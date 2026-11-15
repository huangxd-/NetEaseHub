import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveCatalog,
  searchAllProviders,
  searchProvider
} from '../../src/main/providers'
import type { ProviderId } from '@shared/types'

const json = (value: unknown) => JSON.stringify(value)

const kwTrack = {
  MUSICRID: 'MUSIC_101',
  NAME: '夜曲',
  ARTIST: '周杰伦',
  ALBUM: '十一月的萧邦',
  ALBUMID: '14466',
  DURATION: '226',
  N_MINFO: 'level:p,bitrate:320,format:mp3,size:11.42Mb;'
}

const kgTrack = {
  Audioid: '201',
  SongName: '夜曲',
  SingerName: '周杰伦',
  AlbumID: '958909',
  AlbumName: '十一月的萧邦',
  Duration: 226,
  FileHash: 'KG_HASH',
  FileSize: 4_000_000
}

const txTrack = {
  title: '夜曲',
  mid: 'TX_MID',
  interval: 226,
  album: { mid: 'TX_ALBUM', name: '十一月的萧邦' },
  singer: [{ name: '周杰伦' }],
  file: {
    media_mid: 'TX_MEDIA',
    size_128mp3: 4_000_000,
    size_320mp3: 8_000_000,
    size_flac: 20_000_000,
    size_hires: 0
  }
}

const wyTrack = {
  id: 301,
  name: '夜曲',
  ar: [{ name: '周杰伦' }],
  al: { id: 512175, name: '十一月的萧邦', picUrl: 'https://example.com/wy.jpg' },
  dt: 226_000,
  privilege: { maxbr: 320000 }
}

const mgTrack = {
  songId: '401',
  songName: '夜曲',
  singers: [{ name: '周杰伦' }],
  albums: [{ id: '1140505221', name: '十一月的萧邦' }],
  duration: 226,
  imgItems: [{ img: 'https://example.com/mg.jpg' }],
  audioFormats: [
    { formatType: 'PQ', asize: '4000000' },
    { formatType: 'HQ', asize: '8000000' },
    { formatType: 'SQ', asize: '20000000' }
  ]
}

function responseData(config: { url?: string; method?: string; data?: unknown }): string {
  const url = String(config.url ?? '')

  if (url.includes('search.kuwo.cn') && url.includes('stype=albuminfo')) {
    return json({ name: '十一月的萧邦', artist: '周杰伦', songnum: 1, img: 'kw.jpg', musiclist: [kwTrack] })
  }
  if (url.includes('nplserver.kuwo.cn')) {
    return json({ title: '酷我测试歌单', uname: '酷我用户', songnum: 1, musiclist: [kwTrack] })
  }
  if (url.includes('search.kuwo.cn')) {
    return json({ TOTAL: '1', abslist: [kwTrack] })
  }

  if (url.includes('album/info')) {
    return json({
      data: {
        albumname: '十一月的萧邦',
        singername: '周杰伦',
        songcount: 1,
        imgurl: 'https://example.com/kg.jpg',
        intro: '酷狗专辑介绍'
      }
    })
  }
  if (url.includes('album/song')) {
    return json({ data: { total: 1, info: [kgTrack] } })
  }
  if (url.includes('special/single/')) {
    return `<!doctype html><div class="pc_specail_info"><img class="loadPic" src="https://example.com/kg-playlist.jpg"><h3>酷狗测试歌单</h3></div>
<script>global.data = ${json([kgTrack])};</script>`
  }
  if (url.includes('songsearch.kugou.com')) {
    return json({ data: { total: 1, lists: [kgTrack] } })
  }

  if (url.includes('musics.fcg')) {
    return json({
      code: 0,
      'music.search.SearchCgiService': {
        code: 0,
        data: { body: { song: { list: [txTrack] } }, meta: { sum: 1 } }
      }
    })
  }
  if (url.includes('fcg_v8_album_info_cp.fcg')) {
    return json({
      code: 0,
      data: { name: '十一月的萧邦', singername: '周杰伦', total: 1, list: [txTrack] }
    })
  }
  if (url.includes('fcg_ucc_getcdinfo_byids_cp.fcg')) {
    return json({
      code: 0,
      cdlist: [
        {
          dissname: 'QQ 测试歌单',
          nickname: 'QQ 用户',
          songnum: 1,
          logo: 'https://example.com/tx-playlist.jpg',
          songlist: [txTrack]
        }
      ]
    })
  }

  if (url.includes('music.163.com/api/v1/album')) {
    return json({
      album: {
        name: '十一月的萧邦',
        picUrl: 'https://example.com/wy-album.jpg',
        size: 1
      },
      songs: [wyTrack]
    })
  }
  if (url.includes('playlist/detail')) {
    return json({
      playlist: {
        name: '网易云测试歌单',
        coverImgUrl: 'https://example.com/wy-playlist.jpg',
        trackCount: 1,
        tracks: [wyTrack],
        creator: { nickname: '网易云用户' }
      }
    })
  }
  if (url.includes('music.163.com/api/cloudsearch')) {
    return json({ result: { songs: [wyTrack], songCount: 1 } })
  }

  if (url.includes('queryAlbumSong')) {
    return json({
      code: '000000',
      data: { totalCount: 1, songList: [mgTrack] }
    })
  }
  if (url.includes('search_all.do')) {
    return json({
      code: '000000',
      songResultData: { totalCount: '1', resultList: [[mgTrack]] }
    })
  }
  if (url.includes('resource/album/v2.0')) {
    return json({
      code: '000000',
      data: {
        title: '十一月的萧邦',
        singer: '周杰伦',
        totalCount: 1,
        imgItems: [{ img: 'https://example.com/mg-album.jpg' }]
      }
    })
  }
  if (url.includes('playlist/song/v2.0')) {
    const pageNo = Number(new URL(url).searchParams.get('pageNo'))
    return json({
      code: '000000',
      data: {
        totalCount: '51',
        songList:
          pageNo === 1
            ? Array.from({ length: 50 }, (_, index) => ({
                ...mgTrack,
                songId: String(400 + index)
              }))
            : [{ ...mgTrack, songId: '499', songName: '最后一首' }]
      }
    })
  }
  if (url.includes('resource/playlist/v2.0')) {
    return json({
      code: '000000',
      data: {
        title: '咪咕测试歌单',
        songCount: 51,
        ownerName: '咪咕用户',
        imgItem: { img: 'https://example.com/mg-playlist.jpg' }
      }
    })
  }

  throw new Error(`Unhandled fixture URL: ${url}`)
}

