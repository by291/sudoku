import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localTools = resolve(root, '.tools/wasm-bindgen')
const executable = process.platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen'
const bindgen = process.env.WASM_BINDGEN ?? resolve(localTools, 'bin', executable)

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message ?? `${command} failed (${result.status}): ${result.stderr ?? ''}`,
    )
  }
  return result.stdout?.trim()
}

// Resolve the CLI from the locked crate graph so dependency updates cannot split their versions.
const metadata = JSON.parse(
  run(
    'cargo',
    [
      'metadata',
      '--locked',
      '--format-version',
      '1',
      '--filter-platform',
      'wasm32-unknown-unknown',
    ],
    true,
  ),
)
const bindingPackages = metadata.packages.filter((entry) => entry.name === 'wasm-bindgen')
if (bindingPackages.length !== 1) {
  throw new Error('Expected exactly one resolved wasm-bindgen version')
}
const version = bindingPackages[0].version
const expectedVersion = `wasm-bindgen ${version}`
const installedVersion = existsSync(bindgen) ? run(bindgen, ['--version'], true) : undefined

if (installedVersion !== expectedVersion) {
  if (process.env.WASM_BINDGEN) {
    throw new Error(`WASM_BINDGEN must point to ${expectedVersion}`)
  }
  // Replace an older locally cached CLI after Cargo.lock changes; never alter global Cargo tools.
  run('cargo', [
    'install',
    'wasm-bindgen-cli',
    '--version',
    version,
    '--locked',
    '--force',
    '--root',
    localTools,
  ])
}
if (run(bindgen, ['--version'], true) !== expectedVersion) {
  throw new Error(`The binding crate and wasm-bindgen CLI must both be ${version}`)
}

run('cargo', [
  'build',
  '-p',
  'sudoku-wasm',
  '--target',
  'wasm32-unknown-unknown',
  '--release',
  '--locked',
])
const output = resolve(root, 'packages/sudoku-wasm/pkg')
mkdirSync(output, { recursive: true })
run(bindgen, [
  resolve(root, 'target/wasm32-unknown-unknown/release/sudoku_wasm.wasm'),
  '--target',
  'web',
  '--out-name',
  'sudoku_wasm',
  '--out-dir',
  output,
])

// wasm-bindgen web glue has module-scoped mutable state. A compiler-generated closure
// gives each owner a collectable instance without eval, cache-busting imports or a custom ABI.
const gluePath = resolve(output, 'sudoku_wasm.js')
const glue = readFileSync(gluePath, 'utf8')
const parsed = ts.createSourceFile(gluePath, glue, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
if (
  parsed.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) ||
      (ts.isExportDeclaration(statement) && statement.moduleSpecifier),
  )
) {
  throw new Error('The generated binding factory requires self-contained wasm-bindgen web glue')
}
const transformed = ts.transpileModule(glue, {
  fileName: 'sudoku_wasm.js',
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    allowJs: true,
  },
  reportDiagnostics: true,
})
if (
  transformed.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
) {
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(transformed.diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }),
  )
}
writeFileSync(
  resolve(output, 'factory.js'),
  `// Generated from pinned wasm-bindgen glue by TypeScript. Do not edit.\nexport function createBindings() {\nconst exports = {};\n${transformed.outputText}\nreturn exports;\n}\n`,
)
writeFileSync(
  resolve(output, 'factory.d.ts'),
  `export declare function createBindings(): typeof import('./sudoku_wasm.js');\n`,
)
