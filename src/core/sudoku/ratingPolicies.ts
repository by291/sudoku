import type { SudokuVariant } from '@/core/sudoku/rules'
import { TECHNIQUES } from '@/core/sudoku/techniques'
import type { Technique } from '@/core/sudoku/techniques'
import type { Difficulty } from '@/core/sudoku/types'

export const RATING_VERSION = 'sudoku-rating-v1'
export type RatingVersion = typeof RATING_VERSION

type TierPolicies = Readonly<Record<Difficulty, readonly Technique[]>>

const easy: readonly Technique[] = [
  'naked-single',
  'hidden-single',
  'cage-distinct',
  'cage-remainder',
  'thermo-bound',
  'arrow-equation',
]
const medium: readonly Technique[] = [
  ...easy,
  'locked-candidate',
  'cage-combination',
  'arrow-combination',
]

const ORDERED_POLICIES: TierPolicies = {
  easy,
  medium,
  hard: [...medium, 'naked-pair', 'hidden-pair'],
}

function applicablePolicies(techniques: readonly Technique[]): TierPolicies {
  return {
    easy: ORDERED_POLICIES.easy.filter((technique) => techniques.includes(technique)),
    medium: ORDERED_POLICIES.medium.filter((technique) => techniques.includes(technique)),
    hard: ORDERED_POLICIES.hard.filter((technique) => techniques.includes(technique)),
  }
}

export const RATING_POLICIES = {
  classic: applicablePolicies(TECHNIQUES),
  diagonal: applicablePolicies(TECHNIQUES),
  jigsaw: applicablePolicies(TECHNIQUES),
  killer: applicablePolicies([
    ...TECHNIQUES,
    'cage-distinct',
    'cage-remainder',
    'cage-combination',
  ]),
  thermo: applicablePolicies([...TECHNIQUES, 'thermo-bound']),
  arrow: applicablePolicies([...TECHNIQUES, 'arrow-equation', 'arrow-combination']),
} satisfies Record<SudokuVariant, TierPolicies>

export const TECHNIQUE_TIERS = {
  'naked-single': 'easy',
  'hidden-single': 'easy',
  'locked-candidate': 'medium',
  'naked-pair': 'hard',
  'hidden-pair': 'hard',
  'cage-distinct': 'easy',
  'cage-remainder': 'easy',
  'cage-combination': 'medium',
  'thermo-bound': 'easy',
  'arrow-equation': 'easy',
  'arrow-combination': 'medium',
} satisfies Record<Technique, Difficulty>
