import {
  CloudDownload,
  ListTodo,
  LogIn,
  LogOut,
  Search,
  Settings,
  Sparkles,
  UserRound
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAppStore, type PageKey } from '../store/app-store'
import { unwrap } from '../lib/api'
import { cn, IconButton } from './ui'

const navItems: Array<{
  id: PageKey
  label: string
  hint: string
  icon: typeof Search
}> = [
  { id: 'search', label: '搜索与上传', hint: 'SEARCH', icon: Search },
  { id: 'cloud', label: '云盘管理', hint: 'CLOUD', icon: CloudDownload },
  { id: 'tasks', label: '任务队列', hint: 'TASKS', icon: ListTodo },
  { id: 'settings', label: '设置', hint: 'SETTINGS', icon: Settings }
]

export function Sidebar() {
  const page = useAppStore(state => state.page)
  const setPage = useAppStore(state => state.setPage)
  const auth = useAppStore(state => state.auth)
  const setAuth = useAppStore(state => state.setAuth)
  const setLoginOpen = useAppStore(state => state.setLoginOpen)
  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: () => unwrap(window.neteasehub.sources.list())
  })

  const enabledSources = sources.filter(source => source.enabled).length

  const logout = async () => {
    try {
      await unwrap(window.neteasehub.auth.logout())
      setAuth({ loggedIn: false })
      toast.success('已退出网易云音乐')
    } catch {
      toast.error('退出登录失败')
    }
  }

  return (
    <aside className="sidebar">
      <div className="drag-region mb-5 h-7 shrink-0" />
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 text-white shadow-[0_10px_24px_rgba(244,63,94,.25)]">
          <CloudDownload size={19} strokeWidth={2.3} />
          <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full border-2 border-rose-500 bg-white" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold tracking-[-0.02em]">NetEaseHub</div>
          <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--text-dim)]">
            Cloud Uploader
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        {navItems.map(item => {
          const Icon = item.icon
          const active = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={cn(
                'group no-drag flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-all',
                active
                  ? 'bg-white/[.075] text-[var(--text)] shadow-[inset_0_0_0_1px_rgba(255,255,255,.055)]'
                  : 'text-[var(--text-muted)] hover:bg-white/[.04] hover:text-[var(--text)]'
              )}
            >
              <span
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-lg transition',
                  active ? 'bg-rose-500/15 text-rose-300' : 'bg-white/[.025] group-hover:bg-white/[.05]'
                )}
              >
                <Icon size={15} strokeWidth={2} />
              </span>
              <span className="flex-1 text-[13px] font-medium">{item.label}</span>
              {active ? <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> : null}
            </button>
          )
        })}
      </nav>

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-white/[.022] p-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <Sparkles size={13} className="text-rose-300" />
          音源状态
          <span className="ml-auto mono text-[10px] text-[var(--text-dim)]">
            {enabledSources}/{sources.length}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all"
            style={{ width: sources.length ? `${(enabledSources / sources.length) * 100}%` : '0%' }}
          />
        </div>
        <div className="mt-2 text-[10px] leading-4 text-[var(--text-dim)]">
          {enabledSources ? '多源自动回退已启用' : '请先导入洛雪兼容音源'}
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-5">
        <div className="rounded-2xl border border-[var(--border)] bg-white/[.028] p-3">
          <div className="flex items-center gap-3">
            {auth.loggedIn ? (
              auth.profile?.avatarUrl ? (
                <img
                  src={auth.profile.avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-rose-500/15 text-rose-300">
                  <UserRound size={16} />
                </div>
              )
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full border border-dashed border-white/15 text-[var(--text-dim)]">
                <UserRound size={16} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">
                {auth.loggedIn ? auth.profile?.nickname ?? '网易云用户' : '未登录网易云'}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[var(--text-dim)]">
                {auth.loggedIn ? '云盘已连接' : '扫码后即可上传'}
              </div>
            </div>
            {auth.loggedIn ? (
              <IconButton onClick={logout} aria-label="退出登录" title="退出登录">
                <LogOut size={14} />
              </IconButton>
            ) : (
              <IconButton onClick={() => setLoginOpen(true)} aria-label="扫码登录" title="扫码登录">
                <LogIn size={14} />
              </IconButton>
            )}
          </div>
        </div>
        <div className="px-2 text-[9px] leading-4 text-[var(--text-dim)]">
          非官方工具 · 仅上传你有权使用的内容
        </div>
      </div>
    </aside>
  )
}
