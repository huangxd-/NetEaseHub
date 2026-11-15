import { createRequire } from 'node:module'
import type {
  AuthState,
  CloudPage,
  CloudSong,
  MatchCandidate,
  QrCheckResult,
  QrLoginStart,
  UserProfile
} from '@shared/types'
import { CLOUD_PAGE_SIZE } from '@shared/constants'
import { AppError } from '../errors'
import { logError } from '../logger'
import { SecureStore } from './secure-store'
import {
  diceCoefficient,
  joinArtists,
  matchScore,
  normalizeText
} from '@shared/utils'

interface NeteaseResponse {
  status: number
  body: Record<string, any>
  cookie?: string[] | string
}

type NeteaseCall = (params: Record<string, unknown>) => Promise<NeteaseResponse>

const require = createRequire(import.meta.url)
const neteaseApi = require('@neteasecloudmusicapienhanced/api') as Record<string, NeteaseCall>

function call(name: string): NeteaseCall {
  const fn = neteaseApi[name]
  if (typeof fn !== 'function') throw new AppError('NETEASE_API_MISSING', `网易云接口不存在: ${name}`)
  return fn
}

function normalizeCookie(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const joined = value.filter(item => typeof item === 'string').join('; ')
    return joined || undefined
  }
  return undefined
}

function profileFromBody(body: Record<string, any>): UserProfile | undefined {
  const profile = body.profile ?? body.data?.profile ?? body.account
  if (!profile) return undefined
  const userId = Number(profile.userId ?? profile.id ?? 0)
  if (!userId) return undefined
  return {
    userId,
    nickname: String(profile.nickname ?? profile.userName ?? '网易云用户'),
    avatarUrl: profile.avatarUrl ? String(profile.avatarUrl) : undefined,
    vipType: profile.vipType
  }
}

export class NeteaseService {
  private cookie?: string
  private profile?: UserProfile

  constructor(private readonly secureStore: SecureStore) {
    this.cookie = secureStore.getCookie()
    this.profile = secureStore.getProfile()
  }

  async getState(validate = false): Promise<AuthState> {
    if (!this.cookie) return { loggedIn: false }
    if (!validate && this.profile) return { loggedIn: true, profile: this.profile }
    try {
      const response = await call('login_status')({ cookie: this.cookie, timestamp: Date.now() })
      const profile = profileFromBody(response.body)
      if (!profile && response.body?.code !== 200) {
        await this.logout()
        return { loggedIn: false }
      }
      if (profile) {
        this.profile = profile
        this.secureStore.setProfile(profile)
      }
      return this.profile ? { loggedIn: true, profile: this.profile } : { loggedIn: false }
    } catch (error) {
      logError('validate netease login', error)
      return { loggedIn: false }
    }
  }

  async logout(): Promise<void> {
    if (this.cookie) {
      try {
        await call('logout')({ cookie: this.cookie, timestamp: Date.now() })
      } catch {
        // Local logout still succeeds if the remote call fails.
      }
    }
    this.cookie = undefined
    this.profile = undefined
    this.secureStore.clearCookie()
  }

  async startQrLogin(): Promise<QrLoginStart> {
    const timestamp = Date.now()
    const keyResponse = await call('login_qr_key')({ timestamp })
    const key = keyResponse.body?.data?.unikey
    if (!key) throw new AppError('QR_KEY_FAILED', '无法获取网易云二维码登录 key')
    const createResponse = await call('login_qr_create')({
      key,
      qrimg: true,
      timestamp
    })
    const data = createResponse.body?.data
    if (!data?.qrurl) throw new AppError('QR_CREATE_FAILED', '无法生成网易云登录二维码')
    return {
      key,
      qrUrl: data.qrurl,
      qrDataUrl: data.qrimg || '',
      expiresAt: Date.now() + 3 * 60 * 1000
    }
  }

