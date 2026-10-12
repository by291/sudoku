import { expect, it } from 'vitest'
import { parseVariantQuery, VARIANT_OPTIONS } from '@/features/game/model/variants'
it('rejects unknown variant queries and defaults absent ones to Classic', () => {
  expect(parseVariantQuery(undefined)).toEqual({ valid: true, value: 'classic' })
  expect(parseVariantQuery('unknown').valid).toBe(false)
  expect(parseVariantQuery(['arrow', 'killer']).valid).toBe(false)
  expect(parseVariantQuery(null).valid).toBe(false)
  expect(VARIANT_OPTIONS).toHaveLength(6)
})
