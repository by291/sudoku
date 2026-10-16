import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { readFileSync, realpathSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { referenceRoot, verifyReference } from './freeze-reference.mjs'

export function registerReference({ directory = referenceRoot, v11 = false, verify = true } = {}) {
  if (verify) verifyReference(directory)
  // Node canonicalizes symlinks before reporting parent URLs (including macOS temporary paths).
  const root = realpathSync(directory)
  const prefix = pathToFileURL(root).href + '/'
  const randomModule = new URL('./v11-random.ts', import.meta.url).href

  return registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.startsWith(prefix) && specifier.startsWith('@/')) {
        const target = resolve(root, 'src', specifier.slice(2) + '.ts')
        return next(pathToFileURL(target).href, context)
      }
      if (
        context.parentURL?.startsWith(prefix) &&
        specifier.startsWith('.') &&
        context.parentURL.endsWith('.ts') &&
        !extname(specifier)
      ) {
        return next(specifier + '.ts', context)
      }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (!v11 || !url.startsWith(prefix) || !url.endsWith('.ts')) return next(url, context)
      let source = readFileSync(fileURLToPath(url), 'utf8')
      if (url.endsWith('/generation/types.ts')) {
        source = source
          .replaceAll('sudoku-v10', 'sudoku-v11')
          .replaceAll('sudoku-variants-v10', 'sudoku-variants-v11')
      } else if (url.endsWith('/generation/random.ts')) {
        // Only the version-owned recipe changes; the frozen generator's draw sites stay untouched.
        source = `import { phaseRandom } from ${JSON.stringify(randomModule)}
export function createGenerationRandom(input, phase, layout, proposal = 0) {
  const seed = Uint8Array.from(input.seed.match(/../g).map(byte => Number.parseInt(byte, 16)))
  return phaseRandom({ ...input, seed }, phase, layout, proposal)
}`
      }
      return { source: stripTypeScriptTypes(source), format: 'module', shortCircuit: true }
    },
  })
}

export async function loadEngine({ v11 = false } = {}) {
  registerReference({ v11 })
  const modules = [
    'types',
    'board',
    'budget',
    'puzzle',
    'rules/context',
    'constraints/candidates',
    'constraints/conflicts',
    'constraints/computation',
    'search/exact',
    'logic/workspace',
    'logic/solver',
    'logic/techniques',
    'rating/assessment',
    'rating/policies',
    'rating/input',
    'rating/decoding',
    'generation/input',
    'generation/generate',
    'hint',
  ]
  const loaded = await Promise.all(
    modules.map(
      (name) => import(pathToFileURL(resolve(referenceRoot, 'src/core/sudoku', name + '.ts')).href),
    ),
  )
  return Object.assign({}, ...loaded)
}

if (process.argv[2] === '--probe') {
  const directory = resolve(process.argv[3])
  registerReference({ directory, verify: false })
  const result = await import(pathToFileURL(resolve(directory, process.argv[4])).href)
  console.log(JSON.stringify(result.default))
}
