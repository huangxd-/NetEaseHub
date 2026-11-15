import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import type { EditableMetadata, QualityPreference, TrackRef, UploadDraft } from '@shared/types'
import { QUALITY_LABELS, QUALITY_ORDER } from '@shared/constants'
import { defaultMetadata, formatDuration, splitArtists } from '@shared/utils'
import { useAppStore } from '../store/app-store'
import { errorMessage, unwrap } from '../lib/api'
import { usePreview } from './PreviewPlayer'
import {
  Badge,
  Button,
  Field,
  Modal,
  NativeSelect,
  TextArea,
  TextInput,
  ToggleRow,
  cn
} from './ui'

export function MetadataDialog({
  open,
  onOpenChange,
  track,
  draft
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  track?: TrackRef | null
  draft?: UploadDraft | null
}) {
  const auth = useAppStore(state => state.auth)
  const setLoginOpen = useAppStore(state => state.setLoginOpen)
  const queryClient = useQueryClient()
  const preview = usePreview()
  const targetTrack = draft?.track ?? track ?? null
  const [metadata, setMetadata] = useState<EditableMetadata>({
    title: '',
    artists: []
  })
  const [artistsText, setArtistsText] = useState('')
  const [quality, setQuality] = useState<QualityPreference>('auto')
  const [writeCover, setWriteCover] = useState(true)
  const [writeLyrics, setWriteLyrics] = useState(true)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !targetTrack) return
    const next = draft?.metadata ?? defaultMetadata(targetTrack)
    setMetadata({ ...next })
    setArtistsText(next.artists.join('、'))
    setQuality(draft?.requestedQuality ?? 'auto')
    setWriteCover(draft?.writeCover ?? true)
    setWriteLyrics(draft?.writeLyrics ?? true)
    setAllowDuplicate(draft?.allowDuplicate ?? false)
  }, [draft, open, targetTrack])

  const coverPreview = metadata.cover
    ? `data:${metadata.cover.mime};base64,${metadata.cover.dataBase64}`
    : targetTrack?.coverUrl

  const valid = useMemo(
    () => metadata.title.trim().length > 0 && splitArtists(artistsText).length > 0,
    [artistsText, metadata.title]
  )

  const chooseCover = async () => {
    try {
      const picked = await unwrap(window.neteasehub.app.pickImage())
      if (!picked) return
      setMetadata(value => ({
        ...value,
        cover: {
          mime: picked.mime,
          dataBase64: picked.dataBase64
        }
      }))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const save = async (startNow: boolean) => {
    if (!targetTrack) return
    if (!valid) {
      toast.error('请填写歌曲名和至少一位歌手')
      return
    }
    if (!auth.loggedIn) {
      setLoginOpen(true)
      toast.error('请先扫码登录网易云音乐')
      return
    }
    setSaving(true)
    try {
      const normalized: EditableMetadata = {
        ...metadata,
        title: metadata.title.trim(),
        artists: splitArtists(artistsText)
      }
      if (draft) {
        await unwrap(
          window.neteasehub.uploads.update(draft.id, {
            requestedQuality: quality,
            metadata: normalized,
            writeCover,
            writeLyrics,
            allowDuplicate
          })
        )
        toast.success('任务信息已更新')
      } else {
        await unwrap(
          window.neteasehub.uploads.enqueue({
            tracks: [targetTrack],
            requestedQuality: quality,
            metadataOverrides: normalized,
            writeCover,
            writeLyrics,
            allowDuplicate
          })
        )
        if (startNow) {
          await unwrap(window.neteasehub.uploads.start())
          toast.success('已加入上传队列')
        } else {
          toast.success('已加入队列，可在任务页开始上传')
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['uploads'] })
      await queryClient.invalidateQueries({ queryKey: ['upload-summary'] })
      onOpenChange(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={draft ? '编辑上传任务' : '试听并编辑后上传'}
      description="确认歌曲版本，补充标题、歌手与专辑信息。封面和歌词会写入音频标签。"
      width={820}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {draft ? (
            <Button variant="primary" onClick={() => void save(false)} loading={saving}>
              保存修改
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => void save(false)} disabled={saving}>
                仅加入队列
              </Button>
              <Button variant="primary" onClick={() => void save(true)} loading={saving}>
                加入并开始上传
              </Button>
            </>
          )}
        </>
      }
    >
      {targetTrack ? (
        <>
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-white/[.025] p-4">
            <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl border border-white/10">
              {coverPreview ? (
                <img src={coverPreview} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="cover-fallback h-full w-full text-lg">♪</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-medium">{targetTrack.title}</div>
              <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                {targetTrack.artists.join('、')} · {targetTrack.album || '未知专辑'}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone="accent">{targetTrack.provider.toUpperCase()}</Badge>
                <Badge tone="default">{formatDuration(targetTrack.durationSec)}</Badge>
                {draft?.resolvedQuality ? (
                  <Badge tone="success">已解析 {QUALITY_LABELS[draft.resolvedQuality]}</Badge>
                ) : null}
              </div>
            </div>
            <Button variant="secondary" onClick={() => void preview.playTrack(targetTrack)}>
              <Play size={14} />
              试听 30 秒
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Field label="歌曲名" className="col-span-2">
              <TextInput
                value={metadata.title}
                onChange={event => setMetadata(value => ({ ...value, title: event.target.value }))}
              />
            </Field>
            <Field label="歌手" hint="使用 、 分隔多位歌手">
              <TextInput
                value={artistsText}
                onChange={event => setArtistsText(event.target.value)}
                placeholder="歌手 A、歌手 B"
              />
            </Field>
            <Field label="专辑">
              <TextInput
                value={metadata.album ?? ''}
                onChange={event => setMetadata(value => ({ ...value, album: event.target.value }))}
              />
            </Field>
            <Field label="专辑艺术家">
              <TextInput
                value={metadata.albumArtist ?? ''}
                onChange={event =>
                  setMetadata(value => ({ ...value, albumArtist: event.target.value }))
                }
              />
            </Field>
            <Field label="流派">
              <TextInput
                value={metadata.genre ?? ''}
                onChange={event => setMetadata(value => ({ ...value, genre: event.target.value }))}
                placeholder="Pop / 华语流行"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="音轨号">
                <TextInput
                  type="number"
                  min={1}
                  value={metadata.trackNo ?? ''}
                  onChange={event =>
                    setMetadata(value => ({
                      ...value,
                      trackNo: event.target.value ? Number(event.target.value) : undefined
                    }))
                  }
                />
              </Field>
              <Field label="总数">
                <TextInput
                  type="number"
                  min={1}
                  value={metadata.trackTotal ?? ''}
                  onChange={event =>
                    setMetadata(value => ({
                      ...value,
                      trackTotal: event.target.value ? Number(event.target.value) : undefined
                    }))
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="碟号">
                <TextInput
                  type="number"
                  min={1}
                  value={metadata.discNo ?? ''}
                  onChange={event =>
                    setMetadata(value => ({
                      ...value,
                      discNo: event.target.value ? Number(event.target.value) : undefined
                    }))
                  }
                />
              </Field>
              <Field label="年份">
                <TextInput
                  value={metadata.year ?? ''}
                  onChange={event => setMetadata(value => ({ ...value, year: event.target.value }))}
                  placeholder="2026"
                />
              </Field>
            </div>
            <Field label="上传音质">
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
            </Field>
            <div className="flex items-end">
              <Button variant="secondary" onClick={chooseCover} className="w-full justify-start">
                <ImagePlus size={14} />
                选择本地封面
              </Button>
            </div>
            <Field label="歌词（LRC）" className="col-span-2">
              <TextArea
                className="h-28 font-mono text-[11px]"
                value={metadata.lyrics ?? ''}
                onChange={event =>
                  setMetadata(value => ({ ...value, lyrics: event.target.value }))
                }
                placeholder="可从音源自动获取，也可以在这里粘贴 LRC 歌词"
              />
            </Field>
          </div>

          <div className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] px-4">
            <ToggleRow
              label="写入封面"
              description="优先使用选择的封面，否则尝试来源封面"
              checked={writeCover}
              onCheckedChange={setWriteCover}
            />
            <ToggleRow
              label="写入歌词"
              description="尝试从音源获取歌词并写入音频标签"
              checked={writeLyrics}
              onCheckedChange={setWriteLyrics}
            />
            <ToggleRow
              label="重复文件仍然上传"
              description="关闭时，云盘已存在相同 MD5 的文件会自动跳过"
              checked={allowDuplicate}
              onCheckedChange={setAllowDuplicate}
            />
          </div>

          {metadata.cover ? (
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMetadata(value => ({ ...value, cover: undefined }))}
              >
                <Trash2 size={12} />
                移除本地封面
              </Button>
            </div>
          ) : null}

          <div className={cn('mt-4 rounded-xl px-4 py-3 text-[11px] leading-5', 'border border-sky-400/15 bg-sky-500/[.055] text-sky-100/65')}>
            网易云云盘接口只接收标题、歌手和专辑作为云端字段；封面、歌词、音轨号等信息会写入音频文件标签。
          </div>
        </>
      ) : null}
    </Modal>
  )
}
