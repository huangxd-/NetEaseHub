import { useMemo, useState } from 'react'
import { FileCode2, Link2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import type { SourceImportInput } from '@shared/types'
import { errorMessage, unwrap } from '../lib/api'
import { Button, Field, Modal, TextArea, TextInput, cn } from './ui'

type ImportMode = SourceImportInput['mode']

const modes: Array<{ id: ImportMode; label: string; icon: typeof Link2 }> = [
  { id: 'url', label: '从 URL 导入', icon: Link2 },
  { id: 'text', label: '粘贴脚本', icon: FileCode2 },
  { id: 'file', label: '本地文件', icon: Upload }
]

export function SourceImportDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ImportMode>('url')
  const [value, setValue] = useState('')
  const [filePath, setFilePath] = useState('')
  const [loading, setLoading] = useState(false)

  const fileName = useMemo(() => {
    if (!filePath) return ''
    return filePath.split(/[\\/]/).pop() ?? filePath
  }, [filePath])

  const chooseFile = async () => {
    try {
      const path = await unwrap(
        window.neteasehub.app.pickFile([{ name: 'JavaScript', extensions: ['js', 'txt'] }])
      )
      if (path) setFilePath(path)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const submit = async () => {
    const inputValue = mode === 'file' ? filePath : value.trim()
    if (!inputValue) {
      toast.error(mode === 'file' ? '请选择脚本文件' : '请输入音源地址或脚本内容')
      return
    }
    setLoading(true)
    try {
      const script = await unwrap(
        window.neteasehub.sources.import({
          mode,
          value: inputValue
        })
      )
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
      if (script.enabled) {
        toast.success(`已导入音源：${script.name}`)
      } else {
        toast.warning(`音源已保存但初始化失败：${script.lastError ?? '未知错误'}`)
      }
      setValue('')
      setFilePath('')
      onOpenChange(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="导入洛雪兼容音源"
      description="音源脚本负责解析实际音频地址；搜索和专辑/歌单解析由应用内置完成。"
      width={660}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} loading={loading}>
            导入并校验
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {modes.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setMode(item.id)}
              className={cn(
                'flex h-12 items-center gap-2 rounded-xl border px-3 text-xs transition',
                mode === item.id
                  ? 'border-rose-400/35 bg-rose-500/10 text-rose-200'
                  : 'border-[var(--border)] bg-white/[.025] text-[var(--text-muted)] hover:bg-white/[.05]'
              )}
            >
              <Icon size={15} />
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        {mode === 'url' ? (
          <Field label="脚本 URL" hint="最大 2 MB">
            <TextInput
              autoFocus
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="https://example.com/lx-source.js"
            />
          </Field>
        ) : mode === 'text' ? (
          <Field label="脚本内容" hint="UTF-8 JavaScript">
            <TextArea
              autoFocus
              className="h-[280px] font-mono text-xs"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder={'/**\n * @name 我的音源\n */\nconst { EVENT_NAMES, on, send } = globalThis.lx'}
            />
          </Field>
        ) : (
          <div>
            <Field label="本地脚本文件" hint=".js / .txt">
              <button
                onClick={chooseFile}
                className="flex h-[120px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/15 text-[var(--text-muted)] transition hover:border-rose-400/35 hover:bg-rose-500/[.04]"
              >
                {fileName ? <FileCode2 size={26} className="mb-2 text-rose-300" /> : <Upload size={26} className="mb-2" />}
                <span className="text-sm">{fileName || '选择本地音源脚本'}</span>
                <span className="mt-1 text-[10px] text-[var(--text-dim)]">脚本只在隔离窗口中运行</span>
              </button>
            </Field>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-500/[.055] px-4 py-3 text-[11px] leading-5 text-amber-100/70">
        音源脚本属于第三方代码，拥有向你指定 HTTP/HTTPS 地址发起请求的能力。请只导入可信来源，并在导入前自行审查脚本。
      </div>
    </Modal>
  )
}
