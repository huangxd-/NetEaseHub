import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Link2,
  Music2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Unlink,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import type { CloudSong, CloudSuggestion } from '@shared/types'
import { CLOUD_PAGE_SIZE } from '@shared/constants'
import { formatDuration } from '@shared/utils'
import { useAppStore } from '../store/app-store'
import { errorMessage, unwrap } from '../lib/api'
import { CloudMatchDialog } from '../components/CloudMatchDialog'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Modal,
  Spinner,
  TextInput,
  cn
} from '../components/ui'

const GRID =
  '28px minmax(170px, 1.2fr) minmax(110px, .8fr) minmax(130px, .8fr) 82px 72px 100px'

function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}

export function CloudPage() {
  const auth = useAppStore(state => state.auth)
  const setLoginOpen = useAppStore(state => state.setLoginOpen)
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [matchSong, setMatchSong] = useState<CloudSong | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [suggestions, setSuggestions] = useState<CloudSuggestion[] | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [applyingSuggestions, setApplyingSuggestions] = useState(false)

  const {
    data,
    isLoading,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['cloud-songs'],
    queryFn: ({ pageParam }) =>
      unwrap(window.neteasehub.cloud.list(pageParam, CLOUD_PAGE_SIZE)),
    initialPageParam: 0,
    getNextPageParam: lastPage =>
      lastPage.hasMore ? lastPage.offset + lastPage.list.length : undefined,
    enabled: auth.loggedIn,
    staleTime: 60_000
  })

  const pages = data?.pages
  const songs = useMemo(() => pages?.flatMap(page => page.list) ?? [], [pages])

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return songs
    return songs.filter(song =>
      [song.title, song.artist, song.album, song.fileName]
        .join(' ')
        .toLowerCase()
        .includes(text)
    )
  }, [query, songs])

  const stats = useMemo(() => {
    const matched = songs.filter(song => song.matchedSongId).length
    return {
      total: Math.max(Number(pages?.[0]?.total ?? 0), songs.length),
      matched,
      unmatched: songs.length - matched,
      size: songs.reduce((sum, song) => sum + song.size, 0)
    }
  }, [pages, songs])

  const toggle = (id: number) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteSelected = async () => {
    setDeleting(true)
    try {
      const result = await unwrap(window.neteasehub.cloud.delete([...selected]))
      if (!result.failed.length) {
        toast.success(`已删除 ${result.deleted.length} 首云盘歌曲`)
        setSelected(new Set())
        setDeleteOpen(false)
      } else {
        setSelected(new Set(result.failed))
        if (result.deleted.length) {
          toast.warning(
            `已删除 ${result.deleted.length} 首，${result.failed.length} 首失败`
          )
        } else {
          toast.error(`${result.failed.length} 首云盘歌曲删除失败，请重试`)
        }
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDeleting(false)
      await queryClient.invalidateQueries({ queryKey: ['cloud-songs'] })
    }
  }

  const suggest = async () => {
    if (!auth.loggedIn) {
      setLoginOpen(true)
      return
    }
    const unmatched = songs.filter(song => !song.matchedSongId).slice(0, 30)
    if (!unmatched.length) {
      toast.info('没有未匹配的云盘歌曲')
      return
    }
    setSuggesting(true)
    try {
      const result = await unwrap(window.neteasehub.cloud.suggest(unmatched))
      if (!result.length) {
        toast.info('没有找到足够可信的匹配建议')
      } else {
        setSuggestions(result)
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSuggesting(false)
    }
  }

  const applySuggestions = async () => {
    if (!suggestions?.length) return
    setApplyingSuggestions(true)
    let success = 0
    for (const suggestion of suggestions) {
      try {
        await unwrap(window.neteasehub.cloud.match(suggestion.cloudId, suggestion.songId))
        success++
      } catch {
        // Continue applying the remaining suggestions.
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['cloud-songs'] })
    setSuggestions(null)
    setApplyingSuggestions(false)
    toast.success(`已应用 ${success} 个匹配建议`)
  }

  if (!auth.loggedIn) {
    return (
      <div className="page-enter flex h-full items-center justify-center">
        <EmptyState
          icon={<Music2 size={22} />}
          title="登录后管理网易云云盘"
          description="扫码登录即可查看云盘歌曲、删除文件，并把未匹配歌曲绑定到网易云曲目信息。"
          action={
            <Button variant="primary" onClick={() => setLoginOpen(true)}>
              扫码登录
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="flex items-end justify-between pb-6 pt-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">CLOUD</Badge>
            <Badge tone="default">元数据匹配纠错</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em]">网易云云盘</h1>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            管理已上传歌曲。云盘只支持通过“匹配”校正歌曲信息，不支持任意修改已上传字段。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'spinner' : ''} />
            刷新
          </Button>
          <Button variant="secondary" onClick={() => void suggest()} loading={suggesting}>
            <Sparkles size={14} />
            智能匹配未匹配
          </Button>
          <Button
            variant="danger"
            disabled={!selected.size}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={14} />
            删除所选 {selected.size || ''}
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        {[
          { label: '云盘歌曲', value: stats.total, tone: 'text-[var(--text)]' },
          { label: '已匹配', value: stats.matched, tone: 'text-emerald-300' },
          { label: '未匹配', value: stats.unmatched, tone: 'text-amber-300' },
          { label: '占用空间', value: formatBytes(stats.size), tone: 'text-sky-300' }
        ].map(item => (
          <div
            key={item.label}
            className="rounded-2xl border border-[var(--border)] bg-white/[.022] px-4 py-3.5"
          >
            <div className="text-[10px] text-[var(--text-dim)]">{item.label}</div>
            <div className={cn('mt-1 text-xl font-semibold tracking-tight', item.tone)}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
          />
          <TextInput
            className="pl-10"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="筛选已加载的云盘歌曲"
          />
        </div>
        {selected.size ? (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            清空选择
          </Button>
        ) : null}
        <div className="ml-auto text-[11px] text-[var(--text-dim)]">
          显示 {filtered.length} / {songs.length}
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <Spinner size={20} />
            正在加载云盘歌曲…
          </div>
        </div>
      ) : filtered.length ? (
        <div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#101013]/70">
          <div
            className="grid h-9 items-center border-b border-[var(--border)] px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-dim)]"
            style={{ gridTemplateColumns: GRID }}
          >
            <div>
              <button
                onClick={() =>
                  setSelected(
                    selected.size === filtered.length
                      ? new Set()
                      : new Set(filtered.map(song => song.cloudId))
                  )
                }
                className="grid h-4 w-4 place-items-center rounded border border-white/20 bg-white/[.03] text-[9px] text-white/60"
              >
                {selected.size === filtered.length ? '✓' : ''}
              </button>
            </div>
            <div>歌曲</div>
            <div>歌手</div>
            <div>专辑</div>
            <div>大小</div>
            <div>时长</div>
            <div className="text-right">操作</div>
          </div>
          {filtered.map(song => (
            <div
              key={song.cloudId}
              className={cn('table-row min-h-[62px] px-3', selected.has(song.cloudId) && 'is-selected')}
              style={{ gridTemplateColumns: GRID }}
            >
              <div>
                <button
                  onClick={() => toggle(song.cloudId)}
                  className={cn(
                    'grid h-4 w-4 place-items-center rounded border text-[9px] transition',
                    selected.has(song.cloudId)
                      ? 'border-rose-400 bg-rose-500 text-white'
                      : 'border-white/20 bg-white/[.03] text-transparent'
                  )}
                >
                  ✓
                </button>
              </div>
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/[.08] bg-white/[.035] text-[var(--text-dim)]">
                  <Music2 size={15} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{song.title}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {song.matchedSongId ? (
                      <Badge tone="success">
                        <CheckCircle2 size={9} />
                        已匹配
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <XCircle size={9} />
                        未匹配
                      </Badge>
                    )}
                    <span className="truncate text-[9px] text-[var(--text-dim)]">{song.fileName}</span>
                  </div>
                </div>
              </div>
              <div className="truncate pr-2 text-xs text-[var(--text-muted)]">{song.artist}</div>
              <div className="truncate pr-2 text-xs text-[var(--text-muted)]">
                {song.album || <span className="text-[var(--text-dim)]">未知专辑</span>}
              </div>
              <div className="text-[10px] text-[var(--text-dim)]">{formatBytes(song.size)}</div>
              <div className="mono text-[11px] text-[var(--text-dim)]">
                {formatDuration(song.durationSec)}
              </div>
              <div className="flex items-center justify-end gap-1">
                <IconButton onClick={() => setMatchSong(song)} title="匹配网易云曲目">
                  <Link2 size={14} />
                </IconButton>
                {song.matchedSongId ? (
                  <IconButton
                    title="取消匹配"
                    className="text-amber-300/80"
                    onClick={async () => {
                      try {
                        await unwrap(window.neteasehub.cloud.unmatch(song.cloudId))
                        await queryClient.invalidateQueries({ queryKey: ['cloud-songs'] })
                        toast.success('已取消匹配')
                      } catch (error) {
                        toast.error(errorMessage(error))
                      }
                    }}
                  >
                    <Unlink size={14} />
                  </IconButton>
                ) : null}
              </div>
            </div>
          ))}
          </div>
          {hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                loading={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                加载更多云盘歌曲
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={<Music2 size={22} />}
          title={query ? '没有匹配的云盘歌曲' : '云盘还是空的'}
          description={query ? '尝试更换筛选关键词。' : '从搜索页面找到歌曲并上传后，会出现在这里。'}
        />
      )}

      <CloudMatchDialog
        song={matchSong}
        open={Boolean(matchSong)}
        onOpenChange={open => {
          if (!open) setMatchSong(null)
        }}
      />

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="删除云盘歌曲"
        description="该操作会从网易云云盘删除所选文件，且不可撤销。"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void deleteSelected()}>
              确认删除 {selected.size} 首
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-red-400/15 bg-red-500/[.045] px-4 py-3 text-xs leading-5 text-red-200/70">
          已选择 {selected.size} 首歌曲，总大小{' '}
          {formatBytes(songs.filter(song => selected.has(song.cloudId)).reduce((sum, song) => sum + song.size, 0))}。
        </div>
      </Modal>

      <Modal
        open={Boolean(suggestions)}
        onOpenChange={open => {
          if (!open) setSuggestions(null)
        }}
        title="智能匹配建议"
        description="以下建议基于标题、歌手和时长计算，应用前请人工核对。"
        width={820}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuggestions(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={applyingSuggestions}
              onClick={() => void applySuggestions()}
            >
              应用全部 {suggestions?.length ?? 0} 个建议
            </Button>
          </>
        }
      >
        <div className="max-h-[430px] space-y-2 overflow-auto">
          {suggestions?.map(suggestion => (
            <div
              key={suggestion.cloudId}
              className="grid grid-cols-[1fr_26px_1fr_64px] items-center gap-3 rounded-xl border border-[var(--border)] bg-white/[.018] px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{suggestion.cloudTitle}</div>
                <div className="mt-1 truncate text-[10px] text-[var(--text-muted)]">
                  {suggestion.cloudArtist}
                </div>
              </div>
              <div className="text-center text-[var(--text-dim)]">→</div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{suggestion.title}</div>
                <div className="mt-1 truncate text-[10px] text-[var(--text-muted)]">
                  {suggestion.artist} · {suggestion.album}
                </div>
              </div>
              <Badge tone={suggestion.score >= 0.8 ? 'success' : 'warning'}>
                {Math.round(suggestion.score * 100)}%
              </Badge>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
