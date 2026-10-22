const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

// Exercise the real page, navigation hook and reader handlers with controlled
// response timing. Child workspaces are boundaries, not reimplementations.
const root = path.resolve(__dirname, '..');
const compiled = new Map();
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
const textOf = node => node == null || node === false ? '' : typeof node !== 'object' ? String(node) : (node.props?.children || []).map(textOf).join('');
const plain = value => JSON.parse(JSON.stringify(value));
const note = (id, angle = id) => ({ id, revision: 1, angle, notes: '', sources: [], tags: [], status: 'idea', platforms: [], content: { tiktok: { hook: '', script: '', visualNotes: '', durationEstimate: '' }, instagram: { caption: '', carouselSlides: [], hashtags: [] }, linkedin: { title: '', body: '', keyTakeaways: [] } }, createdAt: '2026-10-19T08:00:00Z', updatedAt: '2026-10-19T08:00:00Z' });
const article = id => ({ id, feedId: 'feed-1', feedName: 'Journal', feedLanguage: 'fr', category: 'general', title: `Article ${id}`, link: `https://journal.example/${id}`, snippet: '', content: '', pubDate: '2026-10-19T08:00:00Z', read: false, saved: false });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }

function makeHarness(options = {}) {
  const slots = []; let cursor = 0; let pending = []; let rerender = false; let tree;
  const events = new Map(); const documentEvents = new Map();
  const session = new Map(); const requests = [];
  const markers = Object.fromEntries(['ArticleReader', 'SourceManager', 'NotesWorkspace', 'TransferWorkspace', 'SessionControls'].map(name => [name, function Boundary() {}]));
  const props = options.reader ? { article: article('a'), notes: [], notesLoading: false, notesError: '', onRetryNotes() {}, onClose() { props.article = null; }, onToggleSave: async () => {}, onToggleRead: async () => {}, onCreateNote: async () => {}, onAttachToNote: async () => {}, onReadAndNext: async () => {}, ...options.props } : { owner: { name: 'Camille', email: 'camille@example.test' } };
  const react = {
    createElement(type, attributes, ...children) { return { type, props: { ...attributes, children: children.flat(Infinity) } }; }, Fragment: Symbol('Fragment'),
    useRef(value) { const index = cursor++; if (!slots[index]) slots[index] = { current: value }; return slots[index]; },
    useState(value) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof value === 'function' ? value() : value }; const slot = slots[index]; return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; rerender = true; } }]; },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++; const previous = slots[index]; if (!previous || !sameDeps(previous.deps, deps)) { slots[index] = { deps, cleanup: previous?.cleanup }; pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
    useId() { const index = cursor++; if (!slots[index]) slots[index] = { value: `id-${index}` }; return slots[index].value; },
  }; react.default = react; react.__esModule = true;
  const addListener = (map, event, fn) => { if (!map.has(event)) map.set(event, new Set()); map.get(event).add(fn); };
  let location = new URL('http://localhost/espace'); let historyIndex = 0;
  const historyEntries = [{ state: {}, href: location.href }];
  const history = {
    get state() { return historyEntries[historyIndex].state; }, scrollRestoration: 'auto',
    replaceState(state, title, href) { if (href) location = new URL(href, location); historyEntries[historyIndex] = { state, href: location.href }; },
    pushState(state, title, href) { if (href) location = new URL(href, location); historyEntries.splice(++historyIndex); historyEntries.push({ state, href: location.href }); },
    back() { if (!historyIndex) return; historyIndex -= 1; location = new URL(historyEntries[historyIndex].href); events.get('popstate')?.forEach(fn => fn({ state: historyEntries[historyIndex].state })); },
  };
  const storage = { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) };
  const window = { history, get location() { return location; }, scrollY: 0, scrollTo({ top }) { window.scrollY = top; }, addEventListener: (event, fn) => addListener(events, event, fn), removeEventListener: (event, fn) => events.get(event)?.delete(fn) };
  const document = { visibilityState: 'visible', addEventListener: (event, fn) => addListener(documentEvents, event, fn), removeEventListener: (event, fn) => documentEvents.get(event)?.delete(fn), getElementById() { return null; } };
  async function authenticatedFetch(url, init = {}) {
    const request = { url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined, deferred: deferred() };
    requests.push(request);
    if (options.network) {
      const result = options.network(request);
      if (result !== undefined) return result;
    }
    if (url === '/api/feeds') return response({ feeds: [{ id: 'feed-1', name: 'Journal', url: 'https://journal.example/rss', website: 'https://journal.example', language: 'fr', category: 'general', enabled: true }] });
    if (url.startsWith('/api/rss')) return response({ articles: options.articles || [], savedArticles: [], health: [], needsRefresh: false });
    if (url === '/api/posts' && request.method === 'GET' && !options.deferPosts) return response({ posts: options.posts || [] });
    return request.deferred.promise;
  }
  const cache = new Map();
  const context = vm.createContext({ console, React: react, Date, JSON, Map, Set, Object, Array, Number, String, Error, Promise, Intl, URL, URLSearchParams, crypto: { randomUUID }, window, document, sessionStorage: storage,
    setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {},
  });
  function load(relative) {
    const filename = path.join(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    if (!compiled.has(filename)) compiled.set(filename, ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText);
    const module = { exports: {} }; cache.set(filename, module);
    const localRequire = name => {
      if (name === 'react') return react;
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : key });
      if (name.endsWith('.css')) return {};
      if (name === './dialog') return { useDialogAccessibility() {}, safeWebUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } } };
      if (name === '@/lib/auth-client') return { authenticatedFetch };
      if (name === './useWorkspaceNavigation') return load('src/components/Newsroom/useWorkspaceNavigation.ts');
      for (const [key, marker] of Object.entries(markers)) if (name.endsWith(`/${key}`)) return { [key]: marker };
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      throw new Error(`Unexpected import in flow harness: ${name}`);
    };
    vm.runInContext(`(function(require,module,exports){${compiled.get(filename)}\n})`, context, { filename })(localRequire, module, module.exports);
    return module.exports;
  }
  const Component = options.reader ? load('src/components/Newsroom/ArticleReader.tsx').ArticleReader : load('src/components/Newsroom/NewsroomApp.tsx').default;
  function render() {
    let loops = 0;
    do { if (++loops > 25) throw new Error('Render loop in flow harness'); cursor = 0; pending = []; rerender = false; tree = Component(props); const effects = pending; pending = []; effects.forEach(effect => effect()); } while (rerender);
    return tree;
  }
  function nodes() { const list = []; const visit = node => { if (!node || typeof node !== 'object') return; list.push(node); node.props?.children?.forEach(visit); }; visit(tree); return list; }
  function find(predicate) { const found = nodes().find(predicate); assert.ok(found, 'Expected public UI node was not found'); return found; }
  function child(name) { return find(node => node.type === markers[name]).props; }
  const h = { props, requests, render, find, child, text: () => textOf(tree), location: () => location, async tick() { for (let step = 0; step < 20; step += 1) await Promise.resolve(); render(); }, resolve(request, data, status) { request.deferred.resolve(response(data, status)); }, postGets: () => requests.filter(request => request.url === '/api/posts' && request.method === 'GET') };
  render(); return h;
}

