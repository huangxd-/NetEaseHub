import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  PauseCircle,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Trash2,
  UploadCloud,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import type { UploadDraft, UploadStage } from '@shared/types'
import { MAX_PREVIEW_SECONDS, QUALITY_LABELS } from '@shared/constants'
import { isUploadActive } from '@shared/utils'
import { useAppStore } from '../store/app-store'
import { errorMessage, unwrap } from '../lib/api'
import { usePreview } from '../components/PreviewPlayer'
import { MetadataDialog } from '../components/MetadataDialog'
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Progress,
  cn
} from '../components/ui'

const STAGE_LABEL: Record<UploadStage, string> = {
  queued: '等待中',
  resolving: '解析音源',
  downloading: '下载中',
  tagging: '写入标签',
  uploading: '上传中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  skipped: '已跳过'
}

const STAGE_TONE: Record<
  UploadStage,
  'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
> = {
  queued: 'default',
  resolving: 'info',
  downloading: 'info',
  tagging: 'warning',
  uploading: 'accent',
  completed: 'success',
  failed: 'danger',
  cancelled: 'default',
  skipped: 'warning'
}

const STAGE_ICON: Record<UploadStage, typeof CircleDashed> = {
  queued: Clock3,
  resolving: CircleDashed,
  downloading: CircleDashed,
  tagging: CircleDashed,
  uploading: UploadCloud,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
  skipped: SkipForward
}

function formatBytes(value?: number): string {
  if (!value) return '0 B'
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}

