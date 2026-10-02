const fs = require('fs')
const path = require('path')
const { parseenvfile, check } = require('@dotenvx/primitives')
const encryptedSources = require('./encryptedSources.cjs')

// Discovery belongs to the loader; all language semantics live in primitives.
function readPolicy (dir, files) {
  for (const name of ['Envfile', 'Envspec', 'Dotenvspec']) {
    const filepath = path.resolve(dir || '.', name)
    let source
    try {
      source = fs.readFileSync(filepath, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT' || fs.lstatSync(filepath, { throwIfNoEntry: false })) throw error
      continue
    }
    let schema
    try {
      schema = parseenvfile(source, {
        filepath,
        envFiles: files.map(file => path.resolve(dir || '.', file))
      })
    } catch (error) {
      error.message = `${filepath}${error.location ? `:${error.location.start.line}:${error.location.start.column}` : ''}: ${error.message}`
      throw error
    }
    return { schema, signature: JSON.stringify([filepath, source, files]) }
  }
  return { schema: { exists: false }, signature: JSON.stringify([path.resolve(dir || '.'), files]) }
}

function validatePolicy (schema, values, rows, log) {
  const diagnostics = check(schema, values, {
    loadedKeys: new Set(rows.flatMap(row => [...Object.keys(row.injected), ...Object.keys(row.existed)])),
    encryptedKeys: encryptedSources(rows)
  })
  if (diagnostics.length === 0) return
  const error = new Error(`[INVALID_ENV] ${diagnostics.map(item => item.message).join('; ')}`)
  error.code = 'INVALID_ENV'
  error.diagnostics = diagnostics
  if (diagnostics.some(item => item.strict)) throw error
  // Diagnostics contain variable names and rules, never resolved secret values.
  log.error(error.message)
}

module.exports = { readPolicy, validatePolicy }
