import { describe, expect, it } from 'vitest'
import { deleteCloudIds } from '../../src/main/services/cloud-delete'

describe('cloud delete helper', () => {
  it('deletes each valid id and returns the aggregated result', async () => {
    const calls: number[] = []
    const result = await deleteCloudIds([1, 2, 3], async id => {
      calls.push(id)
      return { body: { code: 200, failIds: [] } }
    })
    expect(calls.sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect(result).toEqual({ deleted: [1, 2, 3], failed: [] })
  })

  it('deduplicates valid ids and ignores invalid ids', async () => {
    const calls: number[] = []
    const result = await deleteCloudIds([1, 1, 0, -2, 1.5], async id => {
      calls.push(id)
      return { body: { code: 200, failIds: [] } }
    })
    expect(calls).toEqual([1])
    expect(result).toEqual({ deleted: [1], failed: [] })
  })

  it('keeps response failures separate from successful deletes', async () => {
    const result = await deleteCloudIds([11, 12, 13], async id => {
      if (id === 12) return { body: { code: 404, failIds: [12] } }
      return { body: { code: 200, failIds: [] } }
    })
    expect(result).toEqual({ deleted: [11, 13], failed: [12] })
  })

  it('limits concurrent requests to three', async () => {
    let active = 0
    let peak = 0
    const result = await deleteCloudIds(
      [1, 2, 3, 4, 5, 6],
      async _id => {
        active++
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active--
        return { body: { code: 200, failIds: [] } }
      },
      3
    )
    expect(peak).toBeLessThanOrEqual(3)
    expect(result.deleted).toHaveLength(6)
  })

  it('throws the first request error when every delete fails', async () => {
    await expect(
      deleteCloudIds([1, 2], async () => {
        throw new Error('network unavailable')
      })
    ).rejects.toThrow('network unavailable')
  })

  it('returns failed ids when only some requests throw', async () => {
    const result = await deleteCloudIds([1, 2], async id => {
      if (id === 2) throw new Error('network unavailable')
      return { body: { code: 200, failIds: [] } }
    })
    expect(result).toEqual({ deleted: [1], failed: [2] })
  })
})
