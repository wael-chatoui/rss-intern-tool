const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { gzipSync } = require('node:zlib');
const ts = require('typescript');

// Test the real downloader and parser against a local publisher fixture.
// No external requests, database files, or real user data are used.
async function main() {
  const root = path.resolve(__dirname, '..');
  const context = vm.createContext({ process: { env: { NODE_ENV: 'test', RSS_ALLOW_PRIVATE_NETWORK: '1' } }, console, Buffer, URL, TextDecoder, AbortSignal, fetch, Request, Response, crypto: globalThis.crypto });
  function load(filename, imports = {}) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    const wrapper = vm.runInContext(`(function(require, module, exports) { ${compiled}\n})`, context, { filename });
    wrapper(name => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports);
    return module.exports;
  }

  let requests = 0;
  const requestHeaders = [];
  const rssXml = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Journal test</title><link>https://publisher.example</link><description>Fixture</description><item><title>Actualité &amp; mode</title><link>https://publisher.example/article-1</link><pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate><description>Un extrait</description><content:encoded><![CDATA[<p>Le texte complet.</p>]]></content:encoded></item></channel></rss>';
  const atomXml = '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Journal Atom</title><entry><id>urn:test:2</id><title>Article Atom</title><link rel="alternate" href="https://publisher.example/article-2"/><updated>2026-10-15T11:00:00Z</updated><author><name>Camille</name></author><summary>Résumé Atom</summary></entry></feed>';
  const server = http.createServer((req, res) => {
    requests++;
    requestHeaders.push(req.headers);
    if (req.url === '/403') { res.writeHead(403).end('Forbidden'); return; }
    if (req.url === '/404') { res.writeHead(404).end('Not found'); return; }
    if (req.url === '/website') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html><head><link REL="alternate" TYPE="application/atom+xml" href="/atom"></head></html>'); return; }
    if (req.url === '/html') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html><body>Website</body></html>'); return; }
    if (req.url === '/discovery-many') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><head>' + [1,2,3,4].map(i => `<link rel="alternate" type="application/rss+xml" href="/invalid?${i}">`).join('') + '</head></html>'); return; }
    if (req.url.startsWith('/invalid')) { res.writeHead(200, { 'Content-Type': 'text/xml' }).end('<rss version="2.0"><channel>'); return; }
    if (req.url === '/slow') { return; } // The client's timeout must abort this request.
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/gzip' }).end(); return; }
    if (req.url === '/atom') { res.writeHead(200, { 'Content-Type': 'application/atom+xml' }).end(atomXml); return; }
    if (req.url === '/empty') { res.writeHead(200, { 'Content-Type': 'application/rss+xml' }).end('<rss version="2.0"><channel><title>Empty feed</title></channel></rss>'); return; }
    if (req.url === '/latin1') {
      const xml = rssXml.replace('UTF-8', 'ISO-8859-1').replace('Actualité &amp; mode', 'Café');
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=iso-8859-1' }).end(Buffer.from(xml, 'latin1')); return;
    }
    if (req.url === '/oversize') {
      res.writeHead(200, { 'Content-Type': 'text/xml', 'Content-Encoding': 'gzip' }).end(gzipSync(' '.repeat(5 * 1024 * 1024 + 1))); return;
    }
    res.writeHead(200, { 'Content-Type': 'application/rss+xml', 'Content-Encoding': 'gzip' }).end(gzipSync(rssXml));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const source = (id, endpoint = '/gzip', enabled = true) => ({ id, name: `Journal ${id}`, url: `${base}${endpoint}`, website: 'https://publisher.example', category: 'trends', language: 'fr', enabled });
  let groups = 0;
  try {
    const rss = load('src/lib/rss.ts', { undici: { ...require('undici'), fetch: (url, options) => context.fetch(url, options) } });
    const catalog = load('src/lib/feed-catalog.ts');
    const articles = await rss.fetchFeedArticles(source('compressed'));
    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, 'Actualité & mode');
    assert.equal(articles[0].content, '<p>Le texte complet.</p>');
    assert.equal(articles[0].id, rss.createArticleId('compressed', articles[0].link));
    assert.equal((await rss.parseFeedUrl(`${base}/redirect`)).items.length, 1);
    assert.equal((await rss.parseFeedUrl(`${base}/latin1`)).items[0].title, 'Café');
    groups++;

    const atomArticles = await rss.fetchFeedArticles(source('atom', '/atom'));
    assert.equal(atomArticles[0].title, 'Article Atom');
    assert.equal(atomArticles[0].author, 'Camille');
    assert.equal(atomArticles[0].link, 'https://publisher.example/article-2');
    assert.equal(atomArticles[0].snippet, 'Résumé Atom');
    groups++;

    for (const [endpoint, message] of [['/403', /HTTP 403.*accès refusé/], ['/404', /HTTP 404.*introuvable/], ['/html', /page HTML/], ['/invalid', /XML\/RSS ou Atom invalide/], ['/oversize', /trop volumineux/]]) {
      await assert.rejects(rss.parseFeedUrl(`${base}${endpoint}`), message);
    }
    await assert.rejects(rss.parseFeedUrl(`${base}/slow`, 40), /délai dépassé/);
    await assert.rejects(rss.parseFeedUrl('file:///tmp/example.xml'), /HTTP ou HTTPS/);
    groups++;

    const aggregated = await rss.fetchAllActiveFeeds([source('ok'), source('denied', '/403'), source('empty', '/empty')]);
    assert.equal(aggregated.articles.length, 1);
    assert.equal(JSON.stringify(aggregated.failedFeedIds), JSON.stringify(['denied', 'empty']));
    assert.match(aggregated.warnings[0], /Journal denied : HTTP 403/);
    assert.match(aggregated.warnings[1], /Journal empty : aucun article reçu/);
    const beforeEmpty = requests;
    assert.equal(JSON.stringify(await rss.fetchAllActiveFeeds([])), JSON.stringify({ articles: [], failedFeedIds: [], warnings: [], health: [] }));
    assert.equal(aggregated.health.find(item => item.feedId === 'ok').status, 'ok');
    assert.match(aggregated.health.find(item => item.feedId === 'denied').error, /HTTP 403/);
    assert.ok(aggregated.health.every(item => item.lastAttemptAt));
    assert.equal((await rss.fetchAllActiveFeeds([source('paused', '/403', false)])).warnings.length, 0);
    assert.equal(requests, beforeEmpty, 'empty or disabled sources must not make network requests');
    groups++;

    let storedFeed;
    let writes = 0;
    const feedDatabase = { feeds: [] };
    class NextResponse extends Response {
      static json(value, init = {}) { return new NextResponse(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json' } }); }
    }
    const route = load('src/app/api/feeds/route.ts', {
      '@/lib/rss': rss, '@/lib/feed-catalog': catalog,
      '@/lib/auth': { protectApi: async () => null },
      '@/lib/db': { getDb: async () => structuredClone(feedDatabase), updateDb: async mutate => { const result = await mutate(feedDatabase); storedFeed = feedDatabase.feeds[0]; writes++; return result; } },
      'next/server': { NextResponse },
    });
    const addRequest = endpoint => new Request('http://localhost/api/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test', url: `${base}${endpoint}` }) });
    let response = await route.POST(addRequest('/gzip'));
    assert.equal(response.status, 201);
    assert.equal(storedFeed.url, `${base}/gzip`);
    response = await route.POST(addRequest('/403'));
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /HTTP 403/);
    assert.equal(writes, 1, 'invalid sources must not be persisted');
    const beforeDuplicate = requests;
    response = await route.POST(addRequest('/gzip/#bookmark'));
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /existe déjà/);
    assert.equal(requests, beforeDuplicate, 'normalized duplicate URLs must be rejected before contacting the publisher');
    assert.equal(writes, 1, 'duplicate sources must not be inserted');
    assert.equal(rss.normalizeFeedUrl('HTTPS://Example.COM:443/rss/?z=2&a=1#part'), 'https://example.com/rss?a=1&z=2');
    response = await route.POST(new Request('http://localhost/api/feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `${base}/website` }) }));
    assert.equal(response.status, 201);
    const discovered = await response.json();
    assert.equal(discovered.feed.url, `${base}/atom`);
    assert.equal(discovered.feed.name, 'Journal Atom');
    assert.equal(discovered.feed.category, 'general');
    assert.equal(discovered.feeds.length, 2);
    response = await route.POST(addRequest('/website'));
    assert.equal(response.status, 409, 'website discovery must detect an existing canonical feed');
    assert.equal(feedDatabase.feeds.length, 2);
    const race = await Promise.all([route.POST(addRequest('/race')), route.POST(addRequest('/race/'))]);
    assert.deepEqual(race.map(item => item.status).sort(), [201, 409]);
    assert.equal(feedDatabase.feeds.filter(feed => feed.url === `${base}/race`).length, 1, 'the transaction rechecks duplicates after concurrent verification');
    assert.ok(requestHeaders.every(headers => headers['user-agent'].includes('FashionPressHub/1.0')));
    assert.ok(requestHeaders.every(headers => headers.accept.includes('application/atom+xml')));
    groups++;

    assert.equal(catalog.resolveFeedUrl('https://www.dazeddigital.com/rss/fashion'), 'https://www.dazeddigital.com/rss');
    assert.equal(catalog.resolveFeedUrl('https://www.dazeddigital.com/rss/fashion?custom=1'), 'https://www.dazeddigital.com/rss/fashion?custom=1');
    groups++;

    const beforeDiscovery = requests;
    await assert.rejects(rss.discoverFeed(`${base}/discovery-many`), /aucun des flux annoncés/);
    assert.equal(requests - beforeDiscovery, 4, 'discovery reads one page and at most three advertised feeds');
    groups++;

    const capturedHeaders = [];
    context.fetch = async (url, options) => {
      capturedHeaders.push({ hostname: url.hostname, headers: options.headers });
      return new Response(rssXml, { headers: { 'Content-Type': 'application/rss+xml' } });
    };
    try {
      await rss.parseFeedUrl('https://www.businessoffashion.com/arc/outboundfeeds/rss/');
      await rss.parseFeedUrl('https://www.elle.fr/var/plain_site/storage/flux_rss/fluxMode.xml');
      await rss.parseFeedUrl('https://www.businessoffashion.com.example/rss');
      assert.equal(capturedHeaders[0].headers['User-Agent'], 'FashionPressHub/1.0 RSS reader');
      assert.match(capturedHeaders[1].headers['User-Agent'], /Mozilla/);
      assert.match(capturedHeaders[2].headers['User-Agent'], /Mozilla/, 'publisher headers must match the exact hostname');
    } finally { context.fetch = fetch; }
    groups++;
    console.log(`RSS: ${groups} groups passed (local HTTP fixtures only, no database or external network).`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
