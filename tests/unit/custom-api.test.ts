import { describe, expect, it } from 'vitest'
import type { TrackRef } from '@shared/types'
import { buildCustomApiUrl } from '../../src/main/providers/custom-api'

const track: TrackRef = {
  key: 'tx:003mksrh3dmBtW',
  provider: 'tx',
  native: { songId: 733313366, songmid: '003mksrh3dmBtW' },
  title: '寸寸',
  artists: ['袁娅维TIA RAY', '张杰'],
  album: '嫁金钗 影视原声带',
  durationSec: 229.4
}

describe('custom API URL builder', () => {
  it('replaces placeholders with encoded track metadata', () => {
    const url = buildCustomApiUrl(
      'https://lrc.example/lyrics?title={title}&artist={artist}&duration={duration}&songId={songId}',
      track
    )
    expect(url).toBe(
      'https://lrc.example/lyrics?title=%E5%AF%B8%E5%AF%B8&artist=%E8%A2%81%E5%A8%85%E7%BB%B4TIA%20RAY&duration=229&songId=733313366'
    )
  })

  it('appends query parameters when the template has no placeholders', () => {
    const url = new URL(buildCustomApiUrl('https://lrc.xms.mx/lyrics', track)!)
    expect(url.searchParams.get('title')).toBe('寸寸')
    expect(url.searchParams.get('artist')).toBe('袁娅维TIA RAY')
    expect(url.searchParams.get('artists')).toBe('袁娅维TIA RAY、张杰')
    expect(url.searchParams.get('album')).toBe('嫁金钗 影视原声带')
    expect(url.searchParams.get('duration')).toBe('229')
    expect(url.searchParams.get('provider')).toBe('tx')
    expect(url.searchParams.get('songId')).toBe('733313366')
  })

  it('rejects empty and non-HTTP endpoints', () => {
    expect(buildCustomApiUrl('', track)).toBeUndefined()
    expect(buildCustomApiUrl('ftp://example.com/lyrics', track)).toBeUndefined()
    expect(buildCustomApiUrl('not a url', track)).toBeUndefined()
  })
})
