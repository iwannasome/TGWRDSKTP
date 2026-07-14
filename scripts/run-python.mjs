import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const localPython = process.platform === 'win32'
  ? join(root, '.venv', 'Scripts', 'python.exe')
  : join(root, '.venv', 'bin', 'python')
const candidates = [
  process.env.PYTHON,
  localPython,
  process.platform === 'win32' ? 'python' : 'python3',
  'python'
].filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index)

let python = null
for (const candidate of candidates) {
  if ((candidate.includes('/') || candidate.includes('\\')) && !existsSync(candidate)) continue
  const probe = spawnSync(candidate, ['-c', 'import ijson'], { cwd: root, stdio: 'ignore' })
  if (probe.status === 0) {
    python = candidate
    break
  }
}

if (!python) {
  console.error('Python-модуль ijson не найден. Установи зависимости: python -m pip install -r worker/requirements-runtime.txt')
  process.exit(1)
}

const result = spawnSync(python, process.argv.slice(2), { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
