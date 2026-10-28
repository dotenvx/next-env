const path = require('node:path')
const { build } = require('esbuild')

const root = __dirname
const options = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node16',
  legalComments: 'none',
  minify: true,
  // Armor resolves this sibling at runtime to perform synchronous requests.
  external: ['./armorWorker.js', './spinnerWorker.js']
}

Promise.all([
  build({ ...options, entryPoints: ['index.cjs'], outfile: path.join(root, 'dist/index.cjs') }),
  build({ ...options, entryPoints: ['armorWorker.cjs'], outfile: path.join(root, 'dist/armorWorker.js') }),
  build({ ...options, entryPoints: ['spinnerWorker.cjs'], outfile: path.join(root, 'dist/spinnerWorker.js') })
]).catch(error => {
  console.error(error)
  process.exitCode = 1
})
