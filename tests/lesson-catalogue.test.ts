import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { LESSONS } from './support/lessons'
import { LESSON_IDS, lessonStageCount } from '@/features/learning/model/lessonIds'

it('shares all stable authored courses and complete stage facts with Android', () => {
  expect(existsSync('resources/lessons/catalogue.json')).toBe(true)

  const catalogue = JSON.parse(readFileSync('resources/lessons/catalogue.json', 'utf8'))
  expect(catalogue.schemaVersion).toBe(1)
  expect(catalogue.lessons.map((lesson: { id: string }) => lesson.id)).toEqual(LESSON_IDS)
  expect(
    catalogue.lessons.map(
      (lesson: { exercises: { stages: unknown[] }[] }) =>
        lesson.exercises.flatMap((exercise) => exercise.stages).length,
    ),
  ).toEqual(LESSON_IDS.map(lessonStageCount))

  // This sealed pre-Rust snapshot checks extraction fidelity; independent course proofs check mathematics.
  const authored: Record<string, unknown>[] = JSON.parse(
    gunzipSync(readFileSync('tests/fixtures/teaching-contracts.json.gz')).toString('utf8'),
  )
  // The sealed fixture retains the old flattened aliases; compare its owned content contract.
  for (const lesson of authored) {
    delete lesson.board
    delete lesson.candidates
    delete lesson.rules
    delete lesson.exercise
  }
  expect(JSON.parse(JSON.stringify(LESSONS))).toEqual(authored)
})

it('loads an owned copy and rejects forged answers, candidates and transfer capabilities', async () => {
  const { loadLessonCatalogue } = await import('@/features/learning/model/lessonCatalogue')
  const catalogue = JSON.parse(readFileSync('resources/lessons/catalogue.json', 'utf8'))
  const original = catalogue.lessons[0].guided.board[0]
  const loaded = loadLessonCatalogue(catalogue)
  catalogue.lessons[0].guided.board[0] = 0

  expect(loaded[0].guided.board[0]).toBe(original)
  expect(
    loadLessonCatalogue(JSON.parse(readFileSync('resources/lessons/catalogue.json', 'utf8')))[0]
      .guided.board[0],
  ).toBe(original)

  const invalidAnswer = JSON.parse(readFileSync('resources/lessons/catalogue.json', 'utf8'))
  invalidAnswer.lessons[0].guided.answer.expected.digit = 6
  expect(() => loadLessonCatalogue(invalidAnswer)).toThrow(/answer/)

  const invalidCandidates = JSON.parse(readFileSync('resources/lessons/catalogue.json', 'utf8'))
  invalidCandidates.lessons[0].guided.candidates = [0]
  expect(() => loadLessonCatalogue(invalidCandidates)).toThrow(/catalogue entry/)

  const invalidTransform = JSON.parse(readFileSync('resources/lessons/catalogue.json', 'utf8'))
  invalidTransform.lessons[12].transfer.kind = 'swap-rows'
  expect(() => loadLessonCatalogue(invalidTransform)).toThrow(/variant/)
})

it('records the original transfer transforms and materialized stage copy without redefining proof oracles', async () => {
  const { stageAnswer, transformStage } = await import('@/features/learning/model/exerciseStages')
  const { explainStep } = await import('@/features/game/model/techniquePresentation')
  const { testEngine } = await import('./support/semantics')
  const catalogue = JSON.parse(readFileSync('resources/lessons/catalogue.json', 'utf8'))

  for (const [index, lesson] of LESSONS.entries()) {
    const authored = catalogue.lessons[index]
    for (const [exerciseIndex, exercise] of lesson.exercises.entries()) {
      for (const [stageIndex, stage] of exercise.stages.entries()) {
        const materialized = authored.exercises[exerciseIndex].stages[stageIndex]

        expect(materialized.answer).toEqual(stageAnswer(stage))
        expect(materialized.explanation).toBe(explainStep(stage.step))
      }
    }
    if (lesson.id === 'arrow-rules') {
      // This course deliberately teaches a different unknown in the transfer source.
      const alternate = transformStage(lesson.exercises[1].stages[0], testEngine)
      expect(stageAnswer(alternate)).toEqual({
        kind: 'placement',
        expected: { cell: 32, digit: 3 },
      })
      expect(authored.transfer).toEqual({ kind: 'transpose', source: 'authored-alternate' })
    } else {
      expect(
        lesson.exercises[0].stages.map((stage) =>
          transformStage(stage, testEngine, authored.transfer.kind),
        ),
      ).toEqual(lesson.exercises[1].stages)
    }
  }
})
