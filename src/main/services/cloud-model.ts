import type { CloudSong } from '@shared/types'

export function cloudSongFromRaw(item: Record<string, any>): CloudSong | null {
  const simple = item.simpleSong ?? {}
  const privateCloud = item.privateCloud ?? {}
  const cloudId = Number(
    privateCloud.songId ??
      privateCloud.id ??
      item.id ??
      item.pcId ??
      0
  )
  if (!cloudId) return null
  return {
    cloudId,
    matchedSongId:
      Number(simple.id ?? item.matchSongId ?? 0) || undefined,
    fileName: String(item.fileName ?? simple.name ?? ''),
    title: String(simple.name ?? item.songName ?? item.fileName ?? '未知歌曲'),
    artist: String(
      simple.ar?.[0]?.name ??
        simple.artists?.[0]?.name ??
        item.artist ??
        '未知歌手'
    ),
    album: String(simple.al?.name ?? item.album ?? ''),
    size: Number(item.fileSize ?? 0),
    durationSec: Math.round(Number(simple.dt ?? 0) / 1000),
    md5: item.md5 ? String(item.md5) : undefined,
    addedAt: Number(item.addTime ?? 0)
  }
}
