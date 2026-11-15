import { Check, Music2, Pencil, Play, UploadCloud } from 'lucide-react'
import type { TrackRef } from '@shared/types'
import { PROVIDERS, QUALITY_LABELS } from '@shared/constants'
import { formatDuration } from '@shared/utils'
import { usePreview } from './PreviewPlayer'
import { Badge, Button, IconButton, cn } from './ui'

const GRID = '28px minmax(220px, 1.6fr) minmax(120px, .8fr) minmax(130px, .9fr) 54px 80px 94px'

function ProviderBadge({ provider }: { provider: TrackRef['provider'] }) {
  const info = PROVIDERS.find(item => item.id === provider)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[.035] px-1.5 py-0.5 text-[10px]"
      style={{ color: info?.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info?.color }} />
      {info?.shortName ?? provider}
    </span>
  )
}

export function TrackTable({
  tracks,
  selectedKeys,
  onToggle,
  onToggleAll,
  onQuickUpload,
  onEditUpload,
  showActions = true
}: {
  tracks: TrackRef[]
  selectedKeys?: Set<string>
  onToggle?: (key: string) => void
  onToggleAll?: () => void
  onQuickUpload?: (track: TrackRef) => void
  onEditUpload?: (track: TrackRef) => void
  showActions?: boolean
}) {
  const preview = usePreview()
  const selectable = Boolean(selectedKeys && onToggle)
  const allSelected =
    selectable && tracks.length > 0 && tracks.every(track => selectedKeys?.has(track.key))

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#101013]/70">
      <div
        className="grid h-9 items-center border-b border-[var(--border)] px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-dim)]"
        style={{ gridTemplateColumns: GRID }}
      >
        <div>
          {selectable ? (
            <button
              onClick={onToggleAll}
              className={cn(
                'grid h-4 w-4 place-items-center rounded border transition',
                allSelected
                  ? 'border-rose-400 bg-rose-500 text-white'
                  : 'border-white/20 bg-white/[.03] hover:border-white/35'
              )}
              aria-label="全选"
            >
              {allSelected ? <Check size={10} strokeWidth={3} /> : null}
            </button>
          ) : null}
        </div>
        <div>歌曲</div>
        <div>歌手</div>
        <div>专辑</div>
        <div>时长</div>
        <div>来源</div>
        <div className="text-right">{showActions ? '操作' : ''}</div>
      </div>
      {tracks.map(track => {
        const selected = selectedKeys?.has(track.key)
        const isPlaying = preview.currentTrack?.key === track.key && preview.isPlaying
        return (
          <div
            key={track.key}
            className={cn('table-row min-h-[62px] px-3', selected && 'is-selected')}
            style={{ gridTemplateColumns: GRID }}
          >
            <div>
              {selectable ? (
                <button
                  onClick={() => onToggle?.(track.key)}
                  className={cn(
                    'grid h-4 w-4 place-items-center rounded border transition',
                    selected
                      ? 'border-rose-400 bg-rose-500 text-white'
                      : 'border-white/20 bg-white/[.03] hover:border-white/35'
                  )}
                  aria-label="选择歌曲"
                >
                  {selected ? <Check size={10} strokeWidth={3} /> : null}
                </button>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/[.08]">
                {track.coverUrl ? (
                  <img
                    src={track.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="cover-fallback h-full w-full">
                    <Music2 size={14} />
                  </div>
                )}
                <button
                  className={cn(
                    'absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition hover:opacity-100',
                    isPlaying && 'opacity-100'
                  )}
                  onClick={() => void preview.playTrack(track)}
                  aria-label="试听 30 秒"
                >
                  <Play size={14} fill="currentColor" className="translate-x-[1px]" />
                </button>
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{track.title}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  {(track.availableQualities ?? []).slice().reverse().slice(0, 3).map(quality => (
                    <Badge key={quality} tone={quality === 'flac24bit' ? 'warning' : 'default'}>
                      {QUALITY_LABELS[quality]}
                    </Badge>
                  ))}
                  {!track.availableQualities?.length ? (
                    <span className="text-[10px] text-[var(--text-dim)]">音质未知</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="truncate pr-2 text-xs text-[var(--text-muted)]">
              {track.artists.join('、') || '未知歌手'}
            </div>
            <div className="truncate pr-2 text-xs text-[var(--text-muted)]">
              {track.album || <span className="text-[var(--text-dim)]">未知专辑</span>}
            </div>
            <div className="mono text-[11px] text-[var(--text-dim)]">
              {formatDuration(track.durationSec)}
            </div>
            <div>
              <ProviderBadge provider={track.provider} />
            </div>
            <div className="flex items-center justify-end gap-1">
              <IconButton
                onClick={() => void preview.playTrack(track)}
                title="试听 30 秒"
                aria-label="试听 30 秒"
              >
                <Play size={14} />
              </IconButton>
              {showActions && onQuickUpload ? (
                <IconButton
                  onClick={() => onQuickUpload(track)}
                  title="快速上传"
                  aria-label="快速上传"
                  className="text-rose-300 hover:text-rose-200"
                >
                  <UploadCloud size={15} />
                </IconButton>
              ) : null}
              {showActions && onEditUpload ? (
                <IconButton
                  onClick={() => onEditUpload(track)}
                  title="编辑后上传"
                  aria-label="编辑后上传"
                >
                  <Pencil size={13} />
                </IconButton>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TrackTableToolbar({
  count,
  selectedCount,
  onBatchUpload,
  onClear
}: {
  count: number
  selectedCount: number
  onBatchUpload: () => void
  onClear: () => void
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="text-xs text-[var(--text-muted)]">
        共 {count} 首{selectedCount ? `，已选 ${selectedCount} 首` : ''}
      </div>
      <div className="flex items-center gap-2">
        {selectedCount ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            清空选择
          </Button>
        ) : null}
        <Button size="sm" variant="primary" disabled={!selectedCount} onClick={onBatchUpload}>
          <UploadCloud size={13} />
          上传所选
        </Button>
      </div>
    </div>
  )
}
