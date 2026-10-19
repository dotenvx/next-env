const { runAsWorker } = require('@dotenvx/tooling')
const { armor, approvalRequired } = require('@dotenvx/providers')
const injectSpinner = require('./injectSpinner.cjs')

runAsWorker(async (operation, options, args) => {
  const spinner = injectSpinner()
  try {
    if (!['get', 'decrypt'].includes(operation)) throw new Error('invalid Armor operation')
    spinner.start('injecting')
    const provider = armor({
      ...options,
      onApprovalRequired (info) {
        spinner.stop()
        approvalRequired(info)
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
