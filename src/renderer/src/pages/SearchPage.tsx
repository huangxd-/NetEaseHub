import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  Disc3,
  Headphones,
  Link2,
  ListMusic,
  LoaderCircle,
  Search,
  Settings2,
  Sparkles,
  UploadCloud,
  UserRound
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  CatalogInfo,
  ProviderId,
  ProviderArtistTracksResult,
  ProviderEntitySearchResult,
  ProviderSearchResult,
  SearchEntityRef,
  SearchKind,
  SearchRequest,
  TrackRef
} from '@shared/types'
import { MAX_PREVIEW_SECONDS, PROVIDERS, PROVIDER_IDS } from '@shared/constants'
import { parseCatalogLink } from '@shared/utils'
import { useAppStore } from '../store/app-store'
import { errorMessage, unwrap } from '../lib/api'
import { TrackTable, TrackTableToolbar } from '../components/TrackTable'
import { MetadataDialog } from '../components/MetadataDialog'
import { EntityCard } from '../components/EntityCard'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  NativeSelect,
  TextArea,
  ToggleRow,
  cn
} from '../components/ui'

type Mode = 'search' | 'catalog'

const SEARCH_KINDS: Array<{ kind: SearchKind; label: string; icon: typeof Search }> = [
  { kind: 'song', label: '歌曲', icon: Search },
  { kind: 'album', label: '专辑', icon: Disc3 },
  { kind: 'playlist', label: '歌单', icon: ListMusic },
  { kind: 'artist', label: '歌手', icon: UserRound }
]

const SEARCH_PLACEHOLDERS: Record<SearchKind, string> = {
  song: '搜索歌曲，例如：周杰伦 夜曲',
  album: '搜索专辑，例如：十一月的萧邦',
  playlist: '搜索歌单，例如：周杰伦精选',
  artist: '搜索歌手，例如：周杰伦'
}

