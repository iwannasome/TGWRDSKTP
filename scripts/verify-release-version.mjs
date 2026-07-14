import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const packageLock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
const workerSource = await readFile(join(root, 'worker', 'tgwr_worker.py'), 'utf8')
const appSource = await readFile(join(root, 'src', 'renderer', 'src', 'App.tsx'), 'utf8')
const readme = await readFile(join(root, 'Readme.md'), 'utf8')

const version = String(packageJson.version ?? '')
const expectedTag = `v${version}`
const checks = [
  ['package.json', /^\d+\.\d+\.\d+$/.test(version)],
  ['package-lock.json', packageLock.version === version && packageLock.packages?.['']?.version === version],
  ['worker VERSION', workerSource.includes(`VERSION = "${version}"`)],
  ['интерфейс', appSource.includes(`TGWR by IWS · v${version} · local`)],
  ['README', readme.includes(`Текущая версия: **${version}**.`)]
]

const failed = checks.filter(([, ok]) => !ok).map(([label]) => label)
if (failed.length > 0) {
  throw new Error(`Версия ${version || 'не задана'} не совпадает: ${failed.join(', ')}`)
}

const releaseTag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : ''
if (releaseTag && releaseTag !== expectedTag) {
  throw new Error(`Тег ${releaseTag} не совпадает с версией приложения ${expectedTag}`)
}

console.log(`release_version=ok version=${version} tag=${releaseTag || 'not-a-tag'}`)
