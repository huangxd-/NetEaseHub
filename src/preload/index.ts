import { contextBridge, ipcRenderer } from 'electron'
import type { CloudDeleteResult, IpcResult } from '@shared/types'
import { EVENTS, IPC } from '@shared/ipc'
import type { NetEaseHubBridge } from '@shared/bridge'

function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>
}

function subscribe<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: T) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: NetEaseHubBridge = {
  app: {
    info: () => invoke(IPC.appInfo),
    openExternal: (url: string) => invoke<boolean>(IPC.appOpenExternal, url),
    showItem: (path: string) => invoke<boolean>(IPC.appShowItem, path),
    pickFile: filters => invoke<string | null>(IPC.appPickFile, filters),
    pickDirectory: () => invoke<string | null>(IPC.appPickDirectory),
    pickImage: () => invoke(IPC.appPickImage)
  },
  auth: {
    startQr: () => invoke(IPC.authStartQr),
    checkQr: (key: string) => invoke(IPC.authCheckQr, key),
    getState: () => invoke(IPC.authGetState),
    logout: () => invoke<boolean>(IPC.authLogout),
    onChanged: callback => subscribe(EVENTS.authChanged, callback)
  },
  search: {
    query: request => invoke(IPC.searchQuery, request),
    entities: request => invoke(IPC.searchEntities, request),
    artistTracks: request => invoke(IPC.searchArtistTracks, request),
    catalog: request => invoke(IPC.searchCatalog, request)
  },
  preview: {
    create: input => invoke(IPC.previewCreate, input),
    release: (id: string) => invoke<boolean>(IPC.previewRelease, id),
    onExpired: callback => subscribe(EVENTS.previewExpired, callback)
  },
  sources: {
    list: () => invoke(IPC.sourcesList),
    import: input => invoke(IPC.sourcesImport, input),
    remove: (id: string) => invoke(IPC.sourcesRemove, id),
    toggle: input => invoke(IPC.sourcesToggle, input),
    reorder: input => invoke(IPC.sourcesReorder, input),
    reload: (id: string) => invoke(IPC.sourcesReload, id),
    onStatus: callback => subscribe(EVENTS.sourceStatus, callback)
  },
  uploads: {
    list: () => invoke(IPC.uploadsList),
    enqueue: input => invoke(IPC.uploadsEnqueue, input),
    update: (id, patch) => invoke(IPC.uploadsUpdate, id, patch),
    start: () => invoke<boolean>(IPC.uploadsStart),
    retryFailed: () => invoke<boolean>(IPC.uploadsRetryFailed),
    cancel: (ids?: string[]) => invoke<boolean>(IPC.uploadsCancel, ids),
    clearFinished: () => invoke<boolean>(IPC.uploadsClearFinished),
    summary: () => invoke(IPC.uploadsSummary),
    onUpdated: callback => subscribe(EVENTS.uploadUpdated, callback),
    onBatch: callback => subscribe(EVENTS.uploadBatch, callback)
  },
  cloud: {
    list: (offset = 0, limit = 200) => invoke(IPC.cloudList, offset, limit),
    loadAll: () => invoke(IPC.cloudLoadAll),
    delete: (cloudIds: number[]) =>
      invoke<CloudDeleteResult>(IPC.cloudDelete, { cloudIds }),
    searchCatalog: (query: string, limit = 20) =>
      invoke(IPC.cloudSearchCatalog, query, limit),
    match: (cloudId: number, songId: number) =>
      invoke<void>(IPC.cloudMatch, { cloudId, songId }),
    unmatch: (cloudId: number) => invoke<void>(IPC.cloudUnmatch, cloudId),
    suggest: songs => invoke(IPC.cloudSuggest, { songs })
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    update: patch => invoke(IPC.settingsUpdate, patch)
  },
  updates: {
    check: () => invoke(IPC.updateCheck),
    open: (url?: string) => invoke<boolean>(IPC.updateOpen, url)
  },
  diagnostics: {
    run: () => invoke(IPC.diagnosticsRun)
  }
}

contextBridge.exposeInMainWorld('neteasehub', api)
