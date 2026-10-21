import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type Client, type Transaction } from '@libsql/client';

// All private documents share a transaction so an import and its recovery copy
// commit together. SQLite's write lock also serializes separate Vercel instances.
const transactionContext = new AsyncLocalStorage<Transaction>();
let client: Client | undefined;
let schema: Promise<void> | undefined;

export class DurableStorageError extends Error {
  constructor() { super('Le stockage durable est indisponible. Réessayez.'); this.name = 'DurableStorageError'; }
}

export function usesDurableStorage(): boolean {
  const configured = !!process.env.TURSO_DATABASE_URL;
  if (!configured && process.env.VERCEL === '1') throw new DurableStorageError();
  return configured;
}

function getClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url || (process.env.VERCEL === '1' && (!url.startsWith('libsql://') || !process.env.TURSO_AUTH_TOKEN))) throw new DurableStorageError();
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

async function ready(): Promise<Client> {
  const database = getClient();
  schema ||= (async () => {
    if (process.env.TURSO_DATABASE_URL?.startsWith('file:')) {
      await retryLock(() => database.execute('PRAGMA journal_mode=WAL'));
      await database.execute('PRAGMA busy_timeout=5000');
    }
    await retryLock(() => database.execute('CREATE TABLE IF NOT EXISTS redaction_documents (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL)'));
  })().catch(() => { schema = undefined; throw new DurableStorageError(); });
  await schema;
  return database;
}

async function retryLock<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      // Retry only acquiring/committing a transaction, never replay a mutation.
      if (!String((error as { code?: string }).code).startsWith('SQLITE_BUSY') || attempt >= 10) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(250, 30 * (attempt + 1))));
    }
  }
}

export async function inDurableTransaction<T>(operation: () => Promise<T>): Promise<T> {
  if (transactionContext.getStore()) return operation();
  const database = await ready();
  const transaction = await retryLock(() => database.transaction('write'));
  try {
    const result = await transactionContext.run(transaction, operation);
    await retryLock(() => transaction.commit());
    return result;
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  } finally { transaction.close(); }
}

async function executor() { return transactionContext.getStore() || await ready(); }

export async function readDurableDocument(id: string): Promise<string | null> {
  const result = await (await executor()).execute({ sql: 'SELECT body FROM redaction_documents WHERE id = ?', args: [id] });
  return result.rows.length ? String(result.rows[0].body) : null;
}

export async function writeDurableDocument(id: string, body: string): Promise<void> {
  await (await executor()).execute({ sql: 'INSERT INTO redaction_documents (id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at', args: [id, body, new Date().toISOString()] });
}

export async function listDurableBackups(prefix = 'backup:'): Promise<{ id: string; size: number }[]> {
  const result = await (await executor()).execute({ sql: 'SELECT id, length(CAST(body AS BLOB)) AS size FROM redaction_documents WHERE id GLOB ? ORDER BY id DESC', args: [`${prefix}auto-*`] });
  return result.rows.map(row => ({ id: String(row.id).slice(prefix.length), size: Number(row.size) }));
}

export async function removeDurableBackup(id: string, prefix = 'backup:'): Promise<void> {
  await (await executor()).execute({ sql: 'DELETE FROM redaction_documents WHERE id = ?', args: [`${prefix}${id}`] });
}
