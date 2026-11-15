import type { CatalogInfo, ProviderSearchResult, Quality, TrackRef } from '@shared/types'
import { createHash, randomBytes } from 'node:crypto'
import { coverUrl, requestJson } from './http'
import { decodeName, formatSize, makeTrack, makeTypes, parseInterval } from './helpers'
import { AppError } from '../errors'
import { formatDuration } from '@shared/utils'

const TX_HEADERS = {
  Referer: 'https://y.qq.com/',
  Origin: 'https://y.qq.com'
}

const TX_PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const TX_PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const TX_SCRAMBLE_VALUES = [
  89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179
]

function zzcSign(text: string): string {
  const hash = createHash('sha1').update(text).digest('hex')
  const part1 = TX_PART_1_INDEXES.map(index => hash[index]).join('')
  const part2 = TX_PART_2_INDEXES.map(index => hash[index]).join('')
  const part3 = TX_SCRAMBLE_VALUES.map(
    (value, index) => value ^ Number.parseInt(hash.slice(index * 2, index * 2 + 2), 16)
  )
  const encoded = Buffer.from(part3).toString('base64').replace(/[\\/+=]/g, '')
  return `zzc${part1}${encoded}${part2}`.toLowerCase()
}

function qqSearchId(): string {
  return (
    randomBytes(16).toString('hex').toUpperCase() +
    String(Number.parseInt(randomBytes(2).toString('hex'), 16) % 100_000).padStart(5, '0')
  )
}

function entriesFromFile(file: Record<string, any>): Array<{ type: Quality; size: string | null }> {
  const entries: Array<{ type: Quality; size: string | null }> = []
  if (Number(file.size_128mp3 ?? file.size128 ?? 0) > 0) {
    entries.push({ type: '128k', size: formatSize(file.size_128mp3 ?? file.size128) })
  }
  if (Number(file.size_320mp3 ?? file.size320 ?? 0) > 0) {
    entries.push({ type: '320k', size: formatSize(file.size_320mp3 ?? file.size320) })
  }
  if (Number(file.size_flac ?? file.sizeflac ?? 0) > 0) {
    entries.push({ type: 'flac', size: formatSize(file.size_flac ?? file.sizeflac) })
  }
  if (Number(file.size_hires ?? 0) > 0) {
    entries.push({ type: 'flac24bit', size: formatSize(file.size_hires) })
  }
  return entries
}

