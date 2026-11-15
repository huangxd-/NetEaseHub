import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2Off, Music2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import type { CloudSong, MatchCandidate } from '@shared/types'
import { formatDuration, matchScore } from '@shared/utils'
import { errorMessage, unwrap } from '../lib/api'
import { Badge, Button, Modal, Spinner, TextInput, cn } from './ui'

export function CloudMatchDialog({
  song,
  open,
  onOpenChange
}: {
  song: CloudSong | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<MatchCandidate[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [matching, setMatching] = useState(false)

  const search = useCallback(async (text: string) => {
    const keyword = text.trim()
    if (!keyword) return
    setLoading(true)
    try {
      const result = await unwrap(window.neteasehub.cloud.searchCatalog(keyword, 20))
      setCandidates(result)
      setSelected(result[0]?.songId ?? null)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !song) return
    const keyword = `${song.title} ${song.artist}`.trim()
    setQuery(keyword)
    setCandidates([])
    setSelected(null)
    void search(keyword)
  }, [open, search, song])

  const ranked = useMemo(() => {
    if (!song) return candidates
    return candidates
      .map(candidate => ({
        ...candidate,
        score: matchScore(
          { title: song.title, artist: song.artist, durationSec: song.durationSec },
          candidate
        )
      }))
      .sort((a, b) => b.score - a.score)
  }, [candidates, song])

  const apply = async (songId: number) => {
    if (!song) return
    setMatching(true)
    try {
      await unwrap(window.neteasehub.cloud.match(song.cloudId, songId))
      await queryClient.invalidateQueries({ queryKey: ['cloud-songs'] })
      toast.success(songId ? '云盘匹配已更新' : '已取消云盘匹配')
      onOpenChange(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setMatching(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="匹配网易云曲目"
      description="匹配后，网易云会使用目标曲目的歌曲信息。它不会修改本地音频文件。"
      width={760}
      footer={
        <>
          {song?.matchedSongId ? (
            <Button variant="danger" onClick={() => void apply(0)} disabled={matching}>
              <Link2Off size={14} />
              取消当前匹配
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            variant="primary"
            disabled={!selected}
            loading={matching}
            onClick={() => selected && void apply(selected)}
          >
            绑定所选曲目
          </Button>
        </>
      }
    >
      {song ? (
        <>
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/[.025] p-4">
            <div className="cover-fallback grid h-12 w-12 place-items-center rounded-xl">
              <Music2 size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{song.title}</div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                {song.artist} · {song.album || '未知专辑'} · {formatDuration(song.durationSec)}
              </div>
            </div>
            <Badge tone={song.matchedSongId ? 'success' : 'warning'}>
              {song.matchedSongId ? `已匹配 #${song.matchedSongId}` : '未匹配'}
            </Badge>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
              />
              <TextInput
                className="pl-10"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void search(query)
                }}
                placeholder="搜索网易云曲目"
              />
            </div>
            <Button variant="secondary" onClick={() => void search(query)} loading={loading}>
              搜索
            </Button>
          </div>

          <div className="mt-4 max-h-[390px] space-y-2 overflow-auto pr-1">
            {loading ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Spinner size={22} />
              </div>
            ) : ranked.length ? (
              ranked.map(candidate => (
                <button
                  key={candidate.songId}
                  onClick={() => setSelected(candidate.songId)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                    selected === candidate.songId
                      ? 'border-rose-400/35 bg-rose-500/[.08]'
                      : 'border-[var(--border)] bg-white/[.018] hover:bg-white/[.04]'
                  )}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10">
                    {candidate.coverUrl ? (
                      <img
                        src={candidate.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="cover-fallback h-full w-full">
                        <Music2 size={14} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{candidate.title}</div>
                    <div className="mt-1 truncate text-[10px] text-[var(--text-muted)]">
                      {candidate.artist} · {candidate.album || '未知专辑'} ·{' '}
                      {formatDuration(candidate.durationSec)}
                    </div>
                  </div>
                  <Badge tone={candidate.score >= 0.8 ? 'success' : candidate.score >= 0.55 ? 'warning' : 'default'}>
                    {Math.round(candidate.score * 100)}%
                  </Badge>
                </button>
              ))
            ) : (
              <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
                <Search size={20} className="text-[var(--text-dim)]" />
                <div className="mt-3 text-xs text-[var(--text-muted)]">没有找到候选曲目</div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </Modal>
  )
}
