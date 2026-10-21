import { inDurableTransaction, readDurableDocument, writeDurableDocument } from '@/lib/durable-store';
import type { Owner } from '@/lib/auth-store';

export type AccountBilling = {
  memberId: string;
  customerId?: string;
  subscriptionId?: string;
  status: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  lastEventCreated: number;
  lastEventId: string;
  lastObservedAt?: number;
};
const MEMBER_ID = /^member_[a-f0-9-]{36}$/;
export function billingMode(): 'test' | 'live' { return process.env.STRIPE_MODE === 'live' ? 'live' : 'test'; }

export async function getAccountBilling(memberId: string): Promise<AccountBilling | null> {
  if (!MEMBER_ID.test(memberId)) throw new Error('Compte invalide.');
  const raw = await readDurableDocument(`billing:${billingMode()}:${memberId}`);
  return raw ? JSON.parse(raw) : null;
}

/** Called only after Stripe signature verification and server-side account mapping. */
export async function setAccountBilling(value: AccountBilling): Promise<void> {
  if (!MEMBER_ID.test(value.memberId) || !Number.isFinite(value.lastEventCreated) || !value.lastEventId) throw new Error('Événement d’abonnement invalide.');
  await inDurableTransaction(async () => {
    if (await readDurableDocument(`member:${value.memberId}`) === null) throw new Error('Compte introuvable.');
    const previous = await getAccountBilling(value.memberId);
    if (previous && (previous.lastEventCreated > value.lastEventCreated || previous.lastEventId === value.lastEventId)) return;
    if (previous && previous.lastEventCreated === value.lastEventCreated && (previous.lastObservedAt || 0) > (value.lastObservedAt || 0)) return;
    // A canceled Stripe subscription cannot become active again under the same ID.
    if (previous && previous.subscriptionId === value.subscriptionId && previous.status === 'canceled' && value.status !== 'canceled') return;
    if (previous?.customerId && value.customerId && previous.customerId !== value.customerId) throw new Error('Le client Stripe ne correspond pas au compte.');
    if (value.customerId) {
      const mapped = await memberIdForCustomer(value.customerId);
      if (mapped && mapped !== value.memberId) throw new Error('Le client Stripe appartient à un autre compte.');
    }
    await writeDurableDocument(`billing:${billingMode()}:${value.memberId}`, JSON.stringify({ ...previous, ...value }));
    if (value.customerId) await writeDurableDocument(`billing-customer:${billingMode()}:${value.customerId}`, value.memberId);
  });
}

export async function memberIdForCustomer(customerId: string): Promise<string | null> {
  if (!/^cus_[a-zA-Z0-9]+$/.test(customerId)) return null;
  return readDurableDocument(`billing-customer:${billingMode()}:${customerId}`);
}

export async function setMemberCustomer(memberId: string, customerId: string): Promise<void> {
  if (!MEMBER_ID.test(memberId) || !/^cus_[a-zA-Z0-9]+$/.test(customerId)) throw new Error('Compte de facturation invalide.');
  await inDurableTransaction(async () => {
    if (await readDurableDocument(`member:${memberId}`) === null) throw new Error('Compte introuvable.');
    const previous = await getAccountBilling(memberId);
    if (previous?.customerId && previous.customerId !== customerId) throw new Error('Le client Stripe ne correspond pas au compte.');
    const mapped = await memberIdForCustomer(customerId);
    if (mapped && mapped !== memberId) throw new Error('Le client Stripe appartient à un autre compte.');
    await writeDurableDocument(`billing:${billingMode()}:${memberId}`, JSON.stringify({ memberId, status: 'none', lastEventCreated: 0, lastEventId: '', ...previous, customerId }));
    await writeDurableDocument(`billing-customer:${billingMode()}:${customerId}`, memberId);
  });
}

export async function hasWorkspaceAccess(account: Owner): Promise<boolean> {
  if (!account.id) return true;
  const billing = await getAccountBilling(account.id);
  return !!billing && ['active', 'trialing'].includes(billing.status) && typeof billing.currentPeriodEnd === 'number' && billing.currentPeriodEnd * 1000 > Date.now();
}
