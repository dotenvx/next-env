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
  const labels = {
    native: process.platform === 'darwin' ? 'Keychain' : 'system key store',
    onepassword: '1Password',
    bitwarden: 'Bitwarden'
  }
  // The shared package owns precedence; this adapter only renders progress.
  // Armor's own worker handles its spinner and approval prompts.
  return provider({
    ...options,
    onLookup (name) {
      if (labels[name]) progress('start', `injecting (${labels[name]})`)
    },
    onLookupEnd (name) {
      if (labels[name]) progress('stop')
    }
  })
}
