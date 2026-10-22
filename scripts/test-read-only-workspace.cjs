const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const note = (id, notes) => ({ id, revision: 1, angle: `Sujet ${id}`, notes, status: 'ready', tags: ['Économie'], platforms: ['linkedin'], sources: [], content: { tiktok: { hook: '', script: '', visualNotes: '', durationEstimate: '' }, instagram: { caption: '', carouselSlides: [], hashtags: [] }, linkedin: { title: 'Économie circulaire', body: 'Publication complète conservée.', keyTakeaways: ['Vérifier la source'] } }, createdAt: '2026-10-19T08:00:00Z', updatedAt: '2026-10-19T08:00:00Z' });
const textOf = node => node == null || node === false ? '' : typeof node !== 'object' ? String(node) : (node.props?.children || []).map(textOf).join('');
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
function harness() {
  const values = new Map(); const events = new Map(); const blobs = []; const downloads = []; const requests = [];
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const props = { database: { feeds: [], posts: [note('saved', 'Texte enregistré')], cachedArticles: [], savedArticles: [{ id: 'article', title: 'Une archive locale', feedName: 'Journal', content: '<p>Paragraphe complet disponible hors abonnement.</p>', snippet: '', pubDate: '2026-10-19T08:00:00Z', link: 'https://journal.example.test/article' }], lastFetchedAt: null }, draftStorageKey: 'redaction:note-drafts:alice@example.test' };
  let response = { ok: true, status: 200, blob: async () => new Blob(['{"posts":[]}'], { type: 'application/json' }) };
  const slots = []; let cursor = 0; let pending = []; let rerender = false; let tree;
  const react = {
    Fragment: Symbol('Fragment'),
    createElement(type, attributes, ...children) {
      const props = { ...attributes, children: children.flat(Infinity) };
      // NoteContents is a stateless rendering function, not an external boundary.
      return typeof type === 'function' && type.name === 'NoteContents' ? type(props) : { type, props };
    },
    useState(initial) { const index = cursor++; slots[index] ||= { value: initial }; const slot = slots[index]; return [slot.value, value => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; rerender = true; } }]; },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useEffect(fn, deps) { const index = cursor++; const previous = slots[index]; if (!previous || !sameDeps(previous.deps, deps)) { slots[index] = { deps }; pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  }; react.default = react; react.__esModule = true;
  const Reader = function ReaderBoundary() {};
  const context = { console, React: react, Date, JSON, Map, Set, Object, Array, Number, String, Error, Promise, Intl, Blob, crypto: { randomUUID }, setTimeout() {},
    URL: { createObjectURL(blob) { blobs.push(blob); return `blob:${blobs.length}`; }, revokeObjectURL() {} },
    window: { localStorage: storage, addEventListener: (event, fn) => events.set(event, fn), removeEventListener: event => events.delete(event) },
    document: { createElement() { return { click() { downloads.push({ filename: this.download, href: this.href }); } }; } },
  };
  const cache = new Map();
  function load(relative) {
    const filename = path.join(root, relative); if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const requireLocal = name => {
      if (name === 'react') return react;
      if (name === 'next/link') return { __esModule: true, default: 'a' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : key });
      if (name === './ArticleReader') return { ArticleReader: Reader };
      if (name === './dialog') return { safeWebUrl: value => /^https?:\/\//.test(value) ? value : undefined };
      if (name === '@/lib/auth-client') return { authenticatedFetch: async (url, init) => { requests.push({ url, init }); return response; } };
      if (name === './auth-client') return requireLocal('@/lib/auth-client');
      if (name.endsWith('.css')) return {};
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      return require(name);
    };
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    vm.runInNewContext(compiled, { ...context, module, exports: module.exports, require: requireLocal }, { filename });
    return module.exports;
  }
  const Component = load('src/components/Newsroom/ReadOnlyWorkspace.tsx').ReadOnlyWorkspace;
  function render() {
    let loops = 0;
    do { assert.ok(++loops < 20); cursor = 0; pending = []; rerender = false; tree = Component(props); pending.forEach(effect => effect()); } while (rerender);
  }
  function nodes() { const result = []; const visit = node => { if (!node || typeof node !== 'object') return; result.push(node); node.props?.children?.forEach(visit); }; visit(tree); return result; }
  const find = predicate => { const result = nodes().find(predicate); assert.ok(result, 'Expected UI element missing'); return result; };
  const draftModule = load('src/lib/note-drafts.ts');
  return { props, render, storage, values, blobs, downloads, requests, nodes, find, Reader, text: () => textOf(tree), draftModule,
    response(value) { response = value; }, async tick() { for (let i = 0; i < 15; i++) await Promise.resolve(); render(); },
    storageEvent(key) { events.get('storage')?.({ key }); render(); },
  };
}
(async () => {
  const h = harness();
  const ownDraft = note('local', 'Brouillon local après résiliation');
  h.draftModule.writeNoteDraft(h.storage, h.props.draftStorageKey, 'one', ownDraft);
  h.draftModule.writeNoteDraft(h.storage, h.props.draftStorageKey, 'two', ownDraft);
  h.draftModule.writeNoteDraft(h.storage, 'redaction:note-drafts:bob@example.test', 'one', note('foreign', 'COPIE AUTRE COMPTE'));
  h.render();
  assert.match(h.text(), /Brouillon local après résiliation/);
  assert.doesNotMatch(h.text(), /COPIE AUTRE COMPTE/);
  assert.equal(h.nodes().filter(node => node.type === 'button' && textOf(node) === 'Télécharger cette copie locale').length, 1, 'identical local snapshots are shown once');
  assert.match(h.text(), /Publication complète conservée/); assert.match(h.text(), /Vérifier la source/);
  const before = [...h.values];
  h.find(node => node.type === 'button' && textOf(node) === 'Télécharger cette copie locale').props.onClick(); h.render();
  assert.equal(JSON.parse(await h.blobs[0].text()).posts[0].notes, ownDraft.notes);
  assert.deepEqual([...h.values], before, 'viewing and exporting never remove local recovery copies');
  const search = () => h.find(node => node.type === 'input' && node.props.type === 'search');
  search().props.onChange({ target: { value: 'economie circulaire' } }); h.render();
  assert.match(h.text(), /Texte enregistré/); assert.doesNotMatch(h.text(), /Aucun.*note ne correspond/);
  search().props.onChange({ target: { value: 'paragraphe complet' } }); h.render();
  h.find(node => node.type === 'button' && textOf(node) === 'Une archive locale').props.onClick(); h.render();
  const reader = h.find(node => node.type === h.Reader);
  assert.equal(reader.props.readOnly, true); assert.match(reader.props.article.content, /Paragraphe complet/);
  assert.equal(reader.props.onCreateNote, undefined); assert.equal(reader.props.onToggleRead, undefined);
  search().props.onChange({ target: { value: '' } }); h.render();
  const exportButton = () => h.find(node => node.type === 'button' && /Télécharger mes données enregistrées|Préparation du fichier/.test(textOf(node)));
  h.response({ ok: false, status: 503, json: async () => ({ error: 'Stockage temporairement indisponible.' }) });
  exportButton().props.onClick(); h.render(); assert.equal(exportButton().props.disabled, true);
  await h.tick(); assert.match(h.text(), /Stockage temporairement indisponible/); assert.equal(exportButton().props.disabled, false);
  h.response({ ok: true, status: 200, blob: async () => new Blob(['{"posts":["saved"]}'], { type: 'application/json' }) });
  exportButton().props.onClick(); await h.tick();
  assert.match(h.text(), /Fichier prêt/); assert.doesNotMatch(h.text(), /Stockage temporairement indisponible/);
  assert.equal(h.downloads.at(-1).filename, 'la-redaction-sauvegarde.json');
  assert.deepEqual(h.requests.map(request => request.url), ['/api/account/export', '/api/account/export']);
  h.props.draftStorageKey = 'redaction:note-drafts:bob@example.test'; h.render();
  assert.match(h.text(), /COPIE AUTRE COMPTE/); assert.doesNotMatch(h.text(), /Brouillon local après résiliation/);
  console.log('Read-only workspace: full social text, accent/body search, tenant-scoped local copies, lossless downloads, read-only reader and failed-export retry passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