(async () => {
  const existing = note('old-note', 'Enquête déjà enregistrée'); const created = note('new-note', 'Nouvelle enquête');
  for (const newerFirst of [false, true]) {
    const h = makeHarness({ deferPosts: true }); await h.tick();
    assert.equal(h.child('NotesWorkspace').loading, true);
    assert.doesNotMatch(h.text(), /Aucune note/, 'initial pending notes must not look like an empty notebook');
    const initialGet = h.postGets()[0];
    h.find(node => node.type === 'button' && node.props?.['aria-label'] === 'Nouvelle note').props.onClick(); h.render();
    const creation = h.requests.find(request => request.url === '/api/posts' && request.method === 'POST');
    assert.ok(creation, 'the public create action must start a request');
    h.resolve(creation, { post: created }, 201); await h.tick();
    assert.equal(h.postGets().length, 2, 'creation during initial loading must reconcile against a complete server snapshot');
    const reconciledGet = h.postGets()[1];
    if (newerFirst) { h.resolve(reconciledGet, { posts: [created, existing] }); await h.tick(); h.resolve(initialGet, { posts: [existing] }); }
    else { h.resolve(initialGet, { posts: [existing] }); await h.tick(); assert.ok(h.child('NotesWorkspace').posts.some(post => post.id === created.id), 'an old GET must not remove the just-created note'); h.resolve(reconciledGet, { posts: [created, existing] }); }
    await h.tick();
    assert.deepEqual(plain(h.child('NotesWorkspace').posts.map(post => post.id)).sort(), ['new-note', 'old-note']);
    assert.equal(h.child('NotesWorkspace').loading, false);
  }

  const a = article('a'); const b = article('b');
  const h = makeHarness({ articles: [a, b], posts: [existing] }); await h.tick();
  h.find(node => node.type === 'button' && node.props?.['aria-label'] === `Lire : ${a.title}`).props.onClick(); h.render();
  assert.equal(h.child('ArticleReader').article.id, a.id);
  const advance = h.child('ArticleReader').onReadAndNext(a);
  const readRequest = h.requests.find(request => request.url === '/api/articles/read');
  assert.deepEqual(plain(readRequest.body), { articleId: a.id, read: true });
  h.child('ArticleReader').onClose(); h.render();
  assert.equal(h.child('ArticleReader').article, null);
  h.find(node => node.type === 'a' && node.props?.className?.includes('nav-item') && textOf(node).startsWith('Notes & rédaction')).props.onClick({ preventDefault() {} }); h.render();
  h.resolve(readRequest, { read: true }); await advance; await h.tick();
  assert.equal(h.child('ArticleReader').article, null, 'a late read acknowledgement must not reopen the reader');
  assert.equal(h.location().search.includes('notes'), true, 'late reading navigation must preserve the user’s chosen view');

  const oldSave = deferred(); const newSave = deferred(); let saveCalls = 0;
  const reader = makeHarness({ reader: true, props: { article: a, onToggleSave: () => ++saveCalls === 1 ? oldSave.promise : newSave.promise } });
  reader.find(node => node.type === 'button' && textOf(node) === 'Enregistrer').props.onClick(); reader.render();
  reader.props.article = b; reader.render();
  reader.find(node => node.type === 'button' && textOf(node) === 'Enregistrer').props.onClick(); reader.render();
  oldSave.reject(new Error('Échec provenant de l’ancien article')); await reader.tick();
  assert.doesNotMatch(reader.text(), /Échec provenant/, 'an old article failure must not appear on the new article');
  assert.equal(reader.find(node => node.type === 'button' && textOf(node) === 'Enregistrer').props.disabled, true, 'an old finally block must not unlock a different pending action');
  newSave.resolve(); await reader.tick();
  assert.equal(reader.find(node => node.type === 'button' && textOf(node) === 'Enregistrer').props.disabled, false);

  const lateNote = deferred(); let closes = 0;
  const closedReader = makeHarness({ reader: true, props: { article: a, onCreateNote: () => lateNote.promise, onClose() { closes += 1; closedReader.props.article = null; } } });
  closedReader.find(node => node.type === 'button' && textOf(node) === 'Créer une note').props.onClick(); closedReader.render();
  closedReader.find(node => node.props?.['aria-label'] === 'Fermer l’article').props.onClick(); closedReader.render();
  closedReader.props.article = b; closedReader.render();
  lateNote.resolve(); await closedReader.tick();
  assert.equal(closes, 1, 'an old creation acknowledgement must not close a newly opened reader');
  assert.match(closedReader.text(), /Article b/);
  let navigation = 0;
  const readOnly = makeHarness({ reader: true, props: { readOnly: true, article: a, position: { current: 1, total: 2 }, onNext() { navigation += 1; } } });
  assert.match(readOnly.text(), /Copie enregistrée, en lecture seule/);
  assert.doesNotMatch(readOnly.text(), /Enregistrer|Marquer comme|Créer une note|Rattacher|Lu et suivant/);
  readOnly.find(node => node.type === 'button' && node.props?.['aria-label'] === 'Article suivant').props.onClick();
  assert.equal(navigation, 1, 'read-only navigation remains available without mutation callbacks');
  console.log('Newsroom flow: note-load reconciliation, late navigation/errors/acknowledgement and a read-only reader without write actions passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
