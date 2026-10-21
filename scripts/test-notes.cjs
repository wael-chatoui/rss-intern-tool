const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const { NextResponse } = require('next/server');

// Real note handlers and database, isolated in a temporary directory.
async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'rss-notes-'));
  const context = vm.createContext({ console, Buffer, URL, Request, Response, structuredClone, setTimeout, clearTimeout, crypto, process: { cwd: () => directory, pid: process.pid, env: { RSS_DATA_DIR: directory } } });
  function load(filename, imports = {}) {
    if (!Object.hasOwn(imports, '@/lib/durable-store') && filename !== 'src/lib/durable-store.ts') imports['@/lib/durable-store'] = load('src/lib/durable-store.ts');
    imports['@/lib/workspace-context'] ||= { currentWorkspaceId: async () => 'owner', editorialDocumentId: async () => 'editorial', backupDocumentPrefix: async () => 'backup:', inWorkspace: (_id, operation) => operation() };
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename })(name => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports);
    return module.exports;
  }
  const plain = value => JSON.parse(JSON.stringify(value));
  try {
    const model = load('src/lib/note-model.ts');
    const database = load('src/lib/db.ts', { '@/lib/feed-catalog': load('src/lib/feed-catalog.ts') });
    let deny = false;
    const route = load('src/app/api/posts/route.ts', { 'next/server': { NextResponse }, '@/lib/auth': { protectApi: async () => deny ? NextResponse.json({ error: 'Session requise.' }, { status: 401 }) : null }, '@/lib/db': database, '@/lib/note-model': model });
    const request = (method, body, query = '') => new Request(`http://localhost/api/posts${query}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    const save = body => route.PUT(request('PUT', body));
    await database.updateDb(db => { db.feeds = []; db.posts = []; db.savedArticles = []; });
    const legacy = { id: 'legacy-note', angle: 'Recherche', notes: 'Texte ancien', sourceArticleTitle: 'Premier article', sourceArticleLink: 'https://a.example/article', sourceArticleFeed: 'Journal A', articleId: 'article-a', tags: [], status: 'idea', platforms: [], content: { tiktok: { hook: '', script: '', visualNotes: '', durationEstimate: '' }, instagram: { caption: '', carouselSlides: [], hashtags: [] }, linkedin: { title: '', body: '', keyTakeaways: [] } }, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z' };
    await database.updateDb(db => { db.posts.push(legacy); });
    assert.equal(model.noteRevision(legacy), 0);
    assert.deepEqual(plain(model.getNoteSources(legacy)), [{ articleId: 'article-a', title: 'Premier article', link: 'https://a.example/article', feed: 'Journal A' }]);
    assert.deepEqual(plain(model.getNoteSources({ ...legacy, sources: [] })), []);
    const migrated = await save({ ...legacy, revision: 0, notes: 'Première sauvegarde' });
    assert.equal(migrated.status, 200);
    const current = (await migrated.json()).post;
    assert.equal(current.revision, 1); assert.equal(current.sources[0].link, legacy.sourceArticleLink);
    assert.equal(current.createdAt, legacy.createdAt);

    const sources = [...current.sources, { articleId: 'article-b', title: 'Deuxième article', link: 'https://b.example/article', feed: 'Journal B', excerpt: 'Chiffre recoupé' }];
    const concurrent = await Promise.all([save({ ...current, notes: 'Version onglet A', sources }), save({ ...current, notes: 'Version onglet B' })]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409]);
    const winner = (await concurrent.find(response => response.status === 200).json()).post;
    const conflict = await concurrent.find(response => response.status === 409).json();
    assert.equal(winner.revision, 2); assert.equal(conflict.code, 'NOTE_CONFLICT'); assert.deepEqual(conflict.post, winner);
    assert.equal((await database.getDb()).posts[0].revision, 2);
    const latest = winner.sources.length === 2 ? winner : (await (await save({ ...winner, sources })).json()).post;
    assert.match(model.noteSearchText(latest), /Chiffre recoupé/);
    assert.equal(model.mergeNoteSources(sources, [{ ...sources[0], link: sources[0].link + '#section' }]).length, 2);

    const before = JSON.stringify((await database.getDb()).posts);
    for (const body of [{ ...latest, revision: -1 }, { ...latest, revision: 1.5 }, { ...latest, revision: '2' }, { ...latest, revision: undefined }, { ...latest, status: 'unknown' }, { ...latest, tags: 'bad' }, { ...latest, content: null }, { ...latest, content: { ...latest.content, tiktok: null } }, { ...latest, scheduledDate: '2026-02-30' }, { ...latest, scheduledTime: '25:61' }, { ...latest, sources: [{ title: 'Dangereux', link: 'javascript:alert(1)', feed: '' }] }, { ...latest, sources: [{ title: 'Invalide', link: 'https://example.org', feed: '', unexpected: true }] }, { ...latest, unexpected: true }]) {
      assert.equal((await save(body)).status, 400, `must reject ${JSON.stringify(body).slice(0, 100)}`);
    }
    assert.equal((await save('{oops')).status, 400);
    assert.equal(JSON.stringify((await database.getDb()).posts), before, 'invalid inputs cannot change stored notes');
    const deletion = await route.DELETE(request('DELETE', undefined, `?id=${latest.id}&revision=0`));
    assert.equal(deletion.status, 409); assert.equal((await database.getDb()).posts.length, 1);
    assert.equal((await route.DELETE(request('DELETE', undefined, `?id=${latest.id}&revision=${latest.revision}`))).status, 200);
    assert.equal((await database.getDb()).posts.length, 0);
    const created = await route.POST(request('POST', { angle: 'Sujet libre', sources }));
    assert.equal(created.status, 201); const post = (await created.json()).post;
    assert.equal(post.revision, 1); assert.equal(post.sources.length, 2);
    assert.equal(post.sourceArticleLink, sources[0].link);
    const removed = await save({ ...post, sources: [] });
    assert.equal(removed.status, 200); assert.equal((await removed.json()).post.sourceArticleLink, '');
    const abaCreated = await route.POST(request('POST', { angle: 'Version originale avant restauration', sources: [] }));
    const oldTab = (await abaCreated.json()).post;
    assert.equal(oldTab.revision, 1);
    assert.equal((await route.DELETE(request('DELETE', undefined, `?id=${oldTab.id}&revision=1`))).status, 200);
    assert.equal((await database.getDb()).noteRevisions[oldTab.id], 1, 'deletion retains the revision history');
    const rss = load('src/lib/rss.ts');
    const store = load('src/lib/transfer-store.ts', { '@/lib/db': database, '@/lib/rss': rss, '@/lib/note-model': model });
    const restoredContent = { version: 1, kind: 'backup', exportedAt: oldTab.createdAt, feeds: [], posts: [{ ...oldTab, angle: 'Version restaurée' }], savedArticles: [], noteRevisions: { [oldTab.id]: 999 } };
    let preview = await store.previewTransferImport(restoredContent, 'replace', 'skip');
    await store.applyTransferImport(restoredContent, 'replace', 'skip', preview.revision);
    assert.equal((await database.getDb()).posts[0].revision, 2, 'reimport uses the local tombstone, never the forged imported counter');
    const stalePut = await save({ ...oldTab, angle: 'Ancien onglet qui tente de remplacer la restauration' });
    assert.equal(stalePut.status, 409); assert.equal((await stalePut.json()).code, 'NOTE_CONFLICT');
    const snapshot = await store.getTransferSnapshot();
    assert.equal(snapshot.data.noteRevisions, undefined, 'server revision history is not exported');
    const emptyBackup = { version: 1, kind: 'backup', exportedAt: oldTab.createdAt, feeds: [], posts: [], savedArticles: [] };
    preview = await store.previewTransferImport(emptyBackup, 'replace', 'skip');
    await store.applyTransferImport(emptyBackup, 'replace', 'skip', preview.revision);
    assert.equal((await database.getDb()).noteRevisions[oldTab.id], 2, 'a restore that removes a note retains its generation');
    preview = await store.previewTransferImport(restoredContent, 'merge', 'skip');
    await store.applyTransferImport(restoredContent, 'merge', 'skip', preview.revision);
    assert.equal((await database.getDb()).posts[0].revision, 3);
    assert.equal((await save({ ...oldTab, revision: 2 })).status, 409, 'second restore also rejects stale editors');
    deny = true;
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal((await route[method](request(method, method === 'POST' || method === 'PUT' ? {} : undefined))).status, 401);
    console.log('Note checks passed: legacy migration, multisources, concurrent saves, conflict payload, invalid input isolation, revision-aware deletion, explicit source removal, deletion/restore ABA protection, authentication.');
  } finally { await fsp.rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
