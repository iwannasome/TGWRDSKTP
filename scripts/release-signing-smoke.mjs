import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSigningPolicy } from './release-signing-policy.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const unsigned = resolveSigningPolicy(['--dir'], {})
assert(!unsigned.codeSigningRequired, 'Локальная unsigned-сборка ошибочно требует сертификат')
assert(!unsigned.builderArgs.includes('--config.forceCodeSigning=true'), 'Unsigned-сборка принудительно включает подпись')
assert(unsigned.identityAutoDiscovery === 'false', 'Unsigned-сборка может случайно использовать локальный сертификат')

const stable = resolveSigningPolicy(['--win', 'nsis'], { TGWR_REQUIRE_CODE_SIGNING: '1' })
assert(stable.codeSigningRequired, 'Stable-сборка не требует подпись')
assert(stable.builderArgs.includes('--config.forceCodeSigning=true'), 'Stable-сборка не передаёт electron-builder forceCodeSigning')
assert(stable.identityAutoDiscovery === 'true', 'Stable-сборка не разрешает найти импортированный сертификат')

const explicit = resolveSigningPolicy(
  ['--mac', 'dmg', '--config.forceCodeSigning=true'],
  { TGWR_REQUIRE_CODE_SIGNING: '1' }
)
assert(
  explicit.builderArgs.filter((arg) => arg.startsWith('--config.forceCodeSigning=')).length === 1,
  'forceCodeSigning добавлен повторно'
)

let invalidModeRejected = false
try {
  resolveSigningPolicy([], { TGWR_REQUIRE_CODE_SIGNING: 'yes' })
} catch {
  invalidModeRejected = true
}
assert(invalidModeRejected, 'Неизвестный режим подписи принят без ошибки')

const [releaseWorkflow, packageSource, entitlements, inheritedEntitlements, packagedSmoke, singleInstanceSmoke] = await Promise.all([
  readFile(join(root, '.github', 'workflows', 'release.yml'), 'utf8'),
  readFile(join(root, 'package.json'), 'utf8'),
  readFile(join(root, 'build', 'entitlements.mac.plist'), 'utf8'),
  readFile(join(root, 'build', 'entitlements.mac.inherit.plist'), 'utf8'),
  readFile(join(root, 'scripts', 'packaged-app-smoke.mjs'), 'utf8'),
  readFile(join(root, 'scripts', 'single-instance-smoke.mjs'), 'utf8')
])
const packageConfig = JSON.parse(packageSource)

for (const secret of [
  'WIN_CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'MAC_CSC_LINK',
  'MAC_CSC_KEY_PASSWORD',
  'APPLE_API_KEY_BASE64',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER'
]) {
  assert(releaseWorkflow.includes(secret), `Release workflow не проверяет секрет ${secret}`)
}
const signingAssignments = releaseWorkflow.match(/TGWR_REQUIRE_CODE_SIGNING: "1"/g) ?? []
assert(signingAssignments.length === 2, 'Теговые Windows/macOS сборки не включают fail-closed подпись')
assert(releaseWorkflow.includes('windows_signed:'), 'Release workflow не публикует режим подписи Windows')
assert(releaseWorkflow.includes('mac_signed:'), 'Release workflow не публикует режим подписи macOS')
assert(releaseWorkflow.includes('prerelease:'), 'Release workflow не определяет unsigned pre-release')
assert(releaseWorkflow.includes('Неполный набор секретов подписи'), 'Частичный набор signing secrets не отклоняется')

function workflowStep(name, nextName) {
  const start = releaseWorkflow.indexOf(`- name: ${name}`)
  const end = releaseWorkflow.indexOf(`- name: ${nextName}`, start + 1)
  assert(start >= 0 && end > start, `Не найден release-шаг ${name}`)
  return releaseWorkflow.slice(start, end)
}

const unsignedWindowsStep = workflowStep(
  'Собрать неподписанный Windows installer',
  'Собрать и подписать stable Windows installer'
)
assert(
  unsignedWindowsStep.includes("needs.release-credentials.outputs.windows_signed != 'true'"),
  'Unsigned Windows-шаг не доступен теговому релизу без сертификата'
)
assert(!unsignedWindowsStep.includes('WIN_CSC_'), 'Пустой Windows signing secret попадает в unsigned-сборку')

const unsignedMacStep = workflowStep(
  'Собрать неподписанный macOS DMG',
  'Подготовить App Store Connect API key'
)
assert(
  unsignedMacStep.includes("needs.release-credentials.outputs.mac_signed != 'true'"),
  'Unsigned macOS-шаг не доступен теговому релизу без сертификата'
)
assert(!unsignedMacStep.includes('CSC_LINK'), 'Пустой macOS signing secret попадает в unsigned-сборку')
assert(releaseWorkflow.includes('args+=(--prerelease --latest=false)'), 'Unsigned release не помечается как pre-release')
assert(releaseWorkflow.includes('SHA-256'), 'Release notes не предупреждают о проверке unsigned artifacts')
assert(releaseWorkflow.includes('base64.b64decode'), 'App Store Connect API key не декодируется во временный закрытый файл')
assert(releaseWorkflow.includes('Get-AuthenticodeSignature'), 'Windows-подпись не проверяется после сборки')
assert(releaseWorkflow.includes('xcrun stapler validate'), 'macOS notarization ticket не проверяется после сборки')
assert(
  releaseWorkflow.includes('Установить, запустить и удалить готовый Windows installer') &&
    releaseWorkflow.includes('/S /currentuser /D=$installRoot'),
  'Готовый Windows installer не проходит тихую установку и запуск'
)
assert(
  releaseWorkflow.includes('Смонтировать и запустить приложение из готового macOS DMG') &&
    releaseWorkflow.includes('-nobrowse -readonly -quiet'),
  'Готовый macOS DMG не монтируется read-only для запуска'
)
assert(
  releaseWorkflow.includes('Извлечь и запустить приложение из готового Linux AppImage') &&
    releaseWorkflow.includes('--appimage-extract'),
  'Готовый Linux AppImage не извлекается и не запускается'
)
for (const smokeSource of [packagedSmoke, singleInstanceSmoke]) {
  assert(smokeSource.includes('TGWR_SMOKE_EXECUTABLE'), 'App smoke не принимает executable из готового artifact')
}
assert(packageConfig.build.mac?.notarize === true, 'macOS notarization не включена в electron-builder')
assert(packageConfig.build.mac?.hardenedRuntime === true, 'macOS Hardened Runtime не включён явно')
assert(packageConfig.build.mac?.entitlements === 'build/entitlements.mac.plist', 'Основные macOS entitlements не подключены')
assert(
  packageConfig.build.mac?.entitlementsInherit === 'build/entitlements.mac.inherit.plist',
  'Наследуемые macOS entitlements не подключены'
)
for (const source of [entitlements, inheritedEntitlements]) {
  assert(source.includes('com.apple.security.cs.allow-jit'), 'macOS entitlements не разрешают JIT Electron')
  assert(
    source.includes('com.apple.security.cs.allow-unsigned-executable-memory'),
    'macOS entitlements не разрешают необходимую Electron executable memory'
  )
}

console.log('release_signing_smoke=ok unsigned=prerelease partial_secrets=rejected signed=verified artifacts=installed_or_mounted')
