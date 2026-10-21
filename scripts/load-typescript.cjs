const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Small Node loader for trusted first-party maintenance commands, not user input.
module.exports = function createLoader(root = path.resolve(__dirname, '..'), imports = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', source)(name => Object.hasOwn(imports, name) ? imports[name] : name.startsWith('@/') ? load(path.join(root, 'src', `${name.slice(2)}.ts`)) : require(name), loaded, loaded.exports);
    return loaded.exports;
  }
  return filename => load(path.join(root, filename));
};
