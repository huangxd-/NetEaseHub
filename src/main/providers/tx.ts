import type {
  CatalogInfo,
  ProviderArtistTracksResult,
  ProviderEntitySearchResult,
  ProviderSearchResult,
  Quality,
  SearchEntityKind,
  SearchEntityRef,
  TrackRef
} from '@shared/types'
import { createHash, randomBytes } from 'node:crypto'
import { coverUrl, requestJson } from './http'
import {
  decodeName,
  formatSize,
  makeEntity,
  makeTrack,
  makeTypes,
  parseInterval,
  positiveNumber
} from './helpers'
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

async function requestTxSearch(
  query: string,
  page: number,
  limit: number,
  searchType: number
): Promise<Record<string, any>> {
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
          search_type: searchType,
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
    if (body.code === 0 && response?.code === 0 && response.data?.body) {
      return response.data
    }
  }
  throw new AppError('PROVIDER_SEARCH_FAILED', 'QQ 音乐搜索失败，请稍后重试')
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
  const data = await requestTxSearch(query, page, limit, 0)
  const rawList = data.body?.song?.list
  if (!Array.isArray(rawList)) throw new AppError('PROVIDER_SEARCH_FAILED', 'QQ 音乐搜索失败')
  const total =
    Number(data.meta?.sum ?? data.meta?.estimate_sum ?? rawList.length) || rawList.length
  return {
    provider: 'tx',
    list: rawList.map(trackFromRaw),
    total,
    page,
    limit,
    hasMore: page * limit < total
  }
}

function entityFromTx(raw: Record<string, any>, kind: SearchEntityKind): SearchEntityRef | null {
  if (kind === 'album') {
    const id = String(raw.albumMID ?? '')
    const name = decodeName(raw.albumName ?? '')
    if (!id || !name) return null
    return makeEntity({
      provider: 'tx',
      kind,
      id,
      name,
      author: decodeName(raw.singerName ?? ''),
      coverUrl: coverUrl(raw.albumPic),
      subtitle: decodeName(raw.publicTime ?? ''),
      trackCount: positiveNumber(raw.song_count)
    })
  }

  if (kind === 'artist') {
    const id = String(raw.singerMID ?? '')
    const name = decodeName(raw.singerName ?? '')
    if (!id || !name) return null
    return makeEntity({
      provider: 'tx',
      kind,
      id,
      name,
      coverUrl: coverUrl(raw.singerPic),
      albumCount: positiveNumber(raw.albumNum),
      songCount: positiveNumber(raw.songNum)
    })
  }

  const id = String(raw.dissid ?? '')
  const name = decodeName(raw.dissname ?? '')
  if (!id || !name) return null
  return makeEntity({
    provider: 'tx',
    kind,
    id,
    name,
    author: decodeName(raw.creator?.name ?? ''),
    coverUrl: coverUrl(raw.imgurl),
    subtitle: decodeName(raw.introduction ?? '').slice(0, 160),
    trackCount: positiveNumber(raw.song_count)
  })
}

export async function searchTxEntities(
  kind: SearchEntityKind,
  query: string,
  page: number,
  limit: number
): Promise<ProviderEntitySearchResult> {
  if (kind === 'playlist') {
    const body = await requestJson<Record<string, any>>(
      `http://c.y.qq.com/soso/fcgi-bin/client_music_search_songlist?page_no=${page - 1}&num_per_page=${limit}&format=json&query=${encodeURIComponent(query)}&remoteplace=txt.yqq.playlist&inCharset=utf8&outCharset=utf-8`,
      {
        headers: {
          ...TX_HEADERS,
          'User-Agent':
            'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
          Referer: 'http://y.qq.com/portal/search.html'
        }
      }
    )
    const rawList = Array.isArray(body.data?.list) ? body.data.list : []
    const total = positiveNumber(body.data?.sum) ?? rawList.length
    return {
      provider: 'tx',
      kind,
      list: rawList
        .map((item: Record<string, any>) => entityFromTx(item, kind))
        .filter((item: SearchEntityRef | null): item is SearchEntityRef => Boolean(item)),
      total,
      page,
      limit,
      hasMore: page * limit < total
    }
  }

  const data = await requestTxSearch(query, page, limit, kind === 'album' ? 2 : 1)
  const rawList =
    kind === 'album' ? data.body?.album?.list ?? [] : data.body?.singer?.list ?? []
  const total = positiveNumber(data.meta?.sum) ?? rawList.length
  return {
    provider: 'tx',
    kind,
    list: (Array.isArray(rawList) ? rawList : [])
      .map((item: Record<string, any>) => entityFromTx(item, kind))
      .filter((item): item is SearchEntityRef => Boolean(item)),
    total,
    page,
    limit,
    hasMore: page * limit < total
  }
}

export async function getTxArtistTracks(
  artistId: string,
  page: number,
  limit: number
): Promise<ProviderArtistTracksResult> {
  const body = await requestJson<Record<string, any>>('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      ...TX_HEADERS,
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      comm: {
        cv: 4747474,
        ct: 24,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        uin: 0
      },
      req: {
        module: 'musichall.song_list_server',
        method: 'GetSingerSongList',
        param: {
          singerMid: artistId,
          order: 1,
          begin: (page - 1) * limit,
          num: limit
        }
      }
    })
  })
  if (body.code !== 0 || body.req?.code !== 0) {
    throw new AppError('ARTIST_TRACKS_FAILED', 'QQ 音乐歌手曲目获取失败')
  }
  const rawList = Array.isArray(body.req.data?.songList) ? body.req.data.songList : []
  const total = positiveNumber(body.req.data?.totalNum) ?? rawList.length
  return {
    provider: 'tx',
    artistId,
    list: rawList.map((item: Record<string, any>) => trackFromRaw(item.songInfo ?? item)),
    page,
    limit,
    total,
    hasMore: page * limit < total
  }
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
