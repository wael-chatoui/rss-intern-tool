'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { freshWorkspaceState, normalizeWorkspaceState, readWorkspaceUrl, workspaceUrl, type FeedContext, type FeedView, type WorkspaceState } from '@/lib/workspace-state';

export function useWorkspaceNavigation(storageKey: string, feedReady: boolean, notesReady: boolean, blocked = false) {
  const [state, setState] = useState(freshWorkspaceState);
  const [ready, setReady] = useState(false);
  const current = useRef(state);
  const intent = useRef(0);
  const initialized = useRef(false);
  const navigationBlocked = useRef(blocked);
  navigationBlocked.current = blocked;
  const pendingScroll = useRef<number | null>(null);
  const remember = useCallback((next: WorkspaceState) => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* URLs still preserve navigation if storage is unavailable. */ }
  }, [storageKey]);
  const captureScroll = useCallback((value: WorkspaceState) => {
    if (value.activeArticleId) return value;
    const next = { ...value, scroll: { ...value.scroll, [value.view]: window.scrollY } };
    if (value.view === 'veille' || value.view === 'saved') next.feeds = { ...value.feeds, [value.view]: { ...value.feeds[value.view], scrollY: window.scrollY } };
    return next;
  }, []);
  const historyState = (next: WorkspaceState, readerEntry = !!window.history.state?.redactionReaderEntry) => ({ ...window.history.state, redactionWorkspace: next, redactionReaderEntry: !!next.activeArticleId && readerEntry });

  const update = useCallback((change: Partial<WorkspaceState> | ((previous: WorkspaceState) => WorkspaceState), push = false) => {
    if (navigationBlocked.current) return;
    const previous = captureScroll(current.current);
    const next = normalizeWorkspaceState(typeof change === 'function' ? change(previous) : { ...previous, ...change });
    if (workspaceUrl(next) !== workspaceUrl(previous)) intent.current += 1;
    if (push && workspaceUrl(next) !== workspaceUrl(previous)) {
      window.history.replaceState(historyState(previous), '', workspaceUrl(previous));
      window.history.pushState(historyState(next, !!next.activeArticleId && !previous.activeArticleId), '', workspaceUrl(next));
    } else window.history.replaceState(historyState(next), '', workspaceUrl(next));
    const feedScrollChanged = (next.view === 'veille' || next.view === 'saved') && next.feeds[next.view].scrollY !== previous.feeds[next.view].scrollY;
    if (next.view !== previous.view || feedScrollChanged || (previous.activeArticleId && !next.activeArticleId)) {
      pendingScroll.current = next.view === 'veille' || next.view === 'saved' ? next.feeds[next.view].scrollY : next.scroll[next.view] || 0;
    }
    current.current = next; setState(next); remember(next);
  }, [captureScroll, remember]);

  const closeReader = useCallback(() => {
    if (!current.current.activeArticleId || navigationBlocked.current) return;
    intent.current += 1;
    if (window.history.state?.redactionReaderEntry) window.history.back();
    else update({ activeArticleId: null });
  }, [update]);

  const updateFeed = useCallback((patch: Partial<FeedContext> | ((feed: FeedContext) => FeedContext), target?: FeedView) => {
    update(previous => {
      const view = target || (previous.view === 'saved' ? 'saved' : 'veille');
      const feed = previous.feeds[view];
      const changed = typeof patch === 'function' ? patch(feed) : { ...feed, ...patch };
      const criteriaChanged = ['query', 'category', 'language', 'feedId', 'tab'].some(key => feed[key as keyof FeedContext] !== changed[key as keyof FeedContext]);
      return { ...previous, feeds: { ...previous.feeds, [view]: { ...changed, ...(criteriaChanged ? { visibleCount: 15, scrollY: 0 } : {}) } } };
    });
  }, [update]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let stored: unknown;
    try { stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* Start with a clean navigation state. */ }
    const next = readWorkspaceUrl(window.location.search, normalizeWorkspaceState(stored));
    current.current = next; setState(next); setReady(true);
    pendingScroll.current = next.view === 'veille' || next.view === 'saved' ? next.feeds[next.view].scrollY : next.scroll[next.view] || 0;
    window.history.replaceState(historyState(next), '', workspaceUrl(next));
    remember(next);
  }, [remember, storageKey]);

  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      if (navigationBlocked.current) {
        window.history.pushState(historyState(current.current, false), '', workspaceUrl(current.current));
        return;
      }
      const restored = event.state?.redactionWorkspace ? normalizeWorkspaceState(event.state.redactionWorkspace) : readWorkspaceUrl(window.location.search, current.current);
      const previous = captureScroll(current.current);
      // Back restores the visited view's historical context. Other views keep
      // their most recently used filters and positions, rather than an older
      // snapshot from before the user visited them.
      const next: WorkspaceState = {
        ...restored,
        feeds: {
          veille: restored.view === 'veille' ? restored.feeds.veille : previous.feeds.veille,
          saved: restored.view === 'saved' ? restored.feeds.saved : previous.feeds.saved,
        },
        scroll: { ...previous.scroll, [restored.view]: restored.scroll[restored.view] || 0 },
      };
      intent.current += 1;
      current.current = next; setState(next); remember(next);
      pendingScroll.current = next.view === 'veille' || next.view === 'saved' ? next.feeds[next.view].scrollY : next.scroll[next.view] || 0;
    };
    let frame = 0;
    const saveScroll = () => {
      if (frame || pendingScroll.current !== null || current.current.activeArticleId) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = captureScroll(current.current);
        current.current = next; remember(next);
        window.history.replaceState(historyState(next), '');
      });
    };
    const pageHide = () => remember(captureScroll(current.current));
    window.addEventListener('popstate', pop);
    window.addEventListener('scroll', saveScroll, { passive: true });
    window.addEventListener('pagehide', pageHide);
    const oldRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('popstate', pop); window.removeEventListener('scroll', saveScroll); window.removeEventListener('pagehide', pageHide);
      window.history.scrollRestoration = oldRestoration;
    };
  }, [captureScroll, remember]);

  useEffect(() => {
    const contentReady = state.view === 'veille' || state.view === 'saved' ? feedReady : state.view === 'notes' || state.view === 'planning' ? notesReady : true;
    if (!ready || !contentReady || state.activeArticleId || pendingScroll.current === null) return;
    const top = pendingScroll.current;
    const frame = requestAnimationFrame(() => { window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }); pendingScroll.current = null; });
    return () => cancelAnimationFrame(frame);
  }, [ready, feedReady, notesReady, state]);

  const getIntent = useCallback(() => intent.current, []);
  return { state, update, updateFeed, closeReader, getIntent, ready };
}
