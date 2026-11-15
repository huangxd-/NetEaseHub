import axios from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getArtistTracks,
  resolveCatalog,
  searchAllEntities,
  searchAllProviders,
  searchEntities,
  searchProvider
} from '../../src/main/providers'
import { decodeName } from '../../src/main/providers/helpers'
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

const kwEntityFixtures = {
  album: {
    albumid: '69918657',
    name: '十一月的萧邦',
    artist: '周杰伦',
    hts_img: 'https://example.com/kw-album.jpg',
    pub: '2005-11-01',
    musiccnt: '12'
  },
  playlist: {
    playlistid: '2867496601',
    name: '酷我测试歌单',
    nickname: '酷我用户',
    pic: 'https://example.com/kw-playlist.jpg',
    songnum: '18',
    intro: '酷我歌单介绍'
  },
  artist: {
    ARTISTID: '336',
    ARTIST: '周杰伦',
    PICPATH: '240/example.jpg',
    ALBUMNUM: '45',
    SONGNUM: '1708',
    COUNTRY: '中国台湾'
  }
}

const kgEntityFixtures = {
  album: {
    albumid: 958909,
    albumname: '十一月的萧邦',
    singername: '周杰伦',
    songcount: 12,
    imgurl: 'https://example.com/kg-album.jpg',
    publishtime: '2005-11-01'
  },
  playlist: {
    specialid: 6409645,
    specialname: '酷狗测试歌单',
    nickname: '酷狗用户',
    songcount: 194,
    imgurl: 'https://example.com/kg-playlist-search.jpg',
    intro: '酷狗歌单介绍'
  },
  artist: {
    singerid: 3520,
    singername: '周杰伦'
  }
}

const txEntityFixtures = {
  album: {
    albumMID: 'TX_ALBUM',
    albumName: '十一月的萧邦',
    singerName: '周杰伦',
    albumPic: 'https://example.com/tx-album.jpg',
    publicTime: '2005-11-01',
    song_count: 12
  },
  artist: {
    singerMID: '0025NhlN2yWrP4',
    singerName: '周杰伦',
    singerPic: 'https://example.com/tx-artist.jpg',
    albumNum: 43,
    songNum: 1013
  },
  playlist: {
    dissid: '7217720898',
    dissname: 'QQ 测试歌单',
    creator: { name: 'QQ 用户' },
    imgurl: 'https://example.com/tx-playlist-search.jpg',
    introduction: 'QQ 歌单介绍',
    song_count: 24
  }
}

const wyEntityFixtures = {
  album: {
    id: 18909,
    name: '十一月的萧邦',
    picUrl: 'https://example.com/wy-album-search.jpg',
    publishTime: Date.UTC(2005, 10, 1),
    size: 12,
    artist: { name: '周杰伦' }
  },
  artist: {
    id: 6452,
    name: '周杰伦',
    picUrl: 'https://example.com/wy-artist.jpg',
    alias: ['Jay Chou'],
    albumSize: 45,
    musicSize: 591
  },
  playlist: {
    id: 6792103822,
    name: '网易云测试歌单',
    coverImgUrl: 'https://example.com/wy-playlist-search.jpg',
    creator: { nickname: '网易云用户' },
    trackCount: 145,
    description: '网易云歌单介绍'
  }
}

const mgEntityFixtures = {
  album: {
    id: '1140505221',
    resourceType: '2003',
    type: '1',
    name: '十一月的萧邦',
    singer: '周杰伦',
    publishDate: '2005-11-01',
    imgItems: [{ img: 'https://example.com/mg-album-search.jpg' }]
  },
  digitalAlbum: {
    id: '600927015009000944',
    resourceType: '5',
    type: '2',
    name: '数字专辑',
    singer: '周杰伦',
    imgItems: [{ img: 'https://example.com/mg-digital.jpg' }]
  },
  artist: {
    id: '112',
    name: '周杰伦'
  },
  playlist: {
    id: '233754996',
    name: '咪咕测试歌单',
    musicNum: '100',
    musicListPicUrl: 'https://example.com/mg-playlist-search.jpg',
    ts: ['流行', '中国风']
  }
}

