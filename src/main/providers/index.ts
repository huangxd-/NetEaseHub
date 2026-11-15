import type {
  CatalogInfo,
  ProviderArtistTracksResult,
  ProviderEntitySearchResult,
  ProviderId,
  SearchEntityKind,
  TrackRef
} from '@shared/types'
import { PROVIDER_IDS } from '@shared/constants'
import { AppError } from '../errors'
import {
  getKgAlbum,
  getKgArtistTracks,
  getKgPlaylist,
  searchKg,
  searchKgEntities
} from './kg'
import {
  getKwAlbum,
  getKwArtistTracks,
  getKwPlaylist,
  searchKw,
  searchKwEntities
} from './kw'
import {
  getMgAlbum,
  getMgArtistTracks,
  getMgPlaylist,
  searchMg,
  searchMgEntities
} from './mg'
import {
  getTxAlbum,
  getTxArtistTracks,
  getTxPlaylist,
  searchTx,
  searchTxEntities
} from './tx'
import {
  getWyAlbum,
  getWyArtistTracks,
  getWyPlaylist,
  searchWy,
  searchWyEntities
} from './wy'

export const providerSearchers: Record<
  ProviderId,
  (query: string, page: number, limit: number) => Promise<{ provider: ProviderId; list: TrackRef[]; total: number; page: number; limit: number; hasMore: boolean }>
> = {
  kw: searchKw,
  kg: searchKg,
  tx: searchTx,
  wy: searchWy,
  mg: searchMg
}

export async function searchProvider(
  provider: ProviderId,
  query: string,
  page = 1,
  limit = 30
) {
  return providerSearchers[provider](query, page, limit)
}

export async function searchAllProviders(query: string, page = 1, limit = 30) {
  const settled = await Promise.allSettled(
    PROVIDER_IDS.map(provider => providerSearchers[provider](query, page, limit))
  )
  return settled.map((result, index) => {
    const provider = PROVIDER_IDS[index]
    if (result.status === 'fulfilled') return result.value
    return {
      provider,
      list: [] as TrackRef[],
      total: 0,
      page,
      limit,
      hasMore: false,
      error: result.reason instanceof Error ? result.reason.message : '搜索失败'
    }
  })
}

type EntitySearcher = (
  kind: SearchEntityKind,
  query: string,
  page: number,
  limit: number
) => Promise<ProviderEntitySearchResult>

const providerEntitySearchers: Record<ProviderId, EntitySearcher> = {
  kw: searchKwEntities,
  kg: searchKgEntities,
  tx: searchTxEntities,
  wy: searchWyEntities,
  mg: searchMgEntities
}

export async function searchEntities(
  provider: ProviderId,
  kind: SearchEntityKind,
  query: string,
  page = 1,
  limit = 20
) {
  return providerEntitySearchers[provider](kind, query, page, limit)
}

export async function searchAllEntities(
  query: string,
  kind: SearchEntityKind,
  page = 1,
  limit = 20
) {
  const settled = await Promise.allSettled(
    PROVIDER_IDS.map(provider =>
      providerEntitySearchers[provider](kind, query, page, limit)
    )
  )
  return settled.map((result, index) => {
    const provider = PROVIDER_IDS[index]
    if (result.status === 'fulfilled') return result.value
    return {
      provider,
      kind,
      list: [],
      total: 0,
      page,
      limit,
      hasMore: false,
      error: result.reason instanceof Error ? result.reason.message : '搜索失败'
    }
  })
}

type ArtistTracksLoader = (
  artistId: string,
  page: number,
  limit: number
) => Promise<ProviderArtistTracksResult>

const artistTracksLoaders: Record<ProviderId, ArtistTracksLoader> = {
  kw: getKwArtistTracks,
  kg: getKgArtistTracks,
  tx: getTxArtistTracks,
  wy: getWyArtistTracks,
  mg: getMgArtistTracks
}

export async function getArtistTracks(
  provider: ProviderId,
  artistId: string,
  page = 1,
  limit = 50
) {
  return artistTracksLoaders[provider](artistId, page, limit)
}

export async function resolveCatalog(
  provider: ProviderId,
  kind: 'album' | 'playlist',
  id: string
): Promise<CatalogInfo> {
  if (kind === 'album') {
    if (provider === 'kw') return getKwAlbum(id)
    if (provider === 'kg') return getKgAlbum(id)
    if (provider === 'tx') return getTxAlbum(id)
    if (provider === 'wy') return getWyAlbum(id)
    if (provider === 'mg') return getMgAlbum(id)
  }
  if (provider === 'kw') return getKwPlaylist(id)
  if (provider === 'kg') return getKgPlaylist(id)
  if (provider === 'tx') return getTxPlaylist(id)
  if (provider === 'wy') return getWyPlaylist(id)
  if (provider === 'mg') return getMgPlaylist(id)
  throw new AppError('UNSUPPORTED_PROVIDER', '暂不支持该音乐平台')
}

export const providerNames: Record<ProviderId, string> = {
  kw: '酷我音乐',
  kg: '酷狗音乐',
  tx: 'QQ 音乐',
  wy: '网易云音乐',
  mg: '咪咕音乐'
}
