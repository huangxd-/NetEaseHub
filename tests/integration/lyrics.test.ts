import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderId, TrackRef } from '@shared/types'
import { getBuiltInLyric } from '../../src/main/providers/lyrics'

const LRC = '[00:00.00]测试歌词\n[00:01.00]第二行'
const json = (value: unknown) => JSON.stringify(value)

function track(provider: ProviderId, native: Record<string, unknown>): TrackRef {
  return {
    key: `${provider}:test`,
    provider,
    native,
    title: '测试歌曲',
    artists: ['测试歌手'],
    durationSec: 10
  }
}

describe('built-in lyric fallback', () => {
  beforeEach(() => {
    vi.spyOn(axios, 'request').mockImplementation(async config => {
      const url = String(config.url ?? '')
      let data: string
      if (url.includes('musicu.fcg')) {
        data = json({
          code: 0,
          req: {
            code: 0,
            data: { lyric: Buffer.from(LRC).toString('base64') }
          }
        })
      } else if (url.includes('m.kuwo.cn/newh5/singles/songinfoandlrc')) {
        data = json({
          data: {
            lrclist: [
              { time: '0', lineLyric: '测试歌词' },
              { time: '1', lineLyric: '第二行' }
            ]
          }
        })
      } else if (url.includes('lyrics.kugou.com/search')) {
        data = json({ candidates: [{ id: 'kg-id', accesskey: 'kg-key' }] })
      } else if (url.includes('lyrics.kugou.com/download')) {
        data = json({ fmt: 'lrc', content: Buffer.from(LRC).toString('base64') })
      } else if (url.includes('music.163.com/api/song/lyric')) {
        data = json({ lrc: { lyric: LRC } })
      } else if (url.includes('example.com/test.lrc')) {
        data = LRC
      } else {
        throw new Error(`Unhandled lyric fixture URL: ${url}`)
      }
      return {
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      } as never
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['tx', { songId: 123 }],
    ['kw', { songmid: '456' }],
    ['kg', { hash: 'fixture-hash' }],
    ['wy', { songmid: '789' }],
    ['mg', { lrcUrl: 'https://example.com/test.lrc' }]
  ] as Array<[ProviderId, Record<string, unknown>]>)(
    'resolves %s lyrics when source scripts do not provide them',
    async (provider, native) => {
      const lyric = await getBuiltInLyric(track(provider, native))
      expect(lyric).toContain('[00:00.00]测试歌词')
      expect(lyric).toContain('[00:01.00]第二行')
    }
  )
})