describe('provider fixture integration', () => {
  beforeEach(() => {
    vi.spyOn(axios, 'request').mockImplementation(async config => {
      return {
        data: responseData(config as { url?: string; method?: string; data?: unknown }),
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

  it('parses search results from all five providers', async () => {
    const results = await searchAllProviders('夜曲', 1, 10)
    expect(results.map(result => result.provider)).toEqual(['kw', 'kg', 'tx', 'wy', 'mg'])
    for (const result of results) {
      expect('error' in result ? result.error : undefined).toBeUndefined()
      expect(result.list).toHaveLength(1)
      expect(result.list[0]).toMatchObject({
        title: '夜曲',
        artists: ['周杰伦'],
        album: '十一月的萧邦'
      })
    }
  })

  it.each([
    ['kw', '酷我'],
    ['kg', '酷狗'],
    ['tx', 'QQ'],
    ['wy', '网易云'],
    ['mg', '咪咕']
  ] as Array<[ProviderId, string]>)('loads %s album and playlist fixtures', async provider => {
    const album = await resolveCatalog(provider, 'album', 'fixture-album')
    expect(album.tracks).toHaveLength(1)
    expect(album.name).toBe('十一月的萧邦')

    const playlist = await resolveCatalog(provider, 'playlist', 'fixture-playlist')
    expect(playlist.tracks.length).toBeGreaterThan(0)
    expect(playlist.name.length).toBeGreaterThan(0)
  })

  it('paginates Migu playlists beyond the 50-song API page cap', async () => {
    const playlist = await resolveCatalog('mg', 'playlist', '233754996')
    expect(playlist.total).toBe(51)
    expect(playlist.tracks).toHaveLength(51)
    expect(playlist.tracks.at(-1)?.title).toBe('最后一首')
  })

  it('reports a provider failure without rejecting the aggregate search', async () => {
    vi.mocked(axios.request).mockImplementation(async config => {
      const url = String((config as { url?: string }).url ?? '')
      if (url.includes('music.163.com')) throw new Error('fixture failure')
      return {
        data: responseData(config as { url?: string }),
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      } as never
    })
    const results = await searchAllProviders('夜曲', 1, 10)
    const wy = results.find(result => result.provider === 'wy')
    expect(wy).toMatchObject({ list: [], total: 0 })
    expect(wy && 'error' in wy ? wy.error : '').toContain('fixture failure')
  })

  it('keeps single-provider search isolated', async () => {
    const result = await searchProvider('tx', '夜曲', 1, 10)
    expect(result.provider).toBe('tx')
    expect(result.list[0].native.media_mid).toBe('TX_MEDIA')
  })
})
