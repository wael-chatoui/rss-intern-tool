const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

// Evaluate the real modules against a temporary database. No server or network is used.
async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = await fsp.mkdtemp('/tmp/rss-transfer-store-');
  const dataDirectory = path.join(directory, 'data');
  const context = vm.createContext({ console, Buffer, URL, Request, Response, TextEncoder, TextDecoder, structuredClone, setTimeout, clearTimeout, crypto, process: { cwd: () => directory, pid: process.pid, env: { RSS_DATA_DIR: dataDirectory } } });
  function load(filename, imports = {}) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    const wrapper = vm.runInContext(`(function(require, module, exports) { ${compiled}\n})`, context, { filename });
    wrapper(name => name === '@/lib/note-model' ? noteModel : Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports);
    return module.exports;
  }
  const noteModel = load('src/lib/note-model.ts');
  const plain = value => JSON.parse(JSON.stringify(value));
  const withoutExportDate = value => { const result = plain(value); delete result.exportedAt; if (result.posts) result.posts.forEach(post => delete post.revision); return result; };
  let groups = 0;
  try {
    const database = load('src/lib/db.ts', { '@/lib/feed-catalog': load('src/lib/feed-catalog.ts') });
    const rss = load('src/lib/rss.ts');
    const store = load('src/lib/transfer-store.ts', { '@/lib/db': database, '@/lib/rss': rss });
    const source = { id: 'source-a', name: 'Journal A', url: 'https://a.example/rss', category: 'business', language: 'fr', website: 'https://a.example', enabled: false, favicon: 'https://a.example/favicon.ico' };
    const article = (number, feedId = source.id) => ({ id: rss.createArticleId(feedId, `https://a.example/articles/${number}`), feedId, feedName: source.name, feedLanguage: 'fr', category: 'business', title: `Article ${number}`, link: `https://a.example/articles/${number}`, pubDate: '2026-10-14T12:00:00Z', author: 'Camille', snippet: 'Un extrait avec é et &.', content: '<p>Du texte original.</p>', imageUrl: 'https://a.example/image.jpg' });
    const note = (id, text = 'Recherche indépendante\n\nTexte français.') => ({ id, angle: `Sujet ${id}`, notes: text, tags: ['enquête', 'économie'], status: 'in_progress', scheduledDate: '2026-10-20', scheduledTime: '14:30', platforms: ['tiktok', 'instagram', 'linkedin'], sourceArticleTitle: article(1).title, sourceArticleLink: article(1).link, sourceArticleFeed: source.name, articleId: article(1).id, content: { tiktok: { hook: 'Accroche', script: 'Script', visualNotes: 'Images', durationEstimate: '45 s' }, instagram: { caption: 'Légende', carouselSlides: ['Première page', 'Conclusion'], hashtags: ['#presse'] }, linkedin: { title: 'Titre', body: 'Analyse complète', keyTakeaways: ['Fait vérifié'] } }, createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-14T15:00:00Z' });
    const baseline = () => ({ feeds: [source], posts: [note('note-a')], savedArticles: [article(1)], cachedArticles: [article(1), article(2)], readArticleIds: [article(1).id], lastFetchedAt: '2026-10-14T15:30:00Z' });
    async function reset(value = baseline()) {
      await database.updateDb(current => { for (const key of Object.keys(current)) delete current[key]; Object.assign(current, structuredClone(value)); });
    }
    const envelope = (kind, values) => ({ version: 1, kind, exportedAt: '2026-10-15T10:00:00Z', ...values });
    await reset();
    const exported = await store.getTransferSnapshot();
    assert.equal(exported.data.savedArticles[0].saved, true);
    assert.equal(exported.data.cachedArticles[0].read, true);
    assert.equal(exported.data.cachedArticles[1].saved, false);
    assert.equal(exported.data.feeds[0].enabled, false);
    assert.equal(exported.revision.length, 64);
    assert.equal(exported.backups.length, 0);
    groups++;

    await database.updateDb(current => { current.posts[0].notes = 'Version avant restauration'; current.feeds[0].enabled = true; });
    const beforeRestore = await store.getTransferSnapshot();
    const restorePreview = await store.previewTransferImport(exported.data, 'replace', 'skip');
    const restored = await store.applyTransferImport(exported.data, 'replace', 'skip', restorePreview.revision);
    assert.equal(restored.success, true);
    assert.deepEqual(withoutExportDate((await store.getTransferSnapshot()).data), withoutExportDate(exported.data));
    const automaticBackup = JSON.parse((await store.readTransferBackup(restored.backup.id)).text);
    assert.deepEqual(withoutExportDate(automaticBackup), withoutExportDate(beforeRestore.data));
    groups++;

    const backupWithDistinctCopies = plain(exported.data);
    backupWithDistinctCopies.posts.push({ ...backupWithDistinctCopies.posts[0], id: 'distinct-copy', status: 'published' });
    backupWithDistinctCopies.feeds.push({ ...source, id: 'second-source-same-url', name: 'Autre libellé' });
    let preview = await store.previewTransferImport(backupWithDistinctCopies, 'replace', 'skip');
    await store.applyTransferImport(backupWithDistinctCopies, 'replace', 'skip', preview.revision);
    let current = await database.getDb();
    assert.equal(current.posts.length, 2, 'a complete restore retains distinct notes with identical content');
    assert.equal(current.feeds.length, 2, 'a complete restore retains distinct source metadata');
    groups++;

    await reset();
    const modifiedNote = { ...note('note-a'), notes: 'Texte importé modifié' };
    const duplicateNotes = envelope('notes', { posts: [modifiedNote, { ...note('another-id'), angle: note('note-a').angle }] });
    preview = await store.previewTransferImport(duplicateNotes, 'merge', 'skip');
    assert.equal(preview.summary.posts.added, 0);
    assert.equal(preview.summary.posts.skipped, 1);
    await store.applyTransferImport(duplicateNotes, 'merge', 'skip', preview.revision);
    assert.equal((await database.getDb()).posts[0].notes, note('note-a').notes);
    preview = await store.previewTransferImport(envelope('notes', { posts: [modifiedNote] }), 'merge', 'update');
    await store.applyTransferImport(envelope('notes', { posts: [modifiedNote] }), 'merge', 'update', preview.revision);
    assert.equal((await database.getDb()).posts[0].notes, modifiedNote.notes);
    groups++;

    await reset();
    const foreignArticle = { ...article(3, 'foreign-source'), id: 'legacy-foreign-id', feedName: 'Nom externe', read: true };
    const foreignPost = { ...note('foreign-note'), articleId: foreignArticle.id, sourceArticleLink: foreignArticle.link, sourceArticleFeed: foreignArticle.feedName };
    const foreign = envelope('backup', { feeds: [{ ...source, id: 'foreign-source', name: 'Nom externe', enabled: true }], posts: [foreignPost], savedArticles: [foreignArticle], cachedArticles: [foreignArticle], readArticleIds: [foreignArticle.id] });
    preview = await store.previewTransferImport(foreign, 'merge', 'skip');
    assert.equal(preview.summary.feeds.skipped, 1);
    assert.equal(preview.summary.articles.added, 1, 'saved and cached copies count as one article');
    const expectedArticleId = rss.createArticleId(source.id, foreignArticle.link);
    assert.equal(preview.data.savedArticles[0].feedId, source.id);
    assert.equal(preview.data.posts[0].articleId, expectedArticleId);
    await store.applyTransferImport(foreign, 'merge', 'skip', preview.revision);
    current = await database.getDb();
    assert.equal(current.feeds[0].enabled, false, 'skip preserves the existing source configuration');
    assert.ok(current.readArticleIds.includes(expectedArticleId));
    assert.equal(current.savedArticles.find(item => item.link === foreignArticle.link).id, expectedArticleId);
    assert.equal(current.cachedArticles.find(item => item.link === foreignArticle.link).id, expectedArticleId);
    groups++;

    const stale = await store.previewTransferImport(envelope('notes', { posts: [note('new-note')] }), 'merge', 'skip');
    await database.updateDb(value => { value.posts[0].notes = 'Autosave après prévisualisation'; });
    const beforeStale = await store.getTransferSnapshot();
    await assert.rejects(store.applyTransferImport(stale.data, 'merge', 'skip', stale.revision), error => error.status === 409);
    assert.equal((await database.getDb()).posts[0].notes, 'Autosave après prévisualisation');
    assert.equal((await store.listTransferBackups()).length, beforeStale.backups.length);
    preview = await store.previewTransferImport(envelope('notes', { posts: [note('concurrent-import')] }), 'merge', 'skip');
    const attempts = await Promise.allSettled([
      store.applyTransferImport(preview.data, 'merge', 'skip', preview.revision),
      store.applyTransferImport(preview.data, 'merge', 'skip', preview.revision),
    ]);
    assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(item => item.status === 'rejected' && item.reason.status === 409).length, 1);
    groups++;

    await reset({ feeds: [], posts: [], savedArticles: [], cachedArticles: [], readArticleIds: [] });
    const orphan = envelope('articles', { cachedArticles: [{ ...article(8, 'missing-feed'), read: true }] });
    preview = await store.previewTransferImport(orphan, 'merge', 'skip');
    assert.equal(preview.summary.articles.added, 1);
    assert.ok(preview.warnings.includes('Articles importés conservés dans Enregistrés.'));
    await store.applyTransferImport(orphan, 'merge', 'skip', preview.revision);
    const rssRoute = load('src/app/api/rss/route.ts', { '@/lib/auth': { protectApi: async () => null }, '@/lib/db': database, '@/lib/rss': { createArticleId: rss.createArticleId, fetchAllActiveFeeds: async () => ({ articles: [], failedFeedIds: [], warnings: [], health: [] }) }, 'next/server': { NextResponse: { json: value => value } } });
    const afterRss = await rssRoute.GET(new Request('http://localhost/api/rss?refresh=true'));
    assert.equal(afterRss.articles.length, 0);
    assert.equal(afterRss.savedArticles.length, 1);
    assert.equal(afterRss.savedArticles[0].saved, true);
    assert.equal(afterRss.savedArticles[0].read, true);
    groups++;

    const invalidFiles = [
      { ...orphan, version: 2 },
      envelope('notes', { posts: [{ ...note('bad-url'), sourceArticleLink: 'javascript:alert(1)' }] }),
      envelope('feeds', { feeds: [{ ...source, enabled: 'true' }] }),
      envelope('feeds', { feeds: [{ ...source, category: 'unknown' }] }),
      envelope('articles', { savedArticles: [{ ...article(1), pubDate: '2026-02-30T12:00:00Z' }] }),
      envelope('notes', { posts: [{ ...note('bad-date'), scheduledDate: '2026-02-30' }] }),
      envelope('notes', { posts: [{ ...note('extra'), unexpected: 'must not disappear silently' }] }),
      envelope('notes', { posts: [{ ...note('too-long'), notes: 'x'.repeat(1_000_001) }] }),
      envelope('notes', { posts: Array.from({ length: 10_001 }, (_, index) => ({ id: `n-${index}` })) }),
      envelope('backup', { feeds: [], posts: [] }),
      JSON.parse('{"version":1,"kind":"notes","exportedAt":"2026-10-15T10:00:00Z","posts":[],"__proto__":{"polluted":true}}'),
    ];
    const beforeInvalid = await store.getTransferSnapshot();
    for (const invalid of invalidFiles) await assert.rejects(store.previewTransferImport(invalid), error => error.status === 400);
    await assert.rejects(store.previewTransferImport(envelope('notes', { posts: [{ notes: 'x'.repeat(store.MAX_TRANSFER_BYTES) }] })), error => error.status === 413);
    await assert.rejects(store.previewTransferImport(envelope('notes', { posts: [] }), 'replace'), error => error.status === 400);
    await assert.rejects(store.applyTransferImport(orphan, 'merge', 'skip'), error => error.status === 400);
    assert.equal((await store.getTransferSnapshot()).revision, beforeInvalid.revision);
    assert.equal((await store.listTransferBackups()).length, beforeInvalid.backups.length);
    assert.equal({}.polluted, undefined);
    groups++;

    const humanBackup = path.join(dataDirectory, 'backups', 'my-personal-backup.json');
    await fsp.writeFile(humanBackup, '{"keep":true}');
    for (let index = 0; index < 12; index++) {
      const input = envelope('notes', { posts: [note(`retention-${index}`)] });
      preview = await store.previewTransferImport(input);
      await store.applyTransferImport(input, 'merge', 'skip', preview.revision);
    }
    assert.equal((await store.listTransferBackups()).length, 10);
    assert.equal(await fsp.readFile(humanBackup, 'utf8'), '{"keep":true}');
    await assert.rejects(store.readTransferBackup('../db.json'), error => error.status === 400);
    await assert.rejects(store.readTransferBackup('my-personal-backup.json'), error => error.status === 400);
    groups++;

    const blockedBackupStore = load('src/lib/transfer-store.ts', {
      '@/lib/db': database, '@/lib/rss': rss,
      'fs/promises': { ...fsp, writeFile: async (filename, ...args) => {
        if (String(filename).includes(`${path.sep}backups${path.sep}`)) throw new Error('Simulated backup write failure');
        return fsp.writeFile(filename, ...args);
      } },
    });
    const rollbackInput = envelope('notes', { posts: [note('failed-backup')] });
    preview = await store.previewTransferImport(rollbackInput);
    await assert.rejects(blockedBackupStore.applyTransferImport(rollbackInput, 'merge', 'skip', preview.revision), /Simulated backup write failure/);
    assert.equal((await store.getTransferSnapshot()).revision, preview.revision);
    const blockedCleanupStore = load('src/lib/transfer-store.ts', {
      '@/lib/db': database, '@/lib/rss': rss,
      'fs/promises': { ...fsp, rm: async (filename, options) => {
        if (String(filename).includes(`${path.sep}backups${path.sep}`) && String(filename).endsWith('.json')) throw new Error('Simulated retention failure');
        return fsp.rm(filename, options);
      } },
    });
    const cleanupInput = envelope('notes', { posts: [note('successful-despite-cleanup')] });
    preview = await store.previewTransferImport(cleanupInput);
    const cleanupResult = await blockedCleanupStore.applyTransferImport(cleanupInput, 'merge', 'skip', preview.revision);
    assert.equal(cleanupResult.success, true);
    assert.ok(cleanupResult.preview.warnings.some(warning => warning.includes('nettoyage')));
    assert.ok((await database.getDb()).posts.some(item => item.id === 'successful-despite-cleanup'));
    groups++;

    class NextResponse extends Response {
      static json(value, init = {}) { return new NextResponse(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } }); }
    }
    // Keep real origin/CSRF behavior while the store fixture authorizes this
    // isolated owner. Origin checks now live in the shared authentication guard.
    const auth = load('src/lib/auth.ts', {
      'next/server': { NextResponse },
      'next/headers': { cookies: () => ({ get: () => undefined }) },
      '@/lib/auth-store': { AUTH_COOKIE: 'redaction_session', getSession: async () => ({ email: 'fixture@example.com', name: 'Fixture' }) },
    });
    const route = load('src/app/api/transfer/route.ts', { '@/lib/auth': auth, '@/lib/transfer-store': store, 'next/server': { NextResponse } });
    const apiRequest = (body, extra = {}) => new Request('http://localhost/api/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', ...extra }, body: JSON.stringify(body) });
    let response = await route.GET(new Request('http://localhost/api/transfer'));
    assert.equal(response.status, 200);
    const apiSnapshot = await response.json();
    response = await route.POST(apiRequest({ action: 'preview', data: envelope('notes', { posts: [note('api-note')] }) }));
    assert.equal(response.status, 200);
    const apiPreview = await response.json();
    response = await route.POST(apiRequest({ action: 'apply', data: apiPreview.data, mode: 'merge', duplicates: 'skip', expectedRevision: apiPreview.revision }));
    assert.equal(response.status, 200);
    const applied = await response.json();
    assert.equal(applied.success, true);
    assert.equal(applied.preview.summary.posts.added, 1);
    response = await route.GET(new Request(`http://localhost/api/transfer?backup=${encodeURIComponent(applied.backup.id)}`));
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-disposition').includes(applied.backup.id));
    assert.equal((await response.json()).kind, 'backup');
    response = await route.POST(apiRequest({ action: 'preview', data: orphan }, { Origin: 'https://other.example' }));
    assert.equal(response.status, 403);
    const canonicalizedRequest = (origin, extra = {}) => new Request('http://localhost:3001/api/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Host: '127.0.0.1:3001', Origin: origin, 'Sec-Fetch-Site': 'same-origin', ...extra },
      body: JSON.stringify({ action: 'preview', data: orphan }),
    });
    response = await route.POST(canonicalizedRequest('http://127.0.0.1:3001'));
    assert.equal(response.status, 200, 'actual Host matches browser origin despite Next canonicalizing request.url');
    response = await route.POST(canonicalizedRequest('https://127.0.0.1:3001', { 'X-Forwarded-Proto': 'https' }));
    assert.equal(response.status, 200, 'a validated forwarded protocol supports HTTPS termination');
    response = await route.POST(canonicalizedRequest('https://evil.example', { 'X-Forwarded-Host': 'evil.example' }));
    assert.equal(response.status, 403, 'an arbitrary forwarded host must never expand the allowed origin');
    response = await route.POST(canonicalizedRequest('http://127.0.0.1:3001', { 'Sec-Fetch-Site': 'cross-site' }));
    assert.equal(response.status, 403);
    response = await route.POST(canonicalizedRequest('http://127.0.0.1:3001', { Host: '127.0.0.1:3001/invalid' }));
    assert.equal(response.status, 403);
    context.process.env.AUTH_ORIGIN = 'https://redaction.example';
    try {
      response = await route.POST(canonicalizedRequest('http://127.0.0.1:3001'));
      assert.equal(response.status, 403, 'configured AUTH_ORIGIN overrides the request host');
      response = await route.POST(apiRequest({ action: 'preview', data: orphan }, { Origin: 'https://redaction.example' }));
      assert.equal(response.status, 200, 'transfer uses the shared pinned origin policy');
    } finally { delete context.process.env.AUTH_ORIGIN; }
    response = await route.POST(new Request('http://localhost/api/transfer', { method: 'POST', body: '{broken-json' }));
    assert.equal(response.status, 403, 'requests without Origin are rejected before reading the body');
    response = await route.POST(apiRequest({ action: 'preview', data: orphan }, { 'Content-Length': String(store.MAX_TRANSFER_BYTES + 1) }));
    assert.equal(response.status, 413);
    response = await route.POST(new Request('http://localhost/api/transfer', { method: 'POST', headers: { Origin: 'http://localhost' }, body: '{broken-json' }));
    assert.equal(response.status, 400);
    response = await route.GET(new Request('http://localhost/api/transfer?backup=..%2Fdb.json'));
    assert.equal(response.status, 400);
    assert.equal(apiSnapshot.data.kind, 'backup');
    assert.ok(applied.backups.length <= 10, 'a later successful maintenance restores the retention limit');
    groups++;
    await reset();
    const multiSourceNote = { ...note('note-a'), revision: 999, sources: [{ articleId: article(1).id, title: article(1).title, link: article(1).link, feed: source.name }, { articleId: 'foreign-reference', title: 'Second recoupement', link: article(3).link, feed: source.name, excerpt: 'Un fait supplémentaire' }] };
    const multiImport = envelope('backup', { feeds: [source], posts: [multiSourceNote], savedArticles: [{ ...article(3), id: 'foreign-reference' }] });
    preview = await store.previewTransferImport(multiImport, 'merge', 'update');
    await store.applyTransferImport(multiImport, 'merge', 'update', preview.revision);
    current = await database.getDb();
    assert.equal(current.posts[0].revision, 1, 'imported revision is never a local concurrency token');
    assert.equal(current.posts[0].sources.length, 2);
    assert.equal(current.posts[0].sources[1].articleId, article(3).id, 'every source is remapped after imported article migration');
    assert.equal(current.posts[0].sources[1].excerpt, 'Un fait supplémentaire');
    const oldBackup = envelope('backup', { feeds: [source], posts: [{ ...multiSourceNote, revision: 0 }], savedArticles: [] });
    preview = await store.previewTransferImport(oldBackup, 'replace', 'skip');
    await store.applyTransferImport(oldBackup, 'replace', 'skip', preview.revision);
    assert.equal((await database.getDb()).posts[0].revision, 2, 'restoring an older backup invalidates open editors');
    const beforeInvalidSource = (await store.getTransferSnapshot()).revision;
    await assert.rejects(store.previewTransferImport(envelope('notes', { posts: [{ ...multiSourceNote, sources: [{ title: 'Invalid', link: 'javascript:alert(1)', feed: 'Test' }] }] })), error => error.status === 400);
    assert.equal((await store.getTransferSnapshot()).revision, beforeInvalidSource);
    groups++;
    console.log(`Transfer store: ${groups} groups passed (temporary database only, no network).`);
  } finally { await fsp.rm(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
