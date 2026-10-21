import { createHash } from 'node:crypto';
import { inDurableTransaction, readDurableDocument, writeDurableDocument } from '@/lib/durable-store';

export async function limitRegistration(request: Request): Promise<boolean> {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  // Keep only an irreversible daily digest, never persist the visitor's IP.
  const digest = createHash('sha256').update(`signup:${new Date().toISOString().slice(0, 10)}:${address}`).digest('hex');
  return inDurableTransaction(async () => {
    const id = `signup-limit:${digest}`;
    const raw = await readDurableDocument(id);
    const previous = raw ? JSON.parse(raw) as { count: number; startedAt: number } : { count: 0, startedAt: Date.now() };
    const value = Date.now() - previous.startedAt < 60 * 60 * 1000 ? previous : { count: 0, startedAt: Date.now() };
    if (value.count >= 5) return false;
    value.count++;
    await writeDurableDocument(id, JSON.stringify(value));
    return true;
  });
}
