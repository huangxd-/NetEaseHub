import { useQuery } from '@tanstack/react-query'
import { Activity, Cloud, HardDrive, UploadCloud } from 'lucide-react'
import { unwrap } from '../lib/api'
import { useAppStore } from '../store/app-store'
import { Badge } from './ui'

export function Topbar() {
  const auth = useAppStore(state => state.auth)
  const { data: summary } = useQuery({
    queryKey: ['upload-summary'],
    queryFn: () => unwrap(window.neteasehub.uploads.summary()),
    refetchInterval: 3000
  })
  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: () => unwrap(window.neteasehub.sources.list())
  })
  const enabledSources = sources.filter(source => source.enabled).length

  return (
    <header className="drag-region flex h-[62px] shrink-0 items-center justify-end gap-2 border-b border-[var(--border)] px-6">
      <div className="no-drag flex items-center gap-2">
        <Badge tone={enabledSources ? 'success' : 'warning'} className="h-7 gap-1.5 px-2.5">
          <Activity size={11} />
          音源 {enabledSources}
        </Badge>
        <Badge tone={auth.loggedIn ? 'success' : 'default'} className="h-7 gap-1.5 px-2.5">
          <Cloud size={11} />
          {auth.loggedIn ? '云盘已连接' : '未登录'}
        </Badge>
        {summary && summary.total > 0 ? (
          <Badge tone={summary.running ? 'accent' : 'info'} className="h-7 gap-1.5 px-2.5">
            {summary.running ? <UploadCloud size={11} /> : <HardDrive size={11} />}
            {summary.running ? `${summary.running} 个进行中` : `任务 ${summary.total}`}
          </Badge>
        ) : null}
      </div>
    </header>
  )
}
