const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const ts = require('typescript');

// Run the real route in isolated contexts. Database and RSS inputs are fixtures,
// so these checks never touch the user's database or make network requests.
const root = path.resolve(__dirname, '..');
const filename = 'src/app/api/rss/route.ts';
const source = fs.readFileSync(path.join(root, filename), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const NOW = Date.parse('2026-10-15T12:00:00Z');
const STALE_AT = '2026-10-14T12:00:00Z';
const createArticleId = (feedId, link) => `rss_${createHash('sha256').update(`${feedId}:${link}`).digest('hex').slice(0, 24)}`;
const feeds = [
  { id: 'source-a', name: 'Journal A', url: 'https://a.example/rss', website: 'https://a.example', category: 'business', language: 'fr', enabled: true },
  { id: 'source-b', name: 'Journal B', url: 'https://b.example/rss', website: 'https://b.example', category: 'trends', language: 'en', enabled: true },
  { id: 'disabled', name: 'Source désactivée', url: 'https://disabled.example/rss', website: 'https://disabled.example', category: 'business', language: 'fr', enabled: false },
];
function article(number, feed = feeds[0]) {
  const link = `${feed.website}/article/${number}`;
  return { id: createArticleId(feed.id, link), feedId: feed.id, feedName: feed.name, feedLanguage: feed.language, category: feed.category, title: `Article ${number}`, link, pubDate: `2026-10-${String(number).padStart(2, '0')}T10:00:00Z`, snippet: `Extrait ${number}`, author: 'Camille' };
}
const baseline = () => ({
  feeds: structuredClone(feeds), posts: [], savedArticles: [article(15)],
  readArticleIds: [article(15).id], cachedArticles: [article(12), article(11, feeds[1])], lastFetchedAt: STALE_AT,
});

class NextResponse extends Response {
  static json(value, init = {}) {
    return new NextResponse(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  }
}

function harness({ database = baseline(), fetchResult, writeError } = {}) {
  let persisted = structuredClone(database);
  let currentTime = NOW;
  const calls = { fetch: 0, update: 0, mutations: [], logs: [] };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [currentTime])); }
    static now() { return currentTime; }
  }
  const imports = {
    'next/server': { NextResponse },
    '@/lib/auth': { protectApi: async () => null },
    '@/lib/db': {
      getDb: async () => structuredClone(persisted),
      updateDb: async mutate => {
        calls.update++;
        const latest = structuredClone(persisted);
        const result = await mutate(latest);
        calls.mutations.push(structuredClone(latest));
        // A real file write can fail after the route's mutation has completed.
        // The next getDb must still return the old persisted database.
        if (writeError) throw writeError;
        persisted = structuredClone(latest);
        return result;
      },
    },
    '@/lib/rss': {
      createArticleId,
      fetchAllActiveFeeds: async activeFeeds => {
        calls.fetch++;
        assert.deepEqual(Array.from(activeFeeds, feed => feed.id), ['source-a', 'source-b']);
        return structuredClone(typeof fetchResult === 'function' ? await fetchResult(calls.fetch) : fetchResult);
      },
    },
  };
  const context = vm.createContext({
    URL, Request, Response, structuredClone, Date: TestDate,
    console: { error: (...args) => calls.logs.push(args), warn: (...args) => calls.logs.push(args), log: (...args) => calls.logs.push(args) },
  });
  const module = { exports: {} };
  const wrapper = vm.runInContext(`(function(require, module, exports) { ${compiled}\n})`, context, { filename });
  wrapper(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected route dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return {
    calls,
    advance: milliseconds => { currentTime += milliseconds; },
    persisted: () => structuredClone(persisted),
    get: async (search = '') => {
      const response = await module.exports.GET(new Request(`http://localhost/api/rss${search}`));
      return { status: response.status, body: await response.json() };
    },
  };
}

