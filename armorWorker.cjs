const fs = require('node:fs')
const { runAsWorker } = require('@dotenvx/tooling')
const { armor } = require('@dotenvx/providers')

runAsWorker(async (operation, options, args) => {
  try {
    if (!['get', 'decrypt'].includes(operation)) throw new Error('invalid Armor operation')
    const provider = armor({
      ...options,
      onApprovalRequired ({ approvalUri }) {
        // Next's main thread is blocked in getSync, so write directly from the worker.
        fs.writeSync(2, `Armor approval required: ${approvalUri}\nWaiting for approval…\n`)
      }
    })
    return { value: await provider[operation](...args) }
  } catch (error) {
    const { message, code, help, messageWithHelp, meta } = error
    return { error: { message, code, help, messageWithHelp, meta } }
  }
})
