import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { UserProfile } from '@shared/types'
import { logger } from '../logger'

interface SecureSchema {
  cookieEncrypted?: string
  profile?: UserProfile
}

export class SecureStore {
  private readonly store = new Store<SecureSchema>({
    name: 'session',
    encryptionKey: undefined
  })

  getCookie(): string | undefined {
    try {
      const encrypted = this.store.get('cookieEncrypted')
      if (encrypted && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      }
      return undefined
    } catch (error) {
      logger.warn('读取登录凭证失败', error)
      return undefined
    }
  }

  setCookie(cookie: string): void {
    if (!cookie) {
      this.clearCookie()
      return
    }
    try {
      if (safeStorage.isEncryptionAvailable()) {
        this.store.set(
          'cookieEncrypted',
          safeStorage.encryptString(cookie).toString('base64')
        )
      } else {
        throw new Error('系统安全存储不可用，无法安全保存登录凭证')
      }
    } catch (error) {
      logger.error('保存登录凭证失败', error)
      throw error
    }
  }

  clearCookie(): void {
    this.store.delete('cookieEncrypted')
    this.store.delete('profile')
  }

  getProfile(): UserProfile | undefined {
    return this.store.get('profile')
  }

  setProfile(profile: UserProfile | undefined): void {
    if (profile) this.store.set('profile', profile)
    else this.store.delete('profile')
  }
}
