import { AsyncLocalStorage } from 'node:async_hooks';
import { cookies } from 'next/headers';
import { AUTH_COOKIE, getSession } from '@/lib/auth-store';
import { usesDurableStorage } from '@/lib/durable-store';

const context = new AsyncLocalStorage<string>();
const MEMBER_ID = /^member_[a-f0-9-]{36}$/;

/** Maintenance/tests only. Web requests always derive this identifier from the opaque session. */
export function inWorkspace<T>(id: string, operation: () => Promise<T>): Promise<T> {
  if (id !== 'owner' && !MEMBER_ID.test(id)) throw new Error('Espace invalide.');
  return context.run(id, operation);
}

export async function currentWorkspaceId(): Promise<string> {
  const explicit = context.getStore();
  if (explicit) return explicit;
  if (!usesDurableStorage()) return 'owner';
  const user = await getSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!user) throw new Error('Une session est requise pour accéder à cet espace.');
  if (user.id && MEMBER_ID.test(user.id)) return user.id;
  if (user.id) throw new Error('Espace invalide.');
  return 'owner';
}

export async function editorialDocumentId(): Promise<string> {
  const id = await currentWorkspaceId();
  return id === 'owner' ? 'editorial' : `editorial:${id}`;
}

export async function backupDocumentPrefix(): Promise<string> {
  const id = await currentWorkspaceId();
  return id === 'owner' ? 'backup:' : `backup:${id}:`;
}
