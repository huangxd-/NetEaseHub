import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { UploadDraft } from '@shared/types'
import { JOB_RETENTION_DAYS } from '@shared/constants'

interface UploadRow {
  payload: string
}

export class DatabaseService {
  private readonly db: DatabaseSync

  constructor(directory = app.getPath('userData')) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(join(directory, 'neteasehub.db'))
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_uploads_batch ON uploads(batch_id);
      CREATE INDEX IF NOT EXISTS idx_uploads_updated ON uploads(updated_at);
    `)
    this.cleanup()
  }

  saveUpload(draft: UploadDraft): void {
    const statement = this.db.prepare(`
      INSERT INTO uploads (id, batch_id, stage, created_at, updated_at, payload)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        batch_id = excluded.batch_id,
        stage = excluded.stage,
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `)
    statement.run(
      draft.id,
      draft.batchId,
      draft.stage,
      draft.createdAt,
      draft.updatedAt,
      JSON.stringify(draft)
    )
  }

  getUpload(id: string): UploadDraft | undefined {
    const row = this.db.prepare('SELECT payload FROM uploads WHERE id = ?').get(id) as
      | UploadRow
      | undefined
    return row ? (JSON.parse(row.payload) as UploadDraft) : undefined
  }

  listUploads(): UploadDraft[] {
    const rows = this.db
      .prepare('SELECT payload FROM uploads ORDER BY created_at ASC')
      .all() as unknown as UploadRow[]
    return rows.map(row => JSON.parse(row.payload) as UploadDraft)
  }

  deleteUpload(id: string): void {
    this.db.prepare('DELETE FROM uploads WHERE id = ?').run(id)
  }

  clearFinished(): void {
    this.db
      .prepare("DELETE FROM uploads WHERE stage IN ('completed', 'failed', 'cancelled', 'skipped')")
      .run()
  }

  cleanup(): void {
    const cutoff = Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000
    this.db
      .prepare("DELETE FROM uploads WHERE updated_at < ? AND stage IN ('completed', 'cancelled', 'skipped')")
      .run(cutoff)
  }

  close(): void {
    this.db.close()
  }
}
