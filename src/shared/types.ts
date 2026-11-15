export type ProviderId = 'kw' | 'kg' | 'tx' | 'wy' | 'mg'
export type Quality = '128k' | '320k' | 'flac' | 'flac24bit'
export type QualityPreference = Quality | 'auto'
export type SourceAction = 'musicUrl' | 'lyric' | 'pic'

export interface ProviderInfo {
  id: ProviderId
  name: string
  shortName: string
  color: string
}

export interface TrackRef {
  key: string
  provider: ProviderId
  native: Record<string, unknown>
  title: string
  artists: string[]
  album?: string
  albumId?: string
  durationSec?: number
  coverUrl?: string
  availableQualities?: Quality[]
}

export interface ProviderSearchResult {
  provider: ProviderId
  list: TrackRef[]
  total: number
  page: number
  limit: number
  hasMore: boolean
  error?: string
}

export interface CatalogInfo {
  kind: 'album' | 'playlist'
  provider: ProviderId
  id: string
  name: string
  coverUrl?: string
  description?: string
  author?: string
  total: number
  tracks: TrackRef[]
}

export interface SourceScriptInfo {
  id: string
  name: string
  description?: string
  version?: string
  author?: string
  homepage?: string
  sourceUrl?: string
  enabled: boolean
  priority: number
  script?: string
  capabilities: Partial<Record<ProviderId, Quality[]>>
  lastError?: string
  lastCheckedAt?: number
}

export interface SourceRuntimeStatus {
  scriptId: string
  status: 'idle' | 'initializing' | 'ready' | 'failed'
  message?: string
  capabilities: Partial<Record<ProviderId, Quality[]>>
}

export interface UserProfile {
  userId: number
  nickname: string
  avatarUrl?: string
  vipType?: number
}

export interface AuthState {
  loggedIn: boolean
  profile?: UserProfile
}

export interface QrLoginStart {
  key: string
  qrDataUrl: string
  qrUrl: string
  expiresAt: number
}

export type QrCheckCode = 800 | 801 | 802 | 803 | 502

export interface QrCheckResult {
  code: QrCheckCode
  message: string
  auth?: AuthState
}

export interface EditableMetadata {
  title: string
  artists: string[]
  album?: string
  albumArtist?: string
  trackNo?: number
  trackTotal?: number
  discNo?: number
  discTotal?: number
  year?: string
  genre?: string
  cover?: {
    mime: string
    dataBase64: string
  }
  lyrics?: string
}

export type UploadStage =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'tagging'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface UploadDraft {
  id: string
  batchId: string
  track: TrackRef
  requestedQuality: QualityPreference
  resolvedQuality?: Quality
  metadata: EditableMetadata
  writeCover: boolean
  writeLyrics: boolean
  allowDuplicate: boolean
  stage: UploadStage
  progress: number
  downloadedBytes?: number
  totalBytes?: number
  speedBytesPerSec?: number
  cloudSongId?: number
  error?: string
  warning?: string
  attempts: number
  createdAt: number
  updatedAt: number
}

export interface UploadBatchSummary {
  batchId: string
  total: number
  success: number
  failed: number
  skipped: number
  running: number
}

export interface CloudSong {
  cloudId: number
  matchedSongId?: number
  fileName: string
  title: string
  artist: string
  album: string
  size: number
  durationSec: number
  md5?: string
  addedAt: number
}

export interface CloudPage {
  list: CloudSong[]
  total: number
  hasMore: boolean
  offset: number
}

export interface MatchCandidate {
  songId: number
  title: string
  artist: string
  album: string
  durationSec: number
  coverUrl?: string
  score: number
}

export interface PreviewLease {
  id: string
  trackKey: string
  streamUrl: string
  expiresAt: number
  maxPlaybackSec: 30
}

export interface AppSettings {
  defaultQuality: QualityPreference
  previewQuality: Quality
  writeCover: boolean
  writeLyrics: boolean
  autoSkipDuplicate: boolean
  downloadConcurrency: number
  uploadConcurrency: number
  keepDownloadedFiles: boolean
  tempDirectory?: string
  theme: 'dark' | 'light' | 'system'
  disclaimerAccepted: boolean
}

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  arch: string
  dataPath: string
  signed: boolean
}

export interface PickedImage {
  path: string
  mime: string
  dataBase64: string
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion?: string
  hasUpdate: boolean
  releaseUrl: string
  checkedAt: number
  error?: string
}

export interface DiagnosticResult {
  netease: { ok: boolean; message: string }
  providers: Array<{ provider: ProviderId; ok: boolean; message: string; count?: number }>
  sources: Array<{ scriptId: string; name: string; ok: boolean; message?: string }>
}

export interface IpcSuccess<T> {
  ok: true
  data: T
}

export interface IpcFailure {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure

export interface PreviewTrackInput {
  track: TrackRef
}

export interface EnqueueUploadInput {
  tracks: TrackRef[]
  requestedQuality?: QualityPreference
  metadataOverrides?: Partial<EditableMetadata>
  writeCover?: boolean
  writeLyrics?: boolean
  allowDuplicate?: boolean
}

export interface UploadPatch {
  requestedQuality?: QualityPreference
  metadata?: Partial<EditableMetadata>
  writeCover?: boolean
  writeLyrics?: boolean
  allowDuplicate?: boolean
}

export interface SourceImportInput {
  mode: 'url' | 'text' | 'file'
  value: string
}

export interface SourceReorderInput {
  ids: string[]
}

export interface SourceToggleInput {
  id: string
  enabled: boolean
}

export interface SearchRequest {
  query: string
  provider: ProviderId | 'all'
  page?: number
  limit?: number
}

export interface CatalogLinkRequest {
  value: string
  provider?: ProviderId
  kind?: 'album' | 'playlist'
}

export interface CloudMatchInput {
  cloudId: number
  songId: number
}

export interface CloudSuggestInput {
  songs: CloudSong[]
}

export interface CloudSuggestion extends MatchCandidate {
  cloudId: number
  cloudTitle: string
  cloudArtist: string
}

export interface CloudDeleteInput {
  cloudIds: number[]
}

export interface IpcEvents {
  'upload:updated': UploadDraft
  'upload:batch': UploadBatchSummary
  'source:status': SourceRuntimeStatus
  'auth:changed': AuthState
  'preview:expired': { id: string }
}
