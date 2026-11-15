import type {
  AppInfo,
  AppSettings,
  AuthState,
  CatalogInfo,
  CatalogLinkRequest,
  CloudPage,
  CloudSong,
  CloudSuggestion,
  DiagnosticResult,
  EnqueueUploadInput,
  IpcResult,
  MatchCandidate,
  PickedImage,
  PreviewLease,
  PreviewTrackInput,
  ProviderSearchResult,
  QrCheckResult,
  QrLoginStart,
  SearchRequest,
  SourceImportInput,
  SourceReorderInput,
  SourceRuntimeStatus,
  SourceScriptInfo,
  SourceToggleInput,
  UpdateInfo,
  UploadBatchSummary,
  UploadDraft,
  UploadPatch
} from './types'

export interface NetEaseHubBridge {
  app: {
    info: () => Promise<IpcResult<AppInfo>>
    openExternal: (url: string) => Promise<IpcResult<boolean>>
    showItem: (path: string) => Promise<IpcResult<boolean>>
    pickFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<IpcResult<string | null>>
    pickDirectory: () => Promise<IpcResult<string | null>>
    pickImage: () => Promise<IpcResult<PickedImage | null>>
  }
  auth: {
    startQr: () => Promise<IpcResult<QrLoginStart>>
    checkQr: (key: string) => Promise<IpcResult<QrCheckResult>>
    getState: () => Promise<IpcResult<AuthState>>
    logout: () => Promise<IpcResult<boolean>>
    onChanged: (callback: (state: AuthState) => void) => () => void
  }
  search: {
    query: (request: SearchRequest) => Promise<IpcResult<ProviderSearchResult[]>>
    catalog: (request: CatalogLinkRequest) => Promise<IpcResult<CatalogInfo>>
  }
  preview: {
    create: (input: PreviewTrackInput) => Promise<IpcResult<PreviewLease>>
    release: (id: string) => Promise<IpcResult<boolean>>
    onExpired: (callback: (data: { id: string }) => void) => () => void
  }
  sources: {
    list: () => Promise<IpcResult<SourceScriptInfo[]>>
    import: (input: SourceImportInput) => Promise<IpcResult<SourceScriptInfo>>
    remove: (id: string) => Promise<IpcResult<SourceScriptInfo[]>>
    toggle: (input: SourceToggleInput) => Promise<IpcResult<SourceScriptInfo[]>>
    reorder: (input: SourceReorderInput) => Promise<IpcResult<SourceScriptInfo[]>>
    reload: (id: string) => Promise<IpcResult<SourceScriptInfo>>
    onStatus: (callback: (status: SourceRuntimeStatus) => void) => () => void
  }
  uploads: {
    list: () => Promise<IpcResult<UploadDraft[]>>
    enqueue: (input: EnqueueUploadInput) => Promise<IpcResult<UploadDraft[]>>
    update: (id: string, patch: UploadPatch) => Promise<IpcResult<UploadDraft>>
    start: () => Promise<IpcResult<boolean>>
    retryFailed: () => Promise<IpcResult<boolean>>
    cancel: (ids?: string[]) => Promise<IpcResult<boolean>>
    clearFinished: () => Promise<IpcResult<boolean>>
    summary: () => Promise<IpcResult<UploadBatchSummary>>
    onUpdated: (callback: (draft: UploadDraft) => void) => () => void
    onBatch: (callback: (summary: UploadBatchSummary) => void) => () => void
  }
  cloud: {
    list: (offset?: number, limit?: number) => Promise<IpcResult<CloudPage>>
    loadAll: () => Promise<IpcResult<CloudSong[]>>
    delete: (cloudIds: number[]) => Promise<IpcResult<void>>
    searchCatalog: (query: string, limit?: number) => Promise<IpcResult<MatchCandidate[]>>
    match: (cloudId: number, songId: number) => Promise<IpcResult<void>>
    unmatch: (cloudId: number) => Promise<IpcResult<void>>
    suggest: (songs: CloudSong[]) => Promise<IpcResult<CloudSuggestion[]>>
  }
  settings: {
    get: () => Promise<IpcResult<AppSettings>>
    update: (patch: Partial<AppSettings>) => Promise<IpcResult<AppSettings>>
  }
  updates: {
    check: () => Promise<IpcResult<UpdateInfo>>
    open: (url?: string) => Promise<IpcResult<boolean>>
  }
  diagnostics: {
    run: () => Promise<IpcResult<DiagnosticResult>>
  }
}
