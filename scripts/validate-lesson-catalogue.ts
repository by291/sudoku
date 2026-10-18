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

const directoryModuleId = 'virtual:sudoku-lessons'
const lessonModulePrefix = 'virtual:sudoku-lesson/'

type LessonAssets = { source: string; directory: string; lessons: Map<string, string> }

function createLessonAssets(source: string): LessonAssets {
  const catalogue: unknown = JSON.parse(source)
  if (!isRecord(catalogue) || !Array.isArray(catalogue.lessons)) {
    throw new Error('Invalid lesson catalogue schema')
  }
  const lessons = new Map<string, string>()
  const directory = catalogue.lessons.map((lesson: unknown, order) => {
    if (
      !isRecord(lesson) ||
      typeof lesson.id !== 'string' ||
      typeof lesson.title !== 'string' ||
      typeof lesson.introduction !== 'string' ||
      typeof lesson.practiceVariant !== 'string' ||
      typeof lesson.practiceDifficulty !== 'string' ||
      !Array.isArray(lesson.exercises) ||
      lessons.has(lesson.id)
    ) {
      throw new Error('Invalid lesson directory entry')
    }
    const stageCounts = lesson.exercises.map((exercise: unknown) => {
      if (!isRecord(exercise) || !Array.isArray(exercise.stages)) {
        throw new Error('Invalid lesson exercise')
      }
      return exercise.stages.length
    })
    lessons.set(lesson.id, JSON.stringify(lesson))
    return {
      id: lesson.id,
      order,
      title: lesson.title,
      introduction: lesson.introduction,
      practiceVariant: lesson.practiceVariant,
      practiceDifficulty: lesson.practiceDifficulty,
      stageCount: stageCounts.reduce((total, count) => total + count, 0),
    }
  })
  const loaders = [...lessons.keys()].map(
    (id) => `${JSON.stringify(id)}: () => import(${JSON.stringify(lessonModulePrefix + id)})`,
  )
  return {
    source,
    lessons,
    directory: `export const directory = ${JSON.stringify(directory)};\nexport const lessonLoaders = {${loaders.join(',')}};`,
  }
}

/** All generated modules own the same source snapshot proved by Rust before publication. */
export function lessonCatalogueValidation(
  cataloguePath = fileURLToPath(new URL('../resources/lessons/catalogue.json', import.meta.url)),
): Plugin {
  let assets: LessonAssets | null = null
  let catalogueId: string | null = null

  async function validateSnapshot() {
    const source = await readFile(cataloguePath, 'utf8')
    const catalogue: unknown = JSON.parse(source)
    const bindings = createBindings()
    const wasm = await readFile(
      new URL('../packages/sudoku-wasm/pkg/sudoku_wasm_bg.wasm', import.meta.url),
    )
    await bindings.default({ module_or_path: wasm })
    const result = validateLessonCatalogueMath(catalogue, bindings.validate_teaching_step)

    // Never reread after validation: directory and lazy modules must share the proved bytes.
    assets = createLessonAssets(source)
    return result
  }

  return {
    name: 'sudoku-lesson-catalogue-validation',
    enforce: 'pre',
    resolveId(id) {
      if (id === directoryModuleId || id.startsWith(lessonModulePrefix)) {
        return '\0' + id
      }
      return null
    },
    async buildStart() {
      assets = null
      // Use Vite's resolved identity, including its symlink and platform path policy.
      const resolved = await this.resolve(cataloguePath)
      if (!resolved) {
        throw new Error('The lesson catalogue could not be resolved')
      }
      catalogueId = resolved.id
      const result = await validateSnapshot()
      this.addWatchFile(cataloguePath)
      this.info(
        `Validated ${result.lessons} lessons and ${result.stages} teaching stages with Rust/WASM`,
      )
    },
    load(id) {
      if (
        id !== catalogueId &&
        id !== '\0' + directoryModuleId &&
        !id.startsWith('\0' + lessonModulePrefix)
      ) {
        return null
      }
      if (assets === null) {
        throw new Error('The lesson catalogue has not passed mathematical validation')
      }
      if (id === catalogueId) {
        return assets.source
      }
      if (id === '\0' + directoryModuleId) {
        return assets.directory
      }
      const lesson = assets.lessons.get(id.slice(lessonModulePrefix.length + 1))
      if (!lesson) {
        throw new Error('Unknown lesson asset')
      }
      return `export default ${lesson};`
    },
    async handleHotUpdate(context) {
      if (context.file !== cataloguePath) {
        return
      }
      await validateSnapshot()
      for (const module of context.server.moduleGraph.idToModuleMap.values()) {
        if (module.id?.startsWith('\0virtual:sudoku-lesson')) {
          context.server.moduleGraph.invalidateModule(module)
        }
      }
      context.server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
