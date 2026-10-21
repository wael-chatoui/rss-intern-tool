import { NextResponse } from 'next/server';
import { protectApi } from '@/lib/auth';
import { getDb, updateDb } from '@/lib/db';
import { NoteValidationError, nextNoteRevision, noteRevision, rememberNoteRevision, validateNotePost } from '@/lib/note-model';

export const dynamic = 'force-dynamic';
const MAX_NOTE_BYTES = 8 * 1024 * 1024;
async function bodyJson(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new NoteValidationError('Aucune note reçue.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_NOTE_BYTES) { await reader.cancel(); throw new NoteValidationError('La note dépasse la limite de 8 Mo.'); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new NoteValidationError('Le contenu JSON de la note est invalide.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new NoteValidationError('La note doit être un objet.');
  return body as Record<string, unknown>;
}
function failure(error: unknown, fallback: string) {
  if (error instanceof NoteValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
function conflict(post: ReturnType<typeof validateNotePost>) {
  return NextResponse.json({ code: 'NOTE_CONFLICT', error: 'Cette note a été modifiée ailleurs. Comparez les versions avant de l’enregistrer.', post }, { status: 409 });
}
export async function GET(req: Request) {
  const denied = await protectApi(req); if (denied) return denied;
  try { return NextResponse.json({ posts: (await getDb()).posts || [] }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error, 'Impossible de charger les notes. Réessayez.'); }
}
export async function POST(req: Request) {
  const denied = await protectApi(req); if (denied) return denied;
  try {
    const body = await bodyJson(req);
    const now = new Date().toISOString();
    const post = validateNotePost(body, { id: `post-${crypto.randomUUID()}`, now });
    post.createdAt = now; post.updatedAt = now;
    await updateDb(db => { post.revision = nextNoteRevision(db, post.id); db.posts.unshift(post); });
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) { return failure(error, 'Impossible de créer la note. Réessayez.'); }
}
export async function PUT(req: Request) {
  const denied = await protectApi(req); if (denied) return denied;
  try {
    const body = await bodyJson(req);
    if (typeof body.id !== 'string' || !body.id) throw new NoteValidationError('Identifiant de note requis.');
    validateNotePost(body, { requireRevision: true });
    const result = await updateDb(db => {
      const index = db.posts.findIndex(post => post.id === body.id);
      if (index < 0) return { kind: 'missing' as const };
      const current = db.posts[index];
      if (body.revision !== noteRevision(current)) return { kind: 'conflict' as const, post: current };
      const post = validateNotePost({ ...current, ...body }, { requireRevision: true });
      post.createdAt = current.createdAt; post.updatedAt = new Date().toISOString(); post.revision = nextNoteRevision(db, post.id, current);
      db.posts[index] = post;
      return { kind: 'saved' as const, post };
    });
    if (result.kind === 'missing') return NextResponse.json({ error: 'Note introuvable.' }, { status: 404 });
    if (result.kind === 'conflict') return conflict(result.post);
    return NextResponse.json({ post: result.post });
  } catch (error) { return failure(error, 'Impossible d’enregistrer la note. Vos modifications restent dans le brouillon.'); }
}
export async function DELETE(req: Request) {
  const denied = await protectApi(req); if (denied) return denied;
  try {
    const params = new URL(req.url).searchParams;
    const id = params.get('id'); const revisionText = params.get('revision');
    if (!id) throw new NoteValidationError('Identifiant de note requis.');
    if (revisionText !== null && (!/^\d+$/.test(revisionText) || !Number.isSafeInteger(Number(revisionText)))) throw new NoteValidationError('Révision de note invalide.');
    const result = await updateDb(db => {
      const current = db.posts.find(post => post.id === id);
      if (current && revisionText !== null && Number(revisionText) !== noteRevision(current)) return current;
      if (current) rememberNoteRevision(db, id, noteRevision(current));
      db.posts = db.posts.filter(post => post.id !== id); return null;
    });
    if (result) return conflict(result);
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error, 'Impossible de supprimer la note. Réessayez.'); }
}
