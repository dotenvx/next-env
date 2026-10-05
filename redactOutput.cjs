const { redact } = require('@dotenvx/primitives')
const { StringDecoder } = require('string_decoder')

function normalizedValues (values) {
  return [...new Set((values || [])
    .filter(value => value !== undefined && value !== null && `${value}`.length > 0)
    .map(value => `${value}`))]
    .sort((a, b) => b.length - a.length)
}

function partialMatchLength (value, sensitiveValues) {
  let longest = 0

  for (const sensitiveValue of sensitiveValues) {
    const maxLength = Math.min(value.length, sensitiveValue.length - 1)
    for (let length = maxLength; length > longest; length--) {
      if (sensitiveValue.startsWith(value.slice(-length))) {
        longest = length
        break
      }
    }
  }

  return longest
}

function safeBoundary (value, boundary, sensitiveValues) {
  let result = boundary
  let changed = true

  while (changed) {
    changed = false
    for (const sensitiveValue of sensitiveValues) {
      let index = value.indexOf(sensitiveValue)
      while (index !== -1) {
        const end = index + sensitiveValue.length
        if (index < result && end > result) {
          result = index
          changed = true
        }
        index = value.indexOf(sensitiveValue, index + 1)
      }
    }
  }

  return result
}

function createRedactor (sensitiveValues) {
  const values = new Set(normalizedValues(sensitiveValues))
  const decoder = new StringDecoder('utf8')
  let pending = ''
  return {
    add: secrets => normalizedValues(secrets).forEach(secret => values.add(secret)),
    write (chunk) {
      pending += decoder.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      const secrets = [...values]
      const boundary = safeBoundary(pending, pending.length - partialMatchLength(pending, secrets), secrets)
      const output = redact(pending.slice(0, boundary), secrets)
      pending = pending.slice(boundary)
      return output
    },
    flush (maskPending = false) {
      pending += decoder.end()
      const output = maskPending && pending ? '[REDACTED]' : redact(pending, [...values])
      pending = ''
      return output
    }
  }
}

module.exports = { createRedactor }
