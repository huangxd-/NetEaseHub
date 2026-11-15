import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { Music2, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PreviewLease, TrackRef } from '@shared/types'
import { MAX_PREVIEW_SECONDS, PROVIDERS } from '@shared/constants'
import { clampPreviewPosition } from '@shared/utils'
import { errorMessage, unwrap } from '../lib/api'
import { Badge, IconButton } from './ui'

interface PreviewContextValue {
  currentTrack: TrackRef | null
  isPlaying: boolean
  isLoading: boolean
  playTrack: (track: TrackRef) => Promise<void>
  toggle: () => void
  stop: () => void
}

const PreviewContext = createContext<PreviewContextValue | null>(null)

export function usePreview(): PreviewContextValue {
  const value = useContext(PreviewContext)
  if (!value) throw new Error('usePreview must be used inside PreviewProvider')
  return value
}

function providerName(track: TrackRef): string {
  return PROVIDERS.find(item => item.id === track.provider)?.shortName ?? track.provider
}

export function PreviewProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const leaseRef = useRef<PreviewLease | null>(null)
  const requestRef = useRef(0)
  const [currentTrack, setCurrentTrack] = useState<TrackRef | null>(null)
  const [lease, setLease] = useState<PreviewLease | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [position, setPosition] = useState(0)
  const [muted, setMuted] = useState(false)

  const releaseLease = useCallback((id?: string) => {
    if (!id) return
    void window.neteasehub.preview.release(id).catch(() => undefined)
  }, [])

  const stop = useCallback(() => {
    requestRef.current++
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      audio.removeAttribute('src')
      audio.load()
    }
    if (leaseRef.current) releaseLease(leaseRef.current.id)
    leaseRef.current = null
    setLease(null)
    setCurrentTrack(null)
    setIsPlaying(false)
    setIsLoading(false)
    setPosition(0)
  }, [releaseLease])

  const playTrack = useCallback(
    async (track: TrackRef) => {
      if (currentTrack?.key === track.key && leaseRef.current) {
        if (audioRef.current) {
          if (audioRef.current.paused) {
            await audioRef.current.play().catch(() => undefined)
          } else {
            audioRef.current.pause()
          }
        }
        return
      }
      const requestId = ++requestRef.current
      const previous = leaseRef.current
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      }
      if (previous) releaseLease(previous.id)
      leaseRef.current = null
      setLease(null)
      setCurrentTrack(track)
      setIsLoading(true)
      setPosition(0)
      try {
        const nextLease = await unwrap(window.neteasehub.preview.create({ track }))
        if (requestRef.current !== requestId) {
          releaseLease(nextLease.id)
          return
        }
        leaseRef.current = nextLease
        setLease(nextLease)
      } catch (error) {
        if (requestRef.current === requestId) {
          setCurrentTrack(null)
          toast.error(errorMessage(error))
        }
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    },
    [currentTrack?.key, releaseLease]
  )

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !leaseRef.current) return
    if (audio.paused) void audio.play().catch(() => undefined)
    else audio.pause()
  }, [])

  useEffect(() => {
    const dispose = window.neteasehub.preview.onExpired(({ id }) => {
      if (leaseRef.current?.id !== id) return
      toast.info('试听租约已过期，请重新试听')
      stop()
    })
    return dispose
  }, [stop])

  useEffect(() => () => {
    if (leaseRef.current) releaseLease(leaseRef.current.id)
  }, [releaseLease])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !lease) return
    audio.src = lease.streamUrl
    audio.currentTime = 0
    audio.volume = muted ? 0 : 0.82
    void audio.play().catch(error => {
      if (error?.name !== 'AbortError') toast.error('试听连接失败，请重试')
      setIsPlaying(false)
    })
  }, [lease, muted])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : 0.82
  }, [muted])

  useEffect(() => {
    if (!isPlaying) return
    const timer = window.setInterval(() => {
      const audio = audioRef.current
      if (!audio) return
      if (audio.currentTime >= MAX_PREVIEW_SECONDS) {
        audio.pause()
        audio.currentTime = 0
        setPosition(0)
        setIsPlaying(false)
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [isPlaying])

  const value = useMemo(
    () => ({
      currentTrack,
      isPlaying,
      isLoading,
      playTrack,
      toggle,
      stop
    }),
    [currentTrack, isLoading, isPlaying, playTrack, stop, toggle]
  )

  const onTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.currentTime >= MAX_PREVIEW_SECONDS) {
      audio.pause()
      audio.currentTime = 0
      setPosition(0)
      setIsPlaying(false)
      return
    }
    setPosition(audio.currentTime)
  }

  return (
    <PreviewContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onSeeking={() => {
          const audio = audioRef.current
          if (!audio || audio.currentTime <= MAX_PREVIEW_SECONDS) return
          audio.pause()
          audio.currentTime = 0
          setPosition(0)
          setIsPlaying(false)
        }}
        onError={() => {
          const audio = audioRef.current
          if (!audio?.src) return
          toast.error('试听加载失败，请重新选择音源或稍后重试')
          audio.pause()
          setIsPlaying(false)
          setIsLoading(false)
        }}
        onEnded={() => {
          setPosition(0)
          setIsPlaying(false)
        }}
      />
      {currentTrack ? (
        <div className="fixed bottom-0 left-[var(--sidebar-width)] right-0 z-40 border-t border-[var(--border)] bg-[#0d0d10]/96 px-6 py-3 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-[1180px] items-center gap-4">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10">
              {currentTrack.coverUrl ? (
                <img
                  src={currentTrack.coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="cover-fallback h-full w-full">
                  <Music2 size={18} />
                </div>
              )}
            </div>
            <div className="w-[220px] min-w-0">
              <div className="truncate text-[13px] font-medium">{currentTrack.title}</div>
              <div className="mt-0.5 flex items-center gap-2 truncate text-[11px] text-[var(--text-muted)]">
                <span className="truncate">{currentTrack.artists.join('、')}</span>
                <Badge tone="accent" className="shrink-0">
                  {providerName(currentTrack)}
                </Badge>
              </div>
            </div>
            <IconButton
              className="h-10 w-10 rounded-full bg-white text-black hover:bg-white/90 hover:text-black"
              onClick={toggle}
              disabled={isLoading}
              aria-label={isPlaying ? '暂停' : '播放'}
            >
              {isLoading ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              ) : isPlaying ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" className="translate-x-[1px]" />
              )}
            </IconButton>
            <IconButton
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.currentTime = 0
                  setPosition(0)
                  void audioRef.current.play().catch(() => undefined)
                }
              }}
              aria-label="重新播放"
            >
              <RotateCcw size={15} />
            </IconButton>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="mono w-9 text-right text-[10px] text-[var(--text-muted)]">
                {Math.floor(position)}s
              </span>
              <input
                className="range-track flex-1"
                type="range"
                min={0}
                max={MAX_PREVIEW_SECONDS}
                step={0.1}
                value={Math.min(MAX_PREVIEW_SECONDS, position)}
                onChange={event => {
                  const next = clampPreviewPosition(Number(event.target.value))
                  if (audioRef.current) audioRef.current.currentTime = next
                  setPosition(next)
                }}
              />
              <span className="mono w-9 text-[10px] text-[var(--text-dim)]">
                {MAX_PREVIEW_SECONDS}s
              </span>
            </div>
            <Badge tone="default">仅试听前 30 秒</Badge>
            <IconButton onClick={() => setMuted(value => !value)} aria-label="静音">
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </IconButton>
            <IconButton onClick={stop} aria-label="关闭试听">
              <X size={15} />
            </IconButton>
          </div>
        </div>
      ) : null}
    </PreviewContext.Provider>
  )
}
