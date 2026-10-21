#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const load = require('./load-typescript.cjs')();

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--from' || args[2] !== '--backup-dir') throw new Error('Usage : node --env-file=.env.production.local scripts/migrate-durable.cjs --from /chemin/db.json --backup-dir /chemin/prive');
  const source = path.resolve(args[1]);
  const backupDirectory = path.resolve(args[3]);
  const raw = await fs.readFile(source, 'utf8');
  if (Buffer.byteLength(raw) > 20 * 1024 * 1024) throw new Error('La base dépasse 20 Mo. Migration interrompue.');
  const database = JSON.parse(raw);
  if (!database || !Array.isArray(database.feeds) || !Array.isArray(database.posts) || !Array.isArray(database.savedArticles)) throw new Error('Base éditoriale invalide.');
  const durable = load('src/lib/durable-store.ts');
  if (!durable.usesDurableStorage()) throw new Error('TURSO_DATABASE_URL doit être configurée.');
  await fs.mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const backup = path.join(backupDirectory, `db-before-durable-${stamp}.json`);
  await fs.writeFile(backup, raw, { mode: 0o600, flag: 'wx' });
  const authPath = path.join(path.dirname(source), 'auth.json');
  let auth;
  try {
    auth = await fs.readFile(authPath, 'utf8');
    const account = JSON.parse(auth);
    if (account.version !== 1 || !account.owner || !Array.isArray(account.sessions)) throw new Error('Compte propriétaire invalide.');
    await fs.writeFile(path.join(backupDirectory, `auth-before-durable-${stamp}.json`), auth, { mode: 0o600, flag: 'wx' });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await durable.inDurableTransaction(async () => {
    if (await durable.readDurableDocument('editorial') !== null || await durable.readDurableDocument('auth') !== null) throw new Error('La destination contient déjà des données. Aucun remplacement effectué.');
    await durable.writeDurableDocument('editorial', raw);
    if (auth) await durable.writeDurableDocument('auth', auth);
    const directory = path.join(path.dirname(source), 'backups');
    let names = [];
    try { names = await fs.readdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const name of names.filter(name => /^auto-\d{13}-[a-f0-9-]{36}\.json$/.test(name))) {
      const stat = await fs.lstat(path.join(directory, name));
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Sauvegarde non régulière. Migration interrompue.');
      await durable.writeDurableDocument(`backup:${name}`, await fs.readFile(path.join(directory, name), 'utf8'));
    }
  });
  const persisted = await durable.readDurableDocument('editorial');
  if (persisted !== raw) throw new Error('La vérification du contenu migré a échoué.');
  const receipt = { migratedAt: new Date().toISOString(), source, backup, sha256: createHash('sha256').update(raw).digest('hex'), feeds: database.feeds.length, notes: database.posts.length, savedArticles: database.savedArticles.length, ownerMigrated: !!auth };
  await fs.writeFile(path.join(backupDirectory, `migration-${stamp}.json`), JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  console.log('Migration vérifiée :', JSON.stringify(receipt));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