  async checkQrLogin(key: string): Promise<QrCheckResult> {
    let response: NeteaseResponse
    try {
      response = await call('login_qr_check')({
        key,
        timestamp: Date.now()
      })
    } catch (error) {
      throw new AppError('QR_CHECK_FAILED', error instanceof Error ? error.message : '二维码状态检查失败')
    }
    let code = Number(response.body?.code ?? 502) as QrCheckResult['code']
    if (code === 502) {
      try {
        response = await call('login_qr_check')({
          key,
          noCookie: true,
          timestamp: Date.now()
        })
        code = Number(response.body?.code ?? 502) as QrCheckResult['code']
      } catch {
        // Keep the original response.
      }
    }
    const message = String(response.body?.message ?? response.body?.msg ?? '')
    if (code === 803) {
      const cookie =
        normalizeCookie(response.body?.cookie) ??
        normalizeCookie(response.cookie) ??
        normalizeCookie(response.body?.data?.cookie)
      if (!cookie) throw new AppError('QR_COOKIE_MISSING', '扫码成功但未取得登录凭证')
      this.cookie = cookie
      this.secureStore.setCookie(cookie)
      const state = await this.getState(true)
      if (!state.loggedIn) throw new AppError('LOGIN_CHECK_FAILED', '扫码成功但登录态校验失败')
      return { code, message: '登录成功', auth: state }
    }
    const messages: Record<number, string> = {
      800: '二维码已过期，请重新获取',
      801: '等待扫码',
      802: '已扫码，请在手机上确认',
      502: '登录状态检查异常，请重试'
    }
    return { code, message: messages[code] ?? message ?? '未知状态' }
  }

  requireCookie(): string {
    if (!this.cookie) throw new AppError('NOT_LOGGED_IN', '请先扫码登录网易云音乐')
    return this.cookie
  }

  requireUserId(): number {
    if (!this.profile?.userId) throw new AppError('NOT_LOGGED_IN', '当前会话缺少网易云用户 ID')
    return this.profile.userId
  }

  async getCloudPage(offset = 0, limit = CLOUD_PAGE_SIZE): Promise<CloudPage> {
    const response = await call('user_cloud')({
      cookie: this.requireCookie(),
      offset,
      limit,
      timestamp: Date.now()
    })
    const raw = response.body?.data ?? response.body?.cloudSongs ?? []
    const list = Array.isArray(raw) ? raw : []
    const songs = list
      .map((item): CloudSong | null => {
        const cloudId = Number(item?.id ?? item?.pcId ?? item?.privateCloud?.id ?? 0)
        if (!cloudId) return null
        const simple = item.simpleSong ?? {}
        return {
          cloudId,
          matchedSongId: Number(item.songId ?? simple.id ?? 0) || undefined,
          fileName: String(item.fileName ?? simple.name ?? ''),
          title: String(simple.name ?? item.songName ?? item.fileName ?? '未知歌曲'),
          artist: String(
            item.artist ??
              simple.ar?.[0]?.name ??
              simple.artists?.[0]?.name ??
              '未知歌手'
          ),
          album: String(item.album ?? simple.al?.name ?? ''),
          size: Number(item.fileSize ?? 0),
          durationSec: Math.round(Number(simple.dt ?? 0) / 1000),
          md5: item.md5 ? String(item.md5) : undefined,
          addedAt: Number(item.addTime ?? 0)
        }
      })
      .filter((item): item is CloudSong => Boolean(item))
    const total = Number(response.body?.count ?? response.body?.total ?? songs.length)
    return {
      list: songs,
      total,
      offset,
      hasMore: Boolean(response.body?.hasMore) || songs.length >= limit
    }
  }

  async getAllCloudSongs(onPage?: (songs: CloudSong[]) => void): Promise<CloudSong[]> {
    const all: CloudSong[] = []
    let offset = 0
    for (let page = 0; page < 100; page++) {
      const result = await this.getCloudPage(offset, CLOUD_PAGE_SIZE)
      all.push(...result.list)
      onPage?.(result.list)
      if (!result.hasMore || result.list.length === 0) break
      offset += CLOUD_PAGE_SIZE
    }
    return all
  }

  async deleteCloudSongs(cloudIds: number[]): Promise<void> {
    if (!cloudIds.length) return
    const chunks: number[][] = []
    for (let index = 0; index < cloudIds.length; index += 100) {
      chunks.push(cloudIds.slice(index, index + 100))
    }
    for (const chunk of chunks) {
      const response = await call('user_cloud_del')({
        cookie: this.requireCookie(),
        id: chunk.join(','),
        timestamp: Date.now()
      })
      if (response.body?.code && response.body.code !== 200) {
        throw new AppError('CLOUD_DELETE_FAILED', String(response.body.msg ?? '云盘删除失败'))
      }
    }
  }

