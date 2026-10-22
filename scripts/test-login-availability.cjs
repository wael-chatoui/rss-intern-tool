const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redaction-login-availability-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', VERCEL: '', NETLIFY: '', CF_PAGES: '', AWS_LAMBDA_FUNCTION_NAME: '',
    REQUIRE_DURABLE_STORAGE: '0', RSS_DATA_DIR: path.join(directory, 'personal'),
    TURSO_DATABASE_URL: `file:${path.join(directory, 'accounts.sqlite')}`, TURSO_AUTH_TOKEN: '',
    PUBLIC_SIGNUP_ENABLED: '0', BILLING_ENABLED: '0',
  });
  const root = path.resolve(__dirname, '..');
  const load = require('./load-typescript.cjs')();
  const auth = load('src/lib/auth-store.ts');
  const durable = load('src/lib/durable-store.ts');
  const pageModule = { exports: {} };
  const source = ts.transpileModule(await fs.readFile(path.join(root, 'src/app/connexion/page.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  let signedIn = null;
  new Function('require', 'module', 'exports', source)(name => {
    if (name === '@/components/Auth/LoginForm') return { LoginForm: 'fixture-login-form' };
    if (name === '@/lib/auth') return { getCurrentOwner: async () => signedIn };
    if (name === '@/lib/auth-store') return auth;
    if (name === 'next/navigation') return { redirect(destination) { throw new Error(`redirect:${destination}`); } };
    return require(name);
  }, pageModule, pageModule.exports);
  const page = () => pageModule.exports.default({ searchParams: Promise.resolve({ expired: '1' }) });
  try {
    assert.equal(await auth.hasRegisteredAccounts(), false);
    assert.equal((await page()).props.configured, false, 'an unused installation still shows its activation instructions');
    await durable.writeDurableDocument('member-email:unrelated-index', 'not-an-account');
    await durable.writeDurableDocument('editorial:member_fixture', '{}');
    assert.equal(await auth.hasRegisteredAccounts(), false, 'indices and editorial data are not subscriber accounts');
    await assert.rejects(durable.hasDurableDocuments('member:*'), /invalide/);
    process.env.PUBLIC_SIGNUP_ENABLED = '1';
    assert.equal((await page()).props.configured, true, 'open registration keeps the first subscriber sign-in available');
    process.env.PUBLIC_SIGNUP_ENABLED = '0';
    const password = 'Phrase fictive uniquement pour cette recette';
    const member = await auth.registerMember({ email: 'member@example.test', name: 'Compte fictif', password });
    assert.equal(await auth.getOwner(), null, 'the owner was never activated');
    assert.equal(await auth.hasRegisteredAccounts(), true);
    const rendered = await page();
    assert.equal(rendered.props.configured, true, 'an existing member retains the sign-in form after registration closes');
    assert.equal(rendered.props.signupEnabled, false, 'the correction must not open registration');
    assert.equal(rendered.props.expired, true);
    assert.equal((await auth.authenticateOwner(member.email, password)).id, member.id);
    assert.equal(await auth.authenticateOwner(member.email, 'Incorrecte mais assez longue'), null);
    assert.equal(process.env.BILLING_ENABLED, '0');
    signedIn = member;
    await assert.rejects(page(), /redirect:\/espace/);
    signedIn = null;
    delete process.env.TURSO_DATABASE_URL;
    assert.equal(await auth.hasRegisteredAccounts(), false, 'a separate empty personal installation remains unconfigured');
    await auth.setupOwner({ email: 'owner@example.test', name: 'Propriétaire fictif', password });
    assert.equal(await auth.hasRegisteredAccounts(), true, 'personal owner sign-in is preserved without durable storage');
    console.log('Login availability: existing member without owner, closed signup/billing, real authentication, empty-installation guidance, owner personal mode and signed-in redirect passed (isolated SQLite/files, zero network).');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
