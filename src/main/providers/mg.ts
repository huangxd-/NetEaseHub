import type { CatalogInfo, ProviderSearchResult, Quality, TrackRef } from '@shared/types'
import { coverUrl, requestJson } from './http'
import { decodeName, formatSize, makeTrack, makeTypes } from './helpers'
import { AppError } from '../errors'
import { formatDuration } from '@shared/utils'

const MG_HEADERS = {
  Referer: 'https://m.music.migu.cn/',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 Version/13.0.3 Mobile/15E148 Safari/604.1'
}

function songFromRaw(raw: Record<string, any>): TrackRef {
  const formats = raw.audioFormats ?? raw.newRateFormats ?? []
  const entries: Array<{ type: Quality; size: string | null }> = []
  for (const format of Array.isArray(formats) ? formats : []) {
    const size = formatSize(format.asize ?? format.isize ?? format.size ?? format.androidSize)
    switch (format.formatType) {
      case 'PQ':
        entries.push({ type: '128k', size })
        break
      case 'HQ':
        entries.push({ type: '320k', size })
        break
      case 'SQ':
        entries.push({ type: 'flac', size })
        break
      case 'ZQ':
      case 'ZQ24':
        entries.push({ type: 'flac24bit', size })
        break
    }
  }
  if (!entries.length) {
    entries.push({ type: '128k', size: null }, { type: '320k', size: null }, { type: 'flac', size: null })
  }
  const { types, typesMap } = makeTypes(entries)
  const singerList = raw.singerList ?? raw.singers ?? raw.artists ?? []
  const singer = singerList.map((item: any) => item.name).filter(Boolean).join('、') || raw.singer || ''
  const title = decodeName(raw.songName ?? raw.name ?? '')
  const album = decodeName(raw.album ?? raw.albumName ?? raw.albums?.[0]?.name ?? '')
  const albumId = String(raw.albumId ?? raw.albums?.[0]?.id ?? '')
  const durationSec =
    Number(raw.duration) > 0
      ? Math.round(Number(raw.duration))
      : Number(raw.durationMs) > 0
        ? Math.round(Number(raw.durationMs) / 1000)
        : undefined
  const img = coverUrl(
    raw.img3 ?? raw.img2 ?? raw.img1 ?? raw.albumImgs?.[0]?.img ?? raw.imgItems?.[0]?.img,
    'https://d.musicapp.migu.cn'
  )
  const id = String(raw.songId ?? raw.id ?? raw.contentId ?? '')
  return makeTrack({
    provider: 'mg',
    id,
    title,
    singer,
    album,
    albumId,
    durationSec,
    coverUrl: img,
    qualities: entries.map(entry => entry.type),
    native: {
      ...raw,
      songmid: id,
      copyrightId: raw.copyrightId ?? raw.contentId,
      name: title,
      singer,
      albumName: album,
      albumId,
      interval: durationSec ? formatDuration(durationSec) : raw.length ?? null,
      img,
      lrcUrl: raw.lrcUrl,
      mrcUrl: raw.mrcUrl ?? raw.mrcurl,
      trcUrl: raw.trcUrl,
      types,
      _types: typesMap,
      source: 'mg'
    }
  })
}

