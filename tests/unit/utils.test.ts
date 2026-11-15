import { describe, expect, it } from 'vitest'
import {
  clampPreviewPosition,
  defaultMetadata,
  matchScore,
  parseCatalogLink,
  parseSourceHeader,
  qualityCandidates,
  sanitizeFilename,
  summarizeUploads,
  type TrackRef,
  type UploadDraft
} from '@shared/index'

function draft(stage: UploadDraft['stage'], id: string, batchId = 'batch'): UploadDraft {
  return {
    id,
    batchId,
    track: {
      key: id,
      provider: 'wy',
      native: {},
      title: id,
      artists: ['歌手']
    },
    requestedQuality: 'auto',
    metadata: {
      title: id,
      artists: ['歌手']
    },
    writeCover: true,
    writeLyrics: true,
    allowDuplicate: false,
    stage,
    progress: 0,
    attempts: 0,
    createdAt: 1,
    updatedAt: 1
  }
}

describe('shared utilities', () => {
  it('parses album and playlist links for all providers', () => {
    expect(parseCatalogLink('https://music.163.com/#/album?id=14466')).toEqual({
      provider: 'wy',
      kind: 'album',
      id: '14466'
    })
    expect(parseCatalogLink('https://music.163.com/playlist?id=3778678')).toEqual({
      provider: 'wy',
      kind: 'playlist',
      id: '3778678'
    })
    expect(parseCatalogLink('https://y.qq.com/n/ryqq/albumDetail/0024bjiL2aocxT')).toEqual({
      provider: 'tx',
      kind: 'album',
      id: '0024bjiL2aocxT'
    })
    expect(parseCatalogLink('https://y.qq.com/n/ryqq/playlist/7217720898')).toEqual({
      provider: 'tx',
      kind: 'playlist',
      id: '7217720898'
    })
    expect(parseCatalogLink('https://www.kuwo.cn/album_detail/14466')).toEqual({
      provider: 'kw',
      kind: 'album',
      id: '14466'
    })
    expect(parseCatalogLink('https://www.kuwo.cn/playlist_detail/2867496601')).toEqual({
      provider: 'kw',
      kind: 'playlist',
      id: '2867496601'
    })
    expect(parseCatalogLink('https://www.kugou.com/yy/album/single/958909.html')).toEqual({
      provider: 'kg',
      kind: 'album',
      id: '958909'
    })
    expect(parseCatalogLink('https://www.kugou.com/yy/special/single/1067062.html')).toEqual({
      provider: 'kg',
      kind: 'playlist',
      id: '1067062'
    })
    expect(parseCatalogLink('https://music.migu.cn/v3/music/album/1140505221')).toEqual({
      provider: 'mg',
      kind: 'album',
      id: '1140505221'
    })
    expect(parseCatalogLink('https://music.migu.cn/v3/music/playlist/233754996')).toEqual({
      provider: 'mg',
      kind: 'playlist',
      id: '233754996'
    })
  })

  it('builds deterministic quality fallback lists', () => {
    expect(qualityCandidates('auto', ['128k', 'flac'])).toEqual(['flac', '128k'])
    expect(qualityCandidates('auto', ['128k', 'flac'], true)).toEqual(['128k', 'flac'])
    expect(qualityCandidates('320k', ['128k', 'flac'])).toEqual(['320k'])
  })

  it('sanitizes filenames for Windows and macOS', () => {
    expect(sanitizeFilename('A/B:C*D?', 'mp3')).toBe('A_B_C_D_.mp3')
    expect(sanitizeFilename('  歌曲.  ', '.flac')).toBe('歌曲.flac')
  })

  it('parses source script headers', () => {
    const script = `/**
 * @name 测试音源
 * @description 一个测试脚本
 * @version 1.2.3
 * @author tester
 * @homepage https://example.com
 */`
    expect(parseSourceHeader(script)).toEqual({
      name: '测试音源',
      description: '一个测试脚本',
      version: '1.2.3',
      author: 'tester',
      homepage: 'https://example.com'
    })
  })

  it('scores matching versions and penalizes artist mismatch', () => {
    const exact = matchScore(
      { title: '夜曲', artist: '周杰伦', durationSec: 226 },
      { title: '夜曲', artist: '周杰伦', durationSec: 226 }
    )
    const wrongArtist = matchScore(
      { title: '夜曲', artist: '周杰伦', durationSec: 226 },
      { title: '夜曲', artist: '其他歌手', durationSec: 226 }
    )
    expect(exact).toBeGreaterThan(0.95)
    expect(wrongArtist).toBeLessThan(exact)
  })

  it('clamps preview playback to the first 60 seconds', () => {
    expect(clampPreviewPosition(-3)).toBe(0)
    expect(clampPreviewPosition(12.5)).toBe(12.5)
    expect(clampPreviewPosition(61)).toBe(60)
    expect(clampPreviewPosition(Number.NaN)).toBe(0)
  })

  it('summarizes upload task stages', () => {
    const list = [
      draft('queued', 'a'),
      draft('downloading', 'b'),
      draft('completed', 'c'),
      draft('failed', 'd'),
      draft('skipped', 'e')
    ]
    expect(summarizeUploads(list)).toEqual({
      batchId: 'batch',
      total: 5,
      success: 1,
      failed: 1,
      skipped: 1,
      running: 2
    })
  })

  it('maps source track metadata into editable defaults', () => {
    const track: TrackRef = {
      key: 'wy:1',
      provider: 'wy',
      native: { songmid: '1' },
      title: '夜曲',
      artists: ['周杰伦'],
      album: '十一月的萧邦'
    }
    expect(defaultMetadata(track)).toMatchObject({
      title: '夜曲',
      artists: ['周杰伦'],
      album: '十一月的萧邦',
      albumArtist: '周杰伦'
    })
  })
})
