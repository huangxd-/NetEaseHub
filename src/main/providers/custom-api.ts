import type { TrackRef } from '@shared/types'
import { joinArtists } from '@shared/utils'

const PLACEHOLDER = /\{(title|artist|artists|album|duration|provider|songId)\}/g

function nativeSongId(track: TrackRef): string {
  const value =
    track.native.songId ??
    track.native.songmid ??
    track.native.hash ??
    track.native.copyrightId ??
    track.native.audioId ??
    track.native.id
  return value == null ? '' : String(value)
}

function valuesFor(track: TrackRef): Record<string, string> {
  return {
    title: track.title,
    artist: track.artists[0] ?? '',
    artists: joinArtists(track.artists),
    album: track.album ?? '',
    duration:
      track.durationSec && track.durationSec > 0
        ? String(Math.round(track.durationSec))
        : '',
    provider: track.provider,
    songId: nativeSongId(track)
  }
}

export function buildCustomApiUrl(
  template: string | undefined,
  track: TrackRef
): string | undefined {
  const source = template?.trim()
  if (!source) return undefined
  const values = valuesFor(track)

  try {
    if (PLACEHOLDER.test(source)) {
      PLACEHOLDER.lastIndex = 0
      const replaced = source.replace(
        PLACEHOLDER,
        (_match, key: string) => encodeURIComponent(values[key] ?? '')
      )
      const url = new URL(replaced)
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
    }

    const url = new URL(source)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    for (const [key, value] of Object.entries(values)) {
      url.searchParams.set(key, value)
    }
    return url.toString()
  } catch {
    return undefined
  } finally {
    PLACEHOLDER.lastIndex = 0
  }
}