const kgArtistTrack = {
  audio_id: '339589',
  filename: '周杰伦 - 发如雪',
  album_name: '十一月的萧邦',
  album_id: '958909',
  duration: 299,
  filesize: 4_789_176,
  '320filesize': 11_972_641,
  sqfilesize: 36_226_753,
  filesize_high: 0,
  hash: 'KG_128',
  '320hash': 'KG_320',
  sqhash: 'KG_FLAC'
}

it('decodes provider display text consistently', () => {
  expect(decodeName('派伟俊\\u0026周杰伦&nbsp;Live')).toBe('派伟俊&周杰伦 Live')
})

function responseData(config: { url?: string; method?: string; data?: unknown }): string {
  const url = String(config.url ?? '')
  const parsedUrl = new URL(url)

  if (url.includes('search/album') && url.includes('kugou.com')) {
    return json({ status: 1, data: { total: 1, info: [kgEntityFixtures.album] } })
  }
  if (url.includes('search/special') && url.includes('kugou.com')) {
    return json({ status: 1, data: { total: 1, info: [kgEntityFixtures.playlist] } })
  }
  if (url.includes('search/singer') && url.includes('kugou.com')) {
    return json({ status: 1, data: [kgEntityFixtures.artist] })
  }
  if (url.includes('mobiles.kugou.com/api/v5/singer/song')) {
    return json({ data: { total: 1, info: [kgArtistTrack] } })
  }

  if (url.includes('search.kuwo.cn') && url.includes('stype=albuminfo')) {
    return json({ name: '十一月的萧邦', artist: '周杰伦', songnum: 1, img: 'kw.jpg', musiclist: [kwTrack] })
  }
  if (url.includes('nplserver.kuwo.cn')) {
    return json({ title: '酷我测试歌单', uname: '酷我用户', songnum: 1, musiclist: [kwTrack] })
  }
  if (url.includes('search.kuwo.cn')) {
    const kind = parsedUrl.searchParams.get('ft')
    if (kind === 'album') {
      return json({ SHOW: '1', total: '1', albumlist: [kwEntityFixtures.album] })
    }
    if (kind === 'playlist') {
      return json({ TOTAL: '1', abslist: [kwEntityFixtures.playlist] })
    }
    if (kind === 'artist') {
      return json({ TOTAL: '1', abslist: [kwEntityFixtures.artist] })
    }
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
    const payload =
      typeof config.data === 'string' ? (JSON.parse(config.data) as Record<string, any>) : {}
    const searchType =
      payload['music.search.SearchCgiService']?.param?.search_type ?? 0
    const body =
      searchType === 2
        ? { album: { list: [txEntityFixtures.album] } }
        : searchType === 1
          ? { singer: { list: [txEntityFixtures.artist] } }
          : { song: { list: [txTrack] } }
    return json({
      code: 0,
      'music.search.SearchCgiService': {
        code: 0,
        data: { body, meta: { sum: 1 } }
      }
    })
  }
  if (url.includes('musicu.fcg')) {
    return json({
      code: 0,
      req: {
        code: 0,
        data: {
          totalNum: 1,
          songList: [{ songInfo: txTrack }]
        }
      }
    })
  }
  if (url.includes('client_music_search_songlist')) {
    return json({ code: 0, data: { list: [txEntityFixtures.playlist], sum: 1 } })
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
  if (url.includes('music.163.com/api/v1/artist/songs')) {
    return json({ songs: [wyTrack], total: 1, more: false })
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
    const type = Number(parsedUrl.searchParams.get('type') ?? 1)
    if (type === 10) {
      return json({ result: { albums: [wyEntityFixtures.album], albumCount: 1 } })
    }
    if (type === 100) {
      return json({ result: { artists: [wyEntityFixtures.artist], artistCount: 1 } })
    }
    if (type === 1000) {
      return json({ result: { playlists: [wyEntityFixtures.playlist], playlistCount: 1 } })
    }
    return json({ result: { songs: [wyTrack], songCount: 1 } })
  }

  if (url.includes('queryAlbumSong')) {
    return json({
      code: '000000',
      data: { totalCount: 1, songList: [mgTrack] }
    })
  }
  if (url.includes('search_all.do')) {
    const searchSwitch = JSON.parse(
      parsedUrl.searchParams.get('searchSwitch') ?? '{}'
    ) as Record<string, number>
    if (searchSwitch.album) {
      return json({
        code: '000000',
        albumResultData: {
          totalCount: '2',
          result: [mgEntityFixtures.digitalAlbum, mgEntityFixtures.album]
        }
      })
    }
    if (searchSwitch.singer) {
      return json({
        code: '000000',
        singerResultData: { totalCount: '1', result: [mgEntityFixtures.artist] }
      })
    }
    if (searchSwitch.songlist) {
      return json({
        code: '000000',
        songListResultData: { totalCount: '1', result: [mgEntityFixtures.playlist] }
      })
    }
    return json({
      code: '000000',
      songResultData: { totalCount: '1', resultList: [[mgTrack]] }
    })
  }
  if (url.includes('pc/bmw/singer/song/v1.0')) {
    return json({
      code: '000000',
      data: {
        header: {},
        contents: [{ view: 'ZJ-Singer-Song-Scroll', contents: [{ songItem: mgTrack }] }]
      }
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

  it.each(['album', 'playlist', 'artist'] as const)(
    'searches %s entities across all five providers',
    async kind => {
      const results = await searchAllEntities('周杰伦', kind, 1, 10)
      expect(results.map(result => result.provider)).toEqual(['kw', 'kg', 'tx', 'wy', 'mg'])
      for (const result of results) {
        expect('error' in result ? result.error : undefined).toBeUndefined()
        expect(result.kind).toBe(kind)
        expect(result.list.length).toBeGreaterThan(0)
        expect(result.list[0]).toMatchObject({
          provider: result.provider,
          kind
        })
        expect(result.list[0].key).toContain(`${result.provider}:${kind}:`)
      }
    }
  )

  it('filters Migu digital albums that the catalog resolver cannot open', async () => {
    const result = await searchEntities('mg', 'album', '周杰伦', 1, 10)
    expect(result.list).toHaveLength(1)
    expect(result.list[0]).toMatchObject({
      id: '1140505221',
      name: '十一月的萧邦'
    })
  })

  it.each([
    ['kw', '酷我'],
    ['kg', '酷狗'],
    ['tx', 'QQ'],
    ['wy', '网易云'],
    ['mg', '咪咕']
  ] as Array<[ProviderId, string]>)('loads %s artist tracks by exact id', async provider => {
    const result = await getArtistTracks(provider, 'fixture-artist', 1, 10)
    expect(result.provider).toBe(provider)
    expect(result.artistId).toBe('fixture-artist')
    expect(result.list.length).toBeGreaterThan(0)
    expect(result.list[0]).toMatchObject({
      provider,
      title: expect.any(String),
      artists: expect.any(Array)
    })
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

  it('isolates entity search failures per provider', async () => {
    vi.mocked(axios.request).mockImplementation(async config => {
      const url = String((config as { url?: string }).url ?? '')
      if (url.includes('search.kuwo.cn')) throw new Error('kuwo fixture failure')
      return {
        data: responseData(config as { url?: string }),
        status: 200,
        statusText: 'OK',
        headers: {},
        config
      } as never
    })
    const results = await searchAllEntities('周杰伦', 'artist', 1, 10)
    const kw = results.find(result => result.provider === 'kw')
    expect(kw).toMatchObject({ list: [], total: 0 })
    expect(kw && 'error' in kw ? kw.error : '').toContain('kuwo fixture failure')
    expect(results.filter(result => !('error' in result) || !result.error)).toHaveLength(4)
  })

  it('keeps single-provider search isolated', async () => {
    const result = await searchProvider('tx', '夜曲', 1, 10)
    expect(result.provider).toBe('tx')
    expect(result.list[0].native.media_mid).toBe('TX_MEDIA')
  })
})
