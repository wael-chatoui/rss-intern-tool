import { NextResponse } from 'next/server';
import { updateDb } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { articleId, read } = await req.json();

    if (!articleId) {
      return NextResponse.json({ error: 'Article ID requis' }, { status: 400 });
    }

    await updateDb(db => {
      if (!db.readArticleIds) db.readArticleIds = [];
      if (read === false) {
        db.readArticleIds = db.readArticleIds.filter(id => id !== articleId);
      } else if (!db.readArticleIds.includes(articleId)) {
        db.readArticleIds.push(articleId);
      }
    });
    return NextResponse.json({ success: true, read: read !== false });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur mise à jour statut lu' }, { status: 500 });
  }
}
