import type { CatalogInfo, ProviderSearchResult, Quality, TrackRef } from '@shared/types'
import { coverUrl, requestJson, requestText } from './http'
import { decodeName, formatSize, makeTrack, makeTypes, parseInterval } from './helpers'
import { AppError } from '../errors'
import { formatDuration } from '@shared/utils'

function qualitiesFromRaw(raw: Record<string, any>): Array<{ type: Quality; size: string | null; hash?: string }> {
  const entries: Array<{ type: Quality; size: string | null; hash?: string }> = []
  if (Number(raw.filesize ?? raw.FileSize ?? 0) > 0) {
    entries.push({ type: '128k', size: formatSize(raw.filesize ?? raw.FileSize), hash: raw.hash ?? raw.FileHash })
  }
  if (Number(raw.filesize_320 ?? raw.HQFileSize ?? 0) > 0) {
    entries.push({
      type: '320k',
      size: formatSize(raw.filesize_320 ?? raw.HQFileSize),
      hash: raw.hash_320 ?? raw.HQFileHash
    })
  }
  if (Number(raw.filesize_flac ?? raw.SQFileSize ?? 0) > 0) {
    entries.push({
      type: 'flac',
      size: formatSize(raw.filesize_flac ?? raw.SQFileSize),
      hash: raw.hash_flac ?? raw.SQFileHash
    })
  }
  if (Number(raw.filesize_high ?? raw.ResFileSize ?? 0) > 0) {
    entries.push({
      type: 'flac24bit',
      size: formatSize(raw.filesize_high ?? raw.ResFileSize),
      hash: raw.hash_high ?? raw.ResFileHash
    })
  }
  return entries
}

function trackFromRaw(
  raw: Record<string, any>,
  albumName?: string,
  albumIdValue?: string
): TrackRef {
  const entries = qualitiesFromRaw(raw)
  const { types, typesMap } = makeTypes(entries)
  const id = String(raw.Audioid ?? raw.audio_id ?? raw.songid ?? raw.audioId ?? raw.hash ?? '')
  const filename = decodeName(raw.filename ?? '')
  const filenameParts = filename.split(/\s+-\s+/)
  const title = decodeName(
    raw.OriSongName ??
      raw.SongName ??
      raw.songname ??
      raw.songName ??
      (filenameParts.length > 1 ? filenameParts.slice(1).join(' - ') : filename)
  )
  const singer = decodeName(
    raw.Singers?.map?.((item: any) => item.name).join('、') ??
      raw.SingerName ??
      raw.singername ??
      raw.author_name ??
      (filenameParts.length > 1 ? filenameParts[0] : '')
  )
  const duration =
    parseInterval(raw.Duration ?? raw.duration) ??
    (raw.duration ? Math.round(Number(raw.duration) / 1000) : undefined)
  const cover = coverUrl(
    raw.trans_param?.union_cover ??
      raw.album_info?.sizable_cover ??
      raw.album_info?.cover ??
      raw.cover
  )?.replace('{size}', '500')
  const album = decodeName(
    albumName ??
      raw.AlbumName ??
      raw.album_name ??
      raw.album_info?.album_name ??
      raw.remark ??
      ''
  )
  const albumId = String(
    albumIdValue ?? raw.AlbumID ?? raw.album_id ?? raw.album_info?.album_id ?? ''
  )
  return makeTrack({
    provider: 'kg',
    id,
    title,
    singer,
    album,
    albumId,
    durationSec: duration,
    coverUrl: cover,
    qualities: entries.map(entry => entry.type),
    native: {
      ...raw,
      songmid: id,
      songId: id,
      albumAudioId: raw.albumAudioId ?? raw.album_audio_id ?? raw.audio_group_id ?? raw.MixSongID,
      albumAudioIdValue: raw.album_audio_id ?? raw.albumAudioId ?? raw.audio_group_id,
      name: title,
      singer,
      albumName: album,
      albumId,
      interval: duration ? formatDuration(duration) : null,
      hash: raw.hash ?? raw.FileHash ?? raw.audio_info?.hash,
      types,
      _types: typesMap,
      source: 'kg'
    }
  })
}

