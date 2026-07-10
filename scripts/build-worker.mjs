import { spawnSync } from 'node:child_process'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const platform = process.platform
const arch = process.arch
const executableName = platform === 'win32' ? 'tgwr-worker.exe' : 'tgwr-worker'
const outputDir = join(root, 'worker-bin', `${platform}-${arch}`)
const outputPath = join(outputDir, executableName)
const buildRoot = join(root, '.tmp', 'pyinstaller', `${platform}-${arch}`)
const specDir = join(buildRoot, 'spec')
const workDir = join(buildRoot, 'work')

function pythonCandidates() {
  const localPython = platform === 'win32'
    ? join(root, '.venv', 'Scripts', 'python.exe')
    : join(root, '.venv', 'bin', 'python')
  return [process.env.PYTHON, localPython, platform === 'win32' ? 'python' : 'python3', 'python']
    .filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index)
}

function findBuildPython() {
  for (const candidate of pythonCandidates()) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (!existsSync(candidate)) continue
    }
    const probe = spawnSync(candidate, ['-c', 'import PyInstaller'], { cwd: root, stdio: 'ignore' })
    if (probe.status === 0) return candidate
  }
  throw new Error(
    'PyInstaller не найден. Создай .venv и выполни: python -m pip install -r worker/requirements-build.txt'
  )
}

await rm(outputDir, { recursive: true, force: true })
await rm(buildRoot, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })
await mkdir(specDir, { recursive: true })
await mkdir(workDir, { recursive: true })

const python = findBuildPython()
const args = [
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onefile',
  '--noupx',
  '--name', 'tgwr-worker',
  '--distpath', outputDir,
  '--workpath', workDir,
  '--specpath', specDir,
  join(root, 'worker', 'tgwr_worker.py')
]

const result = spawnSync(python, args, { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
if (!existsSync(outputPath)) throw new Error(`PyInstaller не создал ${outputPath}`)

if (platform !== 'win32') await chmod(outputPath, 0o755)
await writeFile(
  join(outputDir, 'build-info.json'),
  `${JSON.stringify({ platform, arch, executable: executableName }, null, 2)}\n`,
  'utf8'
)

console.log(`worker_binary=${outputPath}`)
