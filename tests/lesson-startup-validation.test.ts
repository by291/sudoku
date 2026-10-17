import { expect, it } from 'vitest'
import catalogue from '@content/lessons/catalogue.json' with { type: 'json' }
import { createLessons } from './support/lessons'
import { loadLessonCatalogue } from '@/features/learning/model/lessonCatalogue'

it('constructs the complete owned catalogue without initializing or calling a Sudoku engine', () => {
  expect(createLessons()).toHaveLength(32)
})

it('retains structural validation when mathematical proof moves to the build', () => {
  const malformed = structuredClone(catalogue)
  malformed.lessons[0].guided.candidates = [0]

  expect(() => loadLessonCatalogue(malformed)).toThrow(/lesson catalogue entry/)
})

it('leaves structurally valid false conclusions for the mandatory mathematical build gate', () => {
  const forged = structuredClone(catalogue)
  const lesson = forged.lessons[0]
  const stages = [lesson.guided, lesson.exercises[0].stages[0]]
  for (const stage of stages) {
    if ('digit' in stage.step) {
      stage.step.digit = 6
    }
    if (!Array.isArray(stage.answer.expected)) {
      stage.answer.expected.digit = 6
    }
  }

  expect(loadLessonCatalogue(forged)).toHaveLength(32)
})

it.each([
  { field: 'board size', patch: { board: [0] } },
  { field: 'digit range', patch: { board: Array(81).fill(10) } },
  { field: 'candidate range', patch: { candidates: Array(81).fill(512) } },
  {
    field: 'rule shape',
    patch: { rules: { kind: 'killer', cages: [{ sum: '3', cells: [0, 1] }] } },
  },
  { field: 'step kind', patch: { step: { ...catalogue.lessons[0].guided.step, kind: 'unknown' } } },
  {
    field: 'technique',
    patch: { step: { ...catalogue.lessons[0].guided.step, technique: 'unknown' } },
  },
  {
    field: 'answer shape',
    patch: { answer: { kind: 'placement', expected: { cell: 81, digit: 1 } } },
  },
])('rejects a malformed $field at runtime', ({ patch }) => {
  const malformed = {
    ...catalogue,
    lessons: catalogue.lessons.map((lesson, index) =>
      index === 0 ? { ...lesson, guided: { ...lesson.guided, ...patch } } : lesson,
    ),
  }

  expect(() => loadLessonCatalogue(malformed)).toThrow(/catalogue entry/)
})

it.each([
  { kind: 'unit', patch: { premises: null } },
  { kind: 'unit', patch: { units: null } },
  { kind: 'unit', patch: { unit: { kind: 'row', index: 9 } } },
  { kind: 'subset', patch: { hidden: 'true' } },
  { kind: 'fish', patch: { covers: [{ kind: 'column', index: -1 }] } },
  { kind: 'wing', patch: { wings: [0] } },
  { kind: 'coloring', patch: { colors: [[0]] } },
  { kind: 'coloring', patch: { links: [{ unit: { kind: 'row', index: 0 }, cells: [0] }] } },
  { kind: 'cage', patch: { domains: [{ cell: 0, mask: 512 }] } },
  { kind: 'cage', patch: { sum: '10' } },
  { kind: 'arrow', patch: { circle: 81 } },
  { kind: 'thermo', patch: { bounds: [{ cell: 0, min: 0, max: 9 }] } },
])('rejects malformed $kind evidence before presentation', ({ kind, patch }) => {
  const lessons = createLessons()
  const stage = lessons
    .flatMap((lesson) => lesson.exercises.flatMap((exercise) => exercise.stages))
    .find((stage) => stage.step.evidence.kind === kind)
  if (!stage) {
    throw new Error(`Missing ${kind} evidence fixture`)
  }
  const malformed = {
    ...catalogue,
    lessons: [
      {
        ...catalogue.lessons[0],
        guided: {
          ...catalogue.lessons[0].guided,
          ...stage,
          step: { ...stage.step, evidence: { ...stage.step.evidence, ...patch } },
        },
      },
      ...catalogue.lessons.slice(1),
    ],
  }

  expect(() => loadLessonCatalogue(malformed)).toThrow(/catalogue entry/)
})
