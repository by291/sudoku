import { describe, expect, it } from 'vitest'
import { VARIANT_FIXTURES } from '../../../tests/fixtures/variants'
import { SUDOKU_VARIANTS, compileRules } from '@/core/sudoku/rules'
import { VARIANT_RULE_DEFINITIONS } from '@/core/sudoku/variantRegistry'

describe('variant rule definitions', () => {
  it('covers every supported variant with its own decoded kind', () => {
    expect(Object.keys(VARIANT_RULE_DEFINITIONS)).toEqual([...SUDOKU_VARIANTS])

    for (const kind of SUDOKU_VARIANTS) {
      const rules = kind === 'classic' ? { kind } : VARIANT_FIXTURES[kind].rules
      const result = VARIANT_RULE_DEFINITIONS[kind].parse(rules)

      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.value.kind).toBe(kind)
      }
    }
  })

  it('rejects a payload whose kind does not match its definition', () => {
    for (const kind of SUDOKU_VARIANTS) {
      expect(VARIANT_RULE_DEFINITIONS[kind].parse({ kind: 'unsupported' }).valid).toBe(false)
      const other = kind === 'classic' ? 'diagonal' : 'classic'

      expect(VARIANT_RULE_DEFINITIONS[kind].parse({ kind: other }).valid).toBe(false)
    }
  })

  it('does not mutate rules while compiling', () => {
    for (const kind of SUDOKU_VARIANTS) {
      const rules = kind === 'classic' ? { kind } : VARIANT_FIXTURES[kind].rules
      const before = JSON.stringify(rules)

      compileRules(rules)

      expect(JSON.stringify(rules)).toBe(before)
    }
  })
})
