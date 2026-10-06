const { runAsWorker } = require('@dotenvx/tooling')
const injectSpinner = require('./injectSpinner.cjs')
const spinner = injectSpinner()

// This worker stays responsive while a provider blocks Next's main thread.
runAsWorker((operation, text) => {
  if (operation === 'start') spinner.start(text)
  else spinner.stop()
})
