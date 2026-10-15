/* Run with: node scripts/test-transfer-formats.cjs. Fixtures stay in memory; no application data is opened. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { File } = require('node:buffer');
const ts = require('typescript');
const { zipSync, unzipSync } = require('fflate');

const sourcePath = path.resolve(__dirname, '../src/lib/transfer-formats.ts');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'rss-transfer-formats-'));
const outputPath = path.join(temporaryDirectory, 'transfer-formats.cjs');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
fs.writeFileSync(outputPath, output);
const loaded = new Module(outputPath, module);
loaded.filename = outputPath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(output, outputPath);
const { buildTransferExport, parseTransferFiles, noteMarkdown, createTransferData } = loaded.exports;
const encode = (text) => new TextEncoder().encode(text);
const decode = (bytes) => new TextDecoder().decode(bytes);
const file = (name, value) => new File([typeof value === 'string' ? encode(value) : value], name);
let count = 0;
async function test(name, callback) {
  await callback(); count++; console.log(`✓ ${name}`);
}
async function roundtrip(data, target, format) {
  const result = await buildTransferExport(data, target, format);
  const parsed = await parseTransferFiles([file(result.filename, result.bytes)], target);
  return { ...parsed, result };
}
const content = {
  tiktok: { hook: 'Pourquoi ? 📰', script: 'Texte à voix haute\n第二行', visualNotes: 'Image & citation', durationEstimate: '45 s' },
  instagram: { caption: 'Édition spéciale, « liberté »', carouselSlides: ['Une\nligne', 'العربية 🌍'], hashtags: ['#presse', '#été'] },
  linkedin: { title: 'L’information indépendante', body: 'Sources et analyses.\n\nVérifier.', keyTakeaways: ['Premier point', 'الثاني'] },
};
const post = {
  id: 'note-unicode-α', angle: 'Une enquête : été à São Paulo 🗞️', notes: 'Texte brut\n\n## Citation\n« Bonjour » & café.\n</script><img src=x onerror=alert(1)>',
  articleId: 'article-1', sourceArticleTitle: 'Le titre & sa source', sourceArticleLink: 'https://example.org/article?lang=fr&a=1', sourceArticleFeed: 'Média indépendant',
  tags: ['culture', 'à vérifier', '日本'], status: 'in_progress', scheduledDate: '2026-10-20', scheduledTime: '18:45',
  platforms: ['tiktok', 'instagram', 'linkedin'], content,
  createdAt: '2026-10-15T08:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z',
};
const secondPost = { ...post, id: 'note-2', angle: 'Deuxième note', notes: 'Autre texte' };
const feed = { id: 'feed-test', name: 'Écologie & société 日本', url: 'https://example.org/rss.xml?a=1&b=2', website: 'https://example.org', category: 'sustainability', language: 'fr', enabled: false, favicon: 'https://example.org/icon.svg' };
const article = {
  id: 'article-1', feedId: feed.id, feedName: feed.name, feedLanguage: 'fr', category: 'sustainability', title: '=HYPERLINK("https://example.org","Été")',
  link: 'https://example.org/article', pubDate: '2026-10-15T08:00:00.000Z', author: " +Auteur d’été", snippet: 'Un extrait, avec "citation"\net plusieurs lignes.',
  content: '<p>Texte &amp; citation<br>日本 🌍</p>', imageUrl: 'https://example.org/image.jpg', saved: true, read: false,
};
const backup = { version: 1, kind: 'backup', exportedAt: '2026-10-15T12:00:00.000Z', feeds: [feed], posts: [post], savedArticles: [article], cachedArticles: [{ ...article, id: 'cache-2', saved: false }], readArticleIds: ['cache-2'], lastFetchedAt: '2026-10-15T11:00:00.000Z' };
const notes = { ...createTransferData('notes'), posts: [post] };

(async () => {
  await test('JSON backup roundtrip preserves every collection and Unicode field', async () => {
    const { data } = await roundtrip(backup, 'backup', 'json'); assert.deepEqual(data, backup);
  });
  await test('raw database JSON and native note arrays are accepted', async () => {
    const { version, kind, exportedAt, ...raw } = backup;
    const parsed = await parseTransferFiles([file('db.json', JSON.stringify(raw))], 'backup');
    for (const key of Object.keys(raw)) assert.deepEqual(parsed.data[key], raw[key]);
    const native = await parseTransferFiles([file('notes.json', JSON.stringify([post]))], 'notes'); assert.deepEqual(native.data.posts, [post]);
  });
  await test('external notes and articles aliases get only missing defaults', async () => {
    const note = await parseTransferFiles([file('external.json', JSON.stringify({ notes: [{ title: 'Été', body: 'Texte' }] }))], 'notes');
    assert.equal(note.data.posts[0].angle, 'Été'); assert.equal(note.data.posts[0].notes, 'Texte'); assert.equal(note.data.posts[0].status, 'idea');
    const items = await parseTransferFiles([file('articles.json', JSON.stringify({ articles: [{ title: 'Titre', url: 'https://example.org', source: 'Presse', summary: 'Extrait' }] }))], 'articles');
    assert.equal(items.data.savedArticles[0].link, 'https://example.org'); assert.equal(items.data.savedArticles[0].snippet, 'Extrait');
  });
  await test('JSON does not add an absent optional notes field', async () => {
    const { notes: absent, ...withoutNotes } = post;
    const { data } = await roundtrip({ ...notes, posts: [withoutNotes] }, 'notes', 'json'); assert.deepEqual(data.posts, [withoutNotes]);
  });
  await test('invalid JSON, unsupported versions, malformed root and collections fail', async () => {
    for (const value of ['{oops', 'null', '42', JSON.stringify({ version: 9, posts: [] }), JSON.stringify({ posts: {} }), JSON.stringify({ posts: ['bad'] }), JSON.stringify({ feeds: [] }), JSON.stringify({ kind: 'unknown', posts: [] })]) {
      await assert.rejects(parseTransferFiles([file('invalid.json', value)], 'notes'));
    }
    await assert.rejects(parseTransferFiles([file('db.json', JSON.stringify({ feeds: [], posts: [] }))], 'backup'), /savedArticles/);
    await assert.rejects(parseTransferFiles([file('db.json', JSON.stringify({ ...backup, readArticleIds: [42] }))], 'backup'), /readArticleIds/);
  });
  await test('native Markdown preserves all metadata and social channels', async () => {
    const parsed = await parseTransferFiles([file('note.md', noteMarkdown(post))], 'notes'); assert.deepEqual(parsed.data.posts, [post]);
  });
  await test('external Markdown keeps its text and safe YAML metadata', async () => {
    const parsed = await parseTransferFiles([file('external.md', '---\ntitle: Été\ntags: [presse, 日本]\nstatus: ready\n---\n# Titre\n\nTexte 📰')], 'notes');
    assert.equal(parsed.data.posts[0].angle, 'Été'); assert.equal(parsed.data.posts[0].status, 'ready'); assert.deepEqual(parsed.data.posts[0].tags, ['presse', '日本']); assert.match(parsed.data.posts[0].notes, /Texte 📰/);
  });
  await test('Markdown YAML aliases, malformed YAML and invalid native metadata fail', async () => {
    for (const text of ['---\na: &a [x]\nb: *a\n---\nTexte', '---\ntitle: [\n---\nTexte', '---\nrss_note:\n  version: 2\n  post: {}\n---\nTexte']) await assert.rejects(parseTransferFiles([file('bad.md', text)], 'notes'));
  });
  await test('native HTML preserves notes and escapes closing script payloads', async () => {
    const { data, result } = await roundtrip(notes, 'notes', 'html'); assert.deepEqual(data.posts, [post]);
    const html = decode(result.bytes); assert.equal((html.match(/<script\b/g) || []).length, 1); assert.equal((html.match(/<\/script>/g) || []).length, 1); assert.ok(html.includes('\\u003c/script\\u003e'));
  });
  await test('external HTML imports text and excludes scripts', async () => {
    const parsed = await parseTransferFiles([file('external.html', '<!doctype html><html><head><title>Document</title></head><body><h1>Été &amp; liberté</h1><p>Texte 日本<br>Deuxième ligne</p><script>alert("secret")</script></body></html>')], 'notes');
    assert.equal(parsed.data.posts[0].angle, 'Été & liberté'); assert.match(parsed.data.posts[0].notes, /Texte 日本\nDeuxième ligne/); assert.ok(!parsed.data.posts[0].notes.includes('secret')); assert.ok(parsed.warnings.length);
  });
  await test('TXT is text-only and warns about missing metadata', async () => {
    const parsed = await parseTransferFiles([file('Été.txt', 'Texte 🌍\nLigne 2')], 'notes'); assert.equal(parsed.data.posts[0].angle, 'Été'); assert.equal(parsed.data.posts[0].notes, 'Texte 🌍\nLigne 2'); assert.ok(parsed.warnings.length);
    const exported = await buildTransferExport(notes, 'notes', 'txt'); assert.ok(exported.warnings.length); assert.ok(!decode(exported.bytes).includes('rss_note'));
  });
  await test('native OPML roundtrip preserves categories, languages, enabled and favicon', async () => {
    const { data } = await roundtrip({ ...createTransferData('feeds'), feeds: [feed, { ...feed, id: 'feed-en', language: 'en', enabled: true }] }, 'feeds', 'opml');
    assert.deepEqual(data.feeds, [feed, { ...feed, id: 'feed-en', language: 'en', enabled: true }]);
  });
  await test('OPML folders recurse and escaped XML entities decode', async () => {
    const parsed = await parseTransferFiles([file('nested.opml', '<?xml version="1.0"?><opml version="2.0"><body><outline text="Dossier"><outline text="Sous-dossier"><outline type="rss" text="Presse &amp; société" xmlUrl="https://example.org/rss?a=1&amp;b=2" htmlUrl="https://example.org" category="business" language="en" enabled="false" /></outline></outline></body></opml>')], 'feeds');
    assert.equal(parsed.data.feeds.length, 1); assert.equal(parsed.data.feeds[0].name, 'Presse & société'); assert.equal(parsed.data.feeds[0].url, 'https://example.org/rss?a=1&b=2'); assert.equal(parsed.data.feeds[0].enabled, false);
  });
  await test('empty OPML roundtrip works without reinserting default sources', async () => {
    const { data } = await roundtrip({ ...createTransferData('feeds'), feeds: [] }, 'feeds', 'opml'); assert.deepEqual(data.feeds, []);
  });
  await test('OPML external entities and malformed XML are rejected', async () => {
    for (const text of ['<!DOCTYPE opml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><opml><body>&xxe;</body></opml>', '<opml><body><outline></body></opml>', '<rss><channel /></rss>']) await assert.rejects(parseTransferFiles([file('bad.opml', text)], 'feeds'));
  });
  await test('CSV native roundtrip preserves quotes, multiline Unicode and protected formulas', async () => {
    const csvData = { ...createTransferData('articles'), savedArticles: [article], cachedArticles: [{ ...article, id: 'cache-2' }] };
    const { data, result } = await roundtrip(csvData, 'articles', 'csv'); assert.deepEqual(data.savedArticles, csvData.savedArticles); assert.deepEqual(data.cachedArticles, csvData.cachedArticles);
    const text = decode(result.bytes); assert.ok(text.includes('"\'=HYPERLINK')); assert.ok(text.includes('"\' +Auteur')); assert.equal(result.bytes[0], 0xef);
  });
  await test('external semicolon CSV accepts BOM, escaped quotes and multiline fields', async () => {
    const parsed = await parseTransferFiles([file('external.csv', '\uFEFFTitre;URL;Source;Résumé;Lu\r\n"Été, "+""citation""";https://example.org;Média;"Deux lignes\n日本";oui\r\n'.replace('"+',''))], 'articles');
    assert.equal(parsed.data.savedArticles[0].title, 'Été, "citation"'); assert.equal(parsed.data.savedArticles[0].snippet, 'Deux lignes\n日本'); assert.equal(parsed.data.savedArticles[0].read, true);
  });
  await test('CSV malformed quoting, wrong column count and duplicate headers fail', async () => {
    for (const value of ['title,link\n"bad,https://example.org', 'title,link\nA,B,C', 'title,title\nA,B', 'title,link\n"A"oops,B']) await assert.rejects(parseTransferFiles([file('bad.csv', value)], 'articles'));
  });
  await test('article Markdown and HTML native roundtrips preserve collections', async () => {
    for (const format of ['md', 'html']) { const { data } = await roundtrip(backup, 'articles', format); assert.deepEqual(data.savedArticles, backup.savedArticles); assert.deepEqual(data.cachedArticles, backup.cachedArticles); assert.deepEqual(data.readArticleIds, backup.readArticleIds); }
  });
  await test('article exports deduplicate readable rows without losing collection snapshots', async () => {
    const duplicate = { ...article, title: 'Titre dans le cache', snippet: 'Version cache' };
    const values = { ...createTransferData('articles'), savedArticles: [article], cachedArticles: [duplicate] };
    const csv = await roundtrip(values, 'articles', 'csv');
    assert.deepEqual(csv.data.savedArticles, [article]); assert.deepEqual(csv.data.cachedArticles, [duplicate]);
    assert.ok(decode(csv.result.bytes).includes('savedArticles|cachedArticles'));
    const html = await buildTransferExport(values, 'articles', 'html'); assert.equal((decode(html.bytes).match(/<article>/g) || []).length, 1);
  });
  await test('multi-note ZIP roundtrips import native manifest once for every text format', async () => {
    for (const format of ['md', 'html', 'txt']) {
      const { data, result } = await roundtrip({ ...notes, posts: [post, secondPost] }, 'notes', format);
      assert.equal(result.mime, 'application/zip'); assert.deepEqual(data.posts, [post, secondPost]);
      const entries = unzipSync(result.bytes); assert.equal(Object.keys(entries).length, 3); assert.ok(entries['rss-transfer-manifest.json']);
    }
  });
  await test('external ZIP imports supported nested files and warns about ignored assets', async () => {
    const bytes = zipSync({ 'folder/Été.md': encode('# Été\n\nTexte 📰'), 'second.txt': encode('Second texte'), 'image.png': new Uint8Array([1, 2, 3]), '__MACOSX/._note': encode('Ignored') });
    const parsed = await parseTransferFiles([file('notes.zip', bytes)], 'notes'); assert.equal(parsed.data.posts.length, 2); assert.ok(parsed.warnings.some((message) => message.includes('image.png')));
  });
  await test('ZIP traversal, corrupt ZIP, empty archives and incompatible targets fail', async () => {
    await assert.rejects(parseTransferFiles([file('bad.zip', zipSync({ '../escape.txt': encode('bad') }))], 'notes'), /chemin/);
    await assert.rejects(parseTransferFiles([file('bad.zip', new Uint8Array([1, 2, 3]))], 'notes'), /ZIP/);
    await assert.rejects(parseTransferFiles([file('empty.zip', zipSync({}))], 'notes'), /Aucun fichier/);
    await assert.rejects(parseTransferFiles([file('wrong.zip', zipSync({ 'n.txt': encode('n') }))], 'feeds'), /Notes/);
  });
  await test('invalid UTF-8 and unsupported formats are rejected', async () => {
    await assert.rejects(parseTransferFiles([file('bad.txt', new Uint8Array([0xff, 0xfe, 0x80]))], 'notes'), /UTF-8/);
    await assert.rejects(parseTransferFiles([file('image.png', new Uint8Array([1, 2]))], 'notes'), /format/);
    await assert.rejects(parseTransferFiles([], 'notes'), /au moins/);
    await assert.rejects(buildTransferExport(notes, 'notes', 'opml'), /compatible/);
    await assert.rejects(buildTransferExport({ ...notes, posts: [] }, 'notes', 'md'), /Aucune note/);
  });
  await test('multiple files merge without dropping note metadata', async () => {
    const parsed = await parseTransferFiles([file('first.md', noteMarkdown(post)), file('second.json', JSON.stringify({ posts: [secondPost] }))], 'notes'); assert.deepEqual(parsed.data.posts, [post, secondPost]);
  });
  console.log(`\n${count} transfer-format checks passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); });
