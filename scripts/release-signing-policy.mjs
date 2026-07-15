const VALID_SIGNING_MODES = new Set(['0', '1'])

export function resolveSigningPolicy(args, env = process.env) {
  const mode = env.TGWR_REQUIRE_CODE_SIGNING ?? '0'
  if (!VALID_SIGNING_MODES.has(mode)) {
    throw new Error('TGWR_REQUIRE_CODE_SIGNING должен быть равен 0 или 1')
  }

  const required = mode === '1'
  const hasExplicitForceOption = args.some((arg) => arg.startsWith('--config.forceCodeSigning='))
  const builderArgs = required && !hasExplicitForceOption
    ? [...args, '--config.forceCodeSigning=true']
    : [...args]

  return {
    builderArgs,
    codeSigningRequired: required,
    identityAutoDiscovery: required ? 'true' : (env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false')
  }
}
