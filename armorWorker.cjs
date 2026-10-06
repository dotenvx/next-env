const fs = require('node:fs')
const { runAsWorker } = require('@dotenvx/tooling')
const { armor } = require('@dotenvx/providers')
const injectSpinner = require('./injectSpinner.cjs')

runAsWorker(async (operation, options, args) => {
  const spinner = injectSpinner()
  try {
    if (!['get', 'decrypt'].includes(operation)) throw new Error('invalid Armor operation')
    spinner.start('injecting (Armor)')
    const provider = armor({
      ...options,
      onApprovalRequired ({ approvalUri }) {
        spinner.stop()
        // Next's main thread is blocked in getSync, so write directly from the worker.
        fs.writeSync(2, `Armor approval required: ${approvalUri}\n`)
        if (injectSpinner.enabled()) {
          spinner.start('waiting for approval')
        } else {
          fs.writeSync(2, 'Waiting for approval…\n')
        }
      }
    })
    return { value: await provider[operation](...args) }
  } catch (error) {
    const { message, code, help, messageWithHelp, meta } = error
    return { error: { message, code, help, messageWithHelp, meta } }
  } finally {
    spinner.stop()
  }
})
