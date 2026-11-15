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
import { coverUrl, requestJson } from './http'
import {
  decodeName,
  makeEntity,
  makeTrack,
  makeTypes,
  parseInterval,
  positiveNumber
} from './helpers'
import { AppError } from '../errors'
import { formatDuration } from '@shared/utils'

const SEARCH_BASE = 'http://search.kuwo.cn/r.s'
const PLAYLIST_BASE = 'http://nplserver.kuwo.cn/pl.svc'

function parseQualities(info: string): Quality[] {
  const qualities = new Set<Quality>()
  for (const part of info.split(';')) {
    const match = part.match(/bitrate:(\d+).*?format:(\w+).*?size:([\w.]+)/i)
    if (!match) continue
    const bitrate = Number(match[1])
    if (/mflac|zply/i.test(match[2]) || bitrate >= 4000) qualities.add('flac24bit')
    else if (/flac/i.test(match[2]) || bitrate >= 2000) qualities.add('flac')
    else if (bitrate >= 320) qualities.add('320k')
    else qualities.add('128k')
  }
  return [...qualities]
}

function trackFromRaw(raw: Record<string, any>, albumName?: string, albumId?: string): TrackRef {
  const id = String(raw.MUSICRID ?? raw.musicrid ?? raw.id ?? '').replace('MUSIC_', '')
  const qualities = parseQualities(String(raw.N_MINFO ?? raw.MINFO ?? raw.n_minfo ?? ''))
  const { types, typesMap } = makeTypes(
    qualities.map(type => ({
      type,
      size: null
    }))
  )
  const cover = coverUrl(raw.albumpic ?? raw.web_albumpic_short, 'https://img1.kuwo.cn/star/albumcover')
  const title = decodeName(raw.SONGNAME ?? raw.songname ?? raw.NAME ?? raw.name)
  const singer = decodeName(raw.ARTIST ?? raw.artist ?? '')
  const duration = parseInterval(raw.DURATION ?? raw.duration)
  return makeTrack({
    provider: 'kw',
    id,
    title,
    singer,
    album: decodeName(albumName ?? raw.ALBUM ?? raw.album ?? ''),
    albumId: String(albumId ?? raw.ALBUMID ?? raw.albumid ?? ''),
    durationSec: duration,
    coverUrl: cover,
    qualities,
    native: {
      ...raw,
      songmid: id,
      name: title,
      singer,
      albumName: decodeName(albumName ?? raw.ALBUM ?? raw.album ?? ''),
      albumId: String(albumId ?? raw.ALBUMID ?? raw.albumid ?? ''),
      interval: duration ? formatDuration(duration) : null,
      types,
      _types: typesMap,
      source: 'kw'
    }
  })
}

