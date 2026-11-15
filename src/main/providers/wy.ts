import type { CatalogInfo, ProviderSearchResult, Quality, TrackRef } from '@shared/types'
import { coverUrl, requestJson } from './http'
import { decodeName, formatSize, makeTrack, makeTypes } from './helpers'
import { AppError } from '../errors'
import { formatDuration } from '@shared/utils'

function qualitiesFromSong(raw: Record<string, any>): Array<{ type: Quality; size: string | null }> {
  const entries: Array<{ type: Quality; size: string | null }> = []
  if (raw.l?.size) entries.push({ type: '128k', size: formatSize(raw.l.size) })
  if (raw.h?.size) entries.push({ type: '320k', size: formatSize(raw.h.size) })
  if (raw.sq?.size) entries.push({ type: 'flac', size: formatSize(raw.sq.size) })
  if (raw.hr?.size) entries.push({ type: 'flac24bit', size: formatSize(raw.hr.size) })
  const privilege = raw.privilege
  if (!entries.length && privilege?.maxbr) {
    if (Number(privilege.maxbr) >= 999000) entries.push({ type: 'flac', size: null })
    else if (Number(privilege.maxbr) >= 320000) entries.push({ type: '320k', size: null })
    else entries.push({ type: '128k', size: null })
  }
  return entries
}

function trackFromRaw(raw: Record<string, any>): TrackRef {
  const entries = qualitiesFromSong(raw)
  const { types, typesMap } = makeTypes(entries)
  const artists = raw.ar ?? raw.artists ?? []
  const singer = artists.map((item: any) => item.name).filter(Boolean).join('、')
  const albumName = raw.al?.name ?? raw.album?.name ?? ''
  const albumId = String(raw.al?.id ?? raw.album?.id ?? '')
  const durationSec = Math.round(Number(raw.dt ?? raw.duration ?? 0) / 1000) || undefined
  const title = decodeName(raw.name ?? raw.title ?? '')
  const id = String(raw.id ?? raw.songId ?? '')
  return makeTrack({
    provider: 'wy',
    id,
    title,
    singer,
    album: decodeName(albumName),
    albumId,
    durationSec,
    coverUrl: coverUrl(raw.al?.picUrl ?? raw.album?.picUrl),
    qualities: entries.map(entry => entry.type),
    native: {
      ...raw,
      songmid: id,
      name: title,
      singer,
      albumName: decodeName(albumName),
      albumId,
      interval: durationSec ? formatDuration(durationSec) : null,
      img: raw.al?.picUrl ?? raw.album?.picUrl,
      types,
      _types: typesMap,
      source: 'wy'
    }
  })
}

export async function searchWy(query: string, page: number, limit: number): Promise<ProviderSearchResult> {
  const url = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=1&limit=${limit}&offset=${(page - 1) * limit}`
  const body = await requestJson<Record<string, any>>(url, {
    headers: { Referer: 'https://music.163.com/' }
  })
  const rawList = body.result?.songs ?? body.data?.songs ?? []
  if (!Array.isArray(rawList)) throw new AppError('PROVIDER_SEARCH_FAILED', '网易云音乐搜索失败')
  const total = Number(body.result?.songCount ?? rawList.length) || rawList.length
  return {
    provider: 'wy',
    list: rawList.map(trackFromRaw),
    total,
    page,
    limit,
    hasMore: page * limit < total
  }
}

export async function getWyAlbum(id: string): Promise<CatalogInfo> {
  const body = await requestJson<Record<string, any>>(`https://music.163.com/api/v1/album/${encodeURIComponent(id)}`, {
    headers: { Referer: 'https://music.163.com/' }
  })
  const rawList = body.songs ?? body.album?.songs ?? []
  if (!Array.isArray(rawList)) throw new AppError('CATALOG_FAILED', '网易云专辑解析失败')
  const album = body.album ?? {}
  return {
    kind: 'album',
    provider: 'wy',
    id,
    name: decodeName(album.name ?? rawList[0]?.al?.name ?? '网易云专辑') || '网易云专辑',
    coverUrl: coverUrl(album.picUrl ?? rawList[0]?.al?.picUrl),
    description: decodeName(album.description ?? ''),
    author: decodeName(album.artist?.name ?? ''),
    total: Number(album.size ?? rawList.length) || rawList.length,
    tracks: rawList.map(trackFromRaw)
  }
}

export async function getWyPlaylist(id: string): Promise<CatalogInfo> {
  const body = await requestJson<Record<string, any>>(
    `https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(id)}&n=1000&s=0`,
    { headers: { Referer: 'https://music.163.com/' } }
  )
  const playlist = body.playlist
  const rawList = playlist?.tracks ?? []
  if (!playlist || !Array.isArray(rawList)) throw new AppError('CATALOG_FAILED', '网易云歌单解析失败')
  return {
    kind: 'playlist',
    provider: 'wy',
    id,
    name: decodeName(playlist.name ?? '网易云歌单') || '网易云歌单',
    coverUrl: coverUrl(playlist.coverImgUrl),
    description: decodeName(playlist.description ?? ''),
    author: decodeName(playlist.creator?.nickname ?? ''),
    total: Number(playlist.trackCount ?? rawList.length) || rawList.length,
    tracks: rawList.map(trackFromRaw)
  }
}
