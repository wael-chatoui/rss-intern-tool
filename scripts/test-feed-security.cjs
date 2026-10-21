const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const filename = path.resolve(__dirname, '../src/lib/rss.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  let addresses = [{ address: '93.184.215.14', family: 4 }];
  let requests = 0;
  let redirect;
  const rssXml = '<rss version="2.0"><channel><title>Fixture</title></channel></rss>';
  const context = vm.createContext({ process: { env: { VERCEL: '1', NODE_ENV: 'production', RSS_ALLOW_PRIVATE_NETWORK: '1' } }, console, Buffer, URL, TextDecoder, AbortSignal });
  const imports = {
    'node:dns': { lookup: (_host, _options, callback) => callback(null, addresses) },
    undici: {
      Agent: class { constructor(options) { this.options = options; } },
      fetch: async (url, options) => {
        requests++;
        if (!require('node:net').isIP(url.hostname)) await new Promise((resolve, reject) => options.dispatcher.options.connect.lookup(url.hostname, { all: true }, error => error ? reject({ cause: error }) : resolve()));
        return redirect ? new Response('', { status: 302, headers: { location: redirect } }) : new Response(rssXml, { headers: { 'Content-Type': 'application/rss+xml' } });
      },
    },
  };
  const loaded = { exports: {} };
  vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context)(name => imports[name] || require(name), loaded, loaded.exports);
  const rss = loaded.exports;
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(rss.isPublicFeedAddress(address), false, address);
  assert.equal(rss.isPublicFeedAddress('93.184.215.14'), true);
  assert.equal(rss.isPublicFeedAddress('2606:4700:4700::1111'), true);
  for (const address of ['http://127.0.0.1/rss', 'http://2130706433/rss', 'http://[::ffff:127.0.0.1]/rss', 'http://localhost/rss', 'http://service.local/rss', 'https://user:password@publisher.example/rss']) await assert.rejects(rss.parseFeedUrl(address), /publique|identifiants/);
  assert.equal(requests, 0, 'private literals and embedded credentials are denied before a request');
  await rss.parseFeedUrl('https://publisher.example/rss');
  addresses = [{ address: '127.0.0.1', family: 4 }];
  await assert.rejects(rss.parseFeedUrl('https://publisher.example/rss'), /ERR_RSS_PRIVATE_ADDRESS/);
  addresses = [{ address: '93.184.215.14', family: 4 }, { address: '10.0.0.1', family: 4 }];
  await assert.rejects(rss.parseFeedUrl('https://publisher.example/rss'), /ERR_RSS_PRIVATE_ADDRESS/);
  addresses = [{ address: '93.184.215.14', family: 4 }]; redirect = 'http://169.254.169.254/latest/meta-data/';
  const before = requests;
  await assert.rejects(rss.parseFeedUrl('https://publisher.example/rss'), /publique/);
  assert.equal(requests, before + 1, 'a redirect to private infrastructure is never followed');
  console.log('Feed security: IPv4/IPv6/encoded literals, credentials, DNS pinning/mixed responses, redirect revalidation and production fixture-override rejection passed (mock transport, zero network).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