export async function searchKw(query: string, page: number, limit: number): Promise<ProviderSearchResult> {
  const url = `${SEARCH_BASE}?client=kt&all=${encodeURIComponent(query)}&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
  const body = await requestJson<Record<string, any>>(url)
  const rawList = Array.isArray(body.abslist) ? body.abslist : []
  return {
    provider: 'kw',
    list: rawList.map((item: Record<string, any>) => trackFromRaw(item)),
    total: Number(body.TOTAL ?? body.total ?? rawList.length) || rawList.length,
    page,
    limit,
    hasMore: page * limit < Number(body.TOTAL ?? body.total ?? 0)
  }
}

function entityFromKw(raw: Record<string, any>, kind: SearchEntityKind): SearchEntityRef | null {
  if (kind === 'album') {
    const id = String(raw.albumid ?? raw.id ?? '')
    const name = decodeName(raw.name ?? '')
    if (!id || !name) return null
    return makeEntity({
      provider: 'kw',
      kind,
      id,
      name,
      author: decodeName(raw.artist ?? raw.aartist ?? ''),
      coverUrl: coverUrl(raw.hts_img ?? raw.img),
      subtitle: decodeName(raw.pub ?? ''),
      trackCount: positiveNumber(raw.musiccnt)
    })
  }

  if (kind === 'playlist') {
    const id = String(raw.playlistid ?? raw.DC_TARGETID ?? raw.id ?? '')
    const name = decodeName(raw.name ?? '')
    if (!id || !name) return null
    return makeEntity({
      provider: 'kw',
      kind,
      id,
      name,
      author: decodeName(raw.nickname ?? raw.uname ?? ''),
      coverUrl: coverUrl(raw.hts_pic ?? raw.pic ?? raw.img),
      subtitle: decodeName(raw.intro ?? ''),
      trackCount: positiveNumber(raw.songnum ?? raw.total)
    })
  }

  const id = String(raw.ARTISTID ?? raw.artistid ?? raw.id ?? '')
  const name = decodeName(raw.ARTIST ?? raw.artist ?? raw.name ?? '')
  if (!id || !name) return null
  return makeEntity({
    provider: 'kw',
    kind,
    id,
    name,
    author: decodeName(raw.COUNTRY ?? raw.country ?? ''),
    coverUrl: coverUrl(
      raw.hts_PICPATH ?? raw.PICPATH ?? raw.artistpic,
      'http://img1.kuwo.cn/star/starheads'
    ),
    subtitle: decodeName(raw.desc ?? ''),
    albumCount: positiveNumber(raw.ALBUMNUM ?? raw.albumnum),
    songCount: positiveNumber(raw.SONGNUM ?? raw.songnum)
  })
}

export async function searchKwEntities(
  kind: SearchEntityKind,
  query: string,
  page: number,
  limit: number
): Promise<ProviderEntitySearchResult> {
  const url = `${SEARCH_BASE}?all=${encodeURIComponent(query)}&ft=${kind}&pn=${page - 1}&rn=${limit}&rformat=json&encoding=utf8&ver=mbox&vipver=MUSIC_8.7.7.0_BCS37&plat=pc&devid=28156413&pay=0&needliveshow=0`
  const body = await requestJson<Record<string, any>>(url)
  const source = kind === 'album' ? body.albumlist : body.abslist
  const rawList = Array.isArray(source) ? source : []
  const list = rawList
    .map((item: Record<string, any>) => entityFromKw(item, kind))
    .filter((item): item is SearchEntityRef => Boolean(item))
  const total =
    positiveNumber(body.TOTAL ?? body.total ?? body.rnTotal ?? body.totalCount) ??
    (list.length < rawList.length ? rawList.length : list.length)
  return {
    provider: 'kw',
    kind,
    list,
    total,
    page,
    limit,
    hasMore: page * limit < total
  }
}

export async function getKwArtistTracks(
  artistId: string,
  page: number,
  limit: number
): Promise<ProviderArtistTracksResult> {
  const url = `${SEARCH_BASE}?all=&ft=music&artistid=${encodeURIComponent(artistId)}&pn=${page - 1}&rn=${limit}&rformat=json&encoding=utf8&ver=mbox&vipver=MUSIC_8.7.7.0_BCS37&plat=pc&devid=28156413`
  const body = await requestJson<Record<string, any>>(url)
  const rawList = Array.isArray(body.abslist) ? body.abslist : []
  const total = positiveNumber(body.TOTAL ?? body.total) ?? rawList.length
  return {
    provider: 'kw',
    artistId,
    list: rawList.map((item: Record<string, any>) => trackFromRaw(item)),
    page,
    limit,
    total,
    hasMore: page * limit < total
  }
}

export async function getKwAlbum(id: string): Promise<CatalogInfo> {
  const url = `${SEARCH_BASE}?pn=0&rn=1000&stype=albuminfo&albumid=${encodeURIComponent(id)}&show_copyright_off=0&encoding=utf8&vipver=MUSIC_9.1.0&rformat=json`
  const body = await requestJson<Record<string, any>>(url)
  const rawList = body.musiclist ?? []
  if (!Array.isArray(rawList)) throw new AppError('CATALOG_FAILED', '酷我专辑解析失败')
  const albumName = decodeName(body.name ?? rawList[0]?.album ?? '')
  return {
    kind: 'album',
    provider: 'kw',
    id,
    name: albumName || '酷我专辑',
    coverUrl: coverUrl(body.img ?? body.hts_img ?? rawList[0]?.albumpic),
    description: decodeName(body.info ?? ''),
    author: decodeName(body.artist ?? ''),
    total: Number(body.songnum ?? rawList.length) || rawList.length,
    tracks: rawList.map((item: Record<string, any>) =>
      trackFromRaw(item, albumName, String(body.albumid ?? id))
    )
  }
}

export async function getKwPlaylist(id: string): Promise<CatalogInfo> {
  const url = `${PLAYLIST_BASE}?op=getlistinfo&pid=${encodeURIComponent(id)}&pn=0&rn=1000&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=MUSIC_9.0.5.0_W1&newver=1`
  const body = await requestJson<Record<string, any>>(url)
  const rawList = body.musiclist ?? []
  if (!Array.isArray(rawList)) throw new AppError('CATALOG_FAILED', '酷我歌单解析失败')
  return {
    kind: 'playlist',
    provider: 'kw',
    id,
    name: decodeName(body.title ?? body.name ?? '酷我歌单') || '酷我歌单',
    coverUrl: coverUrl(body.pic ?? rawList[0]?.albumpic),
    description: decodeName(body.info ?? ''),
    author: decodeName(body.uname ?? body.nickname ?? ''),
    total: Number(body.songnum ?? rawList.length) || rawList.length,
    tracks: rawList.map((item: Record<string, any>) => trackFromRaw(item))
  }
}
