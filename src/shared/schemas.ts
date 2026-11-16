import { z } from 'zod'

export const providerSchema = z.enum(['kw', 'kg', 'tx', 'wy', 'mg'])
export const qualitySchema = z.enum(['128k', '320k', 'flac', 'flac24bit'])
export const qualityPreferenceSchema = z.union([qualitySchema, z.literal('auto')])

export const trackRefSchema = z.object({
  key: z.string().min(1),
  provider: providerSchema,
  native: z.record(z.string(), z.unknown()),
  title: z.string().min(1),
  artists: z.array(z.string()),
  album: z.string().optional(),
  albumId: z.string().optional(),
  durationSec: z.number().nonnegative().optional(),
  coverUrl: z.string().optional(),
  availableQualities: z.array(qualitySchema).optional()
})

export const editableMetadataSchema = z.object({
  title: z.string().min(1),
  artists: z.array(z.string()),
  album: z.string().optional(),
  albumArtist: z.string().optional(),
  trackNo: z.number().int().positive().optional(),
  trackTotal: z.number().int().positive().optional(),
  discNo: z.number().int().positive().optional(),
  discTotal: z.number().int().positive().optional(),
  year: z.string().optional(),
  genre: z.string().optional(),
  cover: z
    .object({
      mime: z.string(),
      dataBase64: z.string()
    })
    .optional(),
  lyrics: z.string().optional()
})

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(200),
  provider: z.union([providerSchema, z.literal('all')]),
  page: z.number().int().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(100).optional()
})

export const entitySearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(200),
  provider: z.union([providerSchema, z.literal('all')]),
  kind: z.enum(['album', 'playlist', 'artist']),
  page: z.number().int().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(100).optional()
})

export const artistTracksRequestSchema = z.object({
  provider: providerSchema,
  artistId: z.string().trim().min(1).max(200),
  page: z.number().int().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(100).optional()
})

export const catalogRequestSchema = z.object({
  value: z.string().trim().min(1).max(2000),
  provider: providerSchema.optional(),
  kind: z.enum(['album', 'playlist']).optional()
})

export const sourceImportSchema = z.object({
  mode: z.enum(['url', 'text', 'file']),
  value: z.string().min(1).max(2 * 1024 * 1024)
})

export const sourceToggleSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean()
})

export const sourceReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1)
})

export const enqueueUploadSchema = z.object({
  tracks: z.array(trackRefSchema).min(1).max(2000),
  requestedQuality: qualityPreferenceSchema.optional(),
  metadataOverrides: editableMetadataSchema.partial().optional(),
  writeCover: z.boolean().optional(),
  writeLyrics: z.boolean().optional(),
  allowDuplicate: z.boolean().optional()
})

export const uploadPatchSchema = z.object({
  requestedQuality: qualityPreferenceSchema.optional(),
  metadata: editableMetadataSchema.partial().optional(),
  writeCover: z.boolean().optional(),
  writeLyrics: z.boolean().optional(),
  allowDuplicate: z.boolean().optional()
})

export const cloudDeleteSchema = z.object({
  cloudIds: z.array(z.number().int().positive()).min(1).max(500)
})

export const cloudMatchSchema = z.object({
  cloudId: z.number().int().positive(),
  songId: z.number().int().nonnegative()
})

export const cloudSuggestSchema = z.object({
  songs: z
    .array(
      z.object({
        cloudId: z.number().int().positive(),
        matchedSongId: z.number().int().positive().optional(),
        fileName: z.string(),
        title: z.string(),
        artist: z.string(),
        album: z.string(),
        size: z.number().nonnegative(),
        durationSec: z.number().nonnegative(),
        md5: z.string().optional(),
        addedAt: z.number()
      })
    )
    .max(200)
})

export const settingsPatchSchema = z.object({
  defaultQuality: qualityPreferenceSchema.optional(),
  previewQuality: qualitySchema.optional(),
  writeCover: z.boolean().optional(),
  writeLyrics: z.boolean().optional(),
  autoMatchOnUpload: z.boolean().optional(),
  lrclibEnabled: z.boolean().optional(),
  customLyricsApiUrl: z.string().trim().max(2048).optional(),
  customCoverApiUrl: z.string().trim().max(2048).optional(),
  autoSkipDuplicate: z.boolean().optional(),
  downloadConcurrency: z.number().int().min(1).max(3).optional(),
  uploadConcurrency: z.literal(1).optional(),
  keepDownloadedFiles: z.boolean().optional(),
  tempDirectory: z.string().optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
  disclaimerAccepted: z.boolean().optional()
})

export const previewCreateSchema = z.object({
  track: trackRefSchema
})
