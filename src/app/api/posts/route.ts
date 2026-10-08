import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { SocialPost } from '@/types';

export async function GET() {
  try {
    const db = await getDb();
    return NextResponse.json({ posts: db.posts || [] });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur récupération posts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = await getDb();

    if (!db.posts) {
      db.posts = [];
    }

    const newPost: SocialPost = {
      id: `post-${Date.now()}`,
      articleId: body.articleId,
      sourceArticleTitle: body.sourceArticleTitle || '',
      sourceArticleLink: body.sourceArticleLink || '',
      sourceArticleFeed: body.sourceArticleFeed || '',
      angle: body.angle || 'Nouvel angle éditorial',
      tags: body.tags || ['Mode', 'FashionPress'],
      status: body.status || 'idea',
      scheduledDate: body.scheduledDate || new Date().toISOString().split('T')[0],
      scheduledTime: body.scheduledTime || '18:00',
      platforms: body.platforms || ['tiktok', 'instagram', 'linkedin'],
      content: {
        tiktok: {
          hook: body.content?.tiktok?.hook || '',
          script: body.content?.tiktok?.script || '',
          visualNotes: body.content?.tiktok?.visualNotes || '',
          durationEstimate: body.content?.tiktok?.durationEstimate || '30s-45s',
        },
        instagram: {
          caption: body.content?.instagram?.caption || '',
          carouselSlides: body.content?.instagram?.carouselSlides || [],
          hashtags: body.content?.instagram?.hashtags || ['#Fashion', '#Mode', '#Trends'],
        },
        linkedin: {
          title: body.content?.linkedin?.title || '',
          body: body.content?.linkedin?.body || '',
          keyTakeaways: body.content?.linkedin?.keyTakeaways || [],
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.posts.unshift(newPost);
    await saveDb(db);

    return NextResponse.json({ post: newPost }, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Erreur création post' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const updatedPost: SocialPost = await req.json();
    if (!updatedPost || !updatedPost.id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    const db = await getDb();
    const index = (db.posts || []).findIndex(p => p.id === updatedPost.id);

    if (index === -1) {
      return NextResponse.json({ error: 'Post non trouvé' }, { status: 404 });
    }

    updatedPost.updatedAt = new Date().toISOString();
    db.posts[index] = updatedPost;
    await saveDb(db);

    return NextResponse.json({ post: updatedPost });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur mise à jour post' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    const db = await getDb();
    db.posts = (db.posts || []).filter(p => p.id !== id);
    await saveDb(db);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur suppression post' }, { status: 500 });
  }
}
