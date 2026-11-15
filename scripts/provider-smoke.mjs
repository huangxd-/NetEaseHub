import { _electron as electron } from '@playwright/test'

const SEARCH_QUERY = '周杰伦'
const ALBUM_IDS = {
  kw: '14466',
  kg: '958909',
  tx: '0024bjiL2aocxT',
  wy: '512175',
  mg: '8592'
}
const PLAYLIST_IDS = {
  kw: '2867496601',
  kg: '6409645',
  tx: '7217720898',
  wy: '3778678',
  mg: '233754996'
}

function providerResult(result, provider) {
  if (!result.ok) return result
  return result.data.find(item => item.provider === provider)
}

function describeCatalog(catalog) {
  return {
    name: catalog.name,
    total: catalog.total,
    tracks: catalog.tracks.length,
    first: catalog.tracks[0]
      ? `${catalog.tracks[0].title} / ${catalog.tracks[0].artists.join('、')}`
      : '无曲目'
  }
}

function describeTrackPage(page) {
  return {
    total: page.total,
    tracks: page.list.length,
    first: page.list[0]
      ? `${page.list[0].title} / ${page.list[0].artists.join('、')}`
      : '无曲目'
  }
}

const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    NODE_ENV: 'test',
    NETEASEHUB_E2E: '1',
    NETEASEHUB_E2E_USER_DATA: `neteasehub-provider-smoke-${process.pid}-${Date.now()}`
  }
})

let failed = false
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const accept = page.getByRole('button', { name: '我已了解并继续' })
  if (await accept.isVisible().catch(() => false)) await accept.click()

  const search = await page.evaluate(async query => {
    return window.neteasehub.search.query({ query, provider: 'all', page: 1, limit: 10 })
  }, SEARCH_QUERY)

  console.log('\n搜索')
  for (const provider of Object.keys(ALBUM_IDS)) {
    const item = providerResult(search, provider)
    if (!search.ok || !item) {
      failed = true
      console.log(`${provider}: 失败 ${search.ok ? '缺少结果' : search.error.message}`)
      continue
    }
    console.log(
      `${provider}: ${item.list.length} 首，共 ${item.total}${item.error ? `，错误：${item.error}` : ''}`
    )
    if (!item.list.length) failed = true
  }

  const artistByProvider = {}
  for (const kind of ['album', 'playlist', 'artist']) {
    console.log(`\n${kind === 'album' ? '专辑' : kind === 'playlist' ? '歌单' : '歌手'}搜索`)
    const entities = await page.evaluate(
      async input => window.neteasehub.search.entities(input),
      { query: SEARCH_QUERY, provider: 'all', kind, page: 1, limit: 5 }
    )
    for (const provider of Object.keys(ALBUM_IDS)) {
      const item = providerResult(entities, provider)
      if (!entities.ok || !item || !item.list.length) {
        failed = true
        console.log(`${provider}: 失败 ${entities.ok ? '无结果' : entities.error.message}`)
        continue
      }
      console.log(
        `${provider}: ${item.list.length} 条，共 ${item.total}${item.error ? `，错误：${item.error}` : ''}`
      )
      if (kind === 'artist') artistByProvider[provider] = item.list[0]
    }
  }

  console.log('\n歌手曲目')
  for (const [provider, artist] of Object.entries(artistByProvider)) {
    const result = await page.evaluate(
      async input => window.neteasehub.search.artistTracks(input),
      { provider, artistId: artist.id, page: 1, limit: 5 }
    )
    if (!result.ok || !result.data.list.length) {
      failed = true
      console.log(`${provider} ${artist.name}: ${result.ok ? '无曲目' : result.error.message}`)
      continue
    }
    console.log(`${provider} ${artist.name}:`, describeTrackPage(result.data))
  }

  console.log('\n专辑')
  for (const [provider, id] of Object.entries(ALBUM_IDS)) {
    const result = await page.evaluate(
      async input => window.neteasehub.search.catalog(input),
      { provider, kind: 'album', value: id }
    )
    if (!result.ok) {
      failed = true
      console.log(`${provider} ${id}: ${result.error.message}`)
      continue
    }
    console.log(`${provider} ${id}:`, describeCatalog(result.data))
    if (!result.data.tracks.length) failed = true
  }

  console.log('\n歌单')
  for (const [provider, id] of Object.entries(PLAYLIST_IDS)) {
    const result = await page.evaluate(
      async input => window.neteasehub.search.catalog(input),
      { provider, kind: 'playlist', value: id }
    )
    if (!result.ok) {
      failed = true
      console.log(`${provider} ${id}: ${result.error.message}`)
      continue
    }
    console.log(`${provider} ${id}:`, describeCatalog(result.data))
    if (!result.data.tracks.length) failed = true
  }
} finally {
  await app.close()
}

if (failed) process.exitCode = 1
