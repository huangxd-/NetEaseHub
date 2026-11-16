import { updateFile, type WriteOptions } from 'music-metadata'
import { extname } from 'node:path'
import type { EditableMetadata } from '@shared/types'
import { joinArtists } from '@shared/utils'
import { AppError } from '../errors'

type TagPatch = Parameters<typeof updateFile>[1]

export function buildTagPatch(
  metadata: EditableMetadata,
  extras: { cover?: { mime: string; data: Uint8Array }; lyrics?: string },
  extension = ''
): TagPatch {
  const patch: TagPatch = {
    title: metadata.title,
    artist: joinArtists(metadata.artists),
    artists: metadata.artists,
    album: metadata.album || null,
    albumartist: metadata.albumArtist || null
  }
  if (metadata.year) patch.date = metadata.year
  if (metadata.genre) patch.genre = metadata.genre
  if (metadata.trackNo || metadata.trackTotal) {
    patch.track = {
      ...(metadata.trackNo ? { no: metadata.trackNo } : {}),
      ...(metadata.trackTotal ? { of: metadata.trackTotal } : {})
    }
  }
  if (metadata.discNo || metadata.discTotal) {
    patch.disk = {
      ...(metadata.discNo ? { no: metadata.discNo } : {}),
      ...(metadata.discTotal ? { of: metadata.discTotal } : {})
    }
  }
  if (extras.lyrics) {
    patch.lyrics = extras.lyrics
    const ext = extension.replace(/^\./, '').toLowerCase()
    if (['mp3', 'aac', 'wav'].includes(ext)) {
      patch.native = {
        ...(patch.native ?? {}),
        'TXXX:LYRICS': extras.lyrics
      }
    } else if (['flac', 'ogg', 'opus'].includes(ext)) {
      patch.native = {
        ...(patch.native ?? {}),
        LYRICS: extras.lyrics
      }
    }
  }
  if (extras.cover) {
    patch.picture = [
      {
        format: extras.cover.mime,
        data: extras.cover.data,
        type: 'Cover (front)',
        description: ''
      }
    ]
  } else if (metadata.cover) {
    patch.picture = [
      {
        format: metadata.cover.mime,
        data: Buffer.from(metadata.cover.dataBase64, 'base64'),
        type: 'Cover (front)',
        description: ''
      }
    ]
  }
  return patch
}

export function buildTagWriteOptions(extension: string): WriteOptions {
  const ext = extension.replace(/^\./, '').toLowerCase()
  return {
    backup: false,
    atomic: true,
    ...(['mp3', 'aac', 'wav'].includes(ext) ? { replaceId3: true } : {})
  }
}

export async function writeTags(
  filePath: string,
  metadata: EditableMetadata,
  extras: { cover?: { mime: string; data: Uint8Array }; lyrics?: string }
): Promise<void> {
  const extension = extname(filePath)
  const patch = buildTagPatch(metadata, extras, extension)
  const options = buildTagWriteOptions(extension)
  try {
    await updateFile(filePath, patch, options)
  } catch (error) {
    throw new AppError(
      'TAG_WRITE_FAILED',
      error instanceof Error ? error.message : '写入音频标签失败'
    )
  }
}
