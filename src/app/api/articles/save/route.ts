import { NextResponse } from 'next/server';
import { protectApi } from '@/lib/auth';
import { getDb, updateDb } from '@/lib/db';
import { RSSArticle } from '@/types';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const article: RSSArticle = await req.json();

    if (!article || !article.id) {
      return NextResponse.json({ error: 'Article invalide' }, { status: 400 });
    }

    const result = await updateDb(db => {
      if (!db.savedArticles) db.savedArticles = [];
      const existingIndex = db.savedArticles.findIndex(a => a.id === article.id);
      const isSaved = existingIndex < 0;
      if (existingIndex >= 0) {
        db.savedArticles.splice(existingIndex, 1);
      } else {
        db.savedArticles.unshift({ ...article, saved: true });
      }
      return { isSaved, savedArticles: db.savedArticles };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde de l\'article' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const db = await getDb();
    return NextResponse.json({ savedArticles: db.savedArticles || [] });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
