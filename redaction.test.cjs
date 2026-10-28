const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const modulePath = path.join(__dirname, 'redaction.cjs')
function run (source) {
  const result = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result
}
const setup = `const { applyRedaction } = require(${JSON.stringify(modulePath)}); const policy = { keys: { TOKEN: {stdout: {redacted: true}}, '*': {stdout: {redacted: false}} } }; applyRedaction(policy, {TOKEN: 'secret-value', PUBLIC: 'visible'});`
test('filters console objects, formatting, stdout and stderr, including split UTF-8 chunks', () => {
  const result = run(setup + `console.log('token=%s', 'secret-value'); console.error({nested: {token: 'secret-value'}}); process.stdout.write('secret-'); process.stdout.write('value visible\\n'); process.stderr.write('secret-'); process.stderr.write('value\\n'); applyRedaction(policy, {TOKEN: '🔒secret'}); const b=Buffer.from('🔒secret'); process.stdout.write(b.subarray(0,2)); process.stdout.write(b.subarray(2));`)
  assert(!result.stdout.includes('secret'))
  assert(!result.stderr.includes('secret'))
  assert(result.stdout.includes('visible'))
  assert(result.stdout.includes('[REDACTED]'))
})
test('shares state across module copies, preserves old secrets, and rewraps replaced console', () => {
  const result = run(setup + `delete require.cache[require.resolve(${JSON.stringify(modulePath)})]; const again=require(${JSON.stringify(modulePath)}); const write=process.stdout.write; const old=console.log; console.log=(...args)=>{if(args.some(arg=>String(arg).includes('secret-value'))) throw Error('captured secret'); old(...args)}; again.applyRedaction(policy, {TOKEN:'new-value'}); if(write!==process.stdout.write) throw Error('wrapped twice'); console.log('secret-value new-value');`)
  assert(!result.stdout.includes('secret-value'))
  assert(!result.stdout.includes('new-value'))
})
test('masks a trailing secret prefix at shutdown', () => {
  assert.equal(run(setup + `process.stdout.write('secret-')`).stdout, '[REDACTED]')
})
test('does not redact public rules or public-key metadata', () => {
  const result = run(`const {applyRedaction}=require(${JSON.stringify(modulePath)}); applyRedaction({keys:{'*':{stdout:{redacted:true}},PUBLIC:{stdout:{redacted:false}}}}, {TOKEN:'secret-value',PUBLIC:'visible',DOTENV_PUBLIC_KEY:'public-key'}, ['TOKEN','PUBLIC','DOTENV_PUBLIC_KEY']); console.log('secret-value visible public-key')`)
  assert.equal(result.stdout, '[REDACTED] visible public-key\n')
})
test('loadEnvConfig applies policy to inherited values and updates on reload', () => {
  const result = run(`const fs=require('node:fs'), os=require('node:os'), path=require('node:path'); const dir=fs.mkdtempSync(path.join(os.tmpdir(),'next-env-redaction-')); try { fs.writeFileSync(path.join(dir,'Dotenvxfile'),'env "TOKEN", redacted: true\\n'); fs.writeFileSync(path.join(dir,'.env'),'PUBLIC=visible\\n'); process.env.TOKEN='inherited-secret'; const api=require(${JSON.stringify(process.env.NEXT_ENV_TEST_ENTRY || path.join(__dirname,'index.cjs'))}); const log={info(){},error(){}}; api.loadEnvConfig(dir,true,log); console.log(process.env.TOKEN,process.env.PUBLIC); fs.writeFileSync(path.join(dir,'.env'),'TOKEN=reloaded-secret\\nPUBLIC=visible\\n'); api.updateInitialEnv({TOKEN:undefined}); api.loadEnvConfig(dir,true,log,true); console.log(process.env.TOKEN,'inherited-secret'); } finally {fs.rmSync(dir,{recursive:true,force:true})}`)
  assert(!result.stdout.includes('inherited-secret'))
  assert(!result.stdout.includes('reloaded-secret'))
  assert(result.stdout.includes('visible'))
})

test('global redaction excludes unrelated inherited shell values', () => {
  const result = run(`const {applyRedaction}=require(${JSON.stringify(modulePath)}); applyRedaction({keys:{'*':{stdout:{redacted:true}},EXPLICIT:{stdout:{redacted:true}}}}, {SHELL_SETTING:'0',LOADED:'loaded-secret',EXPLICIT:'inherited-secret'}, ['LOADED']); console.log('\\x1b[36m025 533 loaded-secret inherited-secret\\x1b[0m')`)
  assert.equal(result.stdout, '\x1b[36m025 533 [REDACTED] [REDACTED]\x1b[0m\n')
})
