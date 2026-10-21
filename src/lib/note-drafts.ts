import type { SocialPost } from '@/types';

export interface NoteDraftRecord {
  version: 1;
  writer: string;
  savedAt: string;
  post: SocialPost;
}
export interface StoredNoteDraft extends NoteDraftRecord { key: string }
type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

/** Exact snapshots, including their base revision, are used for conditional cleanup. */
export function noteDraftFingerprint(post: SocialPost): string { return JSON.stringify(stable(post)); }
export function noteDraftKey(ownerKey: string, noteId: string, writer: string): string {
  return `${ownerKey}:draft:${encodeURIComponent(noteId)}:${encodeURIComponent(writer)}`;
}
export function writeNoteDraft(storage: DraftStorage, ownerKey: string, writer: string, post: SocialPost): StoredNoteDraft {
  const prefix = `${noteDraftKey(ownerKey, post.id, writer)}:snapshot:`;
  const previousKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const previous = storage.key(index);
    if (previous?.startsWith(prefix) || previous === noteDraftKey(ownerKey, post.id, writer)) previousKeys.push(previous);
  }
  // No tab ever updates an existing snapshot. Deleting a recovered snapshot can
  // therefore never delete a new edit written concurrently by its original tab.
  const key = `${prefix}${crypto.randomUUID()}`;
  const record: NoteDraftRecord = { version: 1, writer, savedAt: new Date().toISOString(), post };
  storage.setItem(key, JSON.stringify(record));
  for (const previous of previousKeys) {
    try { storage.removeItem(previous); } catch { /* A redundant copy is safer than losing the successful new write. */ }
  }
  return { ...record, key };
}
export function readNoteDrafts(storage: DraftStorage, ownerKey: string): StoredNoteDraft[] {
  const result: StoredNoteDraft[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(`${ownerKey}:draft:`)) continue;
    try {
      const record = JSON.parse(storage.getItem(key) || 'null') as NoteDraftRecord | null;
      if (record?.version !== 1 || typeof record.writer !== 'string' || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt)) || !record.post || typeof record.post.id !== 'string' || typeof record.post.angle !== 'string' || !Array.isArray(record.post.tags) || !Array.isArray(record.post.platforms) || !record.post.content?.tiktok || !record.post.content?.instagram || !record.post.content?.linkedin) continue;
      result.push({ ...record, key });
    } catch { /* A damaged record must not hide the other recoverable drafts. */ }
  }
  return result.sort((first, second) => second.savedAt.localeCompare(first.savedAt));
}
/** Never remove a copy which another tab has changed since it was inspected. */
export function removeNoteDraftIfUnchanged(storage: DraftStorage, key: string, snapshot: SocialPost): boolean {
  const value = storage.getItem(key);
  if (!value) return false;
  try {
    const record = JSON.parse(value) as NoteDraftRecord;
    if (noteDraftFingerprint(record.post) !== noteDraftFingerprint(snapshot)) return false;
    storage.removeItem(key);
    return true;
  } catch { return false; }
}
