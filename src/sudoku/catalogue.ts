import type {
  BasicClassicTechnique,
  AdvancedTechnique,
  ClassicTechnique,
  AdvancedEvidence,
  Technique,
  RuleEvidence,
  LogicalStep,
} from '@/sudoku/contracts'
import type { PuzzleRules, SudokuVariant } from '@/sudoku/contracts'
import type { Difficulty } from '@/sudoku/contracts'

const standard: readonly Difficulty[] = [
  // Preserve ascending policy order when appending Classic's expert tier.
  'easy',
  'medium',
  'hard',
]

export const DIFFICULTY_CAPABILITIES = {
  classic: [...standard, 'expert'],
  diagonal: standard,
  jigsaw: standard,
  killer: standard,
  thermo: standard,
  arrow: standard,
} satisfies Record<SudokuVariant, readonly Difficulty[]>

/** List the supported generation and rating tiers in ascending order. */
export function supportedDifficulties(variant: SudokuVariant): readonly Difficulty[] {
  return DIFFICULTY_CAPABILITIES[variant]
}

/** Check whether a tier can be requested for a variant. */
export function supportsDifficulty(variant: SudokuVariant, difficulty: Difficulty): boolean {
  return supportedDifficulties(variant).includes(difficulty)
}

export const CLASSIC_RULES = Object.freeze({ kind: 'classic' as const }) satisfies PuzzleRules

export const SUDOKU_VARIANTS = [
  'classic',
  'diagonal',
  'jigsaw',
  'killer',
  'thermo',
  'arrow',
] as const satisfies readonly SudokuVariant[]

/** Recognize the stable engine identifier of a variant. */
export function isSudokuVariant(value: unknown): value is SudokuVariant {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTY_CAPABILITIES, value)
}

export const TECHNIQUES: readonly BasicClassicTechnique[] = [
  'naked-single',
  'hidden-single',
  'locked-candidate',
  'naked-pair',
  'hidden-pair',
]

export const ADVANCED_TECHNIQUES: readonly AdvancedTechnique[] = [
  'naked-triple',
  'hidden-triple',
  'x-wing',
  'swordfish',
  'xy-wing',
  'simple-coloring',
]

export const ALL_CLASSIC_TECHNIQUES: readonly ClassicTechnique[] = [
  ...TECHNIQUES,
  ...ADVANCED_TECHNIQUES,
]

/** Identify techniques that use Classic units and candidates. */
export function isClassicTechnique(value: Technique): value is ClassicTechnique {
  return ALL_CLASSIC_TECHNIQUES.some((technique) => technique === value)
}

/** Identify Classic techniques reserved for the expert tier. */
export function isAdvancedTechnique(value: Technique): value is AdvancedTechnique {
  return ADVANCED_TECHNIQUES.some((technique) => technique === value)
}

/** Narrow evidence to the shapes produced by advanced patterns. */
export function isAdvancedEvidence(
  evidence: LogicalStep['evidence'],
): evidence is AdvancedEvidence {
  return (
    evidence.kind === 'subset' ||
    evidence.kind === 'fish' ||
    evidence.kind === 'wing' ||
    evidence.kind === 'coloring'
  )
}

/** Check whether a deduction technique belongs to this clue family. */
export function matchesRuleTechnique(technique: Technique, kind: RuleEvidence['kind']): boolean {
  switch (kind) {
    case 'cage':
      return technique.startsWith('cage-')
    case 'thermo':
      return technique === 'thermo-bound'
    case 'arrow':
      return technique.startsWith('arrow-')
  }
}

export const TECHNIQUE_ACTIONS = {
  'naked-single': 'placement',
  'hidden-single': 'placement',
  'locked-candidate': 'elimination',
  'naked-pair': 'elimination',
  'hidden-pair': 'elimination',
  'naked-triple': 'elimination',
  'hidden-triple': 'elimination',
  'x-wing': 'elimination',
  swordfish: 'elimination',
  'xy-wing': 'elimination',
  'simple-coloring': 'elimination',
  'cage-distinct': 'either',
  'cage-remainder': 'placement',
  'cage-combination': 'either',
  'thermo-bound': 'either',
  'arrow-equation': 'placement',
  'arrow-combination': 'either',
} as const satisfies Record<Technique, 'placement' | 'elimination' | 'either'>

/** Recognizes stable engine IDs without relying on translated display labels. */
export function isTechnique(value: unknown): value is Technique {
  return typeof value === 'string' && Object.hasOwn(TECHNIQUE_ACTIONS, value)
}
