import { NextResponse } from 'next/server';
import { protectApi } from '@/lib/auth';
import { getDb, updateDb } from '@/lib/db';
import { SocialPost } from '@/types';

export async function GET(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const db = await getDb();
    return NextResponse.json({ posts: db.posts || [] });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur récupération posts' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const newPost: SocialPost = {
      id: `post-${crypto.randomUUID()}`,
      notes: typeof body.notes === 'string' ? body.notes : '',
      articleId: body.articleId,
      sourceArticleTitle: body.sourceArticleTitle || '',
      sourceArticleLink: body.sourceArticleLink || '',
      sourceArticleFeed: body.sourceArticleFeed || '',
      angle: body.angle || 'Nouvel angle éditorial',
      tags: body.tags || [],
      status: body.status || 'idea',
      scheduledDate: body.scheduledDate || undefined,
      scheduledTime: body.scheduledTime || undefined,
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
          hashtags: body.content?.instagram?.hashtags || [],
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

    await updateDb(db => {
      if (!db.posts) db.posts = [];
      db.posts.unshift(newPost);
    });

    return NextResponse.json({ post: newPost }, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Erreur création post' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const denied = await protectApi(req);
  if (denied) return denied;
  try {
    const updatedPost: SocialPost = await req.json();
    if (!updatedPost || !updatedPost.id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    const post = await updateDb(db => {
      const index = (db.posts || []).findIndex(p => p.id === updatedPost.id);
      if (index === -1) return null;
      const savedPost = { ...updatedPost, updatedAt: new Date().toISOString() };
      db.posts[index] = savedPost;
      return savedPost;
    });
    if (!post) {
      return NextResponse.json({ error: 'Post non trouvé' }, { status: 404 });
    }
    return NextResponse.json({ post });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur mise à jour post' }, { status: 500 });
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

    await updateDb(db => {
      db.posts = (db.posts || []).filter(p => p.id !== id);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur suppression post' }, { status: 500 });
  }
}
