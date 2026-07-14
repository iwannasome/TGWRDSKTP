import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
const smokeUserData = await mkdtemp(join(tmpdir(), 'tgwr-packaged-smoke-'))

try {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [`--user-data-dir=${smokeUserData}`], {
      cwd: root,
      env: { ...process.env, TGWR_SMOKE_EXIT_ON_PONG: '1', TGWR_SMOKE_RESTART_WORKER: '1' },
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
      if (
        output.includes('tgwr_packaged_csp=applied') &&
        output.includes('tgwr_packaged_app_smoke=ok worker=restart_pong renderer=ready')
      ) {
        console.log('packaged_app_smoke=ok bundled_worker=restart_pong renderer=ready csp=applied isolated_user_data=yes')
        finish()
      }
    }

    const timeout = setTimeout(() => {
      finish(new Error(`Установленное приложение не подтвердило готовность интерфейса и worker.\n${output.slice(-4000)}`))
    }, 45_000)

    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.on('error', finish)
    child.on('exit', (code) => {
      if (!settled) finish(new Error(`Приложение завершилось до проверки интерфейса и worker (code=${code ?? 'null'}).\n${output.slice(-4000)}`))
    })
  })
} finally {
  await rm(smokeUserData, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
