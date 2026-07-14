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

function waitForPrimaryReady(child) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolvePromise()
    }
    const inspect = (chunk) => {
      output += chunk.toString('utf8')
      if (output.includes('tgwr_single_instance_primary=ready')) finish()
    }
    const timeout = setTimeout(() => {
      finish(new Error(`Первая копия TGWR не подтвердила готовность.\n${output.slice(-4000)}`))
    }, 45_000)
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', finish)
    child.once('exit', (code) => {
      finish(new Error(`Первая копия TGWR завершилась до проверки single-instance (code=${code ?? 'null'}).\n${output.slice(-4000)}`))
    })
  })
}

function waitForSecondaryExit(child) {
  return new Promise((resolvePromise, reject) => {
    let output = ''
    const inspect = (chunk) => {
      output += chunk.toString('utf8')
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', reject)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (code === 0 || code === null) resolvePromise()
      else reject(new Error(`Вторая копия TGWR завершилась с ошибкой code=${code}.\n${output.slice(-4000)}`))
    })
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Вторая копия TGWR не завершилась: single-instance lock не сработал.\n${output.slice(-4000)}`))
    }, 12_000)
  })
}

const executable = executableCandidates().find((candidate) => existsSync(candidate))
if (!executable) throw new Error('Не найдена распакованная сборка. Сначала выполни npm run pack:app.')

const smokeUserData = await mkdtemp(join(tmpdir(), 'tgwr-single-instance-smoke-'))
let primary = null
let secondary = null

try {
  primary = spawn(executable, [`--user-data-dir=${smokeUserData}`], {
    cwd: root,
    env: { ...process.env, TGWR_SMOKE_SINGLE_INSTANCE_PRIMARY: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  await waitForPrimaryReady(primary)

  secondary = spawn(executable, [`--user-data-dir=${smokeUserData}`], {
    cwd: root,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  await waitForSecondaryExit(secondary)

  if (primary.exitCode !== null || primary.signalCode !== null) {
    throw new Error('Первая копия TGWR завершилась после запуска второй вместо сохранения единственного окна.')
  }

  console.log('single_instance_smoke=ok primary=alive secondary=blocked isolated_user_data=yes')
} finally {
  if (secondary && secondary.exitCode === null && secondary.signalCode === null) secondary.kill()
  if (primary && primary.exitCode === null && primary.signalCode === null) primary.kill()
  await rm(smokeUserData, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
}
