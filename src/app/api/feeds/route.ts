import { NextResponse } from 'next/server';
import { getDb, updateDb } from '@/lib/db';
import { FeedSource } from '@/types';
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 5000 });
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    return NextResponse.json({ feeds: db.feeds });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve feeds' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, url, category, language, website } = body;

    if (!name || !url) {
      return NextResponse.json({ error: 'Le nom et l\'URL du flux sont requis.' }, { status: 400 });
    }

    // Quick verification that the URL is a readable RSS feed
    try {
      await parser.parseURL(url);
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Impossible de lire ce flux RSS. Vérifiez que l\'URL pointe bien vers un flux XML/RSS valide.' },
        { status: 422 }
      );
    }

    const newFeed: FeedSource = {
      id: `custom-${crypto.randomUUID()}`,
      name: name.trim(),
      url: url.trim(),
      category: category || 'trends',
      language: language || 'fr',
      website: website || url,
      enabled: true,
    };

    await updateDb(db => {
      db.feeds.push(newFeed);
    });

    return NextResponse.json({ feed: newFeed }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'ajout du flux.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, enabled } = body;

    const feed = await updateDb(db => {
      const matchingFeed = db.feeds.find(f => f.id === id);
      if (!matchingFeed) return null;
      if (typeof enabled === 'boolean') matchingFeed.enabled = enabled;
      return matchingFeed;
    });
    if (!feed) {
      return NextResponse.json({ error: 'Flux non trouvé' }, { status: 404 });
    }

    return NextResponse.json({ feed });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur mise à jour flux' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    await updateDb(db => {
      db.feeds = db.feeds.filter(f => f.id !== id);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur suppression flux' }, { status: 500 });
  }
}
