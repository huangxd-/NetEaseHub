import { protocol } from 'electron'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import axios from 'axios'
import type { PreviewLease, TrackRef } from '@shared/types'
import { PREVIEW_LEASE_MS } from '@shared/constants'
import { AppError, messageOf } from '../errors'
import { logger } from '../logger'
import { SourceManager } from './source-manager'

interface LeaseRecord {
  id: string
  trackKey: string
  url: string
  expiresAt: number
  timers: Set<NodeJS.Timeout>
  requests: Set<AbortController>
}

export function registerPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'neteasehub-preview',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

export class PreviewService {
  private readonly leases = new Map<string, LeaseRecord>()
  private cleanupTimer?: NodeJS.Timeout

  constructor(
    private readonly sourceManager: SourceManager,
    private readonly onExpired?: (id: string) => void
  ) {}

  installProtocol(): void {
    protocol.handle('neteasehub-preview', async request => {
      try {
        const url = new URL(request.url)
        const id = url.pathname.replace(/^\/+/, '') || url.hostname
        return await this.handleRequest(id, request)
      } catch (error) {
        logger.warn('试听代理请求失败', messageOf(error))
        const leaseFailure =
          error instanceof AppError &&
          ['PREVIEW_LEASE_INVALID', 'PREVIEW_LEASE_EXPIRED'].includes(error.code)
        return new Response('Preview failed', {
          status: leaseFailure ? 403 : 502,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'private, no-store'
          }
        })
      }
    })
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000)
    this.cleanupTimer.unref?.()
  }

  async create(track: TrackRef): Promise<PreviewLease> {
    const resolved = await this.sourceManager.resolveUrl(track, 'auto', 'preview')
    const id = randomUUID()
    const configuredLeaseMs = Number(process.env.NETEASEHUB_PREVIEW_LEASE_MS)
    const leaseMs =
      process.env.NETEASEHUB_E2E === '1' &&
      Number.isFinite(configuredLeaseMs) &&
      configuredLeaseMs > 0
        ? configuredLeaseMs
        : PREVIEW_LEASE_MS
    const expiresAt = Date.now() + leaseMs
    this.leases.set(id, {
      id,
      trackKey: track.key,
      url: resolved.url,
      expiresAt,
      timers: new Set(),
      requests: new Set()
    })
    return {
      id,
      trackKey: track.key,
      streamUrl: `neteasehub-preview://preview/${id}`,
      expiresAt,
      maxPlaybackSec: 30
    }
  }

  release(id: string): void {
    const lease = this.leases.get(id)
    if (!lease) return
    for (const controller of lease.requests) controller.abort()
    for (const timer of lease.timers) clearTimeout(timer)
    this.leases.delete(id)
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    for (const id of [...this.leases.keys()]) this.release(id)
  }

  private async handleRequest(id: string, request: Request): Promise<Response> {
    const lease = this.leases.get(id)
    if (!lease) throw new AppError('PREVIEW_LEASE_INVALID', '试听租约不存在')
    if (lease.expiresAt <= Date.now()) {
      this.release(id)
      this.onExpired?.(id)
      throw new AppError('PREVIEW_LEASE_EXPIRED', '试听租约已过期')
    }
    const range = request.headers.get('range') ?? undefined
    const controller = new AbortController()
    lease.requests.add(controller)
    const releaseRequest = () => lease.requests.delete(controller)
    controller.signal.addEventListener('abort', releaseRequest, { once: true })

    if (request.method === 'HEAD') {
      try {
        const response = await axios.head(lease.url, {
          timeout: 20_000,
          maxRedirects: 5,
          validateStatus: status => status >= 200 && status < 600,
          signal: controller.signal
        })
        const headers = new Headers()
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === 'string' && !/content-encoding|transfer-encoding/i.test(key)) {
            headers.set(key, value)
          }
        }
        headers.set('accept-ranges', 'bytes')
        return new Response(null, { status: response.status, headers })
      } finally {
        releaseRequest()
      }
    }

    let response
    try {
      response = await axios.get<Readable>(lease.url, {
        responseType: 'stream',
        timeout: 60_000,
        headers: range ? { Range: range } : undefined,
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 600,
        signal: controller.signal
      })
    } catch (error) {
      releaseRequest()
      throw new AppError('PREVIEW_UPSTREAM_FAILED', messageOf(error))
    }
    const headers = new Headers()
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value !== 'string') continue
      if (/content-encoding|transfer-encoding|connection|set-cookie/i.test(key)) continue
      headers.set(key, value)
    }
    if (!headers.has('content-type')) headers.set('content-type', 'audio/mpeg')
    headers.set('accept-ranges', 'bytes')
    headers.set('cache-control', 'private, no-store')

    const stream = Readable.toWeb(response.data) as ReadableStream<Uint8Array>
    const body = new ReadableStream<Uint8Array>({
      start(controllerStream) {
        const reader = stream.getReader()
        const pump = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              controllerStream.enqueue(value)
            }
            controllerStream.close()
          } catch (error) {
            controllerStream.error(error)
          } finally {
            releaseRequest()
          }
        }
        void pump()
      },
      cancel() {
        response?.data.destroy()
        controller.abort()
        releaseRequest()
      }
    })
    return new Response(body, {
      status: response.status,
      headers
    })
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [id, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.release(id)
        this.onExpired?.(id)
      }
    }
  }
}
