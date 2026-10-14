import { expect, it } from 'vitest'
import { RATING_POLICIES, RATING_VERSION, TECHNIQUE_TIERS } from '@/core/sudoku/ratingPolicies'
import { SUDOKU_VARIANTS } from '@/core/sudoku/rules'

it('covers all six types with nested applicable policies', () => {
  expect(RATING_VERSION).toBe('sudoku-rating-v2')
  expect(Object.keys(RATING_POLICIES)).toEqual([...SUDOKU_VARIANTS])

  for (const variant of SUDOKU_VARIANTS) {
    const policy = RATING_POLICIES[variant]

    expect(policy.medium.slice(0, policy.easy.length)).toEqual(policy.easy)
    expect(policy.hard.slice(0, policy.medium.length)).toEqual(policy.medium)
    expect(new Set(policy.hard).size).toBe(policy.hard.length)
    expect(policy.hard.filter((technique) => technique.startsWith('cage-')).length).toBe(
      variant === 'killer' ? 3 : 0,
    )
    expect(policy.hard.includes('thermo-bound')).toBe(variant === 'thermo')
    expect(policy.hard.filter((technique) => technique.startsWith('arrow-')).length).toBe(
      variant === 'arrow' ? 2 : 0,
    )
  }
})

it('preserves the explicit technique order', () => {
  const singles = ['naked-single', 'hidden-single']
  const pairs = ['naked-pair', 'hidden-pair']

  for (const variant of ['classic', 'diagonal', 'jigsaw'] as const) {
    expect(RATING_POLICIES[variant]).toMatchObject({
      easy: singles,
      medium: [...singles, 'locked-candidate'],
      hard: [...singles, 'locked-candidate', ...pairs],
    })
  }

  expect(RATING_POLICIES.killer.hard).toEqual([
    ...singles,
    'cage-distinct',
    'cage-remainder',
    'locked-candidate',
    'cage-combination',
    ...pairs,
  ])
  expect(RATING_POLICIES.thermo.hard).toEqual([
    ...singles,
    'thermo-bound',
    'locked-candidate',
    ...pairs,
  ])
  expect(RATING_POLICIES.arrow.hard).toEqual([
    ...singles,
    'arrow-equation',
    'locked-candidate',
    'arrow-combination',
    ...pairs,
  ])
  expect(TECHNIQUE_TIERS['cage-remainder']).toBe('easy')
  expect(TECHNIQUE_TIERS['arrow-combination']).toBe('medium')
  expect(TECHNIQUE_TIERS['hidden-pair']).toBe('hard')
  expect(RATING_POLICIES.classic.expert.slice(0, 5)).toEqual(RATING_POLICIES.classic.hard)
  expect(RATING_POLICIES.classic.expert.slice(5)).toEqual([
    'naked-triple',
    'hidden-triple',
    'x-wing',
    'swordfish',
    'xy-wing',
    'simple-coloring',
  ])
  for (const variant of ['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow'] as const) {
    expect(RATING_POLICIES[variant].expert).toEqual(RATING_POLICIES[variant].hard)
  }
})