function trackFromRaw(raw: Record<string, any>): TrackRef {
  const file = raw.file ?? raw
  const entries = entriesFromFile(file)
  const { types, typesMap } = makeTypes(entries)
  const album = raw.album?.name ?? raw.albumname ?? raw.albumName ?? ''
  const albumMid = raw.album?.mid ?? raw.albummid ?? raw.albumMid ?? ''
  const singer = (raw.singer ?? raw.singers ?? [])
    .map((item: any) => item.name)
    .filter(Boolean)
    .join('、')
  const title = decodeName(raw.title ?? raw.songname ?? raw.name ?? '')
  const songmid = String(raw.mid ?? raw.songmid ?? raw.songMid ?? raw.id ?? '')
  const mediaMid = String(file.media_mid ?? raw.strMediaMid ?? raw.media_mid ?? '')
  const duration = parseInterval(raw.interval ?? raw.duration)
  const cover =
    raw.album?.mid || albumMid
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`
      : undefined
  return makeTrack({
    provider: 'tx',
    id: songmid,
    title,
    singer,
    album: decodeName(album),
    albumId: String(albumMid),
    durationSec: duration,
    coverUrl: coverUrl(cover),
    qualities: entries.map(entry => entry.type),
    native: {
      ...raw,
      songmid,
      songId: raw.songid ?? raw.id ?? raw.songId,
      albumMid,
      strMediaMid: mediaMid,
      media_mid: mediaMid,
      name: title,
      title,
      singer,
      albumName: decodeName(album),
      albumId: String(albumMid),
      interval: duration ? formatDuration(duration) : null,
      types,
      _types: typesMap,
      source: 'tx'
    }
  })
}

export async function searchTx(query: string, page: number, limit: number): Promise<ProviderSearchResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload = {
      comm: {
        _channelid: '0',
        _os_version: '6.2.9200-2',
        ct: '19',
        cv: '2151',
        guid: '1F70E520B2EAA7D25E11760783C53CA9',
        patch: '118',
        psrf_access_token_expiresAt: 0,
        psrf_qqaccess_token: '',
        psrf_qqopenid: '',
        psrf_qqunionid: '',
        tmeAppID: 'qqmusic',
        tmeLoginType: 0,
        uin: '0',
        wid: '7223299733393904640'
      },
      'music.search.SearchCgiService': {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: {
          grp: 1,
          num_per_page: limit,
          page_num: page,
          query,
          remoteplace: 'txt.newclient.top',
          search_type: 0,
          searchid: qqSearchId()
        }
      }
    }
    const serialized = JSON.stringify(payload)
    const body = await requestJson<Record<string, any>>(
      `https://u.y.qq.com/cgi-bin/musics.fcg?sign=${zzcSign(serialized)}`,
      {
        method: 'POST',
        headers: {
          ...TX_HEADERS,
          'User-Agent': 'QQMusic 14090508(android 12)',
          'Content-Type': 'application/json'
        },
        data: serialized,
        retries: 0
      }
    )
    const response = body['music.search.SearchCgiService'] ?? body.req
    if (body.code !== 0 || response?.code !== 0) continue
    const rawList = response.data?.body?.song?.list
    if (!Array.isArray(rawList)) continue
    const total =
      Number(response.data?.meta?.sum ?? response.data?.meta?.estimate_sum ?? rawList.length) ||
      rawList.length
    return {
      provider: 'tx',
      list: rawList.map(trackFromRaw),
      total,
      page,
      limit,
      hasMore: page * limit < total
    }
  }
  throw new AppError('PROVIDER_SEARCH_FAILED', 'QQ 音乐搜索失败，请稍后重试')
}

export async function getTxAlbum(id: string): Promise<CatalogInfo> {
  if (/^\d+$/.test(id)) {
    throw new AppError(
      'CATALOG_ID_UNSUPPORTED',
      'QQ 音乐专辑请粘贴包含 albumDetail 的专辑链接，暂不支持纯数字专辑 ID'
    )
  }
  const url = `https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=${encodeURIComponent(id)}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8`
  const body = await requestJson<Record<string, any>>(url, { headers: TX_HEADERS })
  if (body.code !== 0 || !body.data) throw new AppError('CATALOG_FAILED', 'QQ 音乐专辑解析失败')
  const data = body.data
  const rawList = Array.isArray(data.list) ? data.list : []
  return {
    kind: 'album',
    provider: 'tx',
    id,
    name: decodeName(data.name ?? 'QQ 音乐专辑') || 'QQ 音乐专辑',
    coverUrl: coverUrl(`https://y.gtimg.cn/music/photo_new/T002R500x500M000${id}.jpg`),
    description: decodeName(data.desc ?? ''),
    author: decodeName(data.singername ?? ''),
    total: Number(data.total ?? rawList.length) || rawList.length,
    tracks: rawList.map(trackFromRaw)
  }
}

export async function getTxPlaylist(id: string): Promise<CatalogInfo> {
  const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1&disstid=${encodeURIComponent(id)}&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`
  const body = await requestJson<Record<string, any>>(url, { headers: TX_HEADERS })
  const detail = body.cdlist?.[0]
  if (!detail) throw new AppError('CATALOG_FAILED', 'QQ 音乐歌单解析失败')
  const rawList = Array.isArray(detail.songlist) ? detail.songlist : []
  return {
    kind: 'playlist',
    provider: 'tx',
    id,
    name: decodeName(detail.dissname ?? 'QQ 音乐歌单') || 'QQ 音乐歌单',
    coverUrl: coverUrl(detail.logo),
    description: decodeName(detail.desc ?? ''),
    author: decodeName(detail.nickname ?? detail.nick ?? ''),
    total: Number(detail.songnum ?? rawList.length) || rawList.length,
    tracks: rawList.map(trackFromRaw)
  }
}
