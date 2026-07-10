import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)

function executableCandidates() {
  if (process.platform === 'win32') {
    return [join(root, 'release', 'win-unpacked', 'TGWR by IWS.exe')]
  }
  if (process.platform === 'darwin') {
    return [
      join(root, 'release', 'mac', 'TGWR by IWS.app', 'Contents', 'MacOS', 'TGWR by IWS'),
      join(root, 'release', 'mac-arm64', 'TGWR by IWS.app', 'Contents', 'MacOS', 'TGWR by IWS')
    ]
  }
  return [join(root, 'release', 'linux-unpacked', 'tgwr')]
}

const executable = executableCandidates().find((candidate) => existsSync(candidate))
if (!executable) throw new Error('Не найдена распакованная сборка. Сначала выполни npm run pack:app.')

await new Promise((resolvePromise, reject) => {
  const child = spawn(executable, [], {
    cwd: root,
    env: { ...process.env, TGWR_SMOKE_EXIT_ON_PONG: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  let output = ''
  let settled = false

  const finish = (error) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    if (!child.killed) child.kill()
    if (error) reject(error)
    else resolvePromise()
  }

  const inspect = (chunk) => {
    output += chunk.toString('utf8')
    if (output.includes('tgwr_packaged_worker_smoke=ok')) {
      console.log('packaged_app_smoke=ok bundled_worker=pong')
      finish()
    }
  }

  const timeout = setTimeout(() => {
    finish(new Error(`Установленное приложение не дождалось pong от worker.\n${output.slice(-4000)}`))
  }, 20_000)

  child.stdout.on('data', inspect)
  child.stderr.on('data', inspect)
  child.on('error', finish)
  child.on('exit', (code) => {
    if (!settled) finish(new Error(`Приложение завершилось до проверки worker (code=${code ?? 'null'}).\n${output.slice(-4000)}`))
  })
})
