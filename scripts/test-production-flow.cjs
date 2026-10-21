const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redaction-http-'));
  const origin = 'http://localhost:3206';
  Object.assign(process.env, { TURSO_DATABASE_URL: `file:${path.join(directory, 'http.sqlite')}`, TURSO_AUTH_TOKEN: '', VERCEL: '', AUTH_ORIGIN: origin, APP_BASE_URL: origin, PUBLIC_SIGNUP_ENABLED: '1', BILLING_ENABLED: '0' });
  const load = require('./load-typescript.cjs')();
  const auth = load('src/lib/auth-store.ts'); const durable = load('src/lib/durable-store.ts'); const billing = load('src/lib/billing-store.ts');
  const noteModel = load('src/lib/note-model.ts');
  let server;
  let logs = '';
  const get = async (url, token, init = {}) => fetch(`${origin}${url}`, { ...init, headers: { ...(token ? { cookie: `redaction_session=${token}` } : {}), ...init.headers }, redirect: 'manual' });
  try {
    const password = 'mot de passe exclusivement pour les tests';
    await auth.setupOwner({ email: 'owner@example.test', name: 'Propriétaire de test', password });
    const owner = await auth.createSession();
    const a = await auth.registerMember({ email: 'a@example.test', name: 'Compte A', password });
    const b = await auth.registerMember({ email: 'b@example.test', name: 'Compte B', password });
    const sessionA = await auth.createSession(a); const sessionB = await auth.createSession(b);
    const note = (who) => noteModel.validateNotePost({ angle: `Confidentiel ${who}`, notes: `Texte privé ${who}`, tags: [], status: 'idea', platforms: [] }, { id: 'same-id', now: new Date().toISOString() });
    for (const [id, who] of [['editorial', 'owner'], [`editorial:${a.id}`, 'A'], [`editorial:${b.id}`, 'B']]) await durable.writeDurableDocument(id, JSON.stringify({ feeds: [], posts: [note(who)], savedArticles: [] }));
    for (const account of [a, b]) await billing.setAccountBilling({ memberId: account.id, status: 'active', currentPeriodEnd: Math.floor(Date.now() / 1000) + 3600, lastEventCreated: 100, lastEventId: `evt_${account.id}` });
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3206'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => { logs += data; });server.stderr.on('data', data => { logs += data; });
    for (let index = 0; index < 100; index++) {
      try { if ((await get('/')).status === 200) break; } catch { /* Wait for the isolated server to listen. */ }
      if (index === 99) throw new Error(`Server failed to start: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal((await get('/api/posts')).status, 401);
    for (const [token, expected] of [[owner.token, 'owner'], [sessionA.token, 'A'], [sessionB.token, 'B']]) {
      const response = await get('/api/posts?memberId=owner', token);
      assert.equal(response.status, 200);
      const body = await response.json();assert.equal(body.posts.length, 1);assert.equal(body.posts[0].notes, `Texte privé ${expected}`);
      assert.ok(!(response.headers.get('cache-control') || '').includes('public'));
    }
    await Promise.all(Array.from({ length: 18 }, async (_, index) => {
      const [token, expected] = [[owner.token, 'owner'], [sessionA.token, 'A'], [sessionB.token, 'B']][index % 3];
      const result = await (await get('/api/posts', token)).json();
      assert.equal(result.posts[0].notes, `Texte privé ${expected}`, 'request-local workspace survives concurrent cookie lookups and the shared operation queue');
    }));
    const aOriginal = (await (await get('/api/posts', sessionA.token)).json()).posts[0];
    const response = await get('/api/posts', sessionA.token, { method: 'PUT', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aOriginal, revision: 0, notes: 'Modification privée A' }) });
    assert.equal(response.status, 200);
    assert.equal((await (await get('/api/posts', sessionB.token)).json()).posts[0].notes, 'Texte privé B');
    assert.equal((await get('/api/posts', sessionA.token, { method: 'POST', headers: { origin: 'https://attacker.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await get('/api/billing/checkout', sessionA.token, { method: 'POST', headers: { origin } })).status, 503);
    await billing.setAccountBilling({ memberId: a.id, status: 'canceled', currentPeriodEnd: 1, lastEventCreated: 102, lastEventId: 'evt_cancel_a' });
    assert.equal((await get('/api/posts', sessionA.token)).status, 200);
    assert.equal((await get('/api/posts', sessionA.token, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 402);
    assert.equal((await get('/api/rss', sessionA.token)).status, 402);
    assert.equal((await get('/api/rss?cacheOnly=true', sessionA.token)).status, 200);
    const exported = await get('/api/account/export', sessionA.token); assert.equal(exported.status, 200);
    const exportData = await exported.json();assert.equal(exportData.posts[0].notes, 'Modification privée A');assert.ok(!JSON.stringify(exportData).includes('Texte privé B'));
    const readOnly = await get('/espace', sessionA.token);assert.equal(readOnly.status, 200);assert.match(await readOnly.text(), /lecture seule/);
    assert.equal((await get('/activation', sessionA.token)).status, 307, 'owner cannot be installed twice');
    assert.equal((await get('/demo')).status, 200);
    const signedUp = await get('/api/auth/register', undefined, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Nouveau compte', email: 'c@example.test', password, acceptTerms: true }) });
    assert.equal(signedUp.status, 201);const newCookie = signedUp.headers.get('set-cookie');assert.ok(newCookie.includes('HttpOnly'));
    const tokenC = /redaction_session=([^;]+)/.exec(newCookie)[1];
    assert.equal((await get('/api/account/export', tokenC)).status, 200);
    const newWorkspace = await (await get('/api/account/export', tokenC)).json();
    assert.deepEqual(newWorkspace.posts, []); assert.deepEqual(newWorkspace.feeds, []);
    console.log('Production HTTP: compiled Next server, owner/A/B cookie isolation, same note IDs, forged account input, cross-origin writes, subscription gates, canceled read/export, no-key checkout safety, signup isolation and HttpOnly cookies passed (temporary local SQLite, no external calls).');
  } finally {
    if (server) { server.kill('SIGTERM');await new Promise(resolve => server.once('exit', resolve)); }
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error);process.exitCode = 1; });
