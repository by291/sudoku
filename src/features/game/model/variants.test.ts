import { expect, it } from 'vitest'
import {
  parseVariantQuery,
  VARIANT_OPTIONS,
  getVariantPresentation,
} from '@/features/game/model/variants'

it('provides ordered Chinese labels and rule descriptions for all six variants', () => {
  expect(VARIANT_OPTIONS.map((option) => option.value)).toEqual([
    'classic',
    'diagonal',
    'jigsaw',
    'killer',
    'thermo',
    'arrow',
  ])
  expect(VARIANT_OPTIONS.map((option) => option.label)).toEqual([
    '标准数独',
    '对角数独',
    '不规则数独',
    '杀手数独',
    '温度计数独',
    '箭头数独',
  ])

  for (const option of VARIANT_OPTIONS) {
    expect(getVariantPresentation(option.value).label).toBe(option.label)
    expect(getVariantPresentation(option.value).ruleText).not.toBe('')
  }
})
it('rejects unknown variant queries and defaults absent ones to Classic', () => {
  expect(parseVariantQuery(undefined)).toEqual({ valid: true, value: 'classic' })
  expect(parseVariantQuery('unknown').valid).toBe(false)
  expect(parseVariantQuery(['arrow', 'killer']).valid).toBe(false)
  expect(parseVariantQuery(null).valid).toBe(false)
  expect(VARIANT_OPTIONS).toHaveLength(6)
})
