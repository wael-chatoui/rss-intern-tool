import { NextResponse } from 'next/server';
import { protectApi } from '@/lib/auth';
import { getDb, updateDb } from '@/lib/db';
import { FeedSource } from '@/types';
import { feedErrorMessage, discoverFeed, normalizeFeedUrl } from '@/lib/rss';
import { resolveFeedUrl } from '@/lib/feed-catalog';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const db = await getDb();
    return NextResponse.json({ feeds: db.feeds, health: db.feedHealth || [] });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve feeds' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const { name, url, category, language, website } = body;
    if (typeof url !== 'string' || !url.trim() || (name !== undefined && typeof name !== 'string')) {
      return NextResponse.json({ error: 'Renseignez l’adresse du site ou du flux RSS.' }, { status: 400 });
    }
    let feedUrl: string;
    let siteUrl: string | undefined;
    try {
      feedUrl = new URL(resolveFeedUrl(url)).href;
      normalizeFeedUrl(feedUrl);
      if (typeof website === 'string' && website.trim()) siteUrl = normalizeFeedUrl(website);
    } catch {
      return NextResponse.json({ error: 'Utilisez une adresse complète commençant par https:// ou http://.' }, { status: 400 });
    }
    const sameAddress = (candidate: FeedSource, address: string) => {
      try { return normalizeFeedUrl(resolveFeedUrl(candidate.url)) === normalizeFeedUrl(address); }
      catch { return false; }
    };
    const duplicateResponse = (feed: FeedSource) => NextResponse.json({ error: `Cette source existe déjà : ${feed.name}.${feed.enabled ? '' : ' Elle est en pause, vous pouvez la réactiver.'}`, feedId: feed.id }, { status: 409 });
    const database = await getDb();
    const existing = database.feeds.find(feed => sameAddress(feed, feedUrl));
    if (existing) return duplicateResponse(existing);

    let discovered: Awaited<ReturnType<typeof discoverFeed>>;
    try {
      discovered = await discoverFeed(feedUrl);
      feedUrl = new URL(discovered.url).href;
      normalizeFeedUrl(feedUrl);
    } catch (parseError) {
      return NextResponse.json({ error: `Impossible d’ajouter cette source : ${feedErrorMessage(parseError)}.` }, { status: 422 });
    }
    const newFeed: FeedSource = {
      id: `custom-${crypto.randomUUID()}`,
      name: (typeof name === 'string' ? name.trim() : '') || discovered.parsed.title?.trim() || new URL(feedUrl).hostname.replace(/^www\./, ''),
      url: feedUrl,
      category: ['general', 'haute-couture', 'business', 'streetwear', 'trends', 'sustainability'].includes(category) ? category : 'general',
      language: language === 'en' ? 'en' : 'fr',
      website: siteUrl || (() => { try { return normalizeFeedUrl(discovered.parsed.link || new URL(feedUrl).origin); } catch { return new URL(feedUrl).origin; } })(),
      enabled: true,
    };
    const saved = await updateDb(db => {
      const duplicate = db.feeds.find(feed => sameAddress(feed, feedUrl));
      if (duplicate) return { duplicate, feeds: db.feeds };
      db.feeds.push(newFeed);
      return { duplicate: null, feeds: db.feeds };
    });
    if (saved.duplicate) return duplicateResponse(saved.duplicate);
    return NextResponse.json({ feed: newFeed, feeds: saved.feeds }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'ajout du flux.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const { id, enabled } = body;

    const result = await updateDb(db => {
      const matchingFeed = db.feeds.find(f => f.id === id);
      if (!matchingFeed) return null;
      if (typeof enabled === 'boolean') matchingFeed.enabled = enabled;
      return { feed: matchingFeed, feeds: db.feeds };
    });
    if (!result) {
      return NextResponse.json({ error: 'Flux non trouvé' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur mise à jour flux' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    const feeds = await updateDb(db => {
      db.feeds = db.feeds.filter(f => f.id !== id);
      db.feedHealth = (db.feedHealth || []).filter(item => item.feedId !== id);
      return db.feeds;
    });

    return NextResponse.json({ success: true, feeds });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur suppression flux' }, { status: 500 });
  }
}
