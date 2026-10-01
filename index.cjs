const fs = require('fs')
const path = require('path')
const { parseSync } = require('@dotenvx/primitives')
const { readPolicy, validatePolicy } = require('./envfile.cjs')

let initialEnv
let combinedEnv
let parsedEnv
let cachedLoadedEnvFiles = []
let previousLoadedEnvFiles = []
let policySignature

function updateInitialEnv (newEnv) {
  if (!initialEnv) {
    return
  }

  for (const [key, value] of Object.entries(newEnv)) {
    if (value === undefined) {
      delete initialEnv[key]
    } else {
      initialEnv[key] = value
    }
  }
}

function replaceProcessEnv (sourceEnv) {
  Object.keys(process.env).forEach((key) => {
    if (!key.startsWith('__NEXT_PRIVATE')) {
      if (sourceEnv[key] === undefined || sourceEnv[key] === '') {
        delete process.env[key]
      }
    }
  })

  Object.entries(sourceEnv).forEach(([key, value]) => {
    process.env[key] = value
  })
}

function processEnv (
  loadedEnvFiles,
  dir,
  log = console,
  forceReload = false,
  onReload,
  policy
) {
  if (!initialEnv) {
    initialEnv = Object.assign({}, process.env)
  }

  policy = policy || readPolicy(dir, loadedEnvFiles.map(file => file.path))
  const policyChanged = policy.signature !== policySignature

  if (
    !policyChanged && !forceReload &&
    (process.env.__NEXT_PROCESSED_ENV || loadedEnvFiles.length === 0)
  ) {
    return [process.env]
  }

  const origEnv = Object.assign({}, initialEnv)
  const parsed = {}
  const rows = []

  for (const envFile of loadedEnvFiles) {
    try {
      const result = parseSync(envFile.contents, {
        processEnv: { ...origEnv, ...parsed },
        fk: [path.resolve(dir || '.', `${envFile.path}.keys`), path.resolve(dir || '.', '.env.keys')]
      })
      const strict = policy.schema.strictByFile?.get(path.resolve(dir || '.', envFile.path)) ?? policy.schema.strict
      for (const error of result.errors || []) {
        if (strict) throw error
        log.error(error.message)
      }

      if (
        result.parsed &&
        !previousLoadedEnvFiles.some(
          (item) =>
            item.contents === envFile.contents && item.path === envFile.path
        )
      ) {
        if (onReload) onReload(envFile.path)
      }

      const injected = {}
      const existed = {}
      for (const key of Object.keys(result.parsed || {})) {
        if (
          typeof parsed[key] === 'undefined' &&
          typeof origEnv[key] === 'undefined'
        ) {
          parsed[key] = result.parsed[key]
          injected[key] = result.parsed[key]
        } else {
          existed[key] = origEnv[key] ?? parsed[key]
        }
      }

      rows.push({ src: envFile.contents, injected, existed })
      envFile.env = result.parsed || {}
    } catch (err) {
      if (policy.schema.strictByFile?.get(path.resolve(dir || '.', envFile.path)) ?? policy.schema.strict) throw err
      log.error(
        `Failed to load env from ${path.join(dir || '', envFile.path)}`,
        err
      )
    }
  }

  validatePolicy(policy.schema, { ...origEnv, ...parsed }, rows, log)
  process.env.__NEXT_PROCESSED_ENV = 'true'
  policySignature = policy.signature
  return [Object.assign(process.env, parsed), parsed]
}

function resetEnv () {
  if (initialEnv) {
    replaceProcessEnv(initialEnv)
  }
}

function loadEnvConfig (
  dir,
  dev,
  log = console,
  forceReload = false,
  onReload
) {
  if (!initialEnv) {
    initialEnv = Object.assign({}, process.env)
  }

  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'
  const dotenvFiles = [
    `.env.${mode}.local`,
    mode !== 'test' && '.env.local',
    `.env.${mode}`,
    '.env'
  ].filter(Boolean)
  // Read policy even on cache hits: edits, deletion, and malformed replacements
  // must not be hidden by Next's cached environment.
  const policy = readPolicy(dir, dotenvFiles)
  const policyChanged = policy.signature !== policySignature
  if (combinedEnv && !forceReload && !policyChanged) {
    return { combinedEnv, parsedEnv, loadedEnvFiles: cachedLoadedEnvFiles }
  }

  combinedEnv = undefined
  parsedEnv = undefined
  replaceProcessEnv(initialEnv)
  previousLoadedEnvFiles = cachedLoadedEnvFiles
  cachedLoadedEnvFiles = []

  for (const envFile of dotenvFiles) {
    const dotEnvPath = path.join(dir, envFile)

    try {
      const stats = fs.statSync(dotEnvPath)

      if (!stats.isFile() && !stats.isFIFO()) {
        continue
      }

      const contents = fs.readFileSync(dotEnvPath, 'utf8')

      cachedLoadedEnvFiles.push({
        path: envFile,
        contents,
        env: {}
      })
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`Failed to load env from ${envFile}`, err)
      }
    }
  }

  const result = processEnv(
    cachedLoadedEnvFiles,
    dir,
    log,
    forceReload || policyChanged,
    onReload,
    policy
  )

  combinedEnv = result[0]
  parsedEnv = result[1]

  return {
    combinedEnv,
    parsedEnv,
    loadedEnvFiles: cachedLoadedEnvFiles
  }
}

module.exports = {
  get initialEnv () {
    return initialEnv
  },
  updateInitialEnv,
  processEnv,
  resetEnv,
  loadEnvConfig
}
