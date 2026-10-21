const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, createHash } = require('node:crypto');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redaction-activation-'));
  const token = randomBytes(32).toString('base64url');
  Object.assign(process.env, { VERCEL: '', TURSO_DATABASE_URL: `file:${path.join(directory, 'activation.sqlite')}`, TURSO_AUTH_TOKEN: '', AUTH_SETUP_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'), AUTH_SETUP_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(), AUTH_ORIGIN: 'http://localhost:3206' });
  const load = require('./load-typescript.cjs')(); const auth = load('src/lib/auth-store.ts');
  const route = load('src/app/api/auth/activate/route.ts');
  const input = { token, email: 'owner@example.test', name: 'Propriétaire de test', password: 'une phrase de test strictement locale' };
  const request = (body, origin = process.env.AUTH_ORIGIN) => new Request(`${process.env.AUTH_ORIGIN}/api/auth/activate`, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await route.POST(request(input, 'https://attacker.example'))).status, 403);
    assert.equal((await route.POST(request({ ...input, token: 'a'.repeat(43) }))).status, 400);
    assert.equal(await auth.getOwner(), null);
    process.env.AUTH_SETUP_EXPIRES_AT = new Date(Date.now() - 1).toISOString();
    assert.equal((await route.POST(request(input))).status, 400);
    assert.equal(await auth.getOwner(), null);
    process.env.AUTH_SETUP_EXPIRES_AT = new Date(Date.now() + 60_000).toISOString();
    const responses = await Promise.all([route.POST(request(input)), route.POST(request(input))]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 400]);
    assert.equal((await auth.getOwner()).email, input.email);
    const cookie = responses.find(response => response.status === 201).headers.get('set-cookie');
    assert.ok(cookie.includes('HttpOnly')); assert.ok(!cookie.includes(token));
    const sessionToken = /redaction_session=([^;]+)/.exec(cookie)[1];
    assert.equal((await auth.getSession(sessionToken)).email, input.email);
    assert.equal((await route.POST(request({ ...input, email: 'other@example.test' }))).status, 400);
    assert.equal((await auth.getOwner()).email, input.email);
    console.log('Owner activation: cross-origin/invalid/expired capability rejection, atomic single consumption under concurrent requests, persistent owner, opaque HttpOnly session and replay protection passed (isolated SQLite only).');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
