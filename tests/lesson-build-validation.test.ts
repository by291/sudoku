// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, createLogger } from 'vite'
import { expect, it, vi } from 'vitest'
import catalogue from '@content/lessons/catalogue.json' with { type: 'json' }
import { createTestEngine } from './support/wasm'
import { loadLessonCatalogue } from '@/features/learning/model/lessonCatalogue'
import {
  lessonCatalogueValidation,
  validateLessonCatalogueMath,
} from '../scripts/validate-lesson-catalogue'

it('proves every guided and exercise stage with the actual Rust/WASM validator', async () => {
  const engine = await createTestEngine()
  try {
    expect(validateLessonCatalogueMath(catalogue, engine.validateTeachingStep)).toEqual({
      lessons: 32,
      stages: 116,
    })
  } finally {
    engine.dispose()
  }
})

it.each(['invalid', 'budget-exhausted'] as const)(
  'rejects %s evidence instead of approving a build',
  (status) => {
    expect(() =>
      validateLessonCatalogueMath(catalogue, () =>
        status === 'invalid' ? { status, issues: ['Fixture rejection'] } : { status },
      ),
    ).toThrow(/rules.*guided.*(Fixture rejection|budget-exhausted)/)
  },
)

it.each(['/', '/sudoku/'])(
  'rejects a structurally valid false conclusion in the %s build',
  async (base) => {
    const directory = await mkdtemp(join(tmpdir(), 'sudoku-lesson-build-'))
    const path = join(directory, 'catalogue.json')
    const forged = structuredClone(catalogue)
    forged.lessons[0].guided.step.digit = 6
    if (!Array.isArray(forged.lessons[0].guided.answer.expected)) {
      forged.lessons[0].guided.answer.expected.digit = 6
    }
    await writeFile(path, JSON.stringify(forged))

    try {
      await expect(
        build({
          configFile: false,
          root: directory,
          base,
          logLevel: 'silent',
          plugins: [lessonCatalogueValidation(path)],
          build: { write: false, lib: { entry: path, formats: ['es'] } },
        }),
      ).rejects.toThrow(/rules.*guided/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)

it('fails closed when the teaching validator throws', () => {
  expect(() =>
    validateLessonCatalogueMath(catalogue, () => {
      throw new Error('WASM validation unavailable')
    }),
  ).toThrow('WASM validation unavailable')
})

it('emits the validated asset snapshot even if the source changes before module loading', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sudoku-lesson-snapshot-'))
  const path = join(directory, 'catalogue.json')
  const original = structuredClone(catalogue)
  original.lessons[0].title = '已验证的课程快照'
  await writeFile(path, JSON.stringify(original))
  let emittedCode = ''

  try {
    await build({
      configFile: false,
      root: directory,
      logLevel: 'silent',
      plugins: [
        lessonCatalogueValidation(path),
        {
          name: 'change-source-after-validation',
          buildStart: {
            order: 'post',
            sequential: true,
            async handler() {
              const changed = structuredClone(original)
              changed.lessons[0].title = '未经验证的替换课程'
              changed.lessons[0].guided.step.digit = 6
              await writeFile(path, JSON.stringify(changed))
            },
          },
          generateBundle(_options, bundle) {
            emittedCode = Object.values(bundle)
              .filter((item) => item.type === 'chunk')
              .map((chunk) => chunk.code)
              .join('\n')
          },
        },
      ],
      build: { write: false, minify: false, lib: { entry: path, formats: ['es'] } },
    })

    expect({
      original: emittedCode.includes('已验证的课程快照'),
      changed: emittedCode.includes('未经验证的替换课程'),
    }).toEqual({ original: true, changed: false })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('validates later transfer stages with the same Rust proof gate', async () => {
  const forged = structuredClone(catalogue)
  const lastLesson = forged.lessons[forged.lessons.length - 1]
  const transferStages = lastLesson.exercises[1].stages
  transferStages[transferStages.length - 1].candidates = Array(81).fill(0)
  expect(loadLessonCatalogue(forged)).toHaveLength(32)
  const engine = await createTestEngine()

  try {
    expect(() => validateLessonCatalogueMath(forged, engine.validateTeachingStep)).toThrow(
      /arrow-combined\/exercises\/1\/stages\/2/,
    )
  } finally {
    engine.dispose()
  }
})

it.each(['/', '/sudoku/'])(
  'requires mathematical proof in the configured %s production build',
  async (base) => {
    const logger = createLogger('silent')
    const messages = vi.spyOn(logger, 'info')

    await build({ base, customLogger: logger, build: { write: false } })

    expect(
      messages.mock.calls.some(([message]) =>
        message.includes('Validated 32 lessons and 116 teaching stages with Rust/WASM'),
      ),
    ).toBe(true)
  },
)
