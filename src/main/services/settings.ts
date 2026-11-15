import Store from 'electron-store'
import type { AppSettings, SourceScriptInfo } from '@shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  defaultQuality: 'auto',
  previewQuality: '128k',
  writeCover: true,
  writeLyrics: true,
  autoSkipDuplicate: true,
  downloadConcurrency: 3,
  uploadConcurrency: 1,
  keepDownloadedFiles: false,
  theme: 'dark',
  disclaimerAccepted: false
}

interface SettingsSchema {
  settings: AppSettings
}

interface SourceSchema {
  scripts: SourceScriptInfo[]
}

export class SettingsService {
  private readonly store = new Store<SettingsSchema>({
    name: 'settings',
    defaults: { settings: DEFAULT_SETTINGS }
  })

  private readonly sourceStore = new Store<SourceSchema>({
    name: 'sources',
    defaults: { scripts: [] }
  })

  get(): AppSettings {
    return {
      ...DEFAULT_SETTINGS,
      ...this.store.get('settings')
    }
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = {
      ...this.get(),
      ...patch
    }
    this.store.set('settings', next)
    return next
  }

  listSources(): SourceScriptInfo[] {
    return this.sourceStore
      .get('scripts')
      .slice()
      .sort((a, b) => a.priority - b.priority)
  }

  saveSources(scripts: SourceScriptInfo[]): SourceScriptInfo[] {
    const normalized = scripts.map((script, index) => ({
      ...script,
      priority: index
    }))
    this.sourceStore.set('scripts', normalized)
    return normalized
  }

  getSource(id: string): SourceScriptInfo | undefined {
    return this.listSources().find(script => script.id === id)
  }

  upsertSource(script: SourceScriptInfo): SourceScriptInfo[] {
    const current = this.listSources()
    const index = current.findIndex(item => item.id === script.id)
    if (index >= 0) current[index] = { ...current[index], ...script }
    else current.push(script)
    return this.saveSources(current)
  }

  removeSource(id: string): SourceScriptInfo[] {
    return this.saveSources(this.listSources().filter(script => script.id !== id))
  }

  reorderSources(ids: string[]): SourceScriptInfo[] {
    const current = this.listSources()
    const byId = new Map(current.map(item => [item.id, item]))
    const ordered = ids.map(id => byId.get(id)).filter((item): item is SourceScriptInfo => Boolean(item))
    for (const item of current) {
      if (!ids.includes(item.id)) ordered.push(item)
    }
    return this.saveSources(ordered)
  }
}

export { DEFAULT_SETTINGS }