export async function searchKg(query: string, page: number, limit: number): Promise<ProviderSearchResult> {
  const url = `http://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=${encodeURIComponent(query)}&hifiquality=0&pagesize=${limit}&PrivilegeFilter=0&page=${page}`
  const body = await requestJson<Record<string, any>>(url)
  const lists = body.data?.lists ?? []
  const flattened: Record<string, any>[] = []
  for (const item of Array.isArray(lists) ? lists : []) {
    flattened.push(item)
    for (const child of Array.isArray(item.Grp) ? item.Grp : []) flattened.push(child)
  }
  return {
    provider: 'kg',
    list: flattened.map(item => trackFromRaw(item)),
    total: Number(body.data?.total ?? flattened.length) || flattened.length,
    page,
    limit,
    hasMore: page * limit < Number(body.data?.total ?? 0)
  }
}

export async function getKgAlbum(id: string): Promise<CatalogInfo> {
  const [body, infoBody] = await Promise.all([
    requestJson<Record<string, any>>(
      `http://mobiles.kugou.com/api/v3/album/song?version=9108&albumid=${encodeURIComponent(id)}&plat=0&pagesize=1000&area_code=0&page=1&with_res_tag=0`
    ),
    requestJson<Record<string, any>>(
      `http://mobilecdnbj.kugou.com/api/v3/album/info?albumid=${encodeURIComponent(id)}&plat=0&version=8000`
    ).catch(() => ({}))
  ])
  const rawList = body.data?.info ?? []
  if (!Array.isArray(rawList)) throw new AppError('CATALOG_FAILED', '酷狗专辑解析失败')
  const info = ((infoBody as Record<string, any>).data ?? {}) as Record<string, any>
  const cover = coverUrl(info.imgurl ?? rawList[0]?.trans_param?.union_cover)?.replace(
    '{size}',
    '500'
  )
  return {
    kind: 'album',
    provider: 'kg',
    id,
    name: decodeName(info.albumname ?? rawList[0]?.album_name ?? '酷狗专辑') || '酷狗专辑',
    coverUrl: cover,
    description: decodeName(info.intro ?? ''),
    author: decodeName(info.singername ?? ''),
    total: Number(info.songcount ?? body.data?.total ?? rawList.length) || rawList.length,
    tracks: rawList.map((item: Record<string, any>) =>
      trackFromRaw(item, decodeName(info.albumname), id)
    )
  }
}

export async function getKgPlaylist(id: string): Promise<CatalogInfo> {
  const url = `http://www2.kugou.kugou.com/yueku/v9/special/single/${encodeURIComponent(id)}-5-9999.html`
  const html = await requestText(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38'
    }
  })
  const dataMatch = html.match(/global\.data\s*=\s*(\[[\s\S]*?\]);/)
  if (!dataMatch?.[1]) throw new AppError('CATALOG_FAILED', '酷狗歌单页面解析失败')
  const rawList = JSON.parse(dataMatch[1]) as Array<Record<string, any>>
  const nameMatch =
    html.match(/global\.name\s*=\s*"([^"]+)"/) ??
    html.match(/<div class="pc_specail_info">[\s\S]*?<h3>([\s\S]*?)<\/h3>/)
  const picMatch =
    html.match(/global\.pic\s*=\s*"([^"]+)"/) ??
    html.match(/<img[^>]+class="loadPic"[^>]+src="([^"]+)"/) ??
    html.match(/<img[^>]+src="([^"]+)"[^>]+class="loadPic"/)
  const authorMatch = html.match(/创建人：<a[^>]*>([^<]+)<\/a>/)
  return {
    kind: 'playlist',
    provider: 'kg',
    id,
    name: decodeName(nameMatch?.[1] ?? '酷狗歌单') || '酷狗歌单',
    coverUrl: coverUrl(picMatch?.[1])?.replace('{size}', '500'),
    author: decodeName(authorMatch?.[1] ?? ''),
    total: rawList.length,
    tracks: rawList.map(item => trackFromRaw(item))
  }
}
