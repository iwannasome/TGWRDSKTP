import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'release')
const outputPath = resolve(root, process.argv[2] || 'release/SHA256SUMS.txt')
const allowedExtensions = new Set(['.exe', '.dmg', '.AppImage', '.deb', '.rpm'])
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const version = String(packageJson.version ?? '')

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Некорректная версия приложения: ${version || 'не задана'}`)
}

const entries = await readdir(releaseDir, { withFileTypes: true })
const artifactNames = entries
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => allowedExtensions.has(name.slice(name.lastIndexOf('.'))))
  .filter((name) => name.includes(`-${version}-`))
  .sort((left, right) => left.localeCompare(right, 'en'))

if (artifactNames.length === 0) {
  throw new Error(`В release нет установщиков версии ${version} для контрольных сумм`)
}

const lines = []
for (const name of artifactNames) {
  const digest = createHash('sha256').update(await readFile(join(releaseDir, name))).digest('hex')
  lines.push(`${digest}  ${name}`)
}

await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8')
console.log(`release_checksums=ok files=${artifactNames.length} output=${basename(outputPath)}`)
