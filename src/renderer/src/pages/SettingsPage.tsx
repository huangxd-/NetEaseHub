import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Captions,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FileImage,
  FilePlus2,
  FolderOpen,
  Gauge,
  LogIn,
  LogOut,
  RefreshCw,
  ScrollText,
  ServerCog,
  Settings2,
  ShieldAlert,
  Trash2,
  UploadCloud,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  AppSettings,
  DiagnosticResult,
  SourceScriptInfo,
  UpdateInfo
} from '@shared/types'
import {
  MAX_PREVIEW_SECONDS,
  PROVIDERS,
  QUALITY_LABELS,
  QUALITY_ORDER,
  RELEASE_URL
} from '@shared/constants'
import { useAppStore } from '../store/app-store'
import { errorMessage, unwrap } from '../lib/api'
import { SourceImportDialog } from '../components/SourceImportDialog'
import {
  Badge,
  Button,
  Field,
  IconButton,
  NativeSelect,
  Spinner,
  TextInput,
  Toggle,
  ToggleRow
} from '../components/ui'

function SourceRow({
  source,
  index,
  total,
  onMove,
  onToggle,
  onReload,
  onRemove
}: {
  source: SourceScriptInfo
  index: number
  total: number
  onMove: (direction: -1 | 1) => void
  onToggle: (enabled: boolean) => void
  onReload: () => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white/[.018] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-rose-500/[.07] text-rose-300">
          <ServerCog size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{source.name}</span>
            {source.version ? <Badge tone="default">v{source.version}</Badge> : null}
            {source.enabled ? (
              <Badge tone="success">已启用</Badge>
            ) : (
              <Badge tone="warning">已停用</Badge>
            )}
            {source.lastError ? <Badge tone="danger">初始化异常</Badge> : null}
          </div>
          <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
            {source.description || '洛雪兼容自定义音源脚本'}
            {source.author ? ` · ${source.author}` : ''}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {PROVIDERS.map(provider => {
              const qualities = source.capabilities?.[provider.id]
              if (!qualities?.length) return null
              return (
                <span
                  key={provider.id}
                  className="rounded-md border border-white/[.08] bg-white/[.025] px-1.5 py-1 text-[9px] text-[var(--text-muted)]"
                >
                  {provider.shortName} · {qualities.map(value => QUALITY_LABELS[value]).join(' / ')}
                </span>
              )
            })}
            {!Object.keys(source.capabilities ?? {}).length ? (
              <span className="text-[10px] text-[var(--text-dim)]">尚未读取到平台能力</span>
            ) : null}
          </div>
          {source.lastError ? (
            <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-red-300/75">
              {source.lastError}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Toggle checked={source.enabled} onCheckedChange={onToggle} />
          <div className="mx-1 h-5 w-px bg-white/10" />
          <IconButton onClick={() => onMove(-1)} disabled={index === 0} title="提高优先级">
            <ArrowUp size={13} />
          </IconButton>
          <IconButton onClick={() => onMove(1)} disabled={index === total - 1} title="降低优先级">
            <ArrowDown size={13} />
          </IconButton>
          <IconButton onClick={onReload} title="重新初始化">
            <RefreshCw size={13} />
          </IconButton>
          <IconButton onClick={onRemove} title="删除" className="text-red-300/70">
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

function SettingsCard({
  title,
  description,
  icon,
  children,
  action
}: {
  title: string
  description?: string
  icon: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="glass-card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[.035] text-rose-300">
            {icon}
          </div>
          <div>
            <h2 className="text-sm font-medium">{title}</h2>
            {description ? (
              <p className="mt-1 text-[10px] text-[var(--text-dim)]">{description}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SettingsPage() {
  const auth = useAppStore(state => state.auth)
  const setAuth = useAppStore(state => state.setAuth)
  const setLoginOpen = useAppStore(state => state.setLoginOpen)
  const queryClient = useQueryClient()
  const [importOpen, setImportOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [updating, setUpdating] = useState(false)
  const [lyricsApiUrl, setLyricsApiUrl] = useState('')
  const [coverApiUrl, setCoverApiUrl] = useState('')
  const [savingApi, setSavingApi] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => unwrap(window.neteasehub.settings.get())
  })
  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: () => unwrap(window.neteasehub.sources.list())
  })
  const { data: appInfo } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => unwrap(window.neteasehub.app.info())
  })
  const savedLyricsApiUrl = settings?.customLyricsApiUrl ?? ''
  const savedCoverApiUrl = settings?.customCoverApiUrl ?? ''

  useEffect(() => {
    setLyricsApiUrl(savedLyricsApiUrl)
  }, [savedLyricsApiUrl])

  useEffect(() => {
    setCoverApiUrl(savedCoverApiUrl)
  }, [savedCoverApiUrl])

  useEffect(() => {
    const dispose = window.neteasehub.sources.onStatus(() => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] })
    })
    return dispose
  }, [queryClient])

  const patchSettings = async (patch: Partial<AppSettings>): Promise<boolean> => {
    try {
      const next = await unwrap(window.neteasehub.settings.update(patch))
      queryClient.setQueryData(['settings'], next)
      return true
    } catch (error) {
      toast.error(errorMessage(error))
      return false
    }
  }

  const saveApiSettings = async () => {
    const lyrics = lyricsApiUrl.trim()
    const cover = coverApiUrl.trim()
    const isValid = (value: string) => !value || /^https?:\/\/\S+$/i.test(value)
    if (!isValid(lyrics) || !isValid(cover)) {
      toast.error('接口地址必须以 http:// 或 https:// 开头')
      return
    }
    setSavingApi(true)
    const saved = await patchSettings({
      customLyricsApiUrl: lyrics,
      customCoverApiUrl: cover
    })
    setSavingApi(false)
    if (saved) toast.success('歌词与封面接口已保存')
  }

  const reorder = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= sources.length) return
    const ids = sources.map(item => item.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    try {
      const next = await unwrap(window.neteasehub.sources.reorder({ ids }))
      queryClient.setQueryData(['sources'], next)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const runDiagnostics = async () => {
    setDiagnosing(true)
    try {
      setDiagnostics(await unwrap(window.neteasehub.diagnostics.run()))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setDiagnosing(false)
    }
  }

  const checkUpdate = async () => {
    setUpdating(true)
    try {
      const result = await unwrap(window.neteasehub.updates.check())
      setUpdate(result)
      if (result.error) toast.error(result.error)
      else if (result.hasUpdate) toast.success(`发现新版本 ${result.latestVersion}`)
      else toast.success('当前已是最新版本')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setUpdating(false)
    }
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }

  return (
    <div className="page-enter">
      <div className="flex items-end justify-between pb-6 pt-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">SETTINGS</Badge>
            <Badge tone="default">{appInfo?.version ? `v${appInfo.version}` : ''}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em]">设置</h1>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            管理账号、洛雪音源、歌词封面补全、上传默认值和本机诊断信息。
          </p>
        </div>
        {update?.hasUpdate ? (
          <Button variant="primary" onClick={() => void window.neteasehub.updates.open(update.releaseUrl)}>
            <Download size={14} />
            下载 v{update.latestVersion}
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_1fr] items-start gap-4">
        <SettingsCard
          title="网易云账号"
          description="登录凭证使用系统安全存储加密"
          icon={<LogIn size={16} />}
          action={
            auth.loggedIn ? (
              <Badge tone="success">
                <CheckCircle2 size={10} />
                已连接
              </Badge>
            ) : (
              <Badge tone="warning">未登录</Badge>
            )
          }
        >
          <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-black/15 p-3">
            {auth.loggedIn && auth.profile?.avatarUrl ? (
              <img
                src={auth.profile.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-full bg-white/[.04] text-[var(--text-dim)]">
                <LogIn size={16} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                {auth.loggedIn ? auth.profile?.nickname ?? '网易云用户' : '尚未登录'}
              </div>
              <div className="mt-1 text-[10px] text-[var(--text-dim)]">
                {auth.loggedIn
                  ? `用户 ID ${auth.profile?.userId ?? '-'}`
                  : '扫码后即可读取并管理云盘'}
              </div>
            </div>
            {auth.loggedIn ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await unwrap(window.neteasehub.auth.logout())
                  setAuth({ loggedIn: false })
                  toast.success('已退出登录')
                }}
              >
                <LogOut size={13} />
                退出
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => setLoginOpen(true)}>
                扫码登录
              </Button>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          title="上传默认值"
          description="应用到之后创建的上传任务"
          icon={<UploadCloud size={16} />}
        >
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1.5 block text-[10px] text-[var(--text-muted)]">默认音质</span>
              <NativeSelect
                value={settings.defaultQuality}
                onChange={event =>
                  void patchSettings({
                    defaultQuality: event.target.value as AppSettings['defaultQuality']
                  })
                }
              >
                <option value="auto">自动（最高可用）</option>
                {QUALITY_ORDER.slice().reverse().map(quality => (
                  <option key={quality} value={quality}>
                    {QUALITY_LABELS[quality]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] text-[var(--text-muted)]">下载并发</span>
              <NativeSelect
                value={settings.downloadConcurrency}
                onChange={event =>
                  void patchSettings({ downloadConcurrency: Number(event.target.value) })
                }
              >
                {[1, 2, 3].map(value => (
                  <option key={value} value={value}>
                    {value} 首
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <div className="mt-2 divide-y divide-[var(--border)]">
            <ToggleRow
              label="默认写入封面"
              checked={settings.writeCover}
              onCheckedChange={writeCover => void patchSettings({ writeCover })}
            />
            <ToggleRow
              label="默认写入歌词"
              checked={settings.writeLyrics}
              onCheckedChange={writeLyrics => void patchSettings({ writeLyrics })}
            />
            <ToggleRow
              label="上传后自动匹配网易云曲目"
              description="仅高置信度自动绑定，用于恢复 SQ / Hi-Res 等曲目信息"
              checked={settings.autoMatchOnUpload}
              onCheckedChange={autoMatchOnUpload => void patchSettings({ autoMatchOnUpload })}
            />
            <ToggleRow
              label="自动跳过云盘重复文件"
              description="按文件 MD5 比对"
              checked={settings.autoSkipDuplicate}
              onCheckedChange={autoSkipDuplicate => void patchSettings({ autoSkipDuplicate })}
            />
            <ToggleRow
              label="保留下载文件"
              description="关闭时上传完成后删除临时文件"
              checked={settings.keepDownloadedFiles}
              onCheckedChange={keepDownloadedFiles => void patchSettings({ keepDownloadedFiles })}
            />
          </div>
        </SettingsCard>
      </div>

      <div className="mt-4">
        <SettingsCard
          title="歌词与封面补全"
          description="平台和洛雪音源缺失时，继续使用 LRCLIB 同步歌词及自定义接口"
          icon={<Captions size={16} />}
        >
          <div className="grid grid-cols-[230px_1fr] gap-5">
            <div className="rounded-2xl border border-[var(--border)] bg-white/[.018] px-4">
              <ToggleRow
                label="LRCLIB 同步歌词"
                description="仅在平台内置歌词失败后查询"
                checked={settings.lrclibEnabled}
                onCheckedChange={lrclibEnabled => void patchSettings({ lrclibEnabled })}
              />
              <div className="pb-4 text-[10px] leading-5 text-[var(--text-dim)]">
                仅采用带时间轴的 syncedLyrics；plainLyrics 静态歌词不会写入。
              </div>
            </div>

            <div className="space-y-3">
              <Field
                label="自定义歌词接口"
                hint="全部自动来源失败后调用"
              >
                <TextInput
                  value={lyricsApiUrl}
                  onChange={event => setLyricsApiUrl(event.target.value)}
                  placeholder="https://api.lrc.cx/lyrics?title={title}&artist={artist}&album={album}"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="自定义封面接口"
                hint="支持直接返回图片或 JSON 封面地址"
              >
                <TextInput
                  value={coverApiUrl}
                  onChange={event => setCoverApiUrl(event.target.value)}
                  placeholder="https://api.lrc.cx/cover?title={title}&artist={artist}&album={album}"
                  spellCheck={false}
                />
              </Field>
              <div className="flex items-end justify-between gap-4">
                <div className="text-[10px] leading-5 text-[var(--text-dim)]">
                  占位符：{'{title} {artist} {artists} {album} {duration} {provider} {songId}'}
                  ；未写占位符时自动追加同名查询参数。留空即禁用。
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void saveApiSettings()}
                  loading={savingApi}
                >
                  <FileImage size={13} />
                  保存接口配置
                </Button>
              </div>
            </div>
          </div>
        </SettingsCard>
      </div>

      <div className="mt-4">
        <SettingsCard
          title={`洛雪兼容音源 · ${sources.filter(item => item.enabled).length}/${sources.length} 启用`}
          description="按从上到下的优先级自动回退；同一平台支持多个脚本接力"
          icon={<ServerCog size={16} />}
          action={
            <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
              <FilePlus2 size={13} />
              导入音源
            </Button>
          }
        >
          <div className="space-y-2">
            {sources.length ? (
              sources.map((source, index) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  index={index}
                  total={sources.length}
                  onMove={direction => void reorder(index, direction)}
                  onToggle={enabled => {
                    void unwrap(
                      window.neteasehub.sources.toggle({ id: source.id, enabled })
                    ).then(next => queryClient.setQueryData(['sources'], next))
                  }}
                  onReload={() => {
                    toast.promise(
                      unwrap(window.neteasehub.sources.reload(source.id)).then(() =>
                        queryClient.invalidateQueries({ queryKey: ['sources'] })
                      ),
                      {
                        loading: '正在重新初始化音源…',
                        success: '音源能力已刷新',
                        error: errorMessage
                      }
                    )
                  }}
                  onRemove={() => {
                    void unwrap(window.neteasehub.sources.remove(source.id)).then(next => {
                      queryClient.setQueryData(['sources'], next)
                      toast.success('音源已删除')
                    })
                  }}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/12 px-6 py-10 text-center">
                <ServerCog size={24} className="mx-auto text-[var(--text-dim)]" />
                <div className="mt-3 text-sm">还没有音源脚本</div>
                <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                  搜索可正常使用；试听与上传需要洛雪兼容脚本解析音频地址。
                </div>
                <Button className="mt-4" variant="secondary" onClick={() => setImportOpen(true)}>
                  导入第一个音源
                </Button>
              </div>
            )}
          </div>
        </SettingsCard>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_1fr] items-start gap-4">
        <SettingsCard
          title="运行诊断"
          description="检查五大平台搜索、网易云登录和音源状态"
          icon={<Cpu size={16} />}
          action={
            <Button size="sm" variant="secondary" onClick={() => void runDiagnostics()} loading={diagnosing}>
              运行诊断
            </Button>
          }
        >
          {diagnostics ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-[11px]">
                {diagnostics.netease.ok ? (
                  <CheckCircle2 size={13} className="text-emerald-300" />
                ) : (
                  <XCircle size={13} className="text-amber-300" />
                )}
                <span>网易云</span>
                <span className="ml-auto text-[var(--text-dim)]">{diagnostics.netease.message}</span>
              </div>
              {diagnostics.providers.map(item => (
                <div
                  key={item.provider}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-[11px]"
                >
                  {item.ok ? (
                    <CheckCircle2 size={13} className="text-emerald-300" />
                  ) : (
                    <XCircle size={13} className="text-red-300" />
                  )}
                  <span>{PROVIDERS.find(provider => provider.id === item.provider)?.name}</span>
                  <span className="ml-auto max-w-[200px] truncate text-[var(--text-dim)]">
                    {item.message}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center text-[11px] text-[var(--text-dim)]">
              诊断会发起少量真实网络请求，用于确认当前环境是否可用。
            </div>
          )}
        </SettingsCard>

        <SettingsCard
          title="存储、日志与更新"
          description="临时文件、日志目录与版本检查"
          icon={<Settings2 size={16} />}
          action={
            <Button size="sm" variant="secondary" onClick={() => void checkUpdate()} loading={updating}>
              <RefreshCw size={13} />
              检查更新
            </Button>
          }
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5">
              <FolderOpen size={14} className="text-[var(--text-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px]">临时下载目录</div>
                <div className="mt-0.5 truncate text-[9px] text-[var(--text-dim)]">
                  {settings.tempDirectory || '系统临时目录 / neteasehub'}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const path = await unwrap(window.neteasehub.app.pickDirectory())
                  if (path) void patchSettings({ tempDirectory: path })
                }}
              >
                选择
              </Button>
              {settings.tempDirectory ? (
                <IconButton
                  onClick={() => void patchSettings({ tempDirectory: '' })}
                  title="恢复默认"
                >
                  <RefreshCw size={13} />
                </IconButton>
              ) : null}
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5">
              <ScrollText size={14} className="text-[var(--text-muted)]" />
              <div className="flex-1">
                <div className="text-[11px]">数据与日志</div>
                <div className="mt-0.5 truncate text-[9px] text-[var(--text-dim)]">
                  {appInfo?.dataPath ?? '应用数据目录'}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => appInfo && void window.neteasehub.app.showItem(appInfo.dataPath)}
              >
                打开
              </Button>
            </div>
            {update ? (
              <div className="rounded-xl border border-[var(--border)] px-3 py-2.5 text-[10px] text-[var(--text-muted)]">
                当前 v{update.currentVersion}
                {update.latestVersion ? ` · 最新 v${update.latestVersion}` : ''}
                {update.hasUpdate ? (
                  <button
                    className="ml-2 text-rose-300 hover:underline"
                    onClick={() => void window.neteasehub.updates.open(update.releaseUrl)}
                  >
                    前往下载
                  </button>
                ) : (
                  <span className="ml-2 text-[var(--text-dim)]">无需更新</span>
                )}
              </div>
            ) : null}
            <div className="rounded-xl border border-amber-400/15 bg-amber-500/[.045] px-3 py-2.5 text-[10px] leading-5 text-amber-100/65">
              当前版本未签名。macOS 可能出现 Gatekeeper 提示，Windows 可能触发 SmartScreen；
              更新检查会跳转到 GitHub Releases。
            </div>
          </div>
        </SettingsCard>
      </div>

      <div className="mt-4 rounded-2xl border border-red-400/15 bg-red-500/[.035] p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-red-300" />
          <div className="text-[11px] leading-5 text-red-100/65">
            <div className="font-medium text-red-100/85">非官方接口与使用风险</div>
            <div className="mt-1">
              NetEaseHub 与网易云音乐、洛雪音乐助手无隶属关系。应用通过第三方接口访问个人云盘，
              接口可能随官方调整而失效；请仅上传你拥有权利的音乐，并自行承担账号使用风险。
            </div>
            <button
              className="mt-2 inline-flex items-center gap-1 text-red-200/80 hover:underline"
              onClick={() => void window.neteasehub.app.openExternal(RELEASE_URL)}
            >
              查看项目发布页
              <ExternalLink size={10} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-5 text-[10px] text-[var(--text-dim)]">
        <span>NetEaseHub {appInfo?.version ? `v${appInfo.version}` : ''} · Apache-2.0</span>
        <span className="flex items-center gap-2">
          <Gauge size={11} />
          五大平台搜索 · 多源回退 · {MAX_PREVIEW_SECONDS} 秒试听 · 云盘匹配
        </span>
      </div>

      <SourceImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
