export class RequestBodyError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function boundedJson(request: Request, maximum = 4096): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RequestBodyError('La requête doit être au format JSON.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError('La requête est vide.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new RequestBodyError('La requête est trop volumineuse.', 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestBodyError('La requête JSON est invalide.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestBodyError('Un objet JSON est requis.');
  return body;
}
