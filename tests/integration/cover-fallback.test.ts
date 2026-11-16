import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackRef } from '@shared/types'
import {
  downloadCoverUrl,
  getCustomCover
} from '../../src/main/providers/cover'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const track: TrackRef = {
  key: 'tx:003mksrh3dmBtW',
  provider: 'tx',
  native: { songId: 733313366 },
  title: '寸寸',
  artists: ['袁娅维TIA RAY'],
  album: '嫁金钗 影视原声带',
  durationSec: 229
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('custom cover fallback', () => {
  it('accepts a direct image response', async () => {
    vi.spyOn(axios, 'get').mockImplementation(
      async () =>
        ({
          data: PNG,
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'image/png' },
          config: {}
        }) as never
    )
    const image = await getCustomCover(track, 'https://lrc.example/cover')
    expect(image?.mime).toBe('image/png')
    expect(image?.data.byteLength).toBe(PNG.byteLength)
  })

  it('resolves a cover URL from a JSON response', async () => {
    vi.spyOn(axios, 'get').mockImplementation(async (urlValue, config) => {
      const url = String(urlValue)
      if (url.includes('lrc.example')) {
        return {
          data: Buffer.from(
            JSON.stringify({ data: { coverUrl: 'https://cdn.example/cover.png' } })
          ),
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config
        } as never
      }
      return {
        data: PNG,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'image/png' },
        config
      } as never
    })
    const image = await getCustomCover(track, 'https://lrc.example/cover')
    expect(image?.mime).toBe('image/png')
    expect(image?.data.byteLength).toBe(PNG.byteLength)
  })

  it('rejects non-image responses', async () => {
    vi.spyOn(axios, 'get').mockImplementation(
      async () =>
        ({
          data: Buffer.from('not an image'),
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/plain' },
          config: {}
        }) as never
    )
    await expect(downloadCoverUrl('https://cdn.example/not-image')).resolves.toBeUndefined()
  })
})
