import type { ProviderId, Quality } from './types'

export const PROVIDERS = [
  { id: 'tx', name: 'QQ 音乐', shortName: 'QQ', color: '#31c27c' },
  { id: 'kw', name: '酷我音乐', shortName: '酷我', color: '#ffb300' },
  { id: 'kg', name: '酷狗音乐', shortName: '酷狗', color: '#2f8cff' },
  { id: 'wy', name: '网易云音乐', shortName: '网易', color: '#e60026' },
  { id: 'mg', name: '咪咕音乐', shortName: '咪咕', color: '#ff5a5f' }
] as const

export const PROVIDER_IDS: ProviderId[] = PROVIDERS.map(item => item.id)

export const QUALITY_ORDER: Quality[] = ['flac24bit', 'flac', '320k', '128k']
export const PREVIEW_QUALITY_ORDER: Quality[] = ['128k', '320k', 'flac', 'flac24bit']

export const QUALITY_LABELS: Record<Quality, string> = {
  '128k': '128k',
  '320k': '320k',
  flac: 'FLAC',
  flac24bit: 'Hi-Res'
}

export const MAX_PREVIEW_SECONDS = 60
export const PREVIEW_LEASE_MS = 5 * 60 * 1000
export const MAX_SCRIPT_BYTES = 2 * 1024 * 1024
export const MAX_BATCH_WARNING = 50
export const CLOUD_PAGE_SIZE = 200
export const JOB_RETENTION_DAYS = 30

export const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg'
}

export const AUDIO_EXTENSIONS = Object.keys(MIME_BY_EXTENSION)

export const RELEASE_URL = 'https://github.com/huangxd-/NetEaseHub/releases'

export const APP_NAME = 'NetEaseHub'
export const BUNDLE_ID = 'com.huangxd.neteasehub'
