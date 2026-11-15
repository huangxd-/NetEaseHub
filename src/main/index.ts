import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerPreviewScheme, PreviewService } from './services/preview'
import { SettingsService } from './services/settings'
import { SecureStore } from './services/secure-store'
import { DatabaseService } from './services/database'
import { NeteaseService } from './services/netease'
import { SourceManager } from './services/source-manager'
import { UploadManager } from './services/upload-manager'
import { UpdateService } from './services/updater'
import { registerIpc } from './ipc'
import { logger } from './logger'
import { EVENTS } from '@shared/ipc'
import { APP_NAME } from '@shared/constants'

registerPreviewScheme()

if (process.env.NETEASEHUB_E2E === '1') {
  const e2eDataPath = process.env.NETEASEHUB_E2E_USER_DATA
    ? join(app.getPath('temp'), process.env.NETEASEHUB_E2E_USER_DATA)
    : join(app.getPath('temp'), 'neteasehub-e2e')
  app.setPath('userData', e2eDataPath)
}

let mainWindow: BrowserWindow | null = null
let database: DatabaseService | null = null
let sourceManager: SourceManager | null = null
let previewService: PreviewService | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b0b0d',
    title: APP_NAME,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)))
  }
  return window
}

async function bootstrap(): Promise<void> {
  app.setName(APP_NAME)
  if (process.platform === 'win32') app.setAppUserModelId('com.huangxd.neteasehub')

  const settings = new SettingsService()
  const secureStore = new SecureStore()
  database = new DatabaseService()
  const netease = new NeteaseService(secureStore)
  sourceManager = new SourceManager(settings)
  previewService = new PreviewService(sourceManager, id => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(EVENTS.previewExpired, { id })
    }
  })
  previewService.installProtocol()

  const uploads = new UploadManager(database, settings, netease, sourceManager, {
    updated: draft => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(EVENTS.uploadUpdated, draft)
      }
    },
    batch: summary => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(EVENTS.uploadBatch, summary)
      }
    }
  })

  mainWindow = createWindow()
  registerIpc({
    window: mainWindow,
    settings,
    netease,
    sources: sourceManager,
    previews: previewService,
    uploads,
    updater: new UpdateService()
  })

  if (process.env.NODE_ENV === 'development') {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http: https:; media-src 'self' neteasehub-preview: http: https: blob:; connect-src 'self' neteasehub-preview: ws: http: https:; img-src 'self' data: blob: http: https:"
          ]
        }
      })
    })
  }

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

app.whenReady().then(bootstrap).catch(error => {
  logger.error('应用启动失败', error)
  app.quit()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  try {
    sourceManager?.destroy()
    previewService?.destroy()
    database?.close()
  } catch (error) {
    logger.warn('清理资源失败', error)
  }
})

process.on('uncaughtException', error => logger.error('uncaughtException', error))
process.on('unhandledRejection', error => logger.error('unhandledRejection', error))
