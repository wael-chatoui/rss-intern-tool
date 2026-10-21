const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual navigation hook with browser history, animation frames and
// React effects. Everything stays in memory: no browser, API, or user storage.
const root = path.resolve(__dirname, '..');
const storageKey = 'redaction:navigation:fixture@example.test';
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function harness(options = {}) {
  const slots = []; let cursor = 0; let effects = []; let dirty = true; let navigation;
  const events = new Map(); const frames = new Map(); const browserTasks = [];
  let frameSequence = 0;
  const storage = options.storage || new MemoryStorage();
  const props = { feedReady: true, notesReady: true, blocked: false, ...options.props };
  const entries = (options.entries || ['/espace']).map(url => ({ url: new URL(url, 'https://app.example.test'), state: { nextRouterFixture: true } }));
  let entryIndex = entries.length - 1;
  const calls = { back: 0, forward: 0, push: 0, scroll: [] };
  const emit = (name, event = {}) => events.get(name)?.forEach(fn => fn(event));
  const browser = {
    scrollY: options.scrollY || 0,
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener(name, fn) { events.get(name)?.delete(fn); },
    scrollTo({ top }) {
      calls.scroll.push(top);
      if (browser.scrollY === top) return;
      browser.scrollY = top;
      browserTasks.push(() => emit('scroll'));
    },
  };
  Object.defineProperty(browser, 'location', { get: () => entries[entryIndex].url });
  const traverse = offset => browserTasks.push(() => {
    const next = entryIndex + offset;
    if (next < 0 || next >= entries.length) return;
    entryIndex = next;
    emit('popstate', { state: structuredClone(entries[entryIndex].state) });
  });
  browser.history = {
    scrollRestoration: 'auto',
    get state() { return entries[entryIndex].state; },
    get length() { return entries.length; },
    replaceState(state, unused, url) {
      entries[entryIndex] = { state: structuredClone(state), url: url == null ? entries[entryIndex].url : new URL(url, browser.location) };
    },
    pushState(state, unused, url) {
      calls.push += 1;
      entries.splice(entryIndex + 1);
      entries.push({ state: structuredClone(state), url: new URL(url, browser.location) });
      entryIndex += 1;
    },
    back() { calls.back += 1; traverse(-1); },
    forward() { calls.forward += 1; traverse(1); },
  };
  const react = {
    useRef(value) { const index = cursor++; if (!slots[index]) slots[index] = { current: value }; return slots[index]; },
    useState(value) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof value === 'function' ? value() : value };
      const slot = slots[index];
      return [slot.value, next => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
      }];
    },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++; const previous = slots[index];
      if (!previous || !sameDeps(previous.deps, deps)) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const context = vm.createContext({
    console, URL, URLSearchParams, structuredClone, window: browser, sessionStorage: storage,
    requestAnimationFrame(fn) { const id = ++frameSequence; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const module = { exports: {} }; cache.set(relative, module);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const wrapper = vm.runInContext(`(function(require, module, exports) { ${compiled}\n})`, context, { filename: relative });
    wrapper(name => {
      if (name === 'react') return react;
      if (name === '@/lib/workspace-state') return load('src/lib/workspace-state.ts');
      throw new Error(`Unexpected dependency in navigation fixture: ${name}`);
    }, module, module.exports);
    return module.exports;
  }
  const useNavigation = load('src/components/Newsroom/useWorkspaceNavigation.ts').useWorkspaceNavigation;
  function render() {
    let count = 0;
    do {
      if (++count > 20) throw new Error('Navigation render loop');
      cursor = 0; effects = []; dirty = false;
      navigation = useNavigation(storageKey, props.feedReady, props.notesReady, props.blocked);
      const pending = effects; effects = []; pending.forEach(fn => fn());
    } while (dirty);
  }
  function flush() {
    let count = 0;
    do {
      if (++count > 50) throw new Error('Navigation browser queue did not settle');
      if (dirty) render();
      const tasks = browserTasks.splice(0); tasks.forEach(fn => fn());
      if (dirty) render();
      const pending = Array.from(frames); frames.clear(); pending.forEach(([, fn]) => fn());
    } while (dirty || browserTasks.length || frames.size);
  }
  flush();
  return {
    get nav() { return navigation; }, browser, calls, storage, entries,
    get index() { return entryIndex; },
    flush,
    change(next) { Object.assign(props, next); dirty = true; flush(); },
    scroll(top) { browser.scrollY = top; emit('scroll'); flush(); },
    go(view) { navigation.update(previous => ({ ...previous, view, activeArticleId: null }), true); flush(); },
    back() { browser.history.back(); flush(); },
    forward() { browser.history.forward(); flush(); },
  };
}

let groups = 0;

const reader = harness();
reader.nav.updateFeed({ query: 'couture', language: 'fr', compact: true }); reader.flush();
reader.nav.updateFeed({ visibleCount: 45 }); reader.flush(); reader.scroll(920);
reader.nav.update({ activeArticleId: 'article-a' }, true); reader.flush();
assert.equal(reader.browser.history.length, 2);
assert.equal(reader.nav.state.activeArticleId, 'article-a');
assert.equal(reader.browser.history.state.nextRouterFixture, true, 'Next history metadata must survive navigation');
reader.nav.update({ activeArticleId: 'article-b' }); reader.flush();
assert.equal(reader.browser.history.length, 2, 'next article stays inside the same reader history entry');
reader.nav.closeReader(); reader.flush();
assert.equal(reader.nav.state.activeArticleId, null);
assert.equal(reader.index, 0, 'closing an internally opened reader consumes its history entry');
assert.equal(reader.calls.back, 1);
assert.equal(reader.browser.scrollY, 920);
assert.equal(reader.nav.state.feeds.veille.query, 'couture');
assert.equal(reader.nav.state.feeds.veille.visibleCount, 45);
assert.equal(reader.nav.state.feeds.veille.compact, true);
reader.forward();
assert.equal(reader.nav.state.activeArticleId, 'article-b', 'Forward can reopen the last reader position');
reader.nav.closeReader(); reader.flush();
assert.equal(reader.index, 0);
groups += 1;

const sameView = harness(); sameView.scroll(510);
sameView.go('veille'); sameView.go('veille');
assert.equal(sameView.calls.push, 0, 'clicking the current section must not create empty Back steps');
assert.equal(sameView.browser.history.length, 1);
assert.equal(sameView.browser.scrollY, 510);
groups += 1;

const contexts = harness();
contexts.nav.updateFeed({ query: 'enquête', language: 'fr', feedId: 'journal-a', compact: true }); contexts.flush();
contexts.nav.updateFeed({ visibleCount: 60 }); contexts.flush(); contexts.scroll(800);
contexts.go('saved');
assert.equal(contexts.browser.scrollY, 0);
contexts.nav.updateFeed({ query: 'archives', language: 'en', feedId: 'journal-b' }); contexts.flush();
contexts.nav.updateFeed({ visibleCount: 30 }); contexts.flush(); contexts.scroll(1700);
contexts.nav.update({ view: 'notes', selectedPostId: 'note-1', returnTo: 'saved' }, true); contexts.flush();
contexts.scroll(220); contexts.back();
assert.equal(contexts.nav.state.view, 'saved');
assert.equal(contexts.browser.scrollY, 1700, 'Back restores the saved list position');
assert.equal(contexts.nav.state.feeds.saved.query, 'archives');
assert.equal(contexts.nav.state.feeds.saved.language, 'en');
assert.equal(contexts.nav.state.feeds.saved.visibleCount, 30);
contexts.back();
assert.equal(contexts.nav.state.view, 'veille');
assert.equal(contexts.browser.scrollY, 800, 'Back restores the independent RSS list position');
assert.equal(contexts.nav.state.feeds.veille.query, 'enquête');
assert.equal(contexts.nav.state.feeds.veille.feedId, 'journal-a');
assert.equal(contexts.nav.state.feeds.veille.visibleCount, 60);
assert.equal(contexts.nav.state.feeds.veille.compact, true);
contexts.forward();
assert.equal(contexts.nav.state.view, 'saved');
assert.equal(contexts.browser.scrollY, 1700);
assert.equal(contexts.browser.location.search.includes('q=archives'), true);
contexts.back();
contexts.go('saved');
assert.equal(contexts.nav.state.feeds.saved.query, 'archives', 'opening Saved from the sidebar after Back must retain its most recent filters');
assert.equal(contexts.nav.state.feeds.saved.feedId, 'journal-b');
assert.equal(contexts.browser.scrollY, 1700, 'an old RSS history entry must not erase the inactive Saved position');
groups += 1;

const source = harness(); source.scroll(1900);
source.nav.update(previous => ({ ...previous, feeds: { ...previous.feeds, veille: { ...previous.feeds.veille, feedId: 'new-source', visibleCount: 15, scrollY: 0 } } }), true); source.flush();
assert.equal(source.browser.scrollY, 0, 'selecting a source from the same RSS section must start at its first article');
assert.equal(source.nav.state.feeds.veille.feedId, 'new-source');
source.back();
assert.equal(source.browser.scrollY, 1900, 'Back from a source restores the original queue position');
assert.equal(source.nav.state.feeds.veille.feedId, 'all');
source.nav.updateFeed({ query: 'zero results' }); source.flush();
assert.equal(source.browser.scrollY, 0, 'new search criteria reset actual scroll, not just stored scroll');
groups += 1;

const direct = harness({ entries: ['https://outside.example.test/', '/espace?view=veille&article=linked-article&q=test&feed=all&category=all&language=all&tab=all&layout=list&limit=30'] });
assert.equal(direct.nav.state.activeArticleId, 'linked-article');
direct.nav.closeReader(); direct.flush();
assert.equal(direct.calls.back, 0, 'closing a direct reader URL must not leave the application');
assert.equal(direct.index, 1);
assert.equal(direct.browser.location.pathname, '/espace');
assert.equal(direct.nav.state.activeArticleId, null);
assert.equal(direct.nav.state.feeds.veille.query, 'test');
assert.equal(direct.nav.state.feeds.veille.visibleCount, 30);
assert.equal(direct.browser.location.search.includes('article='), false);
groups += 1;

const blocked = harness(); blocked.go('sources'); blocked.go('transfer'); blocked.change({ blocked: true });
blocked.back();
assert.equal(blocked.nav.state.view, 'transfer', 'browser Back cannot remove the import transaction screen');
assert.equal(blocked.browser.location.search, '?view=transfer');
blocked.go('notes');
assert.equal(blocked.nav.state.view, 'transfer', 'programmatic navigation also respects the transaction lock');
blocked.change({ blocked: false }); blocked.back();
assert.equal(blocked.nav.state.view, 'sources', 'Back works again when the transaction finishes');
groups += 1;

const waiting = harness({ storage: contexts.storage, entries: [contexts.browser.location.href], props: { feedReady: false, notesReady: false } });
assert.equal(waiting.browser.scrollY, 0, 'defer list scroll until cached articles have rendered');
waiting.change({ feedReady: true });
assert.equal(waiting.browser.scrollY, 1700, 'notes loading must not block RSS scroll restoration');
assert.equal(waiting.nav.state.feeds.saved.query, 'archives');
waiting.go('veille');
assert.equal(waiting.browser.scrollY, 800, 'reload preserves the other feed context as well');
assert.equal(waiting.nav.state.feeds.veille.query, 'enquête');
const notePage = harness({ storage: contexts.storage, entries: ['/espace?view=notes&note=note-1'], props: { feedReady: false, notesReady: true } });
assert.equal(notePage.browser.scrollY, 220, 'RSS loading must not block a ready notes view');
groups += 1;

console.log(`Workspace navigation: ${groups} interaction groups passed (in-memory history, React effects and animation frames only).`);