  async searchCatalog(keywords: string, limit = 20): Promise<MatchCandidate[]> {
    const response = await call('cloudsearch')({
      cookie: this.requireCookie(),
      keywords,
      type: 1,
      limit,
      offset: 0,
      timestamp: Date.now()
    })
    const songs = response.body?.result?.songs ?? response.body?.data?.songs ?? []
    return (Array.isArray(songs) ? songs : [])
      .filter(item => item?.id)
      .map(item => ({
        songId: Number(item.id),
        title: String(item.name ?? ''),
        artist: joinArtists((item.ar ?? item.artists ?? []).map((artist: any) => String(artist.name ?? ''))),
        album: String(item.al?.name ?? item.album?.name ?? ''),
        durationSec: Math.round(Number(item.dt ?? item.duration ?? 0) / 1000),
        coverUrl: item.al?.picUrl ? String(item.al.picUrl) : undefined,
        score: 0
      }))
  }

  async suggestMatches(
    songs: Array<{ cloudId: number; title: string; artist: string; durationSec: number }>
  ): Promise<Array<MatchCandidate & { cloudId: number; cloudTitle: string; cloudArtist: string }>> {
    const suggestions: Array<
      MatchCandidate & { cloudId: number; cloudTitle: string; cloudArtist: string }
    > = []
    for (const song of songs) {
      const query = `${song.title} ${song.artist}`.trim()
      if (!query) continue
      try {
        const candidates = await this.searchCatalog(query, 10)
        const best = candidates
          .map(candidate => ({
            ...candidate,
            score: matchScore(song, candidate)
          }))
          .sort((a, b) => b.score - a.score)[0]
        if (best && best.score >= 0.55) {
          suggestions.push({
            ...best,
            cloudId: song.cloudId,
            cloudTitle: song.title,
            cloudArtist: song.artist
          })
        }
      } catch (error) {
        logError(`suggest cloud match ${song.cloudId}`, error)
      }
    }
    return suggestions
  }

  async matchCloudSong(cloudId: number, songId: number): Promise<void> {
    const response = await call('cloud_match')({
      cookie: this.requireCookie(),
      uid: this.requireUserId(),
      sid: cloudId,
      asid: songId,
      timestamp: Date.now()
    })
    if (response.body?.code && response.body.code !== 200) {
      throw new AppError('CLOUD_MATCH_FAILED', String(response.body.msg ?? '云盘匹配失败'))
    }
  }

  async uploadToken(input: {
    md5: string
    fileSize: number
    filename: string
    bitrate?: number
  }): Promise<{
    needUpload: boolean
    songId: string
    uploadToken: string
    uploadUrl: string
    resourceId: string
    bucket?: string
    md5: string
    fileSize: number
    filename: string
  }> {
    const response = await call('cloud_upload_token')({
      cookie: this.requireCookie(),
      md5: input.md5,
      fileSize: input.fileSize,
      filename: input.filename,
      bitrate: input.bitrate ?? 999000,
      timestamp: Date.now()
    })
    const data = response.body?.data
    if (response.body?.code !== 200 || !data?.uploadUrl) {
      throw new AppError(
        'UPLOAD_TOKEN_FAILED',
        String(response.body?.msg ?? response.body?.message ?? '获取云盘上传凭证失败'),
        response.body
      )
    }
    return data
  }

  async completeUpload(input: {
    songId: string
    resourceId: string
    md5: string
    filename: string
    song: string
    artist: string
    album: string
  }): Promise<number> {
    const response = await call('cloud_upload_complete')({
      cookie: this.requireCookie(),
      songId: input.songId,
      resourceId: input.resourceId,
      md5: input.md5,
      filename: input.filename,
      song: input.song,
      artist: input.artist,
      album: input.album,
      bitrate: 999000,
      timestamp: Date.now()
    })
    if (response.body?.code !== 200) {
      throw new AppError(
        'UPLOAD_COMPLETE_FAILED',
        String(response.body?.msg ?? response.body?.message ?? '完成云盘导入失败'),
        response.body
      )
    }
    const cloudId = Number(response.body?.data?.songId ?? response.body?.songId ?? 0)
    return cloudId || 0
  }

  scoreCandidate(
    input: { title: string; artist: string; durationSec?: number },
    candidate: MatchCandidate
  ): number {
    if (candidate.score) return candidate.score
    return matchScore(input, candidate)
  }

  normalizeSearchText(value: string): string {
    return normalizeText(value)
  }

  quickSimilarity(left: string, right: string): number {
    return diceCoefficient(left, right)
  }
}
