import { NextResponse } from 'next/server';
import { protectApi } from '@/lib/auth';
import {
  MAX_TRANSFER_BYTES, TransferError, applyTransferImport, getTransferSnapshot,
  previewTransferImport, readTransferBackup,
} from '@/lib/transfer-store';
import type { DuplicatePolicy, ImportMode } from '@/lib/transfer-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function failure(error: unknown) {
  if (error instanceof TransferError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Transfer operation failed:', error);
  return NextResponse.json({ error: 'Impossible de terminer le transfert. Vos données existantes sont conservées.' }, { status: 500 });
}
async function requestJson(request: Request): Promise<Record<string, unknown>> {
  // protectApi verifies the configured origin before this parser is reached.
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_TRANSFER_BYTES) throw new TransferError('Le fichier dépasse la limite de 20 Mo.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new TransferError('Aucun fichier reçu.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_TRANSFER_BYTES) { await reader.cancel(); throw new TransferError('Le fichier dépasse la limite de 20 Mo.', 413); }
    chunks.push(value);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new TransferError('Le fichier JSON est invalide.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TransferError('La requête JSON doit contenir un objet.');
  return value as Record<string, unknown>;
}
export async function GET(request: Request) {
  const denied = await protectApi(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get('backup');
    if (id !== null) {
      const backup = await readTransferBackup(id);
      return new NextResponse(backup.text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${backup.id}"`, 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json(await getTransferSnapshot(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const denied = await protectApi(request);
  if (denied) return denied;
  try {
    const body = await requestJson(request);
    if (body.action !== 'preview' && body.action !== 'apply') throw new TransferError('Action de transfert non reconnue.');
    const mode = body.mode === undefined ? 'merge' : body.mode as ImportMode;
    const duplicates = body.duplicates === undefined ? 'skip' : body.duplicates as DuplicatePolicy;
    if (body.action === 'preview') return NextResponse.json(await previewTransferImport(body.data, mode, duplicates));
    if (body.expectedRevision !== undefined && typeof body.expectedRevision !== 'string') throw new TransferError('Révision de prévisualisation invalide.');
    return NextResponse.json(await applyTransferImport(body.data, mode, duplicates, body.expectedRevision as string | undefined));
  } catch (error) { return failure(error); }
}
