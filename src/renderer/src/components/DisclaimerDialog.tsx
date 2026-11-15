import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../store/app-store'
import { unwrap } from '../lib/api'
import { Button, Modal } from './ui'

export function DisclaimerDialog() {
  const open = useAppStore(state => state.disclaimerOpen)
  const setOpen = useAppStore(state => state.setDisclaimerOpen)
  const queryClient = useQueryClient()

  const accept = async () => {
    try {
      const next = await unwrap(
        window.neteasehub.settings.update({ disclaimerAccepted: true })
      )
      queryClient.setQueryData(['settings'], next)
      setOpen(false)
    } catch {
      toast.error('保存确认状态失败')
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={() => undefined}
      title="使用前请了解"
      description="NetEaseHub 是本地桌面工具，不提供音乐内容，也不与网易云音乐或洛雪音乐助手存在隶属关系。"
      width={620}
      footer={
        <Button variant="primary" onClick={() => void accept()}>
          我已了解并继续
        </Button>
      }
    >
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-300">
          <ShieldAlert size={20} />
        </div>
        <div className="space-y-3 text-xs leading-6 text-[var(--text-muted)]">
          <p>
            本应用通过非官方接口访问你的网易云音乐云盘。接口可能随时失效，账号可能触发风控或验证，
            请自行评估风险。
          </p>
          <p>
            洛雪兼容音源脚本由你自行导入并运行。脚本属于第三方代码，具备向外部 HTTP/HTTPS 地址发起请求的能力，
            请只使用你信任的来源。
          </p>
          <p>
            请仅下载、试听和上传你有权使用的内容。应用不会绕过付费或版权限制，也不会向任何第三方服务器上传你的登录凭证。
          </p>
          <p className="text-[var(--text-dim)]">
            继续使用即表示你理解并接受上述风险。登录凭证仅保存在本机，并通过系统安全存储加密。
          </p>
        </div>
      </div>
    </Modal>
  )
}