function formatSpeed(value?: number): string {
  if (!value) return ''
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB/s`
  return `${(value / 1024).toFixed(0)} KB/s`
}

export function TasksPage() {
  const queryClient = useQueryClient()
  const preview = usePreview()
  const auth = useAppStore(state => state.auth)
  const setLoginOpen = useAppStore(state => state.setLoginOpen)
  const [editing, setEditing] = useState<UploadDraft | null>(null)

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['uploads'],
    queryFn: () => unwrap(window.neteasehub.uploads.list()),
    refetchInterval: 4000
  })
  useEffect(() => {
    const disposeUpdated = window.neteasehub.uploads.onUpdated(updated => {
      queryClient.setQueryData<UploadDraft[]>(['uploads'], current => {
        if (!current) return [updated]
        const exists = current.some(item => item.id === updated.id)
        return exists
          ? current.map(item => (item.id === updated.id ? updated : item))
          : [updated, ...current]
      })
    })
    const disposeBatch = window.neteasehub.uploads.onBatch(batch => {
      queryClient.setQueryData(['upload-summary'], batch)
    })
    return () => {
      disposeUpdated()
      disposeBatch()
    }
  }, [queryClient])

  const counts = useMemo(() => {
    const result = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    }
    for (const draft of drafts) {
      if (draft.stage === 'queued') result.queued++
      else if (['resolving', 'downloading', 'tagging', 'uploading'].includes(draft.stage)) {
        result.running++
      } else if (draft.stage === 'completed') result.completed++
      else if (draft.stage === 'failed' || draft.stage === 'cancelled') result.failed++
      else if (draft.stage === 'skipped') result.skipped++
    }
    return result
  }, [drafts])

  const start = async () => {
    if (!auth.loggedIn) {
      setLoginOpen(true)
      toast.error('请先扫码登录网易云音乐')
      return
    }
    try {
      await unwrap(window.neteasehub.uploads.start())
      toast.success('上传队列已启动')
      await queryClient.invalidateQueries({ queryKey: ['upload-summary'] })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const retry = async () => {
    try {
      await unwrap(window.neteasehub.uploads.retryFailed())
      await queryClient.invalidateQueries({ queryKey: ['uploads'] })
      toast.success('失败任务已重新加入队列')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const cancelAll = async () => {
    try {
      await unwrap(window.neteasehub.uploads.cancel())
      await queryClient.invalidateQueries({ queryKey: ['uploads'] })
      toast.success('已取消进行中的任务')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const clear = async () => {
    try {
      await unwrap(window.neteasehub.uploads.clearFinished())
      await queryClient.invalidateQueries({ queryKey: ['uploads'] })
      toast.success('已清理结束任务')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="page-enter">
      <div className="flex items-end justify-between pb-6 pt-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">QUEUE</Badge>
            <Badge tone="default">下载并发 + 单线程上传</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em]">任务队列</h1>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            每首歌曲独立执行解析、下载、写标签与上传；单首失败不会阻塞整个批次。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void clear()} disabled={!drafts.length}>
            <Trash2 size={14} />
            清理结束任务
          </Button>
          <Button variant="secondary" onClick={() => void cancelAll()} disabled={!counts.running && !counts.queued}>
            <PauseCircle size={14} />
            取消全部
          </Button>
          <Button variant="secondary" onClick={() => void retry()} disabled={!counts.failed}>
            <RotateCcw size={14} />
            重试失败
          </Button>
          <Button variant="primary" onClick={() => void start()} disabled={!counts.queued}>
            <Play size={14} fill="currentColor" />
            开始队列
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-5 gap-3">
        {[
          { label: '等待中', value: counts.queued, color: 'text-[var(--text)]' },
          { label: '进行中', value: counts.running, color: 'text-rose-300' },
          { label: '已完成', value: counts.completed, color: 'text-emerald-300' },
          { label: '失败 / 取消', value: counts.failed, color: 'text-red-300' },
          { label: '已跳过', value: counts.skipped, color: 'text-amber-300' }
        ].map(item => (
          <div
            key={item.label}
            className="rounded-2xl border border-[var(--border)] bg-white/[.022] px-4 py-3.5"
          >
            <div className="text-[10px] text-[var(--text-dim)]">{item.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold tracking-tight', item.color)}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-[74px] rounded-2xl" />
          ))}
        </div>
      ) : drafts.length ? (
        <div className="space-y-2">
          {drafts.map(draft => {
            const Icon = STAGE_ICON[draft.stage]
            const active = isUploadActive(draft.stage)
            return (
              <div
                key={draft.id}
                className="rounded-2xl border border-[var(--border)] bg-[#101013]/75 p-4 transition hover:border-[var(--border-strong)]"
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/[.08]">
                    {draft.track.coverUrl ? (
                      <img
                        src={draft.track.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="cover-fallback h-full w-full text-lg">♪</div>
                    )}
                    {active ? (
                      <div className="absolute inset-0 grid place-items-center bg-black/40">
                        <CircleDashed size={18} className="spinner text-white" />
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{draft.metadata.title}</span>
                      <Badge tone={STAGE_TONE[draft.stage]}>
                        <Icon size={9} />
                        {STAGE_LABEL[draft.stage]}
                      </Badge>
                      {draft.resolvedQuality ? (
                        <Badge tone="default">{QUALITY_LABELS[draft.resolvedQuality]}</Badge>
                      ) : null}
                      {draft.cloudSongId ? (
                        <Badge tone="success">云盘 ID {draft.cloudSongId}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                      <span className="truncate">{draft.metadata.artists.join('、')}</span>
                      <span className="text-[var(--text-dim)]">·</span>
                      <span className="truncate">{draft.metadata.album || '未知专辑'}</span>
                      <span className="text-[var(--text-dim)]">·</span>
                      <span>{draft.track.provider.toUpperCase()}</span>
                      {draft.totalBytes ? (
                        <>
                          <span className="text-[var(--text-dim)]">·</span>
                          <span>
                            {formatBytes(draft.downloadedBytes)} / {formatBytes(draft.totalBytes)}
                          </span>
                        </>
                      ) : null}
                      {draft.speedBytesPerSec ? (
                        <span className="mono text-rose-300/80">{formatSpeed(draft.speedBytesPerSec)}</span>
                      ) : null}
                    </div>
                    <Progress className="mt-2.5" value={draft.progress} />
                    {draft.error ? (
                      <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-red-300/80">
                        {draft.error}
                      </div>
                    ) : null}
                    {draft.warning ? (
                      <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-amber-200/70">
                        {draft.warning}
                      </div>
                    ) : null}
                  </div>
                  <div className="w-[42px] shrink-0 text-right">
                    <span className="mono text-[11px] text-[var(--text-muted)]">
                      {Math.round(draft.progress)}%
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      onClick={() => void preview.playTrack(draft.track)}
                      title={`试听 ${MAX_PREVIEW_SECONDS} 秒`}
                    >
                      <Play size={14} />
                    </IconButton>
                    <IconButton
                      onClick={() => setEditing(draft)}
                      title="编辑元数据"
                      disabled={active}
                    >
                      <RefreshCw size={13} />
                    </IconButton>
                    {active || draft.stage === 'queued' ? (
                      <IconButton
                        onClick={async () => {
                          await unwrap(window.neteasehub.uploads.cancel([draft.id]))
                          await queryClient.invalidateQueries({ queryKey: ['uploads'] })
                        }}
                        title="取消任务"
                        className="text-red-300/80"
                      >
                        <Ban size={14} />
                      </IconButton>
                    ) : (
                      <IconButton
                        onClick={() => void retry()}
                        title="重试失败任务"
                        disabled={draft.stage !== 'failed' && draft.stage !== 'cancelled'}
                      >
                        <RotateCcw size={14} />
                      </IconButton>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<UploadCloud size={22} />}
          title="还没有上传任务"
          description={`从搜索或专辑/歌单页面选择歌曲后，任务会出现在这里。建议先试听 ${MAX_PREVIEW_SECONDS} 秒确认版本。`}
        />
      )}

      <MetadataDialog
        open={Boolean(editing)}
        onOpenChange={open => {
          if (!open) setEditing(null)
        }}
        draft={editing}
      />
    </div>
  )
}
