import type { VariantGenerationStrategy } from '@/core/sudoku/generation/types'
import type { RulesFor } from '@/core/sudoku/rules/types'
import { consumeWork } from '@/core/sudoku/budget'
import { JIGSAW_RULE_DEFINITION, irregularRegions } from '@/core/sudoku/rules/definitions/jigsaw'

export const JIGSAW_GENERATION_STRATEGY: VariantGenerationStrategy<'jigsaw'> = {
  allowsDigitMap: true,
  allowsComplement: true,

  createGeometry(rules, solution, random, budget) {
    let regions = rules.regions.map((region) => [...region])

    for (let attempt = 0; attempt < 20; attempt++) {
      if (!consumeWork(budget)) {
        return null
      }

      const first = Math.floor(random() * 81)
      const second = Math.floor(random() * 81)
      if (first === second || solution[first] !== solution[second]) {
        continue
      }

      const firstRegion = regions.findIndex((region) => region.includes(first))
      const secondRegion = regions.findIndex((region) => region.includes(second))
      if (firstRegion === secondRegion) {
        continue
      }

      const candidate = regions.map((region, index) => {
        if (index === firstRegion) {
          return region.map((cell) => (cell === first ? second : cell))
        }

        if (index === secondRegion) {
          return region.map((cell) => (cell === second ? first : cell))
        }

        return [...region]
      })
      const proposed: RulesFor<'jigsaw'> = { kind: 'jigsaw', regions: candidate }
      if (JIGSAW_RULE_DEFINITION.parse(proposed).valid && irregularRegions(proposed)) {
        regions = candidate
      }
    }

    return { kind: 'jigsaw', regions }
  },

  transformRules(rules, cellMap) {
    return { kind: 'jigsaw', regions: rules.regions.map((region) => region.map(cellMap)) }
  },
}
