import { expect, it } from 'vitest'
import { isTechnique } from '@/core/sudoku/logic/techniques'

it.each([
  'naked-single',
  'hidden-single',
  'locked-candidate',
  'naked-pair',
  'hidden-pair',
  'naked-triple',
  'hidden-triple',
  'x-wing',
  'swordfish',
  'xy-wing',
  'simple-coloring',
  'cage-distinct',
  'cage-remainder',
  'cage-combination',
  'thermo-bound',
  'arrow-equation',
  'arrow-combination',
])('recognizes the supported technique %s', (value) => {
  expect(isTechnique(value)).toBe(true)
})

it.each([
  null,
  undefined,
  0,
  {},
  [],
  '',
  'constructor',
  'toString',
  '__proto__',
  'unknown-technique',
])('rejects an untrusted technique identifier: %j', (value) => {
  expect(isTechnique(value)).toBe(false)
})
