import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import type { QrLoginStart } from '@shared/types'
import { useAppStore } from '../store/app-store'
import { errorMessage, unwrap } from '../lib/api'
import { Badge, Button, Modal, Spinner } from './ui'

export function LoginDialog() {
  const open = useAppStore(state => state.loginOpen)
  const setOpen = useAppStore(state => state.setLoginOpen)
  const setAuth = useAppStore(state => state.setAuth)
  const queryClient = useQueryClient()
  const [qr, setQr] = useState<QrLoginStart | null>(null)
  const [status, setStatus] = useState('正在获取二维码…')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const generationRef = useRef(0)

  const start = useCallback(async () => {
    const generation = ++generationRef.current
    setLoading(true)
    setError(null)
    setQr(null)
    setStatus('正在获取二维码…')
    try {
      const result = await unwrap(window.neteasehub.auth.startQr())
      if (generation !== generationRef.current) return
      setQr(result)
      setStatus('打开网易云音乐 App，使用扫一扫登录')
    } catch (err) {
      if (generation !== generationRef.current) return
      setError(errorMessage(err))
      setStatus('二维码获取失败')
    } finally {
      if (generation === generationRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      generationRef.current++
      return
    }
    void start()
  }, [open, start])

  useEffect(() => {
    if (!open || !qr) return
    let disposed = false
    let busy = false
    const timer = window.setInterval(async () => {
      if (disposed || busy) return
      busy = true
      try {
        const result = await unwrap(window.neteasehub.auth.checkQr(qr.key))
        if (disposed) return
        setStatus(result.message)
        if (result.code === 803 && result.auth) {
          window.clearInterval(timer)
          setAuth(result.auth)
          toast.success(`欢迎回来，${result.auth.profile?.nickname ?? '网易云用户'}`)
          await queryClient.invalidateQueries()
          setOpen(false)
        }
        if (result.code === 800) {
          window.clearInterval(timer)
          setStatus('二维码已过期')
        }
      } catch (err) {
        if (!disposed) setStatus(errorMessage(err))
      } finally {
        busy = false
      }
    }, 2000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [open, qr, queryClient, setAuth, setOpen])

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="扫码登录网易云音乐"
      description="登录凭证仅保存在本机，并使用系统安全存储加密。"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            稍后登录
          </Button>
          <Button variant="secondary" onClick={start} loading={loading}>
            <RefreshCw size={14} />
            刷新二维码
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center py-2">
        <div className="relative grid h-[248px] w-[248px] place-items-center overflow-hidden rounded-[26px] bg-white p-3 shadow-[0_24px_70px_rgba(0,0,0,.45)]">
          {qr?.qrDataUrl ? (
            <img src={qr.qrDataUrl} alt="网易云登录二维码" className="h-full w-full object-contain" />
          ) : loading ? (
            <Spinner size={26} />
          ) : (
            <div className="px-6 text-center text-xs leading-5 text-zinc-500">
              {error ?? '二维码不可用，请刷新重试'}
            </div>
          )}
          {status === '二维码已过期' ? (
            <button
              className="absolute inset-0 grid place-items-center bg-white/90 text-sm font-medium text-zinc-900 backdrop-blur"
              onClick={start}
            >
              点击刷新二维码
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm">
          {status.includes('确认') ? (
            <Smartphone size={15} className="text-amber-300" />
          ) : status.includes('成功') ? (
            <CheckCircle2 size={15} className="text-emerald-300" />
          ) : (
            <Smartphone size={15} className="text-[var(--text-muted)]" />
          )}
          {status}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Badge tone="default">网易云音乐 App</Badge>
          <Badge tone="default">扫码登录</Badge>
          <Badge tone="default">不保存密码</Badge>
        </div>
        <p className="mt-5 max-w-sm text-center text-[11px] leading-5 text-[var(--text-dim)]">
          NetEaseHub 使用非官方接口访问网易云云盘。请确认账号风险并仅上传你有权使用的内容。
        </p>
      </div>
    </Modal>
  )
}
