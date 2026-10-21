const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PDFDocument } = require('pdf-lib');
const noteFilename = path.resolve(__dirname, '../src/lib/note-model.ts');
const noteCompiled = ts.transpileModule(fs.readFileSync(noteFilename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const noteModule = new Module(noteFilename, module); noteModule.filename = noteFilename; noteModule._compile(noteCompiled, noteFilename);

const filename = path.resolve(__dirname, '../src/lib/transfer-pdf.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const mod = new Module(filename, module);
mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); mod.require = function (name) { return name === '@/lib/note-model' ? noteModule.exports : Module.prototype.require.call(this, name); };
mod._compile(compiled, filename);
const nativeFetch = global.fetch;
global.fetch = async input => {
  if (typeof input === 'string' && input.startsWith('/fonts/')) return new Response(fs.readFileSync(path.resolve(__dirname, '../public', input.slice(1))));
  return nativeFetch(input);
};
(async () => {
  const content={tiktok:{hook:'',script:'',visualNotes:'',durationEstimate:''},instagram:{caption:'',carouselSlides:[],hashtags:[]},linkedin:{title:'',body:'',keyTakeaways:[]}};
  const note={id:'pdf-qa',angle:'Enquête : rédaction indépendante',notes:Array(90).fill('Paragraphe de contrôle avec accents : é è à ç œ, « citation », emoji 👀 et caractères grecs αβ.').join('\n\n'),tags:['enquête'],status:'in_progress',platforms:[],content,sourceArticleTitle:'Source vérifiée',sourceArticleLink:'https://example.org/'+('chemin-long-'.repeat(18)),createdAt:'2026-10-15T10:00:00Z',updatedAt:'2026-10-15T10:00:00Z'};
  note.sources = [{ title: note.sourceArticleTitle, link: note.sourceArticleLink, feed: 'Premier journal' }, { title: 'Deuxième source recoupée', link: 'https://second.example/article', feed: 'Second journal', excerpt: 'Un fait recoupé dans une deuxième source.' }];
  const result=await mod.exports.createTransferPdf({version:1,kind:'notes',exportedAt:note.createdAt,posts:[note]},'notes');
  assert.equal(result.mime,'application/pdf'); assert.equal(Buffer.from(result.bytes).subarray(0,4).toString(),'%PDF');
  const document=await PDFDocument.load(result.bytes); assert.ok(document.getPageCount()>=3,'Long notes must paginate');
  const out=process.env.PDF_QA_OUTPUT || path.join(require('node:os').tmpdir(), 'rss-transfer-qa', 'note-export.pdf'); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,result.bytes);
  const rare=await mod.exports.createTransferPdf({version:1,kind:'notes',exportedAt:note.createdAt,posts:[{...note,notes:'Texte 漢'}]},'notes');
  assert.ok(rare.warnings.length,'Unsupported glyphs must be reported');
  await assert.rejects(()=>mod.exports.createTransferPdf({version:1,kind:'notes',exportedAt:note.createdAt,posts:[]},'notes'),/Aucune note/);
  const article={id:'qa-article',feedId:'qa',feedName:'Source',feedLanguage:'fr',category:'trends',title:'Article de contrôle',link:'https://example.org/article',pubDate:note.createdAt,snippet:'Résumé en français',content:'<p>Contenu utile.</p>'};
  const articleResult=await mod.exports.createTransferPdf({version:1,kind:'articles',exportedAt:note.createdAt,cachedArticles:[article],savedArticles:[article]},'articles');
  assert.equal((await PDFDocument.load(articleResult.bytes)).getPageCount(),1,'Duplicate articles should appear once');
  console.log(`PDF checks passed: pagination (${document.getPageCount()} pages), UTF-8/fonts, long URLs, glyph warnings, article deduplication. Fixture: ${out}`);
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=nativeFetch});