async function main() {
  let groups = 0;
  const sourceWarning = 'Journal B : HTTP 403 (accès refusé). Les derniers articles disponibles sont conservés.';
  const disabledWarning = 'Source désactivée : flux indisponible.';
  const readonly = harness({
    writeError: Object.assign(new Error('Read-only file system'), { code: 'EROFS' }),
    fetchResult: call => ({
      articles: [article(call === 1 ? 15 : 16)],
      failedFeedIds: ['source-b', 'disabled'],
      warnings: [sourceWarning, disabledWarning],
    }),
  });
  let response = await readonly.get();
  assert.equal(response.status, 200, 'a failed cache write must not discard successfully fetched articles');
  assert.equal(response.body.cacheIsTemporary, true);
  assert.deepEqual(response.body.warnings, [sourceWarning], 'only unavailable sources count as source warnings');
  assert.deepEqual(response.body.articles.map(item => item.id), [article(15).id, article(11, feeds[1]).id]);
  assert.equal(response.body.lastFetchedAt, new Date(NOW).toISOString());
  assert.equal(response.body.isFromCache, false);
  assert.ok(response.body.warnings.includes(sourceWarning), 'the failed active source keeps its warning');
  assert.ok(!response.body.warnings.includes(disabledWarning), 'disabled sources do not report refresh failures');
  assert.equal(response.body.articles[0].saved, true);
  assert.equal(response.body.articles[0].read, true);
  assert.equal(readonly.calls.update, 1);
  assert.equal(readonly.calls.mutations[0].cachedArticles[0].id, article(15).id, 'EROFS is thrown after the real mutation callback');
  assert.equal(readonly.persisted().lastFetchedAt, STALE_AT, 'the storage fixture really remains unchanged');
  groups++;

  readonly.advance(60_000);
  response = await readonly.get();
  assert.equal(response.status, 200);
  assert.equal(readonly.calls.fetch, 1, 'the next request reuses the in-memory result despite a stale persisted cache');
  assert.deepEqual(response.body.articles.map(item => item.id), [article(15).id, article(11, feeds[1]).id]);
  assert.equal(response.body.lastFetchedAt, new Date(NOW).toISOString());
  assert.equal(response.body.isFromCache, true);
  response = await readonly.get('?refresh=true');
  assert.equal(response.status, 200);
  assert.equal(readonly.calls.fetch, 2, 'a forced refresh still reaches the RSS fetcher');
  assert.equal(response.body.articles[0].id, article(16).id);
  assert.equal(response.body.lastFetchedAt, new Date(NOW + 60_000).toISOString());
  groups++;

  const legacyDatabase = baseline();
  legacyDatabase.savedArticles[0].id = 'legacy-id';
  legacyDatabase.readArticleIds = ['legacy-id'];
  const legacyReadonly = harness({
    database: legacyDatabase,
    writeError: Object.assign(new Error('Read-only file system'), { code: 'EROFS' }),
    fetchResult: { articles: [article(15)], failedFeedIds: ['source-b'], warnings: [sourceWarning] },
  });
  for (let request = 0; request < 3; request++) {
    response = await legacyReadonly.get();
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.articles.map(item => item.id), [article(15).id, article(11, feeds[1]).id], 'a failed legacy-ID migration must preserve the fresh in-memory articles');
    assert.equal(response.body.lastFetchedAt, new Date(NOW).toISOString());
    assert.equal(response.body.articles[0].saved, true);
    assert.equal(response.body.articles[0].read, true, 'legacy read markers migrate with their saved article');
    assert.equal(legacyReadonly.calls.fetch, 1, 'repeated legacy migration failures must not replace the runtime cache with stale storage');
    legacyReadonly.advance(60_000);
  }
  groups++;

  for (const writeError of [undefined, Object.assign(new Error('Read-only file system'), { code: 'EROFS' })]) {
    const failed = harness({
      writeError,
      fetchResult: {
        articles: [], failedFeedIds: ['source-a', 'source-b'],
        warnings: ['Journal A : connexion impossible.', sourceWarning],
      },
    });
    response = await failed.get('?refresh=true');
    assert.equal(response.status, 200, 'a complete source outage retains available articles');
    assert.deepEqual(response.body.articles.map(item => item.id), [article(12).id, article(11, feeds[1]).id]);
    assert.equal(response.body.lastFetchedAt, STALE_AT, 'an outage must not claim a successful synchronization now');
    assert.equal(response.body.isFromCache, true);
    assert.ok(response.body.warnings.includes('Journal A : connexion impossible.'));
    assert.ok(response.body.warnings.includes(sourceWarning));
    failed.advance(60_000);
    response = await failed.get();
    assert.equal(response.status, 200);
    assert.equal(response.body.lastFetchedAt, STALE_AT);
    assert.equal(failed.calls.fetch, 2, 'stale articles are eligible for a later retry after a complete outage');
  }
  groups++;

  const broken = harness({
    writeError: new Error('Unexpected transaction bug'),
    fetchResult: { articles: [article(15)], failedFeedIds: [], warnings: [] },
  });
  response = await broken.get();
  assert.equal(response.status, 500, 'non-storage exceptions must not silently become successful responses');
  assert.equal(typeof response.body.error, 'string');
  assert.ok(!response.body.error.includes('Unexpected transaction bug'));
  groups++;

  const replacements = [
    ['fashionnetwork-fr', 'https://fr.fashionnetwork.com/rss/news/', 'https://fr.fashionnetwork.com/rss/feed/fr,0.xml'],
    ['elle-fr', 'https://www.elle.fr/Mode/rss', 'https://www.elle.fr/var/plain_site/storage/flux_rss/fluxMode.xml'],
    ['madame-figaro', 'https://madame.lefigaro.fr/mode/feed', 'https://www.lefigaro.fr/rss/madame_style.xml'],
    ['dazed-fashion', 'https://www.dazeddigital.com/rss/fashion', 'https://www.dazeddigital.com/rss'],
  ];
  let readInput = {
    feeds: replacements.map(([id, url]) => ({ ...feeds[0], id, url, name: `Mon libellé ${id}`, enabled: false })),
    posts: [], savedArticles: [], cachedArticles: [], lastFetchedAt: STALE_AT,
  };
  const originalInput = structuredClone(readInput);
  let filesystemWrites = 0;
  const forbiddenWrite = async () => { filesystemWrites++; assert.fail('getDb migration must never write to the filesystem'); };
  const mockedFs = {
    readFile: async (filename, encoding) => {
      assert.equal(filename, '/virtual/data/db.json');
      assert.equal(encoding, 'utf-8');
      return JSON.stringify(readInput);
    },
    mkdir: forbiddenWrite, writeFile: forbiddenWrite, rename: forbiddenWrite, rm: forbiddenWrite,
  };
  const dbContext = vm.createContext({ structuredClone, console, process: { cwd: () => '/virtual', pid: 1, env: { RSS_DATA_DIR: '/virtual/data' } } });
  function loadDatabaseModule(relativeFilename, imports) {
    const module = { exports: {} };
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relativeFilename), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const wrapper = vm.runInContext(`(function(require, module, exports) { ${compiled}\n})`, dbContext, { filename: relativeFilename });
    wrapper(name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected database dependency: ${name}`);
      return imports[name];
    }, module, module.exports);
    return module.exports;
  }
  const catalog = loadDatabaseModule('src/lib/feed-catalog.ts', {});
  const realDatabase = loadDatabaseModule('src/lib/db.ts', {
    '@/lib/feed-catalog': catalog, 'fs/promises': mockedFs, path, crypto: require('node:crypto'),
  });
  const migrated = await realDatabase.getDb();
  assert.deepEqual(JSON.parse(JSON.stringify(migrated)), {
    ...originalInput,
    feeds: originalInput.feeds.map((feed, index) => ({ ...feed, url: replacements[index][2] })),
  }, 'all four obsolete built-in URLs migrate while custom names and disabled preferences survive');
  assert.deepEqual(readInput, originalInput, 'the input fixture stays untouched during a read');
  readInput = {
    ...originalInput,
    feeds: replacements.map(([id]) => ({ ...feeds[0], id, url: `https://custom.example/${id}.xml`, enabled: false })),
  };
  assert.deepEqual(JSON.parse(JSON.stringify(await realDatabase.getDb())), readInput, 'custom URLs stay intact even when their source IDs match built-ins');
  readInput = { ...originalInput, feeds: [] };
  assert.deepEqual(JSON.parse(JSON.stringify(await realDatabase.getDb())).feeds, [], 'an intentionally empty source list stays empty');
  assert.equal(filesystemWrites, 0, 'URL migration performs no disk writes');
  groups++;

  console.log(`RSS route: ${groups} groups passed (isolated fixtures only, no network).`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
