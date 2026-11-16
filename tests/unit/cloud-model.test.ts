import { describe, expect, it } from 'vitest'
import { cloudSongFromRaw } from '../../src/main/services/cloud-model'

describe('cloud song model', () => {
  it('uses privateCloud.songId as the cloud file id and keeps the public song id separate', () => {
    const song = cloudSongFromRaw({
      id: 9001,
      songId: 9002,
      fileName: '测试.mp3',
      privateCloud: { songId: 631161079838 },
      simpleSong: {
        id: 3462183016,
        name: '晃悠青年',
        ar: [{ name: '张弛' }],
        al: { name: '小城良方 电视剧原声大碟' },
        dt: 224000
      }
    })
    expect(song).toMatchObject({
      cloudId: 631161079838,
      matchedSongId: 3462183016,
      title: '晃悠青年',
      artist: '张弛',
      album: '小城良方 电视剧原声大碟',
      durationSec: 224
    })
  })

  it('falls back to privateCloud.songId when simpleSong.id is absent', () => {
    const song = cloudSongFromRaw({
      fileName: '测试.mp3',
      privateCloud: { songId: 631160000001 },
      songName: '测试歌曲'
    })
    expect(song?.cloudId).toBe(631160000001)
    expect(song?.matchedSongId).toBeUndefined()
  })

  it('falls back to item id when privateCloud is absent', () => {
    const song = cloudSongFromRaw({
      id: 9001,
      songName: '测试歌曲'
    })
    expect(song?.cloudId).toBe(9001)
  })

  it('ignores entries without any usable cloud id', () => {
    expect(cloudSongFromRaw({ fileName: '无 ID.mp3' })).toBeNull()
  })

  it('does not treat the cloud file id as a matched NetEase song id', () => {
    const song = cloudSongFromRaw({
      fileName: '晃悠青年.mp3',
      songId: 631161079838,
      privateCloud: { songId: 631161079838 }
    })
    expect(song?.cloudId).toBe(631161079838)
    expect(song?.matchedSongId).toBeUndefined()
  })

  it('does not use a public simpleSong id as the cloud file id', () => {
    const song = cloudSongFromRaw({
      fileName: '慌啥子嘛.mp3',
      songId: 3462183016,
      privateCloud: { songId: 631161079839 },
      simpleSong: {
        id: 3462183016,
        name: '慌啥子嘛 (赵本山版)(伴奏)'
      }
    })
    expect(song?.cloudId).toBe(631161079839)
    expect(song?.matchedSongId).toBe(3462183016)
    expect(song?.cloudId).not.toBe(song?.matchedSongId)
  })
})
