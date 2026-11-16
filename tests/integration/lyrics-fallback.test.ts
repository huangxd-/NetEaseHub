import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackRef } from '@shared/types'
import { getCustomLyric, getLrclibLyric } from '../../src/main/providers/lyrics'

const LRC = '[00:00.00]第一行\n[00:01.00]第二行'
const PLAIN = '第一行\n第二行'
const track: TrackRef = {
  key: 'tx:003mksrh3dmBtW',
  provider: 'tx',
  native: { songId: 733313366, songmid: '003mksrh3dmBtW' },
  title: '寸寸',
  artists: ['袁娅维TIA RAY'],
  album: '嫁金钗 影视原声带',
  durationSec: 229
}

function response(data: unknown): never {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {}
  } as never
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LRCLIB lyric fallback', () => {
  it('uses syncedLyrics from the exact lookup', async () => {
    vi.spyOn(axios, 'request').mockImplementation(async () =>
      response(JSON.stringify({ syncedLyrics: LRC, plainLyrics: PLAIN }))
    )
    await expect(getLrclibLyric(track)).resolves.toBe(LRC)
  })

  it('falls back to search and rejects duration mismatches', async () => {
    vi.spyOn(axios, 'request').mockImplementation(async config => {
      if (String(config.url).endsWith('/api/get')) throw new Error('404')
      return response(
        JSON.stringify([
          {
            trackName: '寸寸',
            artistName: '袁娅维TIA RAY',
            duration: 290,
            syncedLyrics: '[00:00.00]错误版本'
          },
          {
            trackName: '寸寸',
            artistName: '袁娅维TIA RAY',
            duration: 230,
            syncedLyrics: LRC
          }
        ])
      )
    })
    await expect(getLrclibLyric(track)).resolves.toBe(LRC)
  })

  it('ignores plain lyrics when no synced lyrics exist', async () => {
    vi.spyOn(axios, 'request').mockImplementation(async config => {
      if (String(config.url).endsWith('/api/get')) {
        return response(JSON.stringify({ syncedLyrics: null, plainLyrics: PLAIN }))
      }
      return response(JSON.stringify([]))
    })
    await expect(getLrclibLyric(track)).resolves.toBeUndefined()
  })
})

describe('custom lyric API fallback', () => {
  it('extracts a nested LRC field from JSON', async () => {
    vi.spyOn(axios, 'request').mockImplementation(async () =>
      response(JSON.stringify({ data: { lrc: LRC } }))
    )
    await expect(
      getCustomLyric(track, 'https://lrc.example/lyrics?title={title}')
    ).resolves.toBe(LRC)
  })

  it('accepts raw LRC text', async () => {
    vi.spyOn(axios, 'request').mockImplementation(async () => response(LRC))
    await expect(getCustomLyric(track, 'https://lrc.example/lyrics')).resolves.toBe(LRC)
  })

  it('rejects plain text without timestamps', async () => {
    vi.spyOn(axios, 'request').mockImplementation(async () => response(PLAIN))
    await expect(getCustomLyric(track, 'https://lrc.example/lyrics')).resolves.toBeUndefined()
  })
})
