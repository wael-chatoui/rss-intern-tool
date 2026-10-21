const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
class MemoryStorage {
  values = new Map(); fail = false;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] || null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw new Error('QuotaExceededError'); this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const note = (extra = {}) => ({ id: 'note-1', revision: 0, angle: 'Mon sujet', notes: '', status: 'idea', tags: [], platforms: [], sources: [], content: { tiktok: { hook: '', script: '', visualNotes: '', durationEstimate: '' }, instagram: { caption: '', carouselSlides: [], hashtags: [] }, linkedin: { title: '', body: '', keyTakeaways: [] } }, createdAt: '2026-10-19T08:00:00Z', updatedAt: '2026-10-19T08:00:00Z', ...extra });
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
const textOf = node => node == null || node === false ? '' : typeof node !== 'object' ? String(node) : (node.props?.children || []).map(textOf).join('');
function makeHarness(options = {}) {
  const slots = []; let cursor = 0; let pending = []; let rerender = false; let tree;
  const storage = options.storage || new MemoryStorage();
  const events = new Map(); const timers = new Map(); let timerSequence = 0;
  const handle = { current: null };
  const props = { posts: [note()], selectedPostId: 'note-1', mode: 'notes', draftStorageKey: 'owner:test', onSelectPost(id) { props.selectedPostId = id; }, onNewPost: async () => {}, onSavePost: async post => ({ ...post, revision: (post.revision || 0) + 1 }), onDeletePost: async () => {}, onDuplicatePost: async () => {}, ...options.props };
  const react = {
    createElement(type, attributes, ...children) { return { type, props: { ...attributes, children: children.flat(Infinity) } }; }, Fragment: Symbol('Fragment'),
    forwardRef(fn) { return fn; },
    useRef(value) { const index = cursor++; if (!slots[index]) slots[index] = { current: value }; return slots[index]; },
    useState(value) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof value === 'function' ? value() : value }; const slot = slots[index]; return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; rerender = true; } }]; },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++; const previous = slots[index]; if (!previous || !sameDeps(previous.deps, deps)) { slots[index] = { deps, cleanup: previous?.cleanup }; pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
    useImperativeHandle(ref, fn) { cursor++; ref.current = fn(); },
  }; react.default = react; react.__esModule = true;
  const cache = new Map();
  const contextBase = { console, Date, JSON, Map, Set, Object, Array, Number, String, Error, Promise, Intl, Blob, Uint8Array, crypto: { randomUUID },
    setTimeout(fn) { const id = ++timerSequence; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, requestAnimationFrame(fn) { fn(); return 0; },
    window: { localStorage: storage, addEventListener(event, fn) { if (!events.has(event)) events.set(event, new Set()); events.get(event).add(fn); }, removeEventListener(event, fn) { events.get(event)?.delete(fn); } },
    document: { getElementById() { return null; }, createElement() { return { click() {} }; } }, URL,
  };
  function load(relative) {
    const filename = path.join(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } });
    assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length || 0, 0);
    const module = { exports: {} }; cache.set(filename, module);
    const localRequire = name => {
      if (name === 'react') return react;
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : key });
      if (name.endsWith('.css')) return {};
      if (name === './dialog') return { safeWebUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } } };
      if (name === '@/lib/transfer-formats') return { buildTransferExport: async () => ({ bytes: [], mime: 'application/json', filename: 'note.json' }) };
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      return require(name);
    };
    vm.runInNewContext(compiled.outputText, { ...contextBase, module, exports: module.exports, require: localRequire }, { filename });
    return module.exports;
  }
  const Component = load('src/components/Newsroom/NotesWorkspace.tsx').NotesWorkspace;
  function render() {
    let loops = 0;
    do { if (++loops > 20) throw new Error('Render loop in test harness'); cursor = 0; pending = []; rerender = false; tree = Component(props, handle); const effects = pending; pending = []; effects.forEach(effect => effect()); } while (rerender);
    return tree;
  }
  function nodes() { const list = []; const visit = node => { if (!node || typeof node !== 'object') return; list.push(node); node.props?.children?.forEach(visit); }; visit(tree); return list; }
  function find(predicate) { const found = nodes().find(predicate); assert.ok(found, 'Expected UI node was not found'); return found; }
  function body(value) { find(node => node.props?.id === 'note-body').props.onChange({ target: { value } }); render(); }
  render();
  return { props, handle, storage, render, body, nodes, find, text: () => textOf(tree), events, timers, emit(event) { events.get(event)?.forEach(fn => fn({})); }, async tick() { for (let index = 0; index < 12; index += 1) await Promise.resolve(); render(); } };
}
(async () => {
  const requests = []; const resolves = [];
  const h = makeHarness({ props: { onSavePost(post) { requests.push(post); return new Promise(resolve => resolves.push(resolve)); } } });
  h.body('Premier brouillon');
  assert.equal(h.storage.length, 1, 'edits must be written synchronously before the debounce expires');
  const saving = h.handle.current.flush();
  h.body('Dernière frappe');
  const attaching = h.handle.current.attachSource('note-1', { title: 'Référence', link: 'https://example.test/article', feed: 'Média' });
  resolves.shift()({ ...requests[0], revision: 1 });
  await h.tick();
  assert.equal(requests.length, 2, 'the queued edit and added source must share one subsequent save');
  assert.equal(requests[1].revision, 1, 'queued saves must advance to the returned server revision');
  assert.equal(requests[1].notes, 'Dernière frappe');
  assert.equal(requests[1].sources.length, 1, 'attaching a source must not replace a dirty note');
  resolves.shift()({ ...requests[1], revision: 2 });
  await Promise.all([saving, attaching]); h.render();
  assert.equal(h.storage.length, 0, 'only the acknowledged latest snapshot may be cleaned');
  assert.match(h.text(), /Tout est enregistré/);

  const server = note({ revision: 1, notes: 'Version distante' }); let attempted = 0;
  const conflict = makeHarness({ props: { onSavePost: async () => { attempted += 1; throw Object.assign(new Error('Conflit'), { status: 409, code: 'NOTE_CONFLICT', post: server }); } } });
  conflict.body('Version locale'); await assert.rejects(conflict.handle.current.flush()); conflict.render();
  assert.match(conflict.text(), /Version locale/); assert.match(conflict.text(), /Version distante/);
  conflict.body('Version locale conservée');
  await assert.rejects(conflict.handle.current.flush()); assert.equal(attempted, 1, 'unresolved conflicts must never retry or overwrite the remote version');
  conflict.find(node => node.type === 'button' && textOf(node) === 'Utiliser la version enregistrée').props.onClick(); conflict.render();
  conflict.find(node => node.type === 'button' && textOf(node) === 'Confirmer le remplacement').props.onClick(); conflict.render();
  assert.equal(conflict.find(node => node.props?.id === 'note-body').props.value, 'Version distante');
  const preserved = [...conflict.storage.values.values()].map(JSON.parse);
  assert.ok(preserved.some(record => record.post.notes === 'Version locale conservée'), 'choosing the server must retain a separate recovery copy');
  conflict.body('Nouvelle édition après résolution');
  assert.ok([...conflict.storage.values.values()].map(JSON.parse).some(record => record.post.notes === 'Version locale conservée'), 'future edits must not overwrite the archived conflict copy');

  const storage = new MemoryStorage();
  const session1 = makeHarness({ storage }); session1.body('Brouillon avant rechargement');
  const session2 = makeHarness({ storage });
  assert.match(session2.text(), /copie locale disponible/);
  session2.find(node => node.type === 'button' && textOf(node) === 'Reprendre').props.onClick(); session2.render();
  assert.equal(session2.find(node => node.props?.id === 'note-body').props.value, 'Brouillon avant rechargement');
  assert.equal(storage.length, 2, 'recovering in another tab must leave the originating tab’s snapshot intact until save acknowledgement');
  await session2.handle.current.flush(); session2.render(); assert.equal(storage.length, 0);

  let online = false; let calls = 0;
  const offline = makeHarness({ props: { onSavePost: async post => { calls += 1; if (!online) throw new Error('Offline'); return { ...post, revision: 1 }; } } });
  offline.body('Travail hors ligne'); await assert.rejects(offline.handle.current.flush()); offline.render();
  assert.match(offline.text(), /Échec de l’enregistrement/); assert.equal(offline.storage.length, 1);
  online = true; offline.emit('online'); await offline.tick();
  assert.equal(calls, 2); assert.equal(offline.storage.length, 0); assert.match(offline.text(), /Tout est enregistré/);

  const quota = makeHarness(); quota.storage.fail = true; quota.body('Ne pas perdre');
  assert.match(quota.text(), /stockage plein ou indisponible/);

  const removed = makeHarness(); removed.props.posts = []; removed.render();
  assert.match(removed.text(), /supprimée ailleurs/);
  assert.ok(removed.find(node => node.props?.id === 'note-body'));
  assert.equal(removed.storage.length, 1, 'remote deletion must preserve the open note as a recoverable draft');

  let deleteResolve; let deleteRevision;
  const deleting = makeHarness({ props: { posts: [note({ revision: 4 })], onDeletePost: async (id, revision) => { deleteRevision = revision; await new Promise(resolve => { deleteResolve = resolve; }); } } });
  deleting.find(node => node.props?.['aria-label'] === 'Supprimer cette note').props.onClick(); deleting.render();
  deleting.find(node => node.type === 'button' && textOf(node) === 'Supprimer').props.onClick(); await deleting.tick();
  assert.equal(deleteRevision, 4);
  assert.equal(deleting.find(node => node.type === 'fieldset').props.disabled, true, 'deletion must disable editor fields');
  deleting.body('Frappe tardive');
  assert.equal(deleting.find(node => node.props?.id === 'note-body').props.value, '', 'late events must not create a draft that deletion would discard');
  await assert.rejects(deleting.handle.current.attachSource('note-1', { title: 'Tardif', link: 'https://example.test', feed: '' }), /suppression/);
  deleteResolve(); await deleting.tick();
  const loadFailure = makeHarness({ storage, props: { posts: [], selectedPostId: null, loading: false, error: 'Hors ligne' } });
  assert.match(loadFailure.text(), /Notes enregistrées indisponibles/);
  assert.doesNotMatch(loadFailure.text(), /Aucune note sélectionnée/);

  const remoteRefresh = makeHarness(); remoteRefresh.body('Brouillon en cours');
  remoteRefresh.props.posts = [note({ revision: 3, notes: 'Autre rédaction' })]; remoteRefresh.render();
  assert.equal(remoteRefresh.find(node => node.props?.id === 'note-body').props.value, 'Brouillon en cours', 'a focus refresh must never replace dirty text');

  let lastSaved;
  const schedule = makeHarness({ props: { posts: [note({ scheduledDate: '2026-10-22', scheduledTime: '09:00' })], onSavePost: async post => { lastSaved = post; return { ...post, revision: 1 }; } } });
  schedule.find(node => node.props?.['aria-label'] === 'Retirer la date de publication').props.onClick(); schedule.render(); await schedule.handle.current.flush();
  assert.equal(lastSaved.scheduledDate, undefined); assert.equal(lastSaved.scheduledTime, undefined, 'unscheduling must clear the time as well');

  const fullSearch = makeHarness({ props: { posts: [note({ content: { ...note().content, linkedin: { title: 'Enquête', body: 'Économie circulaire', keyTakeaways: [] } } })] } });
  fullSearch.find(node => node.type === 'input' && node.props?.placeholder === 'Rechercher une note…').props.onChange({ target: { value: 'economie' } }); fullSearch.render();
  assert.ok(fullSearch.nodes().some(node => node.props?.className?.includes('notes-list-item ')), 'search must cover platform bodies and accents');

  let planned;
  const backlog = makeHarness({ props: { mode: 'planning', onSavePost: async post => { planned = post; return { ...post, revision: 1 }; } } });
  backlog.find(node => node.type === 'button' && textOf(node) === 'Calendrier').props.onClick(); backlog.render();
  backlog.find(node => node.type === 'button' && textOf(node).includes('Planifier') && node.props?.['aria-label']?.startsWith('Planifier ')).props.onClick(); await backlog.tick();
  assert.match(planned.scheduledDate, /^\d{4}-\d{2}-\d{2}$/); assert.equal(planned.status, 'idea', 'planning a draft must not claim it is published');

  console.log('Notes workspace: revisions, dirty source attachment, conflicts, local recovery, online retry, quota, deletion, loading states, scheduling and full-text search passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
