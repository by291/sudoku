import { existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = '0.2.129'
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

if (!existsSync(bindgen)) {
  if (process.env.WASM_BINDGEN) {
    throw new Error('WASM_BINDGEN must point to the pinned wasm-bindgen executable')
  }
  run('cargo', [
    'install',
    'wasm-bindgen-cli',
    '--version',
    version,
    '--locked',
    '--root',
    localTools,
  ])
}
if (run(bindgen, ['--version'], true) !== `wasm-bindgen ${version}`) {
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
