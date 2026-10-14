import { expect, it } from 'vitest'
import { structureIssues } from './support/variantStructure'
import { geometrySignature } from './support/geometryDiversity'
import { VARIANT_FIXTURES } from './fixtures/variants'
import { solvedBoard } from './fixtures/sudoku'

it('independently accepts authored terminals and rejects malformed geometry or totals', () => {
  for (const fixture of Object.values(VARIANT_FIXTURES)) {
    expect(structureIssues(fixture.solution, fixture.rules)).toEqual([])
  }
  expect(structureIssues(solvedBoard, { kind: 'diagonal' })).toContain('Invalid diagonals')
  expect(
    structureIssues(solvedBoard, {
      kind: 'jigsaw',
      regions: Array.from({ length: 9 }, (_, region) =>
        Array.from(
          { length: 9 },
          (_, cell) =>
            Math.floor(region / 3) * 27 + (region % 3) * 3 + Math.floor(cell / 3) * 9 + (cell % 3),
        ),
      ),
    }),
  ).toContain('Jigsaw geometry is regular boxes')
  expect(
    structureIssues(solvedBoard, { kind: 'killer', cages: [{ cells: [0, 1], sum: 1 }] }),
  ).toContain('Invalid cage digits or total')
  expect(structureIssues(solvedBoard, { kind: 'thermo', paths: [[0, 80]] })).toContain(
    'Invalid increasing path',
  )
  expect(
    structureIssues(solvedBoard, { kind: 'arrow', arrows: [{ circle: 0, shaft: [1, 2] }] }),
  ).toContain('Invalid arrow geometry or sum')
})

it('canonicalizes legal spatial changes and clue ordering without counting arithmetic totals', () => {
  const rotate = (cell: number) => (cell % 9) * 9 + 8 - Math.floor(cell / 9)
  const rules = VARIANT_FIXTURES.killer.rules
  if (rules.kind !== 'killer') {
    throw new Error('Expected cages')
  }
  expect(
    geometrySignature({
      kind: 'killer',
      cages: [...rules.cages].reverse().map((cage) => ({
        cells: [...cage.cells].reverse().map(rotate),
        sum: cage.cells.length * 10 - cage.sum,
      })),
    }),
  ).toBe(geometrySignature(rules))
  const thermo = VARIANT_FIXTURES.thermo.rules
  if (thermo.kind !== 'thermo') {
    throw new Error('Expected paths')
  }
  expect(
    geometrySignature({
      kind: 'thermo',
      paths: thermo.paths.map((path) => [...path].reverse().map(rotate)),
    }),
  ).toBe(geometrySignature(thermo))
})
