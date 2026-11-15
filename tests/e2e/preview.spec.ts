import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const WAV_DURATION_SECONDS = 65

function createWav(seconds: number): Buffer {
  const sampleRate = 44_100
  const channels = 1
  const bitsPerSample = 16
  const sampleCount = sampleRate * seconds
  const dataSize = sampleCount * channels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28)
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.15
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2)
  }
  return buffer
}

function startAudioServer(wav: Buffer): Promise<{ server: Server; baseUrl: string }> {
  return new Promise(resolve => {
    const server = createServer((request, response) => {
      console.log('audio fixture request:', request.method, request.url, request.headers.range ?? '')
      if (request.url === '/missing.wav') {
        response.writeHead(404, { 'content-type': 'text/plain' })
        response.end('fixture not found')
        return
      }
      const range = request.headers.range
      const commonHeaders = {
        'content-type': 'audio/wav',
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'range',
        'access-control-expose-headers': 'content-range, content-length, accept-ranges'
      }
      if (request.method === 'HEAD') {
        response.writeHead(200, { ...commonHeaders, 'content-length': wav.length })
        response.end()
        return
      }
      if (!range) {
        response.writeHead(200, { ...commonHeaders, 'content-length': wav.length })
        response.end(wav)
        return
      }
      const match = /^bytes=(\d+)-(\d*)$/.exec(range)
      if (!match) {
        response.writeHead(416, {
          ...commonHeaders,
          'content-range': `bytes */${wav.length}`
        })
        response.end()
        return
      }
      const start = Number(match[1])
      const end = match[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1
      if (start >= wav.length || start > end) {
        response.writeHead(416, {
          ...commonHeaders,
          'content-range': `bytes */${wav.length}`
        })
        response.end()
        return
      }
      response.writeHead(206, {
        ...commonHeaders,
        'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${wav.length}`
      })
      response.end(wav.subarray(start, end + 1))
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` })
    })
  })
}

function sourceScript(baseUrl: string): string {
  return `/**
 * @name 本地测试音源
 * @version 1.0.0
 * @author NetEaseHub
 */
const baseUrl = ${JSON.stringify(baseUrl)}
const { EVENT_NAMES } = globalThis.lx
globalThis.lx.on(EVENT_NAMES.request, async ({ action, info }) => {
  if (action !== 'musicUrl') throw new Error('unsupported action')
  const file = info?.musicInfo?.path || 'tone.wav'
  return baseUrl + '/' + file
})
globalThis.lx.send(EVENT_NAMES.inited, {
  status: 'success',
  sources: {
    wy: {
      name: '本地测试音源',
      type: 'music',
      actions: ['musicUrl'],
      qualitys: ['128k', '320k', 'flac', 'flac24bit']
    }
  }
})
`
}

async function launchApp(
  env: Record<string, string> = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const executablePath = process.env.NETEASEHUB_EXECUTABLE
  const app = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [] : ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NETEASEHUB_E2E: '1',
      NETEASEHUB_E2E_USER_DATA: `neteasehub-preview-${process.pid}-${Date.now()}`,
      ...env
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const accept = page.getByRole('button', { name: '我已了解并继续' })
  await expect(accept).toBeVisible()
  await accept.click()
  await expect(accept).toBeHidden()
  return { app, page }
}

async function importSource(page: Page, baseUrl: string): Promise<void> {
  const result = await page.evaluate(
    value => window.neteasehub.sources.import({ mode: 'text', value }),
    sourceScript(baseUrl)
  )
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.data.name).toBe('本地测试音源')
    expect(result.data.capabilities.wy).toEqual(['128k', '320k', 'flac', 'flac24bit'])
  }
}

async function createLease(
  page: Page,
  path = 'tone.wav'
): Promise<{ id: string; streamUrl: string }> {
  const result = await page.evaluate(
    input =>
      window.neteasehub.preview.create({
        track: {
          key: `wy:${input.path}`,
          provider: 'wy',
          native: { name: '测试试听', singer: '本地', path: input.path },
          title: '测试试听',
          artists: ['本地']
        }
      }),
    { path }
  )
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

test('preview protocol streams Range requests and rejects invalid leases', async () => {
  const { server, baseUrl } = await startAudioServer(createWav(WAV_DURATION_SECONDS))
  const { app, page } = await launchApp()
  try {
    await importSource(page, baseUrl)
    const lease = await createLease(page)

    const rangeResponse = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl, { headers: { Range: 'bytes=0-1023' } })
      const body = await response.arrayBuffer()
      return {
        status: response.status,
        contentRange: response.headers.get('content-range'),
        bytes: body.byteLength
      }
    }, lease.streamUrl)
    expect(rangeResponse.status).toBe(206)
    expect(rangeResponse.contentRange).toMatch(/^bytes 0-1023\/\d+$/)
    expect(rangeResponse.bytes).toBe(1024)

    const headResponse = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl, { method: 'HEAD' })
      return {
        status: response.status,
        acceptRanges: response.headers.get('accept-ranges'),
        contentLength: response.headers.get('content-length')
      }
    }, lease.streamUrl)
    expect(headResponse.status).toBe(200)
    expect(headResponse.acceptRanges).toBe('bytes')
    expect(Number(headResponse.contentLength)).toBeGreaterThan(0)

    const missing = await createLease(page, 'missing.wav')
    const upstreamStatus = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl)
      await response.text()
      return response.status
    }, missing.streamUrl)
    expect(upstreamStatus).toBe(404)

    const invalidStatus = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl.replace(/[^/]+$/, 'not-a-lease'))
      await response.text()
      return response.status
    }, lease.streamUrl)
    expect(invalidStatus).toBe(403)

    await page.evaluate(id => window.neteasehub.preview.release(id), lease.id)
    const releasedStatus = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl)
      await response.text()
      return response.status
    }, lease.streamUrl)
    expect(releasedStatus).toBe(403)
  } finally {
    await app.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('preview lease expires and returns 403', async () => {
  const { server, baseUrl } = await startAudioServer(createWav(WAV_DURATION_SECONDS))
  const { app, page } = await launchApp({ NETEASEHUB_PREVIEW_LEASE_MS: '500' })
  try {
    await importSource(page, baseUrl)
    const lease = await createLease(page)
    await page.waitForTimeout(700)
    const status = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl)
      await response.text()
      return response.status
    }, lease.streamUrl)
    expect(status).toBe(403)
  } finally {
    await app.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('falls back to the next source and disables a script that fails initialization', async () => {
  const { server, baseUrl } = await startAudioServer(createWav(WAV_DURATION_SECONDS))
  const { app, page } = await launchApp()
  try {
    const broken = await page.evaluate(async () => {
      return window.neteasehub.sources.import({
        mode: 'text',
        value: `const lx = globalThis.lx
throw new Error('fixture init failure')
void lx`
      })
    })
    expect(broken.ok).toBe(true)
    if (broken.ok) {
      expect(broken.data.enabled).toBe(false)
      expect(broken.data.lastError).toContain('fixture init failure')
    }

    const invalidUrl = await page.evaluate(async () => {
      return window.neteasehub.sources.import({
        mode: 'text',
        value: `/**
 * @name 非法地址音源
 */
const { EVENT_NAMES } = globalThis.lx
globalThis.lx.on(EVENT_NAMES.request, async () => 'ftp://invalid.example/audio.mp3')
globalThis.lx.send(EVENT_NAMES.inited, {
  status: 'success',
  sources: {
    wy: {
      name: '非法地址音源',
      type: 'music',
      actions: ['musicUrl'],
      qualitys: ['128k']
    }
  }
})`
      })
    })
    expect(invalidUrl.ok).toBe(true)
    await importSource(page, baseUrl)

    const lease = await createLease(page)
    const status = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl)
      await response.arrayBuffer()
      return response.status
    }, lease.streamUrl)
    expect(status).toBe(200)
  } finally {
    await app.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('player stops at 60 seconds and releases the previous lease on switch', async () => {
  test.setTimeout(90_000)
  const { server, baseUrl } = await startAudioServer(createWav(WAV_DURATION_SECONDS))
  const { app, page } = await launchApp()
  try {
    await importSource(page, baseUrl)
    const enqueued = await page.evaluate(() =>
      window.neteasehub.uploads.enqueue({
        tracks: [
          {
            key: 'wy:preview-one',
            provider: 'wy',
            native: { name: '试听一', singer: '本地' },
            title: '试听一',
            artists: ['本地']
          },
          {
            key: 'wy:preview-two',
            provider: 'wy',
            native: { name: '试听二', singer: '本地' },
            title: '试听二',
            artists: ['本地']
          }
        ]
      })
    )
    expect(enqueued.ok).toBe(true)

    await page.getByRole('button', { name: /任务队列/ }).click()
    await expect(page.getByText('试听一', { exact: true }).first()).toBeVisible()
    const previewButtons = page.locator('button[title="试听 60 秒"]')
    await expect(previewButtons).toHaveCount(2)
    await previewButtons.nth(0).click()

    const audio = page.locator('audio')
    await expect(page.getByText('仅试听前 60 秒')).toBeVisible()
    await expect
      .poll(() => audio.evaluate(element => (element as HTMLAudioElement).readyState))
      .toBeGreaterThanOrEqual(1)

    const firstSrc = await audio.evaluate(element => element.src)
    await audio.evaluate(element => {
      const media = element as HTMLAudioElement
      media.currentTime = 60.01
      media.dispatchEvent(new Event('timeupdate', { bubbles: true }))
    })
    await expect
      .poll(() =>
        audio.evaluate(element => ({
          currentTime: (element as HTMLAudioElement).currentTime,
          paused: (element as HTMLAudioElement).paused
        }))
      )
      .toEqual({ currentTime: 0, paused: true })

    await previewButtons.nth(1).click()
    await expect
      .poll(() => audio.evaluate(element => element.src))
      .not.toBe(firstSrc)
    const previousLeaseStatus = await page.evaluate(async streamUrl => {
      const response = await fetch(streamUrl)
      await response.text()
      return response.status
    }, firstSrc)
    expect(previousLeaseStatus).toBe(403)

    await audio.evaluate(element => {
      const media = element as HTMLAudioElement
      media.currentTime = 62
      media.dispatchEvent(new Event('seeking', { bubbles: true }))
    })
    await expect
      .poll(() =>
        audio.evaluate(element => ({
          currentTime: (element as HTMLAudioElement).currentTime,
          paused: (element as HTMLAudioElement).paused
        }))
      )
      .toEqual({ currentTime: 0, paused: true })
  } finally {
    await app.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
