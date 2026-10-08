import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { RSSArticle } from '@/types';

export async function POST(req: Request) {
  try {
    const article: RSSArticle = await req.json();

    if (!article || !article.id) {
      return NextResponse.json({ error: 'Article invalide' }, { status: 400 });
    }

    const db = await getDb();
    if (!db.savedArticles) {
      db.savedArticles = [];
    }

    const existingIndex = db.savedArticles.findIndex(a => a.id === article.id);
    let isSaved = false;

    if (existingIndex >= 0) {
      // Remove
      db.savedArticles.splice(existingIndex, 1);
      isSaved = false;
    } else {
      // Add
      db.savedArticles.unshift({ ...article, saved: true });
      isSaved = true;
    }

    await saveDb(db);
    return NextResponse.json({ success: true, isSaved, savedArticles: db.savedArticles });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde de l\'article' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = await getDb();
    return NextResponse.json({ savedArticles: db.savedArticles || [] });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
