const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const execute = promisify(execFile);

async function worker() {
  const { AsyncLocalStorage } = require('node:async_hooks');
  const scope = new AsyncLocalStorage();
  const workspace = { currentWorkspaceId: async () => scope.getStore() || 'owner', editorialDocumentId: async () => !scope.getStore() || scope.getStore() === 'owner' ? 'editorial' : `editorial:${scope.getStore()}`, backupDocumentPrefix: async () => !scope.getStore() || scope.getStore() === 'owner' ? 'backup:' : `backup:${scope.getStore()}:`, inWorkspace: (id, operation) => scope.run(id, operation) };
  const load = require('./load-typescript.cjs')(undefined, { '@/lib/workspace-context': workspace });
  const store = load('src/lib/durable-store.ts');
  const database = load('src/lib/db.ts');
  const transfers = load('src/lib/transfer-store.ts');
  const auth = load('src/lib/auth-store.ts');
  const billing = load('src/lib/billing-store.ts');
  const mode = process.argv[3];
  const plain = value => JSON.parse(JSON.stringify(value));
  if (mode === 'seed') {
    await store.inDurableTransaction(() => store.writeDurableDocument('editorial', JSON.stringify({ feeds: [], posts: [], savedArticles: [], readArticleIds: [] })));
  } else if (mode === 'append') {
    for (let index = 0; index < 8; index++) await database.updateDb(current => { current.readArticleIds.push(`${process.argv[4]}:${index}`); });
  } else if (mode === 'verify') {
    assert.equal(new Set((await database.getDb()).readArticleIds).size, 24);
    const before = await database.getDb();
    const snapshot = await transfers.getTransferSnapshot();
    await database.updateDb(current => { current.readArticleIds.push('restore-check'); });
    const preview = await transfers.previewTransferImport(snapshot.data, 'replace', 'skip');
    const result = await transfers.applyTransferImport(snapshot.data, 'replace', 'skip', preview.revision);
    assert.deepEqual(plain(await database.getDb()), { ...plain(before), cachedArticles: [] });
    const recovery = JSON.parse((await transfers.readTransferBackup(result.backup.id)).text);
    assert.ok(recovery.readArticleIds.includes('restore-check'));
    assert.equal((await transfers.listTransferBackups()).length, 1);
    await assert.rejects(store.inDurableTransaction(async () => { await store.writeDurableDocument('rollback-check', 'must-not-exist'); throw new Error('interrupt'); }), /interrupt/);
    assert.equal(await store.readDurableDocument('rollback-check'), null);
  } else if (mode === 'setup') {
    await auth.setupOwner({ email: 'owner@example.test', name: 'Compte de test', password: 'phrase de test exclusivement locale' });
    const session = await auth.createSession();
    process.stdout.write(JSON.stringify(session));
  } else if (mode === 'session') {
    assert.equal((await auth.getSession(process.argv[4])).email, 'owner@example.test');
    assert.equal((await transfers.listTransferBackups()).length, 1);
    assert.equal((await database.getDb()).readArticleIds.length, 24);
    assert.deepEqual(await fs.readdir(process.env.RSS_DATA_DIR).catch(() => []), []);
  } else if (mode === 'missing') {
    const flags = ['VERCEL', 'NETLIFY', 'CF_PAGES', 'AWS_LAMBDA_FUNCTION_NAME', 'REQUIRE_DURABLE_STORAGE', 'NODE_ENV'];
    for (const [flag, value] of [['VERCEL', '1'], ['NETLIFY', 'true'], ['CF_PAGES', '1'], ['AWS_LAMBDA_FUNCTION_NAME', 'isolated-test'], ['REQUIRE_DURABLE_STORAGE', '1'], ['NODE_ENV', 'production']]) {
      for (const key of flags) delete process.env[key];
      delete process.env.RSS_DATA_DIR;
      process.env[flag] = value;
      delete process.env.TURSO_DATABASE_URL;
      assert.throws(() => store.usesDurableStorage(), /stockage durable/, `${flag} without database`);
      await assert.rejects(store.readDurableDocument('must-not-use-files'), /stockage durable/);
      process.env.TURSO_DATABASE_URL = 'file:must-not-be-created.sqlite';
      assert.throws(() => store.usesDurableStorage(), /stockage durable/, `${flag} with local SQLite`);
      process.env.TURSO_DATABASE_URL = 'libsql://isolated-example.invalid';
      delete process.env.TURSO_AUTH_TOKEN;
      assert.throws(() => store.usesDurableStorage(), /stockage durable/, `${flag} without remote authentication`);
      process.env.TURSO_AUTH_TOKEN = 'isolated-not-a-real-token';
      assert.equal(store.usesDurableStorage(), true);
    }
  } else if (mode === 'members') {
    const first = await auth.registerMember({ email: 'a@example.test', name: 'Rédaction A', password: 'phrase de test du premier compte' });
    const second = await auth.registerMember({ email: 'b@example.test', name: 'Rédaction B', password: 'phrase de test du second compte' });
    assert.notEqual(first.id, second.id);
    await assert.rejects(auth.registerMember({ email: 'A@EXAMPLE.TEST', name: 'Doublon', password: 'phrase de test du premier compte' }), /déjà utilisée/);
    const a = await auth.createSession(first); const b = await auth.createSession(second);
    assert.equal((await auth.getSession(a.token)).id, first.id);
    assert.equal((await auth.getSession(b.token)).id, second.id);
    assert.equal((await auth.authenticateOwner('a@example.test', 'phrase de test du premier compte')).id, first.id);
    assert.equal(await auth.authenticateOwner('b@example.test', 'phrase de test du premier compte'), null);
    assert.equal(await billing.hasWorkspaceAccess(first), false);
    const event = { memberId: first.id, customerId: 'cus_testA', subscriptionId: 'sub_testA', status: 'active', currentPeriodEnd: Math.floor(Date.now() / 1000) + 3600, lastEventCreated: 100, lastEventId: 'evt_a' };
    await billing.setAccountBilling(event);
    assert.equal(await billing.hasWorkspaceAccess(first), true);
    assert.equal(await billing.hasWorkspaceAccess(second), false);
    await billing.setAccountBilling({ ...event, status: 'canceled', lastEventCreated: 99, lastEventId: 'evt_old' });
    assert.equal(await billing.hasWorkspaceAccess(first), true, 'older webhook cannot revoke a newer confirmed state');
    await assert.rejects(billing.setAccountBilling({ ...event, customerId: 'cus_wrong', lastEventId: 'evt_wrong' }), /correspond pas/);
    const ownerBefore = await workspace.inWorkspace('owner', () => database.getDb());
    await workspace.inWorkspace(first.id, async () => {
      const initial = await database.getDb(); assert.equal(initial.posts.length, 0); assert.equal(initial.savedArticles.length, 0); assert.equal(initial.feeds.length, 0, 'new subscribers choose their own sources');
      await database.updateDb(value => { value.readArticleIds = ['only-a']; });
    });
    await workspace.inWorkspace(second.id, async () => { assert.equal((await database.getDb()).readArticleIds, undefined); await database.updateDb(value => { value.readArticleIds = ['only-b']; }); });
    await workspace.inWorkspace(first.id, async () => { assert.deepEqual((await database.getDb()).readArticleIds, ['only-a']); });
    const aSnapshot = await workspace.inWorkspace(first.id, () => transfers.getTransferSnapshot());
    const preview = await workspace.inWorkspace(first.id, () => transfers.previewTransferImport(aSnapshot.data, 'replace', 'skip'));
    const applied = await workspace.inWorkspace(first.id, () => transfers.applyTransferImport(aSnapshot.data, 'replace', 'skip', preview.revision));
    await workspace.inWorkspace(second.id, async () => {
      assert.equal((await transfers.listTransferBackups()).length, 0);
      await assert.rejects(transfers.readTransferBackup(applied.backup.id), /introuvable/);
      assert.deepEqual((await database.getDb()).readArticleIds, ['only-b']);
    });
    assert.deepEqual(plain(await workspace.inWorkspace('owner', () => database.getDb())), plain(ownerBefore));
    await auth.revokeSession(a.token);
    assert.equal(await auth.getSession(a.token), null);
    assert.equal((await auth.getSession(b.token)).id, second.id);
    assert.equal(await billing.memberIdForCustomer('cus_testA'), first.id);
  }
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redaction-durable-'));
  const env = { ...process.env, TURSO_DATABASE_URL: `file:${path.join(directory, 'workspace.sqlite')}`, TURSO_AUTH_TOKEN: '', RSS_DATA_DIR: path.join(directory, 'no-json-fallback'), VERCEL: '' };
  const run = (...args) => execute(process.execPath, [__filename, '--worker', ...args], { env });
  try {
    await run('seed');
    await Promise.all([run('append', 'a'), run('append', 'b'), run('append', 'c')]);
    await run('verify');
    const session = JSON.parse((await run('setup')).stdout);
    await run('session', session.token);
    await run('members');
    await run('missing');
    console.log('Durable storage: 3 separate writers, 24 preserved mutations, restarts, atomic backup/restore, rollback, persistent sessions, A/B/owner data and backup isolation, subscription ordering and no ephemeral fallback passed (isolated SQLite only).');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

(process.argv[2] === '--worker' ? worker() : main()).catch(error => { console.error(error); process.exitCode = 1; });
