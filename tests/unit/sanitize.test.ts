import { describe, expect, it } from 'vitest'
import { sanitizeForLog } from '../../src/main/sanitize'

describe('log sanitizer', () => {
  it('redacts credentials from structured values', () => {
    expect(
      sanitizeForLog({
        cookie: 'MUSIC_U=secret',
        nested: { 'X-NOS-Token': 'upload-token', md5: 'abc', keep: 'ok' }
      })
    ).toEqual({
      cookie: '[redacted]',
      nested: {
        'X-NOS-Token': '[redacted]',
        md5: '[redacted]',
        keep: 'ok'
      }
    })
  })

  it('keeps safe Axios failure context without request headers', () => {
    const error = Object.assign(new Error('upload failed'), {
      config: {
        url: 'https://upload.example/file',
        method: 'post',
        headers: { 'X-NOS-Token': 'secret' }
      },
      response: { status: 403, statusText: 'Forbidden' }
    })
    const sanitized = sanitizeForLog(error) as Record<string, any>
    expect(sanitized.request).toEqual({
      url: 'https://upload.example/file',
      method: 'post'
    })
    expect(sanitized.response).toEqual({ status: 403, statusText: 'Forbidden' })
    expect(JSON.stringify(sanitized)).not.toContain('secret')
  })

  it('redacts sensitive query and header text', () => {
    expect(
      sanitizeForLog('request failed cookie=MUSIC_U=abc; X-NOS-Token: upload-token')
    ).toBe('request failed cookie=[redacted]; X-NOS-Token: [redacted]')
  })
})
