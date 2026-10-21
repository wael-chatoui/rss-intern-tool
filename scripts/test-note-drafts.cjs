const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const filename = path.join(__dirname, '../src/lib/note-drafts.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exported = { exports: {} };
vm.runInNewContext(compiled, { module: exported, exports: exported.exports, require, Date, JSON, crypto });
const { readNoteDrafts, writeNoteDraft, removeNoteDraftIfUnchanged, noteDraftFingerprint } = exported.exports;
class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] || null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const post = { id: 'note-1', revision: 2, angle: 'Mon angle', notes: 'À vérifier', status: 'idea', tags: [], platforms: [], content: { tiktok: { hook: '', script: '', visualNotes: '', durationEstimate: '' }, instagram: { caption: '', carouselSlides: [], hashtags: [] }, linkedin: { title: '', body: '', keyTakeaways: [] } }, createdAt: '2026-10-19T08:00:00Z', updatedAt: '2026-10-19T08:00:00Z' };
const storage = new MemoryStorage();
const first = writeNoteDraft(storage, 'owner-a', 'tab-1', post);
const second = writeNoteDraft(storage, 'owner-a', 'tab-2', { ...post, notes: 'Autre onglet' });
writeNoteDraft(storage, 'owner-b', 'tab-1', post);
assert.equal(readNoteDrafts(storage, 'owner-a').length, 2, 'each tab must retain its own recoverable snapshot');
assert.equal(readNoteDrafts(storage, 'owner-b').length, 1, 'owners must not see each other’s drafts');
writeNoteDraft(storage, 'owner-a', 'tab-1', { ...post, notes: 'Modification plus récente' });
assert.equal(removeNoteDraftIfUnchanged(storage, first.key, post), false, 'a late save must not clear a newer local edit');
assert.equal(readNoteDrafts(storage, 'owner-a').length, 2);
assert.notEqual(readNoteDrafts(storage, 'owner-a').find(record => record.writer === 'tab-1').key, first.key, 'each edit must use a new immutable snapshot key');
assert.equal(removeNoteDraftIfUnchanged(storage, second.key, { ...post, notes: 'Autre onglet' }), true);
assert.equal(readNoteDrafts(storage, 'owner-a').length, 1);
const latest = readNoteDrafts(storage, 'owner-a')[0];
assert.equal(removeNoteDraftIfUnchanged(storage, latest.key, { ...latest.post, revision: 3 }), false, 'cleanup must also match the base revision');
assert.equal(noteDraftFingerprint(post), noteDraftFingerprint(Object.fromEntries(Object.entries(post).reverse())), 'object key ordering must not affect snapshot matching');
storage.setItem('owner-a:draft:broken:tab', 'not JSON');
storage.setItem('owner-a:draft:bad-date:tab', JSON.stringify({ version: 1, writer: 'tab', savedAt: 'invalid', post }));
assert.equal(readNoteDrafts(storage, 'owner-a').length, 1, 'corrupt records must not hide valid drafts or crash date formatting');
assert.throws(() => writeNoteDraft({ setItem() { throw new Error('QuotaExceededError'); } }, 'owner-a', 'tab-3', post), /Quota/, 'quota failure must propagate to the visible recovery UI');
const oldForeign = writeNoteDraft(storage, 'owner-a', 'active-tab', { ...post, notes: 'Avant la course' });
const originalGet = storage.getItem.bind(storage); let intervened = false;
storage.getItem = key => {
  const value = originalGet(key);
  if (key === oldForeign.key && !intervened) { intervened = true; writeNoteDraft(storage, 'owner-a', 'active-tab', { ...post, notes: 'Nouvelle frappe concurrente' }); }
  return value;
};
removeNoteDraftIfUnchanged(storage, oldForeign.key, oldForeign.post);
storage.getItem = originalGet;
assert.ok(readNoteDrafts(storage, 'owner-a').some(record => record.post.notes === 'Nouvelle frappe concurrente'), 'cleanup racing with a live tab must preserve its new immutable snapshot');
console.log('Note drafts: immutable snapshots, isolated tabs/owners, concurrent cleanup, damaged records and quota failure passed.');
