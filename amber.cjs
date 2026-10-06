const { WriteStream } = require('tty')

// Match dotenvx run's success color at each terminal color depth.
module.exports = function amber (message, stream = process.stdout) {
  if (!stream.isTTY) return message

  let depth
  try {
    depth = typeof stream.getColorDepth === 'function'
      ? stream.getColorDepth()
      : WriteStream.prototype.getColorDepth()
  } catch (error) {
    const term = process.env.TERM || ''
    depth = term.includes('256color') || term.includes('xterm') ? 8 : 4
  }

  if (depth >= 24) return `\x1b[38;2;236;213;63m${message}\x1b[39m`
  if (depth >= 8) return `\x1b[38;5;136m${message}\x1b[39m`
  if (depth >= 4) return `\x1b[33m${message}\x1b[39m`
  return message
}
