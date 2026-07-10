import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executableName = process.platform === 'win32' ? 'tgwr-worker.exe' : 'tgwr-worker'
const executablePath = join(root, 'worker-bin', `${process.platform}-${process.arch}`, executableName)

if (!existsSync(executablePath)) {
  throw new Error(`Worker binary not found: ${executablePath}. Run npm run worker:build first.`)
}

await new Promise((resolvePromise, reject) => {
  const child = spawn(executablePath, [], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  let stdoutBuffer = ''
  let stderr = ''
  let settled = false

  const finish = (error) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    if (!child.killed) child.kill()
    if (error) reject(error)
    else resolvePromise()
  }

  const timeout = setTimeout(() => {
    finish(new Error(`Worker binary did not answer ping. stderr: ${stderr.trim()}`))
  }, 10_000)

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8')
    while (stdoutBuffer.includes('\n')) {
      const newline = stdoutBuffer.indexOf('\n')
      const line = stdoutBuffer.slice(0, newline).trim()
      stdoutBuffer = stdoutBuffer.slice(newline + 1)
      if (!line) continue
      try {
        const payload = JSON.parse(line)
        if (payload?.type === 'pong' && typeof payload.version === 'string') {
          console.log(`worker_binary_smoke=ok version=${payload.version}`)
          finish()
          return
        }
      } catch {
        // Continue reading until a complete JSONL response arrives.
      }
    }
  })
  child.on('error', finish)
  child.on('exit', (code) => {
    if (!settled) finish(new Error(`Worker binary exited before pong (code=${code ?? 'null'}). stderr: ${stderr.trim()}`))
  })

  child.stdin.write(`${JSON.stringify({ cmd: 'ping' })}\n`)
})
