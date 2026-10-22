import { authenticatedFetch } from './auth-client';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export only the server-selected workspace, including after subscription expiry. */
export async function downloadAccountSnapshot() {
  const response = await authenticatedFetch('/api/account/export', { cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'Le téléchargement est indisponible. Réessayez.');
  }
  downloadBlob(await response.blob(), 'la-redaction-sauvegarde.json');
}
