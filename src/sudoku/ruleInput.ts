import type { RulesDto } from '@sudoku/wasm'
import type { PuzzleRules } from '@/sudoku/contracts'

/** Copy borrowed layout data into the generated transport shape; no rule computation belongs here. */
export function copyRules(rules: PuzzleRules): RulesDto {
  switch (rules.kind) {
    case 'classic':
      return { kind: 'classic' }
    case 'diagonal':
      return { kind: 'diagonal' }
    case 'jigsaw':
      return { kind: 'jigsaw', regions: rules.regions.map((cells) => [...cells]) }
    case 'killer':
      return {
        kind: 'killer',
        cages: rules.cages.map((cage) => ({ cells: [...cage.cells], sum: cage.sum })),
      }
    case 'thermo':
      return { kind: 'thermo', paths: rules.paths.map((cells) => [...cells]) }
    case 'arrow':
      return {
        kind: 'arrow',
        arrows: rules.arrows.map((arrow) => ({ circle: arrow.circle, shaft: [...arrow.shaft] })),
      }
  }
}
