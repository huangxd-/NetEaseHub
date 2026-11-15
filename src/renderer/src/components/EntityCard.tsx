import { ChevronRight, Disc3, ListMusic, LoaderCircle, UserRound } from 'lucide-react'
import type { SearchEntityRef } from '@shared/types'
import { Badge, cn } from './ui'

interface EntityCardProps {
  entity: SearchEntityRef
  opening?: boolean
  onOpen: (entity: SearchEntityRef) => void
}

function EntityIcon({ kind }: { kind: SearchEntityRef['kind'] }) {
  if (kind === 'album') return <Disc3 size={24} />
  if (kind === 'playlist') return <ListMusic size={24} />
  return <UserRound size={24} />
}

function entityAction(entity: SearchEntityRef): string {
  return entity.kind === 'artist' ? '查看歌曲' : '查看曲目'
}

export function EntityCard({ entity, opening, onOpen }: EntityCardProps) {
  const detail = [
    entity.author,
    entity.subtitle,
    entity.trackCount ? `${entity.trackCount} 首` : undefined,
    entity.songCount ? `${entity.songCount} 首歌曲` : undefined,
    entity.albumCount ? `${entity.albumCount} 张专辑` : undefined
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      className={cn(
        'no-drag group flex min-h-[88px] w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/[.018] p-3 text-left transition hover:border-white/[.14] hover:bg-white/[.04]',
        opening && 'cursor-wait opacity-80'
      )}
      onClick={() => onOpen(entity)}
      disabled={opening}
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10">
        {entity.coverUrl ? (
          <img
            src={entity.coverUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="cover-fallback h-full w-full">
            <EntityIcon kind={entity.kind} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{entity.name}</span>
          <Badge tone="default" className="shrink-0">
            {entity.kind === 'album' ? '专辑' : entity.kind === 'playlist' ? '歌单' : '歌手'}
          </Badge>
        </div>
        <div className="mt-1 truncate text-[10px] text-[var(--text-dim)]">
          {detail || (entity.kind === 'artist' ? '查看该歌手的精确曲目' : '查看完整曲目')}
        </div>
      </div>

      <span className="flex shrink-0 items-center gap-1 text-[10px] text-rose-200/75 transition group-hover:text-rose-200">
        {opening ? (
          <LoaderCircle size={13} className="spinner" />
        ) : (
          <>
            {entityAction(entity)}
            <ChevronRight size={13} />
          </>
        )}
      </span>
    </button>
  )
}
