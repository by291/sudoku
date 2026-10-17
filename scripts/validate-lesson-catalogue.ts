import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createBindings } from '@sudoku/wasm/factory'
import type { ValidationDto } from '@sudoku/wasm'
import type { Plugin } from 'vite'
import { isRecord } from '../src/sudoku/values.ts'

type TeachingValidator = (stage: unknown) => ValidationDto

/** Reject incomplete proof as well as invalid proof; every bundled stage must be established. */
export function validateLessonCatalogueMath(
  source: unknown,
  validateTeachingStep: TeachingValidator,
): { lessons: number; stages: number } {
  if (
    !isRecord(source) ||
    source.schemaVersion !== 1 ||
    !Array.isArray(source.lessons) ||
    source.lessons.length === 0
  ) {
    throw new Error('Invalid lesson catalogue schema')
  }

  let stages = 0
  function validateStage(stage: unknown, location: string) {
    const result = validateTeachingStep(stage)
    if (result.status !== 'valid') {
      const reason = result.status === 'invalid' ? result.issues.join('; ') : result.status
      throw new Error(`Invalid authored teaching step at ${location}: ${reason}`)
    }
    stages += 1
  }

  for (const lesson of source.lessons) {
    if (
      !isRecord(lesson) ||
      typeof lesson.id !== 'string' ||
      !Array.isArray(lesson.exercises) ||
      lesson.exercises.length !== 2
    ) {
      throw new Error('Invalid lesson catalogue entry')
    }
    validateStage(lesson.guided, `${lesson.id}/guided`)

    for (const [exerciseIndex, exercise] of lesson.exercises.entries()) {
      if (!isRecord(exercise) || !Array.isArray(exercise.stages) || exercise.stages.length === 0) {
        throw new Error(`Invalid lesson exercise in ${lesson.id}`)
      }
      for (const [stageIndex, stage] of exercise.stages.entries()) {
        validateStage(stage, `${lesson.id}/exercises/${exerciseIndex}/stages/${stageIndex}`)
      }
    }
  }

  return { lessons: source.lessons.length, stages }
}

/** Own the verified source snapshot so Vite emits exactly the JSON proved by Rust. */
export function lessonCatalogueValidation(
  cataloguePath = fileURLToPath(new URL('../content/lessons/catalogue.json', import.meta.url)),
): Plugin {
  let verifiedSource: string | null = null
  let catalogueId: string | null = null

  return {
    name: 'sudoku-lesson-catalogue-validation',
    apply: 'build',
    enforce: 'pre',
    async buildStart() {
      verifiedSource = null
      // Use Vite's resolved identity, including its symlink and platform path policy.
      const resolved = await this.resolve(cataloguePath)
      if (!resolved) {
        throw new Error('The lesson catalogue could not be resolved')
      }
      catalogueId = resolved.id
      const source = await readFile(cataloguePath, 'utf8')
      const catalogue: unknown = JSON.parse(source)
      const bindings = createBindings()
      const wasm = await readFile(
        new URL('../packages/sudoku-wasm/pkg/sudoku_wasm_bg.wasm', import.meta.url),
      )
      await bindings.default({ module_or_path: wasm })
      const result = validateLessonCatalogueMath(catalogue, bindings.validate_teaching_step)

      // Never reread after validation: a changed file must wait for the next complete build.
      verifiedSource = source
      this.addWatchFile(cataloguePath)
      this.info(
        `Validated ${result.lessons} lessons and ${result.stages} teaching stages with Rust/WASM`,
      )
    },
    load(id) {
      if (id !== catalogueId) {
        return null
      }
      if (verifiedSource === null) {
        throw new Error('The lesson catalogue has not passed mathematical validation')
      }
      return verifiedSource
    },
  }
}
