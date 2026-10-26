const fs = require('fs')
const path = require('path')
const { parseSync, injectsummary, publickeys, keyringSync } = require('@dotenvx/primitives')
const provider = require('./provider.cjs')
const { armor } = require('@dotenvx/providers')
const amber = require('./amber.cjs')

let initialEnv
let combinedEnv
let parsedEnv
let cachedLoadedEnvFiles = []
let previousLoadedEnvFiles = []

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
  onReload
) {
  if (!initialEnv) {
    initialEnv = Object.assign({}, process.env)
  }

  if (
    !forceReload &&
    (process.env.__NEXT_PROCESSED_ENV || loadedEnvFiles.length === 0)
  ) {
    return [process.env]
  }

  const origEnv = Object.assign({}, initialEnv)
  const parsed = {}
  let failed = false
  const summaryRows = []

  for (const envFile of loadedEnvFiles) {
    try {
      const publicKeys = publickeys(envFile.contents)
      const keySources = {}
      const environment = keyringSync({ processEnv: process.env, fk: [], provider: null })
      for (const key of publicKeys) {
        if (environment[key]) keySources[key] = 'environment'
      }
      let source
      const keys = provider({
        cwd: dir || '.',
        fk: path.resolve(dir || '.', '.env.keys'),
        onLookup (name) { source = name }
      })
      let result
      try {
        result = parseSync(envFile.contents, {
        // Let the shared provider resolve file keys so their source is recorded.
        // Preserve legacy discovery for files without a declared public key.
          fk: publicKeys.length ? [] : path.resolve(dir || '.', '.env.keys'),
          provider (publicKey) {
            try {
              const ring = keys.getSync(publicKey)
              if (ring[publicKey]) keySources[publicKey] = source
              return ring
            } catch (error) {
              if (error.code === 'SERVER_SIDE_DECRYPTION_REQUIRED') throw error
              failed = true
              const message = error.messageWithHelp || error.message || 'private key lookup failed'
              const prefix = error.code && !message.startsWith(`[${error.code}]`) ? `[${error.code}] ` : ''
              log.error(`☠ ${prefix}${message} (${envFile.path})`)
              return {}
            }
          }
        })
      } catch (error) {
        if (error.code !== 'SERVER_SIDE_DECRYPTION_REQUIRED') throw error
        const meta = error.meta || {}
        try {
          const decrypted = armor().decryptSync(envFile.contents, { publicKey: meta.public_key, grantToken: meta.grant_token })
          result = parseSync(decrypted.src, { provider: null })
          keySources[meta.public_key] = 'armor'
        } catch (decryptError) {
          result = parseSync(envFile.contents, { provider: null })
          result.errors = [decryptError, ...(result.errors || [])]
        }
      }
      summaryRows.push({ filepath: envFile.path, publicKeys, keySources })

      for (const error of result.errors || []) {
        failed = true
        log.error(`☠ ${error.messageWithHelp || error.message} (${envFile.path})`)
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

      for (const key of Object.keys(result.parsed || {})) {
        if (
          typeof parsed[key] === 'undefined' &&
          typeof origEnv[key] === 'undefined'
        ) {
          parsed[key] = result.parsed[key]
        }
      }

      envFile.env = result.parsed || {}
    } catch (err) {
      failed = true
      log.error(
        `Failed to load env from ${path.join(dir || '', envFile.path)}`,
        err
      )
    }
  }

  process.env.__NEXT_PROCESSED_ENV = 'true'
  Object.assign(process.env, parsed)

  if (!failed && loadedEnvFiles.length && typeof log.info === 'function') {
    log.info(amber(injectsummary(Object.keys(parsed).length, summaryRows)))
  }
  return [process.env, parsed]
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

  if (combinedEnv && !forceReload) {
    return {
      combinedEnv,
      parsedEnv,
      loadedEnvFiles: cachedLoadedEnvFiles
    }
  }

  combinedEnv = undefined
  parsedEnv = undefined
  replaceProcessEnv(initialEnv)

  previousLoadedEnvFiles = cachedLoadedEnvFiles
  cachedLoadedEnvFiles = []

  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'

  const dotenvFiles = [
    `.env.${mode}.local`,
    mode !== 'test' && '.env.local',
    `.env.${mode}`,
    '.env'
  ].filter(Boolean)

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
    forceReload,
    onReload
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
