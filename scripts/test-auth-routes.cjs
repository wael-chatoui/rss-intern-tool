const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');

// Exercise the real handlers and cookie implementation without a server, network
// requests or access to the user's account/database. The store fixture controls
// authentication failures; auth-store's persistence/crypto has its own tests.
const root = path.resolve(__dirname, '..');
const AUTH_COOKIE = 'redaction_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_TOKEN = 'a'.repeat(43);
const OWNER = { email: 'camille@example.com', name: 'Camille' };
const CREDENTIALS = { email: OWNER.email, password: 'une phrase secrete de test' };
const compiled = new Map();

function harness() {
  const env = { NODE_ENV: 'development' };
  const state = { now: Date.now(), expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000, revoked: false, authenticateError: null, sessionError: null, createError: null, revokeError: null };
  const calls = { authenticate: [], getSession: [], createSession: 0, revokeSession: [] };
  const store = {
    AUTH_COOKIE, SESSION_TTL_SECONDS,
    authenticateOwner: async (email, password) => {
      calls.authenticate.push({ email, password });
      if (state.authenticateError) throw state.authenticateError;
      return email === CREDENTIALS.email && password === CREDENTIALS.password ? { ...OWNER } : null;
    },
    createSession: async () => {
      calls.createSession++;
      if (state.createError) throw state.createError;
      state.revoked = false;
      return { token: SESSION_TOKEN, expiresAt: state.expiresAt };
    },
    getSession: async token => {
      calls.getSession.push(token);
      if (state.sessionError) throw state.sessionError;
      return token === SESSION_TOKEN && !state.revoked && state.now < state.expiresAt ? { ...OWNER } : null;
    },
    revokeSession: async token => {
      calls.revokeSession.push(token);
      if (state.revokeError) throw state.revokeError;
      if (token === SESSION_TOKEN) state.revoked = true;
    },
  };
  const context = vm.createContext({ Buffer, URL, Request, Response, Date, console, process: { env } });
  function load(filename, imports) {
    if (!compiled.has(filename)) {
      compiled.set(filename, ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      }).outputText);
    }
    const module = { exports: {} };
    const wrapper = vm.runInContext(`(function(require, module, exports) { ${compiled.get(filename)}\n})`, context, { filename });
    wrapper(name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency in ${filename}: ${name}`);
      return imports[name];
    }, module, module.exports);
    return module.exports;
  }
  const auth = load('src/lib/auth.ts', {
    '@/lib/auth-store': store, 'next/server': { NextResponse },
    'next/headers': { cookies: () => ({ get: name => name === AUTH_COOKIE ? { value: SESSION_TOKEN } : undefined }) },
  });
  const imports = { '@/lib/auth-store': store, '@/lib/auth': auth, 'next/server': { NextResponse } };
  return {
    auth, calls, state, env, load,
    login: load('src/app/api/auth/login/route.ts', imports),
    logout: load('src/app/api/auth/logout/route.ts', imports),
    session: load('src/app/api/auth/session/route.ts', imports),
  };
}

function writeRequest(endpoint, body = CREDENTIALS, overrides = {}, url = `http://localhost/api/${endpoint}`) {
  const headers = new Headers({ Origin: 'http://localhost', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  return new Request(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
function sessionRequest(token = SESSION_TOKEN) {
  return new Request('http://localhost/api/auth/session', { headers: token === undefined ? {} : { Cookie: `${AUTH_COOKIE}=${token}` } });
}
function assertPrivate(response) {
  assert.match(response.headers.get('cache-control') || '', /private/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
}
function assertSessionCookie(response, { secure = false, cleared = false } = {}) {
  const cookie = response.cookies.get(AUTH_COOKIE);
  assert.ok(cookie, 'the response must set the session cookie');
  assert.equal(cookie.value, cleared ? '' : SESSION_TOKEN);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, 'lax');
  assert.equal(cookie.path, '/');
  assert.equal(cookie.secure, secure);
  assert.equal(cookie.maxAge, cleared ? 0 : SESSION_TTL_SECONDS);
  const serialized = response.headers.get('set-cookie');
  assert.match(serialized, /HttpOnly/);
  assert.match(serialized, /SameSite=lax/);
  assert.equal(/; Secure(?:;|$)/.test(serialized), secure);
  if (!cleared) {
    assert.ok(cookie.expires instanceof Date);
    assert.ok(Math.abs(cookie.expires.getTime() - (Date.now() + SESSION_TTL_SECONDS * 1000)) < 5000, 'the session cookie expires in seven days');
    assert.match(serialized, /Expires=/);
  }
  assertPrivate(response);
}

async function main() {
  let groups = 0;

  // Real API guards must return before even reading a URL/body or calling an
  // editorial dependency. A single response stub alone would miss auth wiring.
  {
    const test = harness();
    const forbidden = () => { throw new Error('Private data accessed before authentication'); };
    const dependency = new Proxy({}, { get: forbidden });
    const guardedRoutes = ['feeds', 'posts', 'rss', 'articles/save', 'articles/read', 'transfer'];
    let handlers = 0;
    for (const name of guardedRoutes) {
      const route = test.load(`src/app/api/${name}/route.ts`, {
        '@/lib/auth': test.auth, 'next/server': { NextResponse },
        '@/lib/db': dependency, '@/lib/rss': dependency, '@/lib/feed-catalog': dependency,
        '@/lib/transfer-store': dependency,
      });
      for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
        if (typeof route[method] !== 'function') continue;
        const request = new Request(`http://localhost/api/${name}`, { method, headers: { Origin: 'http://localhost' } });
        const response = await route[method](request);
        assert.equal(response.status, 401, `${name} ${method} must refuse anonymous requests`);
        assert.equal((await response.json()).code, 'UNAUTHENTICATED');
        assertPrivate(response);
        handlers++;
      }
    }
    assert.equal(handlers, 14);
    assert.equal(test.calls.getSession.length, handlers);
    groups++;
  }

  {
    const test = harness();
    for (const headers of [
      { Origin: null }, { Origin: 'https://other.example' },
      { Origin: 'http://localhost', 'Sec-Fetch-Site': 'cross-site' },
      { Origin: 'null' }, { Origin: 'http://localhost/' },
      { Origin: 'http://localhost', Host: 'evil.example@localhost' },
    ]) {
      const request = writeRequest('posts', {}, { Cookie: `${AUTH_COOKIE}=${SESSION_TOKEN}`, ...headers });
      const denial = await test.auth.protectApi(request);
      assert.equal(denial.status, 403);
      assertPrivate(denial);
      for (const route of [test.login, test.logout]) {
        const response = await route.POST(writeRequest('auth/login', CREDENTIALS, headers));
        assert.equal(response.status, 403);
        assertPrivate(response);
      }
    }
    assert.equal(test.calls.getSession.length, 0, 'origin rejection precedes session/store access');
    assert.equal(test.calls.authenticate.length, 0);
    assert.equal(test.calls.revokeSession.length, 0);
    groups++;
  }

  {
    const test = harness();
    assert.equal(test.auth.checkRequestOrigin(writeRequest('posts')), null);
    const canonicalized = writeRequest('posts', {}, { Host: '127.0.0.1:3001', Origin: 'http://127.0.0.1:3001' }, 'http://localhost:3001/api/posts');
    assert.equal(test.auth.checkRequestOrigin(canonicalized), null, 'Host preserves browser origin when Next normalizes 127.0.0.1 to localhost');
    assert.equal(test.auth.checkRequestOrigin(writeRequest('posts', {}, { Host: '127.0.0.1:3001', Origin: 'https://127.0.0.1:3001', 'X-Forwarded-Proto': 'https' }, 'http://localhost:3001/api/posts')), null);
    assert.equal(test.auth.checkRequestOrigin(writeRequest('posts', {}, { Origin: 'https://evil.example', 'X-Forwarded-Host': 'evil.example' })).status, 403, 'forwarded host cannot add an allowed origin');
    test.env.AUTH_ORIGIN = 'https://redaction.example';
    assert.equal(test.auth.checkRequestOrigin(writeRequest('posts', {}, { Origin: 'https://redaction.example', Host: 'internal-host:3000' })), null);
    assert.equal(test.auth.checkRequestOrigin(writeRequest('posts')).status, 403, 'AUTH_ORIGIN pins the browser origin');
    test.env.AUTH_ORIGIN = 'invalid';
    assert.equal(test.auth.checkRequestOrigin(writeRequest('posts')).status, 403);
    groups++;
  }

  {
    const test = harness();
    const absent = new Request('http://localhost/api/auth/session');
    assert.equal(test.auth.requestSessionToken(absent), undefined);
    assert.equal(test.auth.requestSessionToken(new Request('http://localhost', { headers: { Cookie: `other=1; ${AUTH_COOKIE}=${SESSION_TOKEN}; theme=dark` } })), SESSION_TOKEN);
    for (const token of ['', 'fabricated', 'b'.repeat(43)]) {
      const response = await test.session.GET(sessionRequest(token));
      assert.equal(response.status, 401);
      assert.equal((await response.json()).user, null);
      assertPrivate(response);
      assert.equal((await test.auth.protectApi(sessionRequest(token))).status, 401);
    }
    assert.equal((await test.session.GET(absent)).status, 401);
    let response = await test.session.GET(sessionRequest());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user: OWNER });
    assert.equal(await test.auth.protectApi(sessionRequest()), null);
    assert.deepEqual(await test.auth.getCurrentOwner(), OWNER);
    assert.equal(await test.auth.protectApi(writeRequest('posts', {}, { Cookie: `${AUTH_COOKIE}=${SESSION_TOKEN}` })), null);
    test.state.now = test.state.expiresAt;
    response = await test.session.GET(sessionRequest());
    assert.equal(response.status, 401, 'expired store sessions cannot authenticate');
    assertPrivate(response);
    groups++;
  }

  {
    const test = harness();
    for (const [body, headers, status] of [
      [CREDENTIALS, { 'Content-Type': 'text/plain' }, 415],
      ['{invalid-json', {}, 400], [null, {}, 400], [[], {}, 400],
      [{ email: OWNER.email }, {}, 400], [{ email: 42, password: CREDENTIALS.password }, {}, 400],
      [{ email: 'x'.repeat(255), password: CREDENTIALS.password }, {}, 400],
      [{ ...CREDENTIALS, password: 'x'.repeat(513) }, {}, 400],
      ['x'.repeat(4097), {}, 413],
      [{ ...CREDENTIALS, padding: 'é'.repeat(4096) }, {}, 413],
    ]) {
      const response = await test.login.POST(writeRequest('auth/login', body, headers));
      assert.equal(response.status, status);
      assertPrivate(response);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    const noBody = new Request('http://localhost/api/auth/login', { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' } });
    assert.equal((await test.login.POST(noBody)).status, 400);
    assert.equal(test.calls.authenticate.length, 0, 'invalid and oversized bodies never reach password verification');
    assert.equal(test.calls.createSession, 0);
    const wrong = await test.login.POST(writeRequest('auth/login', { ...CREDENTIALS, password: 'une autre phrase secrete' }));
    assert.equal(wrong.status, 401);
    assertPrivate(wrong);
    assert.equal(test.calls.createSession, 0);
    assert.equal(wrong.headers.get('set-cookie'), null);
    groups++;
  }

  {
    const test = harness();
    for (const production of [false, true]) {
      test.env.NODE_ENV = production ? 'production' : 'development';
      const response = await test.login.POST(writeRequest('auth/login', CREDENTIALS, { 'Content-Type': 'application/json; charset=utf-8' }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { user: OWNER });
      assertSessionCookie(response, { secure: production });
    }
    assert.equal(test.calls.authenticate.length, 2);
    assert.equal(test.calls.createSession, 2);
    groups++;
  }

  {
    const test = harness();
    let response = await test.logout.POST(writeRequest('auth/logout', {}, { Cookie: `theme=light; ${AUTH_COOKIE}=${SESSION_TOKEN}` }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assertSessionCookie(response, { cleared: true });
    assert.deepEqual(test.calls.revokeSession, [SESSION_TOKEN]);
    assert.equal((await test.session.GET(sessionRequest())).status, 401, 'logout revokes the server session as well as the cookie');
    assert.equal((await test.auth.protectApi(sessionRequest())).status, 401);
    test.env.NODE_ENV = 'production';
    response = await test.logout.POST(writeRequest('auth/logout', {}));
    assert.equal(response.status, 200, 'logout remains safe without a session cookie');
    assertSessionCookie(response, { secure: true, cleared: true });
    assert.equal(test.calls.revokeSession[1], undefined);
    groups++;
  }

  {
    const test = harness();
    test.state.authenticateError = Object.assign(new Error('Rate limit fixture'), { retryAfter: 42.2 });
    const response = await test.login.POST(writeRequest('auth/login'));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '43');
    assert.equal(response.headers.get('set-cookie'), null);
    assertPrivate(response);
    assert.equal(test.calls.createSession, 0);
    groups++;
  }

  {
    const test = harness();
    const storageError = new Error('Sensitive fixture storage path must not leak');
    test.state.authenticateError = storageError;
    let response = await test.login.POST(writeRequest('auth/login'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
    assertPrivate(response);
    assert.ok(!(await response.text()).includes(storageError.message));
    test.state.authenticateError = null;
    test.state.createError = storageError;
    response = await test.login.POST(writeRequest('auth/login'));
    assert.equal(response.status, 503, 'a failed session write cannot report successful login');
    assert.equal(response.headers.get('set-cookie'), null);
    assertPrivate(response);
    test.state.sessionError = storageError;
    for (const operation of [() => test.session.GET(sessionRequest()), () => test.auth.protectApi(sessionRequest())]) {
      response = await operation();
      assert.equal(response.status, 503);
      assertPrivate(response);
      assert.ok(!(await response.text()).includes(storageError.message));
    }
    test.state.revokeError = storageError;
    response = await test.logout.POST(writeRequest('auth/logout', {}, { Cookie: `${AUTH_COOKIE}=${SESSION_TOKEN}` }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null, 'a failed revocation must not pretend to close the session');
    assertPrivate(response);
    assert.ok(!(await response.text()).includes(storageError.message));
    groups++;
  }

  console.log(`Auth routes: ${groups} groups passed, including all 14 private API handlers (isolated store fixtures, no server or network).`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
