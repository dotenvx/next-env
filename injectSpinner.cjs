const fs = require('node:fs')
const { isatty } = require('node:tty')

const frames = ['◇', '⬖', '◆', '⬗']

function enabled () {
  // Worker stderr is a forwarding stream: inspect the actual descriptor instead.
  return isatty(2) && process.env.TERM !== 'dumb'
}

function injectSpinner () {
  let timer
  let visible = false
  let frame = 0

  function stop () {
    clearInterval(timer)
    timer = undefined
    if (visible) {
      visible = false
      try { fs.writeSync(2, '\r\x1b[2K') } catch (error) { /* Progress must not interrupt loading. */ }
    }
  }

  function start (text = 'injecting') {
    stop()
    if (!enabled()) return

    function draw () {
      try {
        // Bypass worker stream forwarding while the main thread is blocked.
        fs.writeSync(2, `\r\x1b[2K${frames[frame++ % frames.length]} ${text}`)
        visible = true
      } catch (error) {
        stop()
      }
    }

    draw()
    if (visible) {
      timer = setInterval(draw, 80)
      timer.unref()
    }
  }

  return { start, stop }
}

injectSpinner.enabled = enabled
module.exports = injectSpinner
