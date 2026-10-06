const fs = require('fs')
const path = require('path')
const { parseSync, policy, check, injectsummary } = require('@dotenvx/primitives')
const provider = require('./provider.cjs')
const redactProcessOutput = require('./redactProcessOutput.cjs')
const amber = require('./amber.cjs')
const injectSpinner = require('./injectSpinner.cjs')

let initialEnv
let combinedEnv
let parsedEnv
let cachedLoadedEnvFiles = []
let previousLoadedEnvFiles = []
let cachedSelectedFiles = []

function validateEnvfile (dir, files, env, log, loadedEnvFiles = []) {
  const filepath = path.resolve(dir || '.', 'Envfile')
  let source
  try {
    source = fs.readFileSync(filepath, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    if (fs.lstatSync(filepath, { throwIfNoEntry: false })) throw new Error(`Cannot read Envfile: ${filepath}`)
    return
  }

  const selected = files.map(file => path.relative(path.dirname(filepath), path.resolve(dir || '.', file))).join(',')
  const schema = policy(source, selected)
  const { errors } = check(schema, env)
  // Match config(): protect resolved file values (including shell overrides) and
  // declared shell-only values, without treating unrelated shell variables as secrets.
  const keys = new Set([...Object.keys(schema.keys), ...loadedEnvFiles.flatMap(file => Object.keys(file.env || {}))])
  redactProcessOutput([...keys]
    .filter(key => schema.keys[key]?.stdio.redacted !== false)
    .map(key => env[key]))
  if (!errors.length) return

  const error = new Error(`[INVALID_ENV] ${errors.map(item => item.message).join('; ')}`)
  error.code = 'INVALID_ENV'
  error.diagnostics = errors
  if (errors.some(item => item.strict)) throw error
  log.error(error.message)
}

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
  selectedFiles = loadedEnvFiles.map(file => file.path)
) {
  if (!initialEnv) {
    initialEnv = Object.assign({}, process.env)
  }

  if (
    !forceReload &&
    (process.env.__NEXT_PROCESSED_ENV || loadedEnvFiles.length === 0)
  ) {
    validateEnvfile(dir, selectedFiles, process.env, log, loadedEnvFiles)
    return [process.env]
  }

  const origEnv = Object.assign({}, initialEnv)
  const parsed = {}
  let failed = false

  // Armor's worker owns animated terminal output while this thread is blocked.
  if (loadedEnvFiles.length && typeof log.info === 'function' && !injectSpinner.enabled()) {
    log.info('◇ injecting')
  }

  for (const envFile of loadedEnvFiles) {
    try {
      const result = parseSync(envFile.contents, {
        fk: path.resolve(dir || '.', '.env.keys'),
        provider: provider({ cwd: dir || '.' }).getSync
      })

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

  validateEnvfile(dir, selectedFiles, { ...process.env, ...parsed }, log, loadedEnvFiles)
  process.env.__NEXT_PROCESSED_ENV = 'true'
  Object.assign(process.env, parsed)

  if (!failed && loadedEnvFiles.length && typeof log.info === 'function') {
    log.info(amber(injectsummary(Object.keys(parsed).length, loadedEnvFiles.map(file => file.path))))
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
    validateEnvfile(dir, cachedSelectedFiles, combinedEnv, log, cachedLoadedEnvFiles)
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
    onReload,
    dotenvFiles
  )

  cachedSelectedFiles = dotenvFiles
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
