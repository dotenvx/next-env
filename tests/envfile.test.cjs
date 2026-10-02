/* eslint-disable no-template-curly-in-string */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { keypair, encrypt } = require('@dotenvx/primitives')

function fixture (t, files = {}, initial = {}) {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, initial)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-env-policy-'))
  for (const [name, contents] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), contents)
  delete require.cache[require.resolve('../index.cjs')]
  const loader = require('../index.cjs')
  const logs = []
  const log = { error: (...args) => logs.push(args.join(' ')), info: () => {} }
  t.after(() => {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, saved)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return { dir, loader, logs, load: (dev = true, force = false) => loader.loadEnvConfig(dir, dev, log, force) }
}

test('keeps layering, shell precedence, expansion and no-policy compatibility', t => {
  const f = fixture(t, { '.env.development.local': 'A=first', '.env.local': 'A=second\nB=${A}', '.env': 'A=third\nC=${B}\nS=file' }, { S: 'shell' })
  const result = f.load()
  assert.equal(result.parsedEnv.A, 'first')
  assert.equal(process.env.B, 'first')
  assert.equal(process.env.C, 'first')
  assert.equal(process.env.S, 'shell')
  assert.equal(f.logs.length, 0)
})

test('strict policy fails before any values are injected, and can recover', t => {
  const f = fixture(t, { Envfile: 'strict true\nenv "PORT", type: "port", encrypted: false', '.env': 'PORT=99999\nTOKEN=private' })
  assert.throws(() => f.load(), { code: 'INVALID_ENV' })
  assert.equal(process.env.PORT, undefined)
  assert.equal(process.env.TOKEN, undefined)
  assert.equal(process.env.__NEXT_PROCESSED_ENV, undefined)
  fs.writeFileSync(path.join(f.dir, '.env'), 'PORT=3000')
  assert.equal(f.load().parsedEnv.PORT, '3000')
})

test('warns without disclosing values', t => {
  const f = fixture(t, { Envfile: 'env "TOKEN"', '.env': 'TOKEN=super-secret' })
  f.load()
  assert.equal(process.env.TOKEN, 'super-secret')
  assert.match(f.logs.join(''), /TOKEN is not encrypted/)
  assert.ok(!f.logs.join('').includes('super-secret'))
})

test('requires declared values even with no dotenv files', t => {
  const f = fixture(t, { Envfile: 'strict true\nenv "MISSING"' })
  assert.throws(() => f.load(), { code: 'INVALID_ENV' })
})

test('checks policy edits, malformed replacements, and deletion on cache hits', t => {
  const f = fixture(t, { '.env': 'PORT=3000' })
  f.load()
  fs.writeFileSync(path.join(f.dir, 'Envfile'), 'strict true\nenv "PORT", encrypted: false, type: "port", max: 100')
  assert.throws(() => f.load(), { code: 'INVALID_ENV' })
  fs.writeFileSync(path.join(f.dir, 'Envfile'), 'system "oops"')
  assert.throws(() => f.load(), { code: 'MALFORMED_ENVFILE' })
  fs.unlinkSync(path.join(f.dir, 'Envfile'))
  assert.equal(f.load().combinedEnv.PORT, '3000')
})

test('decrypts using keys beside the project regardless of cwd', t => {
  const kp = keypair()
  const f = fixture(t, { Envfile: 'strict true\nenv "TOKEN"', '.env': `DOTENV_PUBLIC_KEY=${kp.publicKey}\nTOKEN=${encrypt(kp.publicKey, 'secret')}`, '.env.keys': `DOTENV_PRIVATE_KEY=${kp.privateKey}` })
  assert.equal(f.load().parsedEnv.TOKEN, 'secret')
  assert.equal(f.logs.length, 0)
})

test('plaintext shell override does not inherit encrypted file provenance', t => {
  const kp = keypair()
  const f = fixture(t, { Envfile: 'strict true\nenv "TOKEN"', '.env': `TOKEN=${encrypt(kp.publicKey, 'secret')}` }, { TOKEN: 'shell', DOTENV_PRIVATE_KEY: kp.privateKey })
  assert.throws(() => f.load(), error => error.code === 'INVALID_ENV' && error.diagnostics.some(d => d.code === 'EXPECTED_ENCRYPTED'))
  assert.equal(process.env.TOKEN, 'shell')
})

test('missing keys under strict policy fail without injecting ciphertext', t => {
  const kp = keypair()
  const f = fixture(t, { Envfile: 'strict true\nenv "TOKEN"', '.env': `TOKEN=${encrypt(kp.publicKey, 'secret')}` })
  assert.throws(() => f.load())
  assert.equal(process.env.TOKEN, undefined)
})

test('file blocks apply to selected environment and test skips .env.local', t => {
  const f = fixture(t, { Envfile: 'file ".env.test" do\n strict true\n env "PORT", type: "port", encrypted: false\nend\nfile ".env.production" do\n env "PRODUCTION_ONLY"\nend', '.env.test': 'PORT=3000', '.env.local': 'PORT=bad' }, { NODE_ENV: 'test' })
  assert.equal(f.load().parsedEnv.PORT, '3000')
})

test('removed proxy syntax fails before loading even in an inactive block', t => {
  const f = fixture(t, { Envfile: 'file ".env.production" do\n env "TOKEN", proxy: { domain: "api.example.com" }\nend', '.env': 'PORT=3000' })
  assert.throws(() => f.load(), { code: 'MALFORMED_ENVFILE' })
  assert.equal(process.env.PORT, undefined)
})

test('malformed policy and dangling symlink never silently disable validation', t => {
  const f = fixture(t, { Envfile: 'env "PORT", unknown: true', '.env': 'PORT=3000' })
  assert.throws(() => f.load(), { code: 'MALFORMED_ENVFILE' })
  assert.equal(process.env.PORT, undefined)
  fs.unlinkSync(path.join(f.dir, 'Envfile'))
  fs.symlinkSync(path.join(f.dir, 'missing'), path.join(f.dir, 'Envfile'))
  assert.throws(() => f.load(), { code: 'ENOENT' })
})

test('force reload validates new dotenv contents with unchanged policy', t => {
  const f = fixture(t, { Envfile: 'strict true\nenv "PORT", encrypted: false, type: "port"', '.env': 'PORT=3000' })
  f.load()
  fs.writeFileSync(path.join(f.dir, '.env'), 'PORT=invalid')
  assert.throws(() => f.load(true, true), { code: 'INVALID_ENV' })
})

test('encrypted origins reflect actual final injections, not skipped parser results', t => {
  const kp = keypair()
  const cipher = encrypt(kp.publicKey, 'secret')
  const f = fixture(t, { Envfile: 'strict true\nenv "TOKEN"', '.env': `TOKEN=${cipher}` }, { TOKEN: cipher, DOTENV_PRIVATE_KEY: kp.privateKey })
  // Next preserves original shell values. A parser-decrypted value that the
  // loader does not inject must not establish an encrypted origin for it.
  assert.throws(() => f.load(), { code: 'INVALID_ENV' })
  assert.equal(process.env.TOKEN, cipher)
})
