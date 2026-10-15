const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const ts = require('typescript');

// The real store runs only against an isolated temporary directory. Dates can
// advance without waiting, and no user's account or editorial data is touched.
async function main() {
  const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), 'redaction-auth-test-'));
  const dataDirectory = path.join(temporary, 'data');
  const authFile = path.join(dataDirectory, 'auth.json');
  const filename = path.resolve(__dirname, '../src/lib/auth-store.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  let currentTime = Date.parse('2026-10-15T10:00:00Z');
  class TestDate extends Date { static now() { return currentTime; } }
  function loadStore() {
    const context = vm.createContext({ Buffer, Date: TestDate, console, process: { cwd: () => temporary, pid: process.pid, env: { RSS_DATA_DIR: dataDirectory } } });
    const loaded = { exports: {} };
    const wrapper = vm.runInContext(`(function(require, module, exports) { ${compiled}\n})`, context, { filename });
    wrapper(require, loaded, loaded.exports);
    return loaded.exports;
  }
  const plain = value => JSON.parse(JSON.stringify(value));
  const read = async () => JSON.parse(await fsp.readFile(authFile, 'utf8'));
  const password = 'une phrase personnelle très longue';
  const nextPassword = 'une autre phrase personnelle durable';
  const owner = { email: 'camille@example.test', name: 'Camille' };
  let groups = 0;
  try {
    let auth = loadStore();
    assert.equal(await auth.getOwner(), null);
    assert.equal(await auth.getSession(undefined), null);
    assert.equal(await auth.getSession('A'.repeat(43)), null);
    assert.equal(await auth.authenticateOwner(owner.email, password), null);
    await assert.rejects(auth.createSession(), error => error.name === 'AuthValidationError');
    await assert.rejects(auth.setupOwner({ ...owner, password: 'short' }), error => error.name === 'AuthValidationError');
    await assert.rejects(auth.setupOwner({ ...owner, password: 'a'.repeat(129) }), error => error.name === 'AuthValidationError');
    await assert.rejects(auth.setupOwner({ ...owner, email: 'invalid', password }), error => error.name === 'AuthValidationError');
    await assert.rejects(auth.setupOwner({ ...owner, name: 'x'.repeat(81), password }), error => error.name === 'AuthValidationError');
    assert.equal(fs.existsSync(authFile), false);
    groups++;

    assert.deepEqual(plain(await auth.setupOwner({ email: ' Camille@Example.Test ', name: ' Camille ', password })), owner);
    assert.deepEqual(plain(await auth.getOwner()), owner);
    const installed = await read();
    assert.match(installed.owner.passwordSalt, /^[a-f0-9]{64}$/);
    assert.match(installed.owner.passwordHash, /^[a-f0-9]{128}$/);
    assert.ok(!JSON.stringify(installed).includes(password));
    assert.equal((await fsp.stat(authFile)).mode & 0o777, 0o600);
    await assert.rejects(auth.setupOwner({ ...owner, password: nextPassword }), error => error.name === 'AuthValidationError');
    assert.equal((await read()).owner.passwordHash, installed.owner.passwordHash);
    groups++;

    assert.equal(await auth.authenticateOwner('someone-else@example.test', password), null);
    assert.equal((await read()).loginAttempts.count, 1);
    assert.equal(await auth.authenticateOwner(owner.email, 'incorrect-password-long-enough'), null);
    assert.equal((await read()).loginAttempts.count, 2);
    assert.deepEqual(plain(await auth.authenticateOwner('CAMILLE@EXAMPLE.TEST', password)), owner);
    assert.equal((await read()).loginAttempts, undefined);
    groups++;

    const session = await auth.createSession();
    assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(session.expiresAt, currentTime + auth.SESSION_TTL_SECONDS * 1000);
    const stored = await read();
    assert.equal(stored.sessions[0].hash, createHash('sha256').update(session.token).digest('hex'));
    assert.ok(!JSON.stringify(stored).includes(session.token));
    assert.deepEqual(plain(await auth.getSession(session.token)), owner);
    assert.equal(await auth.getSession(`${session.token[0] === 'A' ? 'B' : 'A'}${session.token.slice(1)}`), null);
    assert.equal(await auth.getSession('../auth.json'), null);
    // New module context simulates a server restart; token and owner persist.
    auth = loadStore();
    assert.deepEqual(plain(await auth.getSession(session.token)), owner);
    await auth.revokeSession(session.token);
    assert.equal(await auth.getSession(session.token), null);
    await auth.revokeSession(session.token);
    groups++;

    const oldest = await auth.createSession();
    for (let index = 0; index < 20; index++) await auth.createSession();
    assert.equal((await read()).sessions.length, 20);
    assert.equal(await auth.getSession(oldest.token), null);
    const expiring = await auth.createSession();
    currentTime = expiring.expiresAt;
    assert.equal(await auth.getSession(expiring.token), null);
    assert.equal((await read()).sessions.length, 0);
    groups++;

    // Seed the persisted counter at nine to check the real boundary with one
    // scrypt call, keeping this security suite quick enough for normal builds.
    const almostLimited = await read();
    almostLimited.loginAttempts = { count: 9, startedAt: currentTime };
    await fsp.writeFile(authFile, JSON.stringify(almostLimited));
    assert.equal(await auth.authenticateOwner('unknown@example.test', password), null);
    assert.equal((await read()).loginAttempts.count, 10);
    auth = loadStore();
    await assert.rejects(auth.authenticateOwner(owner.email, password), error => error.name === 'AuthRateLimitError' && error.status === 429 && error.retryAfter === 900 && !error.message.includes(owner.email));
    currentTime += 15 * 60 * 1000;
    assert.deepEqual(plain(await auth.authenticateOwner(owner.email, password)), owner);
    groups++;

    const beforeReset = await auth.createSession();
    await auth.setupOwner({ ...owner, password: nextPassword }, { reset: true });
    const reset = await read();
    assert.notEqual(reset.owner.passwordSalt, installed.owner.passwordSalt);
    assert.notEqual(reset.owner.passwordHash, installed.owner.passwordHash);
    assert.deepEqual(reset.sessions, []);
    assert.equal(await auth.getSession(beforeReset.token), null);
    assert.equal(await auth.authenticateOwner(owner.email, password), null);
    assert.deepEqual(plain(await auth.authenticateOwner(owner.email, nextPassword)), owner);
    groups++;

    const live = await auth.createSession();
    const validData = await fsp.readFile(authFile, 'utf8');
    await fsp.writeFile(authFile, '{broken JSON');
    await assert.rejects(auth.getOwner(), error => error.name === 'AuthStorageError');
    await assert.rejects(auth.getSession(live.token), error => error.name === 'AuthStorageError');
    await assert.rejects(auth.authenticateOwner(owner.email, nextPassword), error => error.name === 'AuthStorageError');
    await assert.rejects(auth.setupOwner({ ...owner, password }, { reset: true }), error => error.name === 'AuthStorageError');
    await fsp.writeFile(authFile, validData);
    const tampered = await read();
    tampered.sessions[0].hash = 'not-a-hash';
    await fsp.writeFile(authFile, JSON.stringify(tampered));
    await assert.rejects(auth.getSession(live.token), error => error.name === 'AuthStorageError');
    await fsp.rm(authFile);
    await fsp.symlink(path.join(temporary, 'missing-account'), authFile);
    await assert.rejects(auth.getOwner(), error => error.name === 'AuthStorageError');
    groups++;
    process.stdout.write(`Authentication store: ${groups} groups passed.\n`);
  } finally { await fsp.rm(temporary, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
