/// <reference types="vite/client" />

import type { NetEaseHubBridge } from '@shared/bridge'

declare global {
  interface Window {
    neteasehub: NetEaseHubBridge
  }
}

export {}
