const { provider } = require('@dotenvx/providers')
const injectSpinner = require('./injectSpinner.cjs')
let spinSync

function progress (operation, text) {
  if (!injectSpinner.enabled()) return
  try {
    if (!spinSync) {
      const { createSyncFn } = require('@dotenvx/tooling')
      spinSync = createSyncFn(require.resolve('./spinnerWorker.js'))
    }
    spinSync(operation, text)
  } catch (error) {
    // Optional terminal feedback must not prevent resolving a key.
  }
}

module.exports = function withProgress (options = {}) {
  const fallbackProviders = new Set(['native', 'onepassword', 'bitwarden'])
  // The shared package owns precedence; this adapter only renders progress.
  // Armor's own worker handles its spinner and approval prompts.
  return provider({
    ...options,
    onLookup (name) {
      if (fallbackProviders.has(name)) progress('start', 'injecting')
    },
    onLookupEnd (name) {
      if (fallbackProviders.has(name)) progress('stop')
    }
  })
}
