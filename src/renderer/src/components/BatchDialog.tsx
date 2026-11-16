import { useEffect, useMemo, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import type { QualityPreference } from '@shared/types'
import {
  MAX_BATCH_WARNING,
  MAX_PREVIEW_SECONDS,
  QUALITY_LABELS,
  QUALITY_ORDER
} from '@shared/constants'
import { useAppStore } from '../store/app-store'
import { errorMessage, unwrap } from '../lib/api'
import { TrackTable } from './TrackTable'
import {
  Badge,
  Button,
  Modal,
  NativeSelect,
  Progress,
  ToggleRow
} from './ui'

export function BatchDialog() {
  const open = useAppStore(state => state.batchOpen)
  const tracks = useAppStore(state => state.batchTracks)
  const close = useAppStore(state => state.closeBatch)
  const auth = useAppStore(state => state.auth)
  const setLoginOpen = useAppStore(state => state.setLoginOpen)
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quality, setQuality] = useState<QualityPreference>('auto')
  const [writeCover, setWriteCover] = useState(true)
  const [writeLyrics, setWriteLyrics] = useState(true)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [confirmedLarge, setConfirmedLarge] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set(tracks.map(track => track.key)))
    setConfirmedLarge(false)
    setQuality('auto')
    setWriteCover(true)
    setWriteLyrics(true)
    setAllowDuplicate(false)
  }, [open, tracks])

  const selectedTracks = useMemo(
    () => tracks.filter(track => selected.has(track.key)),
    [selected, tracks]
  )

  const toggle = (key: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(current =>
      current.size === tracks.length ? new Set() : new Set(tracks.map(track => track.key))
    )
  }

  const enqueue = async (startNow: boolean) => {
    if (!selectedTracks.length) {
      toast.error('请至少选择一首歌曲')
      return
    }
    if (!auth.loggedIn) {
      setLoginOpen(true)
      toast.error('请先扫码登录网易云音乐')
      return
    }
    if (selectedTracks.length > MAX_BATCH_WARNING && !confirmedLarge) {
      toast.error(`本批次超过 ${MAX_BATCH_WARNING} 首，请先勾选确认`)
      return
    }
    setLoading(true)
    try {
      await unwrap(
        window.neteasehub.uploads.enqueue({
          tracks: selectedTracks,
          requestedQuality: quality,
          writeCover,
          writeLyrics,
          allowDuplicate
        })
      )
      if (startNow) {
        await unwrap(window.neteasehub.uploads.start())
        toast.success(`已开始上传 ${selectedTracks.length} 首歌曲`)
      } else {
        toast.success(`已加入队列，共 ${selectedTracks.length} 首`)
      }
      await queryClient.invalidateQueries({ queryKey: ['uploads'] })
      await queryClient.invalidateQueries({ queryKey: ['upload-summary'] })
      close()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={value => {
        if (!value) close()
      }}
      title="批量上传专辑 / 歌单"
      description="上传前会逐首解析音源地址并下载，失败项不会阻塞后续歌曲。"
      width={1040}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            取消
          </Button>
          <Button variant="secondary" onClick={() => void enqueue(false)} disabled={loading}>
            仅加入队列
          </Button>
          <Button variant="primary" onClick={() => void enqueue(true)} loading={loading}>
            <UploadCloud size={14} />
            一键上传 {selectedTracks.length} 首
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-[1fr_170px] gap-4">
        <div className="rounded-2xl border border-[var(--border)] bg-white/[.025] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">已选择 {selectedTracks.length} / {tracks.length} 首</div>
              <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                使用来源元数据；如需修改请在上传任务页逐首编辑。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="accent">{tracks[0]?.provider.toUpperCase() ?? 'SOURCE'}</Badge>
              <Badge tone="default">{MAX_PREVIEW_SECONDS} 秒试听可用</Badge>
            </div>
          </div>
          <Progress
            className="mt-4"
            value={tracks.length ? (selectedTracks.length / tracks.length) * 100 : 0}
          />
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-white/[.025] p-4">
          <div className="mb-1.5 text-[11px] text-[var(--text-muted)]">默认上传音质</div>
          <NativeSelect
            value={quality}
            onChange={event => setQuality(event.target.value as QualityPreference)}
          >
            <option value="auto">自动（最高可用）</option>
            {QUALITY_ORDER.slice().reverse().map(value => (
              <option key={value} value={value}>
                {QUALITY_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="mb-3 max-h-[360px] overflow-auto">
        <TrackTable
          tracks={tracks}
          selectedKeys={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          showActions={false}
        />
      </div>

      <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] px-4">
        <ToggleRow
          label="写入封面"
          description="写入 APIC/PICTURE，云盘未匹配时也可显示"
          checked={writeCover}
          onCheckedChange={setWriteCover}
        />
        <ToggleRow
          label="写入歌词"
          description="自动回退洛雪、平台、LRCLIB 和自定义接口，仅写入同步 LRC"
          checked={writeLyrics}
          onCheckedChange={setWriteLyrics}
        />
        <ToggleRow
          label="重复文件仍然上传"
          checked={allowDuplicate}
          onCheckedChange={setAllowDuplicate}
        />
      </div>

      {selectedTracks.length > MAX_BATCH_WARNING ? (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-500/[.06] px-4 py-3 text-[11px] leading-5 text-amber-100/75">
          <input
            type="checkbox"
            checked={confirmedLarge}
            onChange={event => setConfirmedLarge(event.target.checked)}
            className="mt-0.5 accent-rose-500"
          />
          本批次包含 {selectedTracks.length} 首歌曲，下载和上传可能持续较长时间。我确认开始批量处理。
        </label>
      ) : null}
    </Modal>
  )
}
