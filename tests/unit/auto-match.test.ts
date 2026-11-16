import { describe, expect, it } from 'vitest'
import { selectAutoMatchCandidate } from '../../src/main/services/auto-match'

const input = {
  title: '晃悠青年',
  artist: '张弛',
  durationSec: 224
}

describe('auto match candidate selection', () => {
  it('accepts an exact title, artist and duration match', () => {
    const selected = selectAutoMatchCandidate(input, [
      {
        songId: 1001,
        title: '晃悠青年',
        artist: '张弛',
        durationSec: 224
      }
    ])
    expect(selected?.songId).toBe(1001)
    expect(selected?.score).toBeGreaterThan(0.99)
  })

  it('rejects a different title', () => {
    expect(
      selectAutoMatchCandidate(input, [
        { songId: 1002, title: '小城', artist: '张弛', durationSec: 224 }
      ])
    ).toBeUndefined()
  })

  it('rejects a different artist', () => {
    expect(
      selectAutoMatchCandidate(input, [
        { songId: 1003, title: '晃悠青年', artist: '李佩玲', durationSec: 224 }
      ])
    ).toBeUndefined()
  })

  it('rejects a duration difference above five seconds', () => {
    expect(
      selectAutoMatchCandidate(input, [
        { songId: 1004, title: '晃悠青年', artist: '张弛', durationSec: 240 }
      ])
    ).toBeUndefined()
  })

  it('does not bind when the top candidates are too close', () => {
    expect(
      selectAutoMatchCandidate(input, [
        { songId: 1005, title: '晃悠青年', artist: '张弛', durationSec: 224 },
        { songId: 1006, title: '晃悠青年', artist: '张弛', durationSec: 225 }
      ])
    ).toBeUndefined()
  })

  it('returns undefined when there are no candidates', () => {
    expect(selectAutoMatchCandidate(input, [])).toBeUndefined()
  })
})
