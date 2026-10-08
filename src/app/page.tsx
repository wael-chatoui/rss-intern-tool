'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '@/components/Header';
import { FeedReaderSection } from '@/components/FeedReader/FeedReaderSection';
import { PressStudioSection, StudioTab } from '@/components/PressStudio/PressStudioSection';
import { AddFeedModal } from '@/components/FeedReader/AddFeedModal';
import { ManageFeedsModal } from '@/components/FeedReader/ManageFeedsModal';
import { SplitDivider } from '@/components/ui/SplitDivider';
import {
  FeedSource,
  RSSArticle,
  SocialPost,
  FashionCategory,
  Language,
  PostStatus,
  LayoutMode,
} from '@/types';

export default function Home() {
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [articles, setArticles] = useState<RSSArticle[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [currentPost, setCurrentPost] = useState<SocialPost | null>(null);

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState<FashionCategory>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('all');
  const [selectedFeedId, setSelectedFeedId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSavedOnly, setShowSavedOnly] = useState<boolean>(false);

  // Dynamic Mouse Resizing state (percentage of width for left feed pane)
  const [splitRatio, setSplitRatio] = useState<number>(48);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLElement>(null);

  // Layout mode (Split, Feed focused, Studio focused)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('split');

  // Studio tab state
  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>('editor');

  // Loading & Modals state
  const [isLoadingArticles, setIsLoadingArticles] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isAddFeedOpen, setIsAddFeedOpen] = useState<boolean>(false);
  const [isManageFeedsOpen, setIsManageFeedsOpen] = useState<boolean>(false);

  // Load split ratio preference on mount
  useEffect(() => {
    try {
      const savedRatio = localStorage.getItem('fashion_cockpit_split');
      if (savedRatio) {
        const parsed = parseFloat(savedRatio);
        if (!isNaN(parsed) && parsed >= 22 && parsed <= 78) {
          setSplitRatio(parsed);
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  // Handle dynamic mouse dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const newRatio = (currentX / rect.width) * 100;
      // Clamp ratio between 22% and 78% for good readability on both sides
      const clampedRatio = Math.min(Math.max(newRatio, 22), 78);
      setSplitRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem('fashion_cockpit_split', splitRatio.toString());
      } catch {
        // ignore
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, splitRatio]);

  const handleResetSplit = () => {
    setSplitRatio(50);
    setLayoutMode('split');
    try {
      localStorage.setItem('fashion_cockpit_split', '50');
    } catch {
      // ignore
    }
  };

  const handleLayoutModeChange = (mode: LayoutMode) => {
    setLayoutMode(mode);
    if (mode === 'feed-focused') {
      setSplitRatio(70);
    } else if (mode === 'studio-focused') {
      setSplitRatio(30);
    } else {
      setSplitRatio(50);
    }
  };

  // Fetch initial feeds & posts
  const fetchInitialData = useCallback(async () => {
    try {
      const [feedsRes, postsRes] = await Promise.all([
        fetch('/api/feeds'),
        fetch('/api/posts'),
      ]);

      const feedsData = await feedsRes.json();
      const postsData = await postsRes.json();

      if (feedsData.feeds) setFeeds(feedsData.feeds);
      if (postsData.posts) {
        setPosts(postsData.posts);
        if (postsData.posts.length > 0 && !currentPost) {
          setCurrentPost(postsData.posts[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  }, [currentPost]);

  // Fetch articles based on active filters (with caching & force refresh)
  const fetchArticles = useCallback(
    async (forceRefresh = false) => {
      setIsLoadingArticles(true);
      try {
        const params = new URLSearchParams();
        if (selectedCategory !== 'all') params.set('category', selectedCategory);
        if (selectedLanguage !== 'all') params.set('language', selectedLanguage);
        if (selectedFeedId !== 'all') params.set('feedId', selectedFeedId);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (forceRefresh) params.set('refresh', 'true');

        const res = await fetch(`/api/rss?${params.toString()}`);
        const data = await res.json();
        if (data.articles) {
          setArticles(data.articles);
        }
      } catch (error) {
        console.error('Error fetching articles:', error);
      } finally {
        setIsLoadingArticles(false);
      }
    },
    [selectedCategory, selectedLanguage, selectedFeedId, searchQuery]
  );

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    fetchArticles(false);
  }, [fetchArticles]);

  // Manual refresh all feeds
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchArticles(true);
    setIsRefreshing(false);
  };

  // Toggle bookmark on article
  const handleToggleSaveArticle = async (article: RSSArticle) => {
    try {
      const res = await fetch('/api/articles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article),
      });
      const data = await res.json();

      if (data.success) {
        setArticles((prev) =>
          prev.map((a) => (a.id === article.id ? { ...a, saved: data.isSaved } : a))
        );
      }
    } catch (error) {
      console.error('Error saving article:', error);
    }
  };

  // Toggle read status on article
  const handleToggleReadArticle = async (article: RSSArticle) => {
    try {
      const newReadStatus = !article.read;
      const res = await fetch('/api/articles/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id, read: newReadStatus }),
      });
      const data = await res.json();

      if (data.success) {
        setArticles((prev) =>
          prev.map((a) => (a.id === article.id ? { ...a, read: newReadStatus } : a))
        );
      }
    } catch (error) {
      console.error('Error toggling read status:', error);
    }
  };

  // Convert RSS article to a social media draft post
  const handleCreatePostFromArticle = async (article: RSSArticle) => {
    const defaultAngle = `Décryptage : ${article.title}`;
    const newPostDraft = {
      articleId: article.id,
      sourceArticleTitle: article.title,
      sourceArticleLink: article.link,
      sourceArticleFeed: article.feedName,
      angle: defaultAngle,
      tags: [article.feedName.replace(/\s+/g, ''), 'FashionTrends', 'Mode2026'],
      status: 'idea' as PostStatus,
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '18:00',
      platforms: ['tiktok', 'instagram', 'linkedin'],
      content: {
        tiktok: {
          hook: `Vous avez sûrement raté ce détail caché sur le défilé ${article.feedName}... 👀👗`,
          script: `[0:00 - 0:03] Hook : "Ce détail est passé inaperçu, mais il annonce le thème de toute la saison..."
[0:03 - 0:15] Contexte : ${article.snippet.slice(0, 120)}...
[0:15 - 0:35] Décryptage : Pourquoi ce choix est stratégique et ce que ça annonce pour la saison.
[0:35 - 0:45] CTA : Votre avis en commentaire : Top ou Flop ?`,
          visualNotes: 'Incrustation des visuels de la pièce/défilé, cuts rapides.',
          durationEstimate: '30s-45s',
        },
        instagram: {
          caption: `${article.title} ✨

${article.snippet}

💡 Les 3 points à retenir :
1. Une évolution majeure repérée sur les podiums
2. L'impact direct sur les tendances du prêt-à-porter
3. Ce que cela révèle sur l'orientation de la maison

Partagez votre regard en commentaire 💬

#FashionNews #${article.feedName.replace(/\s+/g, '')} #HauteCouture #Mode2026 #Trends`,
          carouselSlides: [
            `Slide 1 : Titre "Décryptage : ${article.title.slice(0, 30)}..."`,
            `Slide 2 : L'annonce et le contexte clé`,
            `Slide 3 : Les détails de confection ou l'impact business`,
            `Slide 4 : Synthèse et question ouverte`,
          ],
          hashtags: ['#FashionNews', '#Mode2026', '#FashionTrends', '#HauteCouture'],
        },
        linkedin: {
          title: `Analyse industrie : Les répercussions de l'annonce "${article.title.slice(0, 50)}"`,
          body: `L'actualité récente relayée par ${article.feedName} soulève des questions fondamentales pour l'écosystème mode et luxe.

${article.snippet}

Dans un marché où l'attention des consommateurs est ultra-fragmentée, cette orientation témoigne d'un recentrage stratégique :
- Consolidation de l'image de marque
- Réponse aux nouvelles attentes de durabilité et de désirabilité
- Adaptation des canaux de communication digitale

Quelle est votre lecture de ce mouvement stratégique ?`,
          keyTakeaways: [
            'Recentrage stratégique de la maison',
            'Impact direct sur la communication et le retail',
            'Évolution des attentes des acheteurs de luxe',
          ],
        },
      },
    };

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPostDraft),
      });

      const data = await res.json();
      if (data.post) {
        setPosts((prev) => [data.post, ...prev]);
        setCurrentPost(data.post);
        setActiveStudioTab('editor');
      }
    } catch (error) {
      console.error('Error creating post from article:', error);
    }
  };

  // Create empty post
  const handleNewPost = async () => {
    const emptyDraft = {
      angle: 'Nouveau sujet éditorial fashion',
      tags: ['Mode', 'FashionPress'],
      status: 'idea' as PostStatus,
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '18:00',
      platforms: ['tiktok', 'instagram', 'linkedin'],
      content: {
        tiktok: {
          hook: '',
          script: `[0:00 - 0:03] Hook : ...
[0:03 - 0:15] Contexte : ...
[0:15 - 0:35] Analyse : ...
[0:35 - 0:45] CTA : ...`,
          visualNotes: '',
          durationEstimate: '30s-45s',
        },
        instagram: {
          caption: '',
          carouselSlides: ['Slide 1 : Hook', 'Slide 2 : Détail', 'Slide 3 : Conclusion'],
          hashtags: ['#Fashion', '#Mode', '#Trends'],
        },
        linkedin: {
          title: '',
          body: '',
          keyTakeaways: ['Point clé 1', 'Point clé 2'],
        },
      },
    };

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emptyDraft),
      });
      const data = await res.json();
      if (data.post) {
        setPosts((prev) => [data.post, ...prev]);
        setCurrentPost(data.post);
        setActiveStudioTab('editor');
      }
    } catch (error) {
      console.error('Error creating new post:', error);
    }
  };

  const handleNewPostWithDate = async (dateStr: string) => {
    await handleNewPost();
    if (currentPost) {
      setCurrentPost({
        ...currentPost,
        scheduledDate: dateStr,
      });
    }
  };

  // Save/Update post
  const handleSavePost = async (updatedPost: SocialPost) => {
    try {
      const res = await fetch('/api/posts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPost),
      });
      const data = await res.json();
      if (data.post) {
        setPosts((prev) => prev.map((p) => (p.id === data.post.id ? data.post : p)));
        setCurrentPost(data.post);
      }
    } catch (error) {
      console.error('Error updating post:', error);
    }
  };

  // Update status (e.g. from Kanban)
  const handleUpdateStatus = async (post: SocialPost, newStatus: PostStatus) => {
    const updated = { ...post, status: newStatus };
    await handleSavePost(updated);
  };

  // Delete post
  const handleDeletePost = async (id: string) => {
    try {
      await fetch(`/api/posts?id=${id}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== id));
      if (currentPost?.id === id) {
        const remaining = posts.filter((p) => p.id !== id);
        setCurrentPost(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  // Toggle feed enabled/disabled
  const handleToggleFeed = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await fetch('/api/feeds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (data.feed) {
        setFeeds((prev) => prev.map((f) => (f.id === id ? data.feed : f)));
        fetchArticles(true);
      }
    } catch (error) {
      console.error('Error toggling feed:', error);
    }
  };

  // Delete feed
  const handleDeleteFeed = async (id: string) => {
    try {
      await fetch(`/api/feeds?id=${id}`, { method: 'DELETE' });
      setFeeds((prev) => prev.filter((f) => f.id !== id));
      fetchArticles(true);
    } catch (error) {
      console.error('Error deleting feed:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* Top Main Header with Consolidated Menu */}
      <Header
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onOpenManageFeeds={() => setIsManageFeedsOpen(true)}
        onOpenAddFeed={() => setIsAddFeedOpen(true)}
        layoutMode={layoutMode}
        onLayoutChange={handleLayoutModeChange}
        onResetSplit={handleResetSplit}
        onNewPost={handleNewPost}
        stats={{
          activeFeeds: feeds.filter((f) => f.enabled).length,
          totalArticles: articles.length,
          savedArticles: articles.filter((a) => a.saved).length,
          readyPosts: posts.filter((p) => p.status === 'ready' || p.status === 'published').length,
        }}
      />

      {/* Main Dynamically Resizable Cockpit Layout */}
      <main ref={containerRef} className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* LEFT PANE: Fashion RSS Veille & Actualités */}
        <div
          style={{ width: `${splitRatio}%` }}
          className={`h-1/2 md:h-full overflow-hidden shrink-0 ${
            isDragging ? '' : 'transition-[width] duration-150 ease-out'
          }`}
        >
          <FeedReaderSection
            articles={articles}
            feeds={feeds}
            isLoading={isLoadingArticles}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            selectedLanguage={selectedLanguage}
            onSelectLanguage={setSelectedLanguage}
            selectedFeedId={selectedFeedId}
            onSelectFeedId={setSelectedFeedId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSavedOnly={showSavedOnly}
            onToggleShowSavedOnly={() => setShowSavedOnly(!showSavedOnly)}
            onToggleSaveArticle={handleToggleSaveArticle}
            onToggleReadArticle={handleToggleReadArticle}
            onCreatePostFromArticle={handleCreatePostFromArticle}
          />
        </div>

        {/* Dynamic Draggable Split Handle (Mouse Resizer) */}
        <SplitDivider
          onMouseDown={() => setIsDragging(true)}
          onDoubleClick={handleResetSplit}
          isDragging={isDragging}
          splitPercentage={splitRatio}
        />

        {/* RIGHT PANE: Editorial & Social Press Studio */}
        <div
          style={{ width: `${100 - splitRatio}%` }}
          className={`h-1/2 md:h-full overflow-hidden flex-1 ${
            isDragging ? '' : 'transition-[width] duration-150 ease-out'
          }`}
        >
          <PressStudioSection
            posts={posts}
            currentPost={currentPost}
            activeTab={activeStudioTab}
            onTabChange={setActiveStudioTab}
            onSavePost={handleSavePost}
            onDeletePost={handleDeletePost}
            onNewPost={handleNewPost}
            onSelectPost={setCurrentPost}
            onUpdateStatus={handleUpdateStatus}
            onNewPostWithDate={handleNewPostWithDate}
          />
        </div>
      </main>

      {/* Modal: Add custom feed */}
      <AddFeedModal
        isOpen={isAddFeedOpen}
        onClose={() => setIsAddFeedOpen(false)}
        onFeedAdded={(newFeed) => {
          setFeeds((prev) => [...prev, newFeed]);
          fetchArticles(true);
        }}
      />

      {/* Modal: Manage & toggle feeds */}
      <ManageFeedsModal
        isOpen={isManageFeedsOpen}
        onClose={() => setIsManageFeedsOpen(false)}
        feeds={feeds}
        onToggleFeed={handleToggleFeed}
        onDeleteFeed={handleDeleteFeed}
        onOpenAddModal={() => setIsAddFeedOpen(true)}
      />
    </div>
  );
}
