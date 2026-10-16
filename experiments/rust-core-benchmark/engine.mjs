import { registerHooks } from 'node:module'
import { resolve, extname } from 'node:path'
import { pathToFileURL } from 'node:url'

export const root = resolve(import.meta.dirname, '../..')

// Node 26 strips the installed project's TypeScript; only its Vite alias needs resolution.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      return next(pathToFileURL(resolve(root, 'src', specifier.slice(2) + '.ts')).href, context)
    }
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts') && !extname(specifier)) {
      return next(specifier + '.ts', context)
    }
    return next(specifier, context)
  },
})

export const engine = Object.assign(
  {},
  ...(await Promise.all([
    import('@/core/sudoku/board'),
    import('@/core/sudoku/budget'),
    import('@/core/sudoku/rules/context'),
    import('@/core/sudoku/constraints/computation'),
    import('@/core/sudoku/search/exact'),
    import('@/core/sudoku/generation/input'),
    import('@/core/sudoku/generation/generate'),
  ])),
)

export function prepare(rules) {
  const result = engine.prepareRuleComputation(rules, engine.createWorkBudget(4_000_000))
  if (result.status !== 'ready') {
    throw new Error('Fixture preparation exhausted')
  }
  return result.computation
}
