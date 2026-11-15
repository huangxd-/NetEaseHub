import { describe, expect, it } from 'vitest'
import { buildTagPatch } from '../../src/main/services/tag-writer'

describe('tag writer', () => {
  it('maps editable metadata into a music-metadata tag patch', () => {
    const patch = buildTagPatch(
      {
        title: '夜曲',
        artists: ['周杰伦', '方文山'],
        album: '十一月的萧邦',
        albumArtist: '周杰伦',
        trackNo: 1,
        trackTotal: 12,
        discNo: 1,
        discTotal: 1,
        year: '2005',
        genre: '华语流行'
      },
      {
        lyrics: '[00:00.00]夜曲',
        cover: {
          mime: 'image/jpeg',
          data: new Uint8Array([1, 2, 3])
        }
      }
    )

    expect(patch.title).toBe('夜曲')
    expect(patch.artist).toBe('周杰伦、方文山')
    expect(patch.artists).toEqual(['周杰伦', '方文山'])
    expect(patch.track).toEqual({ no: 1, of: 12 })
    expect(patch.disk).toEqual({ no: 1, of: 1 })
    expect(patch.date).toBe('2005')
    expect(patch.lyrics).toBe('[00:00.00]夜曲')
    expect((patch.picture as any[])[0].format).toBe('image/jpeg')
  })
})
