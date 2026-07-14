import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mainSource = await readFile(join(root, 'src', 'main', 'index.ts'), 'utf8')
const dockerfileSource = await readFile(join(root, 'Dockerfile'), 'utf8')
const composeSource = await readFile(join(root, 'docker-compose.yml'), 'utf8')
const entrypointSource = await readFile(join(root, 'docker', 'entrypoint.sh'), 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(mainSource.includes('event.sender !== mainWindow.webContents'), 'IPC не проверяет принадлежность основному окну')
assert(mainSource.includes('event.senderFrame === event.sender.mainFrame'), 'IPC не запрещает вызовы из дочерних frame')
assert(mainSource.includes('MAX_OUTPUT_FILE_BYTES = 128 * 1024 * 1024'), 'Нет лимита размера экспортируемого файла')
assert(mainSource.includes('hasValidOutputSignature(filename, bytes)'), 'PNG/PDF не проверяются по сигнатуре')
assert(mainSource.includes('await fsp.realpath(dirPath)'), 'Выбранная папка не перепроверяется перед записью')
assert(mainSource.includes("ALLOWED_EXTERNAL_HOSTS = new Set(['t.me', 'github.com'])"), 'Внешние ссылки не ограничены allowlist')
assert(mainSource.includes('isAllowedDevServerUrl(devUrl)'), 'Dev renderer может загрузиться с непроверенного адреса')
assert(mainSource.includes('setPermissionRequestHandler'), 'Electron permissions не запрещены по умолчанию')
assert(mainSource.includes("session.on('will-download'"), 'Неожиданные загрузки Electron не блокируются')

const registrations = [...mainSource.matchAll(/ipcMain\.(?:handle|on)\((IPC_[A-Z_]+)/g)]
assert(registrations.length >= 12, `Найдено слишком мало IPC-регистраций: ${registrations.length}`)
for (let index = 0; index < registrations.length; index += 1) {
  const current = registrations[index]
  const next = registrations[index + 1]
  const block = mainSource.slice(current.index, next?.index ?? mainSource.length)
  assert(block.includes('isTrustedIpcSender(event)'), `${current[1]} не проверяет отправителя`)
}

assert(composeSource.includes('127.0.0.1:6080:6080'), 'noVNC опубликован не только на localhost')
assert(!entrypointSource.includes('-nopw'), 'x11vnc всё ещё запускается без пароля')
assert(entrypointSource.includes('-rfbauth "$password_file"'), 'x11vnc не использует файл пароля')
assert(entrypointSource.includes('-localhost'), 'сырой VNC не ограничен loopback-интерфейсом контейнера')
assert(dockerfileSource.includes('/app/.venv/bin/python -m pip install --no-cache-dir -r worker/requirements-runtime.txt'), 'Docker dev-worker не получает runtime-зависимости')

console.log(`security_smoke=ok ipc_channels=${registrations.length} output_limit_mb=128 novnc=localhost_password`)