export function SearchPage() {
  const page = useAppStore(state => state.page)
  void page
  const setPage = useAppStore(state => state.setPage)
  const auth = useAppStore(state => state.auth)
  const setLoginOpen = useAppStore(state => state.setLoginOpen)
  const openBatch = useAppStore(state => state.openBatch)
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<Mode>('search')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<SearchKind>('song')
  const [provider, setProvider] = useState<ProviderId | 'all'>('all')
  const [results, setResults] = useState<ProviderSearchResult[]>([])
  const [entityResults, setEntityResults] = useState<ProviderEntitySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [entitySearching, setEntitySearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [openingEntityKey, setOpeningEntityKey] = useState<string>()
  const [artistView, setArtistView] = useState<SearchEntityRef | null>(null)
  const [artistTracks, setArtistTracks] = useState<ProviderArtistTracksResult | null>(null)
  const [artistLoading, setArtistLoading] = useState(false)
  const [catalogLink, setCatalogLink] = useState('')
  const [catalogProvider, setCatalogProvider] = useState<ProviderId>('wy')
  const [catalogKind, setCatalogKind] = useState<'album' | 'playlist'>('album')
  const [catalog, setCatalog] = useState<CatalogInfo | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogSelected, setCatalogSelected] = useState<Set<string>>(new Set())
  const [editTrack, setEditTrack] = useState<TrackRef | null>(null)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [quickUploadTrack, setQuickUploadTrack] = useState<TrackRef | null>(null)
  const [quickWriteCover, setQuickWriteCover] = useState(true)
  const [quickWriteLyrics, setQuickWriteLyrics] = useState(true)
  const [quickLyrics, setQuickLyrics] = useState('')
  const [quickUploading, setQuickUploading] = useState(false)

  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: () => unwrap(window.neteasehub.sources.list())
  })
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => unwrap(window.neteasehub.settings.get())
  })
  const enabledSources = sources.filter(source => source.enabled)

  const visibleProviders = useMemo(
    () => (provider === 'all' ? PROVIDER_IDS : [provider]),
    [provider]
  )

  const scrollToTop = () => {
    document.querySelector('.page-scroll')?.scrollTo({ top: 0 })
  }

  const search = async (
    nextPage = 1,
    appendProvider?: ProviderId,
    searchKind: SearchKind = kind
  ) => {
    const text = query.trim()
    if (!text) {
      toast.error('请输入搜索关键词')
      return
    }

    if (searchKind !== 'song') {
      const request = {
        query: text,
        provider: appendProvider ?? provider,
        kind: searchKind,
        page: nextPage,
        limit: 20
      }
      setEntitySearching(true)
      try {
        const next = await unwrap(window.neteasehub.search.entities(request))
        if (appendProvider) {
          setEntityResults(current =>
            current.map(item =>
              item.provider === appendProvider
                ? {
                    ...next[0],
                    list: [...item.list, ...next[0].list],
                    error: undefined
                  }
                : item
            )
          )
        } else {
          setArtistView(null)
          setArtistTracks(null)
          setSearched(true)
          setEntityResults(next)
          const failed = next.filter(item => item.error)
          if (failed.length === next.length) {
            toast.error('所有平台搜索均失败，请稍后重试')
          } else if (failed.length) {
            toast.warning(`${failed.length} 个平台搜索失败，其余结果仍可查看`)
          }
        }
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        setEntitySearching(false)
      }
      return
    }

    if (appendProvider) {
      setSearching(true)
      try {
        const [next] = await unwrap(
          window.neteasehub.search.query({
            query: text,
            provider: appendProvider,
            page: nextPage,
            limit: 30
          })
        )
        setResults(current =>
          current.map(item =>
            item.provider === appendProvider
              ? {
                  ...next,
                  list: [...item.list, ...next.list],
                  error: undefined
                }
              : item
          )
        )
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        setSearching(false)
      }
      return
    }
    const request: SearchRequest = {
      query: text,
      provider,
      page: 1,
      limit: 30
    }
    setSearching(true)
    setSearched(true)
    try {
      const next = await unwrap(window.neteasehub.search.query(request))
      setResults(next)
      const failed = next.filter(item => item.error)
      if (failed.length === next.length) {
        toast.error('所有平台搜索均失败，请稍后重试')
      } else if (failed.length) {
        toast.warning(`${failed.length} 个平台搜索失败，其余结果仍可上传`)
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSearching(false)
    }
  }

  const selectKind = (next: SearchKind) => {
    if (next === kind) return
    setKind(next)
    setResults([])
    setEntityResults([])
    setSearched(false)
    setArtistView(null)
    setArtistTracks(null)
    if (query.trim()) void search(1, undefined, next)
  }

  const openEntity = async (entity: SearchEntityRef) => {
    setOpeningEntityKey(entity.key)
    scrollToTop()
    try {
      if (entity.kind === 'artist') {
        setArtistView(entity)
        setArtistTracks(null)
        setArtistLoading(true)
        const next = await unwrap(
          window.neteasehub.search.artistTracks({
            provider: entity.provider,
            artistId: entity.id,
            page: 1,
            limit: 50
          })
        )
        setArtistTracks(next)
        if (!next.list.length) {
          toast.info('该歌手暂无可解析曲目')
        }
        return
      }

      const result = await unwrap(
        window.neteasehub.search.catalog({
          value: entity.id,
          provider: entity.provider,
          kind: entity.kind
        })
      )
      setCatalog(result)
      setCatalogSelected(new Set(result.tracks.map(track => track.key)))
      setMode('catalog')
      toast.success(`已解析 ${result.kind === 'album' ? '专辑' : '歌单'}：${result.name}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setArtistLoading(false)
      setOpeningEntityKey(undefined)
    }
  }

  const loadMoreArtistTracks = async () => {
    if (!artistView || !artistTracks?.hasMore || artistLoading) return
    setArtistLoading(true)
    try {
      const next = await unwrap(
        window.neteasehub.search.artistTracks({
          provider: artistView.provider,
          artistId: artistView.id,
          page: artistTracks.page + 1,
          limit: artistTracks.limit
        })
      )
      setArtistTracks(current =>
        current
          ? {
              ...next,
              list: [...current.list, ...next.list]
            }
          : next
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setArtistLoading(false)
    }
  }

  const closeArtistView = () => {
    setArtistView(null)
    setArtistTracks(null)
    scrollToTop()
  }

  const resolveCatalog = async () => {
    const value = catalogLink.trim()
    if (!value) {
      toast.error('请输入专辑/歌单链接或 ID')
      return
    }
    const parsed = parseCatalogLink(value)
    setCatalogLoading(true)
    try {
      const result = await unwrap(
        window.neteasehub.search.catalog({
          value,
          provider: parsed?.provider ?? catalogProvider,
          kind: parsed?.kind ?? catalogKind
        })
      )
      setCatalog(result)
      setCatalogSelected(new Set(result.tracks.map(track => track.key)))
      scrollToTop()
      toast.success(`已解析 ${result.kind === 'album' ? '专辑' : '歌单'}：${result.name}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setCatalogLoading(false)
    }
  }

  const requireLogin = (): boolean => {
    if (auth.loggedIn) return true
    setLoginOpen(true)
    toast.error('请先扫码登录网易云音乐')
    return false
  }

  const quickUpload = (track: TrackRef) => {
    if (!requireLogin()) return
    setQuickUploadTrack(track)
    setQuickWriteCover(settings?.writeCover ?? true)
    setQuickWriteLyrics(settings?.writeLyrics ?? true)
    setQuickLyrics('')
  }

  const startQuickUpload = async () => {
    if (!quickUploadTrack) return
    setQuickUploading(true)
    try {
      await unwrap(
        window.neteasehub.uploads.enqueue({
          tracks: [quickUploadTrack],
          metadataOverrides: quickLyrics.trim() ? { lyrics: quickLyrics.trim() } : undefined,
          writeCover: quickWriteCover,
          writeLyrics: quickWriteLyrics
        })
      )
      await unwrap(window.neteasehub.uploads.start())
      await queryClient.invalidateQueries({ queryKey: ['uploads'] })
      await queryClient.invalidateQueries({ queryKey: ['upload-summary'] })
      toast.success(`已开始上传：${quickUploadTrack.title}`)
      setQuickUploadTrack(null)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setQuickUploading(false)
    }
  }

  const openEditor = (track: TrackRef) => {
    setEditTrack(track)
    setMetadataOpen(true)
  }

  const toggleCatalog = (key: string) => {
    setCatalogSelected(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectedCatalogTracks =
    catalog?.tracks.filter(track => catalogSelected.has(track.key)) ?? []

  return (
    <div className="page-enter">
      <section className="relative overflow-hidden pb-8 pt-5">
        <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-rose-500/[.08] blur-3xl" />
        <div className="relative flex items-start justify-between gap-10">
          <div className="max-w-[680px]">
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="accent">
                <Sparkles size={10} />
                五源聚合
              </Badge>
              <Badge tone="default">{MAX_PREVIEW_SECONDS} 秒版本确认</Badge>
              <Badge tone="default">批量上传</Badge>
            </div>
            <h1 className="text-[34px] font-semibold leading-[1.12] tracking-[-0.045em]">
              找到正确的版本，
              <br />
              再放进网易云云盘。
            </h1>
            <p className="mt-4 max-w-[570px] text-[13px] leading-6 text-[var(--text-muted)]">
              聚合酷我、酷狗、QQ、网易和咪咕检索，使用你导入的洛雪兼容音源解析音频。
              先试听 {MAX_PREVIEW_SECONDS} 秒，确认不是翻唱、Live 或错误版本，再写入标签上传。
            </p>
          </div>
          <div className="hidden w-[250px] shrink-0 grid-cols-3 gap-2 xl:grid">
            {[
              { icon: Search, value: '5', label: '音乐平台' },
              { icon: Headphones, value: `${MAX_PREVIEW_SECONDS}s`, label: '安全试听' },
              { icon: UploadCloud, value: '一键', label: '批量上传' }
            ].map(item => {
              const Icon = item.icon
              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[var(--border)] bg-white/[.025] p-3"
                >
                  <Icon size={15} className="text-rose-300" />
                  <div className="mt-4 min-h-7 whitespace-nowrap text-lg font-semibold leading-7 tracking-tight">
                    {item.value}
                  </div>
                  <div className="mt-0.5 text-[9px] text-[var(--text-dim)]">{item.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {!enabledSources.length ? (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[.055] px-4 py-3">
          <Settings2 size={16} className="text-amber-300" />
          <div className="flex-1 text-xs text-amber-100/75">
            目前没有启用的洛雪兼容音源。搜索可用，但试听和上传需要至少一个音源脚本。
          </div>
          <Button size="sm" variant="secondary" onClick={() => setPage('settings')}>
            去配置音源
          </Button>
        </div>
      ) : null}

      <Card className="p-2">
        <div className="flex items-center gap-1 rounded-[14px] bg-black/15 p-1">
          <button
            onClick={() => setMode('search')}
            className={cn(
              'no-drag flex h-9 items-center gap-2 rounded-[10px] px-4 text-xs transition',
              mode === 'search'
                ? 'bg-white/[.075] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            )}
          >
            <Search size={13} />
            在线搜索
          </button>
          <button
            onClick={() => setMode('catalog')}
            className={cn(
              'no-drag flex h-9 items-center gap-2 rounded-[10px] px-4 text-xs transition',
              mode === 'catalog'
                ? 'bg-white/[.075] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            )}
          >
            <ListMusic size={13} />
            链接解析
          </button>
        </div>

        {mode === 'search' ? (
          <div className="p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
                />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void search()
                  }}
                  autoFocus
                  placeholder={SEARCH_PLACEHOLDERS[kind]}
                  className="h-14 w-full rounded-2xl border border-[var(--border)] bg-black/20 pl-12 pr-4 text-[14px] outline-none transition placeholder:text-[var(--text-dim)] focus:border-rose-400/35 focus:ring-2 focus:ring-rose-500/10"
                />
              </div>
              <Button
                className="h-14 min-w-[112px] rounded-2xl"
                variant="primary"
                loading={kind === 'song' ? searching : entitySearching}
                onClick={() => void search()}
              >
                搜索
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex shrink-0 items-center gap-1 rounded-xl bg-black/15 p-1">
                {SEARCH_KINDS.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.kind}
                      onClick={() => selectKind(item.kind)}
                      className={cn(
                        'no-drag flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[11px] transition',
                        kind === item.kind
                          ? 'bg-white/[.075] text-[var(--text)]'
                          : 'text-[var(--text-dim)] hover:text-[var(--text-muted)]'
                      )}
                    >
                      <Icon size={12} />
                      {item.label}
                    </button>
                  )
                })}
              </div>
              <div className="h-5 w-px shrink-0 bg-[var(--border)]" />
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-auto pb-1">
                <button
                  onClick={() => setProvider('all')}
                  className={cn(
                    'no-drag shrink-0 rounded-lg px-3 py-1.5 text-[11px] transition',
                    provider === 'all'
                      ? 'bg-rose-500/12 text-rose-200'
                      : 'text-[var(--text-dim)] hover:bg-white/[.04] hover:text-[var(--text-muted)]'
                  )}
                >
                  全部平台
                </button>
                {PROVIDERS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setProvider(item.id)}
                    className={cn(
                      'no-drag flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] transition',
                      provider === item.id
                        ? 'bg-white/[.075] text-[var(--text)]'
                        : 'text-[var(--text-dim)] hover:bg-white/[.04] hover:text-[var(--text-muted)]'
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: item.color }}
                    />
                    {item.shortName}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2
                  size={17}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
                />
                <input
                  value={catalogLink}
                  onChange={event => setCatalogLink(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void resolveCatalog()
                  }}
                  placeholder="粘贴公开专辑 / 歌单链接，或输入 ID"
                  className="h-12 w-full rounded-xl border border-[var(--border)] bg-black/20 pl-11 pr-4 text-sm outline-none transition placeholder:text-[var(--text-dim)] focus:border-rose-400/35 focus:ring-2 focus:ring-rose-500/10"
                />
              </div>
              <NativeSelect
                className="h-12 w-[132px]"
                value={catalogProvider}
                onChange={event => setCatalogProvider(event.target.value as ProviderId)}
              >
                {PROVIDERS.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                className="h-12 w-[100px]"
                value={catalogKind}
                onChange={event =>
                  setCatalogKind(event.target.value as 'album' | 'playlist')
                }
              >
                <option value="album">专辑</option>
                <option value="playlist">歌单</option>
              </NativeSelect>
              <Button
                className="h-12 min-w-[100px] rounded-xl"
                variant="primary"
                loading={catalogLoading}
                onClick={() => void resolveCatalog()}
              >
                解析
              </Button>
            </div>
            <div className="mt-2.5 text-[10px] text-[var(--text-dim)]">
              支持公开链接；纯 ID 需选择平台和类型。QQ 音乐专辑请使用 albumDetail 链接。
            </div>
          </div>
        )}
      </Card>

      {mode === 'search' ? (
        <div className="mt-6">
          {kind === 'song' ? (
            <>
              {searching && !results.length ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 rounded-2xl border border-[var(--border)] p-3">
                  <div className="skeleton h-11 w-11" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-1/3" />
                    <div className="skeleton h-2.5 w-1/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length ? (
            <div className="space-y-7">
              {visibleProviders.map(providerId => {
                const result = results.find(item => item.provider === providerId)
                if (!result) return null
                const info = PROVIDERS.find(item => item.id === providerId)!
                return (
                  <section key={providerId}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: info.color }}
                      />
                      <h3 className="text-[13px] font-medium">{info.name}</h3>
                      <span className="text-[10px] text-[var(--text-dim)]">
                        {result.error ? '搜索失败' : `${result.total} 个结果`}
                      </span>
                      {result.error ? (
                        <Badge tone="danger">失败</Badge>
                      ) : (
                        <Badge tone="default">本页 {result.list.length}</Badge>
                      )}
                      <div className="flex-1" />
                      {result.hasMore && !result.error ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const nextPage = result.page + 1
                            void search(nextPage, providerId)
                          }}
                          disabled={searching}
                        >
                          {searching ? <LoaderCircle size={12} className="spinner" /> : null}
                          加载更多
                        </Button>
                      ) : null}
                    </div>
                    {result.error ? (
                      <div className="rounded-xl border border-red-400/15 bg-red-500/[.045] px-4 py-3 text-[11px] text-red-200/70">
                        {result.error}
                      </div>
                    ) : result.list.length ? (
                      <TrackTable
                        tracks={result.list}
                        onQuickUpload={quickUpload}
                        onEditUpload={openEditor}
                      />
                    ) : (
                      <div className="rounded-xl border border-[var(--border)] px-4 py-5 text-center text-xs text-[var(--text-dim)]">
                        该平台没有搜索到结果
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : searched ? (
            <EmptyState
              icon={<Search size={20} />}
              title="没有找到可用的搜索结果"
              description="尝试更换关键词，或切换单个平台搜索。部分平台可能暂时限制访问。"
            />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  icon: BadgeCheck,
                  title: '先试听，再上传',
                  description: `每个版本都可以试听前 ${MAX_PREVIEW_SECONDS} 秒，避免上传翻唱、Live 或错误版本。`
                },
                {
                  icon: Disc3,
                  title: '自动整理标签',
                  description: '标题、歌手、专辑、封面和歌词在上传前统一检查。'
                },
                {
                  icon: UploadCloud,
                  title: '批量队列',
                  description: '专辑或歌单可一键加入队列，失败项独立重试。'
                }
              ].map(item => {
                const Icon = item.icon
                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-[var(--border)] bg-white/[.018] p-5"
                  >
                    <Icon size={18} className="text-rose-300" />
                    <div className="mt-4 text-sm font-medium">{item.title}</div>
                    <p className="mt-1.5 text-[11px] leading-5 text-[var(--text-muted)]">
                      {item.description}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
            </>
          ) : artistView ? (
            <div>
              <div className="mb-5 flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-white/[.022] p-5">
                <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
                  {artistView.coverUrl ? (
                    <img
                      src={artistView.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="cover-fallback h-full w-full">
                      <UserRound size={28} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">歌手</Badge>
                    <Badge tone="default">
                      {PROVIDERS.find(item => item.id === artistView.provider)?.name}
                    </Badge>
                    {artistTracks?.total ? (
                      <Badge tone="default">{artistTracks.total} 首</Badge>
                    ) : null}
                  </div>
                  <h2 className="mt-2 truncate text-xl font-semibold tracking-tight">
                    {artistView.name}
                  </h2>
                  <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                    {artistView.author || '精确歌手曲目'}
                  </div>
                </div>
                <Button variant="ghost" onClick={closeArtistView}>
                  <ChevronLeft size={14} />
                  返回歌手搜索
                </Button>
              </div>

              {artistLoading && !artistTracks ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 rounded-2xl border border-[var(--border)] p-3"
                    >
                      <div className="skeleton h-11 w-11" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-3 w-1/3" />
                        <div className="skeleton h-2.5 w-1/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : artistTracks?.list.length ? (
                <>
                  <TrackTable
                    tracks={artistTracks.list}
                    onQuickUpload={quickUpload}
                    onEditUpload={openEditor}
                  />
                  {artistTracks.hasMore ? (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="secondary"
                        loading={artistLoading}
                        onClick={() => void loadMoreArtistTracks()}
                      >
                        加载更多歌曲
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  icon={<UserRound size={20} />}
                  title="该歌手暂无可解析曲目"
                  description="当前平台没有返回可试听或上传的歌曲，可返回后切换其他平台搜索。"
                />
              )}
            </div>
          ) : (
            <div>
              {entitySearching && !entityResults.length ? (
                <div className="space-y-7">
                  {Array.from({ length: 3 }).map((_, sectionIndex) => (
                    <div key={sectionIndex}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <div className="skeleton h-2 w-2 rounded-full" />
                        <div className="skeleton h-3 w-24" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, cardIndex) => (
                          <div
                            key={cardIndex}
                            className="flex h-[88px] items-center gap-3 rounded-2xl border border-[var(--border)] p-3"
                          >
                            <div className="skeleton h-14 w-14" />
                            <div className="flex-1 space-y-2">
                              <div className="skeleton h-3 w-2/3" />
                              <div className="skeleton h-2.5 w-1/2" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : entityResults.length ? (
                <div className="space-y-7">
                  {visibleProviders.map(providerId => {
                    const result = entityResults.find(item => item.provider === providerId)
                    if (!result) return null
                    const info = PROVIDERS.find(item => item.id === providerId)!
                    return (
                      <section key={providerId}>
                        <div className="mb-2.5 flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: info.color }}
                          />
                          <h3 className="text-[13px] font-medium">{info.name}</h3>
                          <span className="text-[10px] text-[var(--text-dim)]">
                            {result.error ? '搜索失败' : `${result.total} 个结果`}
                          </span>
                          {result.error ? (
                            <Badge tone="danger">失败</Badge>
                          ) : (
                            <Badge tone="default">本页 {result.list.length}</Badge>
                          )}
                          <div className="flex-1" />
                          {result.hasMore && !result.error ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void search(result.page + 1, providerId)}
                              disabled={entitySearching}
                            >
                              {entitySearching ? (
                                <LoaderCircle size={12} className="spinner" />
                              ) : null}
                              加载更多
                            </Button>
                          ) : null}
                        </div>
                        {result.error ? (
                          <div className="rounded-xl border border-red-400/15 bg-red-500/[.045] px-4 py-3 text-[11px] text-red-200/70">
                            {result.error}
                          </div>
                        ) : result.list.length ? (
                          <div className="grid grid-cols-2 gap-3">
                            {result.list.map(entity => (
                              <EntityCard
                                key={entity.key}
                                entity={entity}
                                opening={openingEntityKey === entity.key}
                                onOpen={entity => void openEntity(entity)}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-[var(--border)] px-4 py-5 text-center text-xs text-[var(--text-dim)]">
                            该平台没有搜索到结果
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              ) : searched ? (
                <EmptyState
                  icon={<Search size={20} />}
                  title="没有找到可用的搜索结果"
                  description="尝试更换关键词，或切换单个平台后重新搜索。"
                />
              ) : (
                <EmptyState
                  icon={
                    kind === 'artist' ? (
                      <UserRound size={20} />
                    ) : kind === 'playlist' ? (
                      <ListMusic size={20} />
                    ) : (
                      <Disc3 size={20} />
                    )
                  }
                  title={`搜索${SEARCH_KINDS.find(item => item.kind === kind)?.label ?? ''}`}
                  description="选择平台和搜索类型后输入关键词。专辑和歌单可继续查看曲目，歌手可查看该歌手的精确歌曲列表。"
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {catalogLoading ? (
            <div className="space-y-3">
              <div className="skeleton h-[118px] rounded-2xl" />
              <div className="skeleton h-[240px] rounded-2xl" />
            </div>
          ) : catalog ? (
            <div>
              <div className="mb-4 flex items-center gap-5 rounded-2xl border border-[var(--border)] bg-white/[.022] p-5">
                <div className="h-[92px] w-[92px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
                  {catalog.coverUrl ? (
                    <img
                      src={catalog.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="cover-fallback h-full w-full">
                      <Disc3 size={26} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">
                      {catalog.kind === 'album' ? '专辑' : '歌单'}
                    </Badge>
                    <Badge tone="default">{catalog.provider.toUpperCase()}</Badge>
                    <Badge tone="default">{catalog.total} 首</Badge>
                  </div>
                  <h2 className="mt-2 truncate text-xl font-semibold tracking-tight">{catalog.name}</h2>
                  <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                    {catalog.author || '未知作者'}
                  </div>
                  <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-[var(--text-dim)]">
                    {catalog.description || '暂无简介'}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    variant="primary"
                    onClick={() => openBatch(catalog.tracks)}
                  >
                    <UploadCloud size={14} />
                    一键上传全部
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => openBatch(selectedCatalogTracks)}
                    disabled={!selectedCatalogTracks.length}
                  >
                    <ArrowRight size={14} />
                    上传所选 {selectedCatalogTracks.length}
                  </Button>
                </div>
              </div>

              <TrackTableToolbar
                count={catalog.tracks.length}
                selectedCount={catalogSelected.size}
                onBatchUpload={() => openBatch(selectedCatalogTracks)}
                onClear={() => setCatalogSelected(new Set())}
              />
              <TrackTable
                tracks={catalog.tracks}
                selectedKeys={catalogSelected}
                onToggle={toggleCatalog}
                onToggleAll={() =>
                  setCatalogSelected(
                    catalogSelected.size === catalog.tracks.length
                      ? new Set()
                      : new Set(catalog.tracks.map(track => track.key))
                  )
                }
                onQuickUpload={quickUpload}
                onEditUpload={openEditor}
              />
            </div>
          ) : (
            <EmptyState
              icon={<ListMusic size={20} />}
              title="解析专辑或歌单"
              description="粘贴公开链接，或在输入 ID 后选择平台和类型。解析结果会显示全部曲目，可逐首试听后再批量上传。"
            />
          )}
        </div>
      )}

      <Modal
        open={Boolean(quickUploadTrack)}
        onOpenChange={open => {
          if (!open && !quickUploading) setQuickUploadTrack(null)
        }}
        title="快速上传"
        description="选择是否把封面和歌词写入音频文件；云盘未匹配到歌曲时也能显示文件内元数据。"
        width={560}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setQuickUploadTrack(null)}
              disabled={quickUploading}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => void startQuickUpload()}
              loading={quickUploading}
            >
              <UploadCloud size={14} />
              开始上传
            </Button>
          </>
        }
      >
        {quickUploadTrack ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/[.025] p-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10">
                {quickUploadTrack.coverUrl ? (
                  <img
                    src={quickUploadTrack.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="cover-fallback h-full w-full">
                    <Disc3 size={20} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{quickUploadTrack.title}</div>
                <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                  {quickUploadTrack.artists.join('、')} · {quickUploadTrack.album || '未知专辑'}
                </div>
              </div>
            </div>

            <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] px-4">
              <ToggleRow
                label="写入封面"
                description="优先使用已选或来源封面，写入 APIC/PICTURE"
                checked={quickWriteCover}
                onCheckedChange={setQuickWriteCover}
              />
              <ToggleRow
                label="写入歌词"
                description="优先使用已填写 LRC，否则从洛雪、平台、LRCLIB 或自定义接口补全"
                checked={quickWriteLyrics}
                onCheckedChange={setQuickWriteLyrics}
              />
            </div>

            {quickWriteLyrics ? (
              <div>
                <div className="mb-1.5 text-[11px] text-[var(--text-muted)]">
                  歌词（可选，LRC）
                </div>
                <TextArea
                  className="h-24 font-mono text-[11px]"
                  value={quickLyrics}
                  onChange={event => setQuickLyrics(event.target.value)}
                  placeholder="可粘贴 LRC；留空时自动从洛雪音源或来源音乐平台获取"
                />
              </div>
            ) : null}

            <div className="rounded-xl border border-sky-400/15 bg-sky-500/[.055] px-3.5 py-3 text-[11px] leading-5 text-sky-100/65">
              关闭开关时不会写入对应标签，但仍会按标题、歌手和专辑信息完成上传。自动获取失败时会在任务列表显示警告。
            </div>
          </div>
        ) : null}
      </Modal>

      <MetadataDialog
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
        track={editTrack}
      />
    </div>
  )
}
