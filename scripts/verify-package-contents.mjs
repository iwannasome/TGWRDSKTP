import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'release')
const executableName = process.platform === 'win32' ? 'tgwr-worker.exe' : 'tgwr-worker'
const expectedSuffix = ['worker-bin', `${process.platform}-${process.arch}`, executableName].join('/')
const files = []

const preloadPath = join(root, 'dist', 'preload', 'index.js')
let preloadSource = ''
try {
  preloadSource = await readFile(preloadPath, 'utf8')
} catch {
  throw new Error('Не найден CommonJS preload dist/preload/index.js')
}
if (!preloadSource.includes('require("electron")')) {
  throw new Error('Preload собран не в CommonJS и не сможет работать внутри Electron sandbox')
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) await walk(fullPath)
    else if (entry.isFile()) files.push(fullPath)
  }
}

await walk(releaseDir)
const normalized = files.map((filePath) => relative(releaseDir, filePath).split(sep).join('/'))
const workerRelative = normalized.find((filePath) => filePath.endsWith(expectedSuffix))
if (!workerRelative) throw new Error(`В package не найден ${expectedSuffix}`)
if (normalized.some((filePath) => filePath.endsWith('worker/tgwr_worker.py'))) {
  throw new Error('В package неожиданно попал исходный tgwr_worker.py')
}

const workerPath = join(releaseDir, ...workerRelative.split('/'))
const workerStat = await stat(workerPath)
if (workerStat.size < 1_000_000) throw new Error(`Worker binary подозрительно мал: ${workerStat.size} bytes`)
if (process.platform !== 'win32' && (workerStat.mode & 0o111) === 0) {
  throw new Error('Worker binary не имеет executable bit')
}

console.log(`package_contents=ok worker=${workerRelative} bytes=${workerStat.size}`)
