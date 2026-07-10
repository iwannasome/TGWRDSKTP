import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const builderCli = join(root, 'node_modules', 'electron-builder', 'cli.js')
const args = process.argv.slice(2)

if (!existsSync(builderCli)) {
  console.error('electron-builder CLI not found. Run npm ci before packaging.')
  process.exit(1)
}

const child = spawn(process.execPath, [builderCli, ...args], {
  cwd: root,
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false'
  },
  stdio: 'inherit'
})

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`electron-builder terminated by ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
