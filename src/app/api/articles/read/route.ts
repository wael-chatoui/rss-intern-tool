import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { articleId, read } = await req.json();

    if (!articleId) {
      return NextResponse.json({ error: 'Article ID requis' }, { status: 400 });
    }

    const db = await getDb();
    if (!db.readArticleIds) {
      db.readArticleIds = [];
    }

    const isCurrentlyRead = db.readArticleIds.includes(articleId);

    if (read === false) {
      // Mark as unread
      db.readArticleIds = db.readArticleIds.filter(id => id !== articleId);
    } else {
      // Mark as read
      if (!isCurrentlyRead) {
        db.readArticleIds.push(articleId);
      }
    }

    await saveDb(db);
    return NextResponse.json({ success: true, read: read !== false });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur mise à jour statut lu' }, { status: 500 });
  }
}