export async function searchMg(query: string, page: number, limit: number): Promise<ProviderSearchResult> {
  const searchSwitch = encodeURIComponent(
    JSON.stringify({
      song: 1,
      album: 0,
      singer: 0,
      tagSong: 0,
      mvSong: 0,
      songlist: 0,
      bestShow: 0
    })
  )
  const url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/search_all.do?isCopyright=1&isCorrect=1&pageNo=${page}&pageSize=${limit}&searchSwitch=${searchSwitch}&sort=0&text=${encodeURIComponent(query)}`
  const body = await requestJson<Record<string, any>>(url, { headers: MG_HEADERS })
  if (body.code !== '000000') throw new AppError('PROVIDER_SEARCH_FAILED', '咪咕音乐搜索失败')
  const resultList = body.songResultData?.resultList ?? []
  const flattened: Record<string, any>[] = []
  for (const group of Array.isArray(resultList) ? resultList : []) {
    if (Array.isArray(group)) flattened.push(...group)
    else if (group) flattened.push(group)
  }
  const total = Number(body.songResultData?.totalCount ?? flattened.length) || flattened.length
  return {
    provider: 'mg',
    list: flattened.map(songFromRaw),
    total,
    page,
    limit,
    hasMore: page * limit < total
  }
}

export async function getMgAlbum(id: string): Promise<CatalogInfo> {
  const [listResponse, infoResponse] = await Promise.all([
    requestJson<Record<string, any>>(
      `http://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryAlbumSong?albumId=${encodeURIComponent(id)}&pageNo=1`,
      { headers: MG_HEADERS }
    ),
    requestJson<Record<string, any>>(
      `https://app.c.nf.migu.cn/MIGUM3.0/resource/album/v2.0?albumId=${encodeURIComponent(id)}`,
      { headers: MG_HEADERS }
    ).catch(() => ({}))
  ])
  const rawList = listResponse.data?.songList ?? []
  if (!Array.isArray(rawList)) throw new AppError('CATALOG_FAILED', '咪咕专辑解析失败')
  const info = (infoResponse as Record<string, any>).data ?? {}
  return {
    kind: 'album',
    provider: 'mg',
    id,
    name: decodeName(info.title ?? rawList[0]?.album ?? '咪咕专辑') || '咪咕专辑',
    coverUrl: coverUrl(info.imgItems?.[0]?.img ?? rawList[0]?.albumImgs?.[0]?.img),
    description: decodeName(info.summary ?? ''),
    author: decodeName(info.singer ?? ''),
    total: Number(info.totalCount ?? rawList.length) || rawList.length,
    tracks: rawList.map(songFromRaw)
  }
}

export async function getMgPlaylist(id: string): Promise<CatalogInfo> {
  const firstResponse = await requestJson<Record<string, any>>(
    `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0?pageNo=1&pageSize=50&playlistId=${encodeURIComponent(id)}`,
    { headers: MG_HEADERS }
  )
  const firstSongs = firstResponse.data?.songList ?? []
  if (!Array.isArray(firstSongs)) throw new AppError('CATALOG_FAILED', '咪咕歌单解析失败')
  const total = Number(firstResponse.data?.totalCount ?? firstSongs.length) || firstSongs.length
  const pageCount = Math.ceil(total / 50)
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, async (_, index) => {
      const pageNo = index + 2
      const response = await requestJson<Record<string, any>>(
        `https://app.c.nf.migu.cn/MIGUM3.0/resource/playlist/song/v2.0?pageNo=${pageNo}&pageSize=50&playlistId=${encodeURIComponent(id)}`,
        { headers: MG_HEADERS }
      )
      return Array.isArray(response.data?.songList) ? response.data.songList : []
    })
  )
  const rawList = [firstSongs, ...remainingPages].flat()
  const infoResponse = await requestJson<Record<string, any>>(
    `https://c.musicapp.migu.cn/MIGUM3.0/resource/playlist/v2.0?playlistId=${encodeURIComponent(id)}`,
    { headers: MG_HEADERS }
  ).catch(() => ({}))
  const info = (infoResponse as Record<string, any>).data ?? {}
  return {
    kind: 'playlist',
    provider: 'mg',
    id,
    name: decodeName(info.title ?? '咪咕歌单') || '咪咕歌单',
    coverUrl: coverUrl(info.imgItem?.img),
    description: decodeName(info.summary ?? ''),
    author: decodeName(info.ownerName ?? ''),
    total: Number(info.songCount ?? total) || rawList.length,
    tracks: rawList.map(songFromRaw)
  }
}
