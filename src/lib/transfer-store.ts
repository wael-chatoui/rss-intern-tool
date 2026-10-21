import fs from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { DATA_DIR, getDb, updateDb } from '@/lib/db';
import { createArticleId } from '@/lib/rss';
import { getNoteSources, nextNoteRevision, noteRevision, rememberNoteRevision, validateNoteSources, NoteValidationError, withNoteSources } from '@/lib/note-model';
import type { TransferData } from '@/lib/transfer-formats';
import type { DatabaseSchema, FeedSource, RSSArticle, SocialPost } from '@/types';

export const MAX_TRANSFER_BYTES = 20 * 1024 * 1024;
export const MAX_TRANSFER_RECORDS = 10_000;
const BACKUP_DIRECTORY = path.join(DATA_DIR, 'backups');
const BACKUP_NAME = /^auto-(\d{13})-[a-f0-9-]{36}\.json$/;
const CATEGORIES = ['all', 'general', 'haute-couture', 'business', 'streetwear', 'trends', 'sustainability'] as const;
const PLATFORMS = ['tiktok', 'instagram', 'linkedin'] as const;
const STATUSES = ['idea', 'in_progress', 'ready', 'published'] as const;

export type ImportMode = 'merge' | 'replace';
export type DuplicatePolicy = 'skip' | 'update';
type Action = 'add' | 'update' | 'skip';
type Collection = 'feeds' | 'posts' | 'articles';
type Counts = { added: number; updated: number; skipped: number };
export interface BackupInfo { id: string; createdAt: string; size: number }
export interface ImportPreview {
  data: TransferData;
  revision: string;
  summary: Record<Collection, Counts>;
  warnings: string[];
  entries: { kind: Collection; title: string; action: Action }[];
  truncated?: boolean;
}
export interface ApplyImportResult {
  success: true;
  preview: ImportPreview;
  revision: string;
  backup: BackupInfo;
  backups: BackupInfo[];
}
export class TransferError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'TransferError'; }
}

function fail(location: string, message: string): never { throw new TransferError(`${location} : ${message}`); }
function object(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(location, 'objet attendu.');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[], location: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(location, `champ non reconnu « ${key} ».`);
}
function string(value: unknown, location: string, maximum = 2_000, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') fail(location, 'texte attendu.');
  if (value.length > maximum) fail(location, `texte trop long (maximum ${maximum} caractères).`);
  return value;
}
function optionalString(value: unknown, location: string, maximum = 2_000): string | undefined {
  return value === undefined ? undefined : string(value, location, maximum);
}
function boolean(value: unknown, location: string, fallback?: boolean): boolean | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(location, 'booléen attendu.');
  return value;
}
function enumeration<T extends string>(value: unknown, options: readonly T[], location: string, fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !options.includes(value as T)) fail(location, 'valeur non reconnue.');
  return value as T;
}
function array(value: unknown, location: string, maximum = MAX_TRANSFER_RECORDS): unknown[] {
  if (!Array.isArray(value)) fail(location, 'liste attendue.');
  if (value.length > maximum) fail(location, `liste trop longue (maximum ${maximum}).`);
  return value;
}
function texts(value: unknown, location: string, maximumLength = 10_000): string[] {
  return array(value === undefined ? [] : value, location, 200).map((item, index) => string(item, `${location}[${index}]`, maximumLength));
}
function url(value: unknown, location: string, fallback?: string): string {
  const text = string(value, location, 4_096, fallback).trim();
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') fail(location, 'URL HTTP ou HTTPS requise.');
  } catch (error) {
    if (error instanceof TransferError) throw error;
    fail(location, 'URL invalide.');
  }
  return text;
}
function optionalUrl(value: unknown, location: string): string | undefined {
  if (value === undefined) return undefined;
  if (value === '') return '';
  return url(value, location);
}
function canonicalUrl(value: string): string {
  const parsed = new URL(value); parsed.hash = ''; return parsed.toString();
}
function date(value: unknown, location: string, fallback?: string): string {
  const text = string(value, location, 100, fallback);
  if (!text || !Number.isFinite(Date.parse(text))) fail(location, 'date invalide.');
  const isoDay = /^\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
  if (isoDay && new Date(`${isoDay}T00:00:00Z`).toISOString().slice(0, 10) !== isoDay) fail(location, 'jour invalide.');
  return text;
}
function scheduleDate(value: unknown, location: string): string | undefined {
  if (value === undefined || value === '') return value;
  const text = string(value, location, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) fail(location, 'jour invalide (AAAA-MM-JJ attendu).');
  return text;
}
function scheduleTime(value: unknown, location: string): string | undefined {
  if (value === undefined || value === '') return value;
  const text = string(value, location, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) fail(location, 'heure invalide (HH:mm attendu).');
  return text;
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
function feed(value: unknown, location: string): FeedSource {
  const item = object(value, location);
  fields(item, ['id', 'name', 'url', 'category', 'language', 'website', 'enabled', 'favicon'], location);
  const feedUrl = url(item.url, `${location}.url`);
  const name = string(item.name, `${location}.name`, 500).trim();
  if (!name) fail(location, 'nom de source requis.');
  return defined({
    id: string(item.id, `${location}.id`, 200, `feed_${hash(canonicalUrl(feedUrl)).slice(0, 24)}`),
    name, url: feedUrl,
    category: enumeration(item.category, CATEGORIES, `${location}.category`, 'general'),
    language: enumeration(item.language, ['fr', 'en'], `${location}.language`, 'fr'),
    website: url(item.website, `${location}.website`, feedUrl),
    enabled: boolean(item.enabled, `${location}.enabled`, true)!,
    favicon: optionalUrl(item.favicon, `${location}.favicon`),
  });
}
function postFingerprint(item: SocialPost): string {
  return hash(JSON.stringify([item.angle, item.notes || '', getNoteSources(item).map(source => [source.link, source.title, source.feed, source.excerpt || '']), item.tags, item.content]));
}
function post(value: unknown, location: string, exportedAt: string): SocialPost {
  const item = object(value, location);
  fields(item, ['id', 'revision', 'notes', 'sources', 'articleId', 'sourceArticleTitle', 'sourceArticleLink', 'sourceArticleFeed', 'angle', 'tags', 'status', 'scheduledDate', 'scheduledTime', 'platforms', 'content', 'createdAt', 'updatedAt'], location);
  const content = object(item.content === undefined ? {} : item.content, `${location}.content`);
  fields(content, ['tiktok', 'instagram', 'linkedin'], `${location}.content`);
  const tiktok = object(content.tiktok === undefined ? {} : content.tiktok, `${location}.tiktok`);
  const instagram = object(content.instagram === undefined ? {} : content.instagram, `${location}.instagram`);
  const linkedin = object(content.linkedin === undefined ? {} : content.linkedin, `${location}.linkedin`);
  fields(tiktok, ['hook', 'script', 'visualNotes', 'durationEstimate'], `${location}.tiktok`);
  fields(instagram, ['caption', 'carouselSlides', 'hashtags'], `${location}.instagram`);
  fields(linkedin, ['title', 'body', 'keyTakeaways'], `${location}.linkedin`);
  if (item.revision !== undefined && (!Number.isSafeInteger(item.revision) || (item.revision as number) < 0)) fail(location, 'révision invalide.');
  let sources;
  try { sources = validateNoteSources(item.sources); } catch (error) {
    if (error instanceof NoteValidationError) fail(location, error.message);
    throw error;
  }
  const createdAt = date(item.createdAt, `${location}.createdAt`, exportedAt);
  const result: SocialPost = defined({
    id: string(item.id, `${location}.id`, 200, ''),
    revision: item.revision as number | undefined, sources,
    notes: optionalString(item.notes, `${location}.notes`, 1_000_000),
    articleId: optionalString(item.articleId, `${location}.articleId`, 200),
    sourceArticleTitle: optionalString(item.sourceArticleTitle, `${location}.sourceArticleTitle`),
    sourceArticleLink: optionalUrl(item.sourceArticleLink, `${location}.sourceArticleLink`),
    sourceArticleFeed: optionalString(item.sourceArticleFeed, `${location}.sourceArticleFeed`, 500),
    angle: string(item.angle, `${location}.angle`, 2_000, 'Sans titre'),
    tags: texts(item.tags, `${location}.tags`, 200),
    status: enumeration(item.status, STATUSES, `${location}.status`, 'idea'),
    scheduledDate: scheduleDate(item.scheduledDate, `${location}.scheduledDate`),
    scheduledTime: scheduleTime(item.scheduledTime, `${location}.scheduledTime`),
    platforms: array(item.platforms === undefined ? [] : item.platforms, `${location}.platforms`, 3).map((platform, index) => enumeration(platform, PLATFORMS, `${location}.platforms[${index}]`)),
    content: {
      tiktok: { hook: string(tiktok.hook, `${location}.hook`, 10_000, ''), script: string(tiktok.script, `${location}.script`, 1_000_000, ''), visualNotes: string(tiktok.visualNotes, `${location}.visualNotes`, 100_000, ''), durationEstimate: string(tiktok.durationEstimate, `${location}.durationEstimate`, 100, '') },
      instagram: { caption: string(instagram.caption, `${location}.caption`, 1_000_000, ''), carouselSlides: texts(instagram.carouselSlides, `${location}.carouselSlides`, 100_000), hashtags: texts(instagram.hashtags, `${location}.hashtags`, 200) },
      linkedin: { title: string(linkedin.title, `${location}.title`, 2_000, ''), body: string(linkedin.body, `${location}.body`, 1_000_000, ''), keyTakeaways: texts(linkedin.keyTakeaways, `${location}.keyTakeaways`, 100_000) },
    },
    createdAt, updatedAt: date(item.updatedAt, `${location}.updatedAt`, createdAt),
  });
  if (!result.id) result.id = `note_${postFingerprint(result).slice(0, 24)}`;
  return result;
}
function article(value: unknown, location: string, exportedAt: string): RSSArticle {
  const item = object(value, location);
  fields(item, ['id', 'feedId', 'feedName', 'feedLanguage', 'category', 'title', 'link', 'pubDate', 'author', 'snippet', 'content', 'imageUrl', 'saved', 'read'], location);
  const link = url(item.link, `${location}.link`);
  const feedName = string(item.feedName, `${location}.feedName`, 500, new URL(link).hostname);
  const feedId = string(item.feedId, `${location}.feedId`, 200, `feed_${hash(feedName).slice(0, 24)}`);
  return defined({
    id: string(item.id, `${location}.id`, 200, createArticleId(feedId, canonicalUrl(link))),
    feedId, feedName,
    feedLanguage: enumeration(item.feedLanguage, ['fr', 'en'], `${location}.feedLanguage`, 'fr'),
    category: enumeration(item.category, CATEGORIES, `${location}.category`, 'general'),
    title: string(item.title, `${location}.title`, 2_000, 'Sans titre'), link,
    pubDate: date(item.pubDate, `${location}.pubDate`, exportedAt),
    author: optionalString(item.author, `${location}.author`, 500),
    snippet: string(item.snippet, `${location}.snippet`, 100_000, ''),
    content: optionalString(item.content, `${location}.content`, 1_000_000),
    imageUrl: optionalUrl(item.imageUrl, `${location}.imageUrl`),
    saved: boolean(item.saved, `${location}.saved`), read: boolean(item.read, `${location}.read`),
  });
}

export function validateTransferData(value: unknown): TransferData {
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { throw new TransferError('Le fichier ne contient pas des données JSON valides.'); }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_TRANSFER_BYTES) throw new TransferError('Le fichier dépasse la limite de 20 Mo.', 413);
  const item = object(value, 'Fichier');
  fields(item, ['version', 'kind', 'exportedAt', 'feeds', 'posts', 'savedArticles', 'cachedArticles', 'readArticleIds', 'lastFetchedAt', 'noteRevisions'], 'Fichier');
  if (item.version !== 1) fail('Fichier', 'version non prise en charge.');
  const kind = enumeration(item.kind, ['backup', 'notes', 'feeds', 'articles'], 'Fichier.kind');
  if (item.noteRevisions !== undefined) {
    if (kind !== 'backup') fail('Fichier.noteRevisions', 'ce champ interne est accepté uniquement dans une sauvegarde brute.');
    const journal = object(item.noteRevisions, 'Fichier.noteRevisions');
    for (const revision of Object.values(journal)) if (!Number.isSafeInteger(revision) || (revision as number) < 0) fail('Fichier.noteRevisions', 'révision invalide.');
    // Deliberately discard imported counters: only this server's history is authoritative.
  }
  const exportedAt = date(item.exportedAt, 'Fichier.exportedAt');
  const data: TransferData = { version: 1, kind, exportedAt };
  let count = 0;
  for (const key of ['feeds', 'posts', 'savedArticles', 'cachedArticles', 'readArticleIds'] as const) {
    if (item[key] === undefined) continue;
    const values = array(item[key], `Fichier.${key}`);
    count += values.length;
    if (count > MAX_TRANSFER_RECORDS) fail('Fichier', 'maximum 10 000 enregistrements par import.');
    if (key === 'feeds') data.feeds = values.map((value, index) => feed(value, `Sources[${index}]`));
    else if (key === 'posts') data.posts = values.map((value, index) => post(value, `Notes[${index}]`, exportedAt));
    else if (key === 'readArticleIds') data.readArticleIds = values.map((value, index) => string(value, `Articles lus[${index}]`, 200));
    else data[key] = values.map((value, index) => article(value, `${key}[${index}]`, exportedAt));
  }
  if (item.lastFetchedAt !== undefined) data.lastFetchedAt = date(item.lastFetchedAt, 'Fichier.lastFetchedAt');
  if (kind === 'backup' && (!data.feeds || !data.posts || !data.savedArticles)) fail('Sauvegarde', 'les listes feeds, posts et savedArticles sont requises.');
  if (kind === 'notes' && !data.posts) fail('Notes', 'liste posts manquante.');
  if (kind === 'feeds' && !data.feeds) fail('Sources', 'liste feeds manquante.');
  if (kind === 'articles' && !data.savedArticles && !data.cachedArticles) fail('Articles', 'aucune collection d’articles fournie.');
  const sourceIds = new Map<string, string>();
  for (const source of data.feeds || []) {
    if (!source.id.trim()) fail('Sources', 'identifiant vide.');
    const previous = sourceIds.get(source.id);
    if (previous && previous !== canonicalUrl(source.url)) fail('Sources', 'un même identifiant désigne plusieurs URL.');
    sourceIds.set(source.id, canonicalUrl(source.url));
  }
  const stableArticleIds = new Map<string, string>();
  for (const item of [...(data.savedArticles || []), ...(data.cachedArticles || [])]) {
    if (!item.feedId.trim()) fail('Articles', 'identifiant de source vide.');
    if (!/^rss_[a-f0-9]{24}$/.test(item.id)) continue;
    const identity = `${item.feedId}:${canonicalUrl(item.link)}`;
    const previous = stableArticleIds.get(item.id);
    if (previous && previous !== identity) fail('Articles', 'un même identifiant stable désigne plusieurs articles.');
    stableArticleIds.set(item.id, identity);
  }
  return data;
}

export function databaseRevision(database: DatabaseSchema): string { return hash(JSON.stringify(database)); }
export function snapshotDatabase(database: DatabaseSchema): TransferData {
  const saved = new Set((database.savedArticles || []).map(item => item.id));
  const read = new Set(database.readArticleIds || []);
  const annotate = (item: RSSArticle): RSSArticle => ({ ...structuredClone(item), saved: saved.has(item.id), read: read.has(item.id) });
  return defined({
    version: 1 as const, kind: 'backup' as const, exportedAt: new Date().toISOString(),
    feeds: structuredClone(database.feeds), posts: structuredClone(database.posts || []),
    savedArticles: (database.savedArticles || []).map(annotate), cachedArticles: (database.cachedArticles || []).map(annotate),
    readArticleIds: [...(database.readArticleIds || [])], lastFetchedAt: database.lastFetchedAt,
  });
}

function importPlan(database: DatabaseSchema, rawData: unknown, mode: ImportMode, duplicates: DuplicatePolicy): { preview: ImportPreview; next: DatabaseSchema } {
  if (mode !== 'merge' && mode !== 'replace') throw new TransferError('Mode d’import non reconnu.');
  if (duplicates !== 'skip' && duplicates !== 'update') throw new TransferError('Politique de doublons non reconnue.');
  const data = validateTransferData(rawData);
  if (mode === 'replace' && data.kind !== 'backup') throw new TransferError('Seule une sauvegarde complète peut remplacer les données.');
  if (mode === 'replace') {
    for (const [name, items] of [['feeds', data.feeds], ['posts', data.posts]] as const) {
      if (new Set((items || []).map(item => item.id)).size !== items?.length) fail('Sauvegarde', `identifiants répétés dans ${name}.`);
    }
    for (const [name, items] of [['savedArticles', data.savedArticles], ['cachedArticles', data.cachedArticles]] as const) {
      if (items && new Set(items.map(item => `${item.feedId}:${canonicalUrl(item.link)}`)).size !== items.length) fail('Sauvegarde', `articles répétés dans ${name}.`);
    }
  }
  const next = structuredClone(database);
  // Preserve tombstones for every current note before a complete restore can remove it.
  for (const post of database.posts) rememberNoteRevision(next, post.id, noteRevision(post));
  if (mode === 'replace') {
    next.feeds = []; next.posts = []; next.savedArticles = [];
    // Older backups may omit the cache or read history. Keep those metadata intact.
    if (data.cachedArticles !== undefined) next.cachedArticles = [];
    if (data.readArticleIds !== undefined) next.readArticleIds = [];
    if (data.lastFetchedAt !== undefined) next.lastFetchedAt = data.lastFetchedAt;
    else if (data.cachedArticles !== undefined) delete next.lastFetchedAt;
  }
  const actions = new Map<string, ImportPreview['entries'][number]>();
  const warnings: string[] = [];
  const record = (kind: Collection, key: string, title: string, action: Action) => {
    const previous = actions.get(`${kind}:${key}`);
    const rank = { skip: 0, update: 1, add: 2 };
    if (!previous || rank[action] > rank[previous.action]) actions.set(`${kind}:${key}`, { kind, title, action });
  };
  if (data.kind === 'articles') {
    const savedArticles = [...(data.savedArticles || [])];
    const savedIdentities = new Set(savedArticles.map(item => `${item.feedId}:${canonicalUrl(item.link)}`));
    for (const item of data.cachedArticles || []) {
      const identity = `${item.feedId}:${canonicalUrl(item.link)}`;
      if (!savedIdentities.has(identity)) { savedArticles.push({ ...item, saved: true }); savedIdentities.add(identity); }
    }
    data.savedArticles = savedArticles;
    warnings.push('Articles importés conservés dans Enregistrés.');
  }
  const feedRemap = new Map<string, string>();
  for (const incoming of data.feeds || []) {
    const key = canonicalUrl(incoming.url);
    const index = mode === 'replace' ? -1 : next.feeds.findIndex(item => canonicalUrl(item.url) === key);
    if (index >= 0) {
      feedRemap.set(incoming.id, next.feeds[index].id);
      const action = duplicates === 'update' ? 'update' : 'skip';
      if (action === 'update') next.feeds[index] = { ...next.feeds[index], ...incoming, id: next.feeds[index].id };
      record('feeds', key, incoming.name, action);
    } else {
      let id = incoming.id;
      let attempt = 0;
      while (next.feeds.some(item => item.id === id)) id = `feed_${hash(`${key}:${attempt++}`).slice(0, 24)}`;
      feedRemap.set(incoming.id, id);
      next.feeds.push({ ...incoming, id });
      record('feeds', key, incoming.name, 'add');
    }
  }
  if (data.feeds) data.feeds = data.feeds.map(item => ({ ...item, id: feedRemap.get(item.id) || item.id }));

  const articleIds = new Map<string, Set<string>>();
  const importedRead = new Set<string>();
  const importedUnread = new Set<string>();
  const articleKey = (item: RSSArticle) => `${item.feedId}:${canonicalUrl(item.link)}`;
  const identityIds = new Map<string, string>();
  const stableIdIdentities = new Map<string, string>();
  for (const item of [...next.savedArticles, ...(next.cachedArticles || [])]) {
    if (!/^rss_[a-f0-9]{24}$/.test(item.id)) continue;
    const identity = articleKey(item);
    if (!identityIds.has(identity)) identityIds.set(identity, item.id);
    stableIdIdentities.set(item.id, identity);
  }
  const importArticles = (key: 'savedArticles' | 'cachedArticles') => {
    const incomingArticles = data[key];
    if (incomingArticles === undefined) return;
    const destination = next[key] || [];
    data[key] = incomingArticles.map(incoming => {
      const feedId = feedRemap.get(incoming.feedId) || incoming.feedId;
      const identity = `${feedId}:${canonicalUrl(incoming.link)}`;
      const index = destination.findIndex(item => articleKey(item) === identity);
      const existing = index < 0 ? undefined : destination[index];
      const stableExisting = existing && /^rss_[a-f0-9]{24}$/.test(existing.id) ? existing.id : undefined;
      const stableIncoming = feedId === incoming.feedId && /^rss_[a-f0-9]{24}$/.test(incoming.id) ? incoming.id : undefined;
      let id = identityIds.get(identity) || stableExisting || stableIncoming || createArticleId(feedId, canonicalUrl(incoming.link));
      if (stableIdIdentities.has(id) && stableIdIdentities.get(id) !== identity) id = createArticleId(feedId, canonicalUrl(incoming.link));
      if (stableIdIdentities.has(id) && stableIdIdentities.get(id) !== identity) fail('Articles', 'collision d’identifiants avec les données existantes.');
      identityIds.set(identity, id); stableIdIdentities.set(id, identity);
      const normalized = { ...incoming, feedId, id, ...(key === 'savedArticles' ? { saved: true } : {}) };
      const remapped = articleIds.get(incoming.id) || new Set<string>();
      remapped.add(id); articleIds.set(incoming.id, remapped);
      if (existing && existing.id !== id) {
        const existingReferences = articleIds.get(existing.id) || new Set<string>();
        existingReferences.add(id); articleIds.set(existing.id, existingReferences);
      }
      const action = existing ? duplicates === 'update' ? 'update' : 'skip' : 'add';
      if (!existing) destination.push(normalized);
      else if (action === 'update') destination[index] = { ...existing, ...normalized };
      else if (existing.id !== id) destination[index] = { ...existing, id };
      if (incoming.read === true && action !== 'skip') importedRead.add(id);
      if (incoming.read === false && action === 'update') importedUnread.add(id);
      record('articles', identity, incoming.title, action);
      return normalized;
    });
    next[key] = destination;
  };
  importArticles('savedArticles'); importArticles('cachedArticles');
  for (const key of ['savedArticles', 'cachedArticles'] as const) {
    if (!next[key]) continue;
    next[key] = next[key]!.map(item => {
      const id = identityIds.get(articleKey(item)) || item.id;
      if (item.id !== id) {
        const replacements = articleIds.get(item.id) || new Set<string>();
        replacements.add(id); articleIds.set(item.id, replacements);
      }
      return item.id === id ? item : { ...item, id };
    });
  }
  const readIds = new Set((next.readArticleIds || []).flatMap(id => Array.from(articleIds.get(id) || [id])));
  importedUnread.forEach(id => readIds.delete(id));
  importedRead.forEach(id => readIds.add(id));
  for (const id of data.readArticleIds || []) {
    Array.from(articleIds.get(id) || [id]).forEach(mapped => readIds.add(mapped));
  }
  next.readArticleIds = Array.from(readIds);
  if (data.readArticleIds) data.readArticleIds = Array.from(new Set(data.readArticleIds.flatMap(id => Array.from(articleIds.get(id) || [id]))));

  const allArticles = [...next.savedArticles, ...(next.cachedArticles || [])];
  if (data.posts) data.posts = data.posts.map(incoming => {
    const remapSource = (source: import('@/types').NoteSource) => {
      const normalized = { ...source };
      const references = source.articleId ? articleIds.get(source.articleId) : undefined;
      if (references?.size === 1) normalized.articleId = Array.from(references)[0];
      if (source.link) {
        const matches = allArticles.filter(item => canonicalUrl(item.link) === canonicalUrl(source.link) && (!source.feed || item.feedName === source.feed));
        const ids = new Set(matches.map(item => item.id));
        if (ids.size === 1) normalized.articleId = Array.from(ids)[0];
        else if (references && references.size > 1) warnings.push(`« ${incoming.angle} » : lien vers l’article ambigu, référence d’origine conservée.`);
      } else if (references && references.size > 1) warnings.push(`« ${incoming.angle} » : référence d’article ambiguë, identifiant d’origine conservé.`);
      return normalized;
    };
    let normalized = incoming.sources !== undefined
      ? withNoteSources(incoming, getNoteSources(incoming).map(remapSource))
      : { ...incoming, articleId: remapSource(getNoteSources(incoming)[0] || { title: '', link: '', feed: '' }).articleId };
    const fingerprint = postFingerprint(normalized);
    const index = next.posts.findIndex(item => item.id === normalized.id || (mode === 'merge' && postFingerprint(item) === fingerprint));
    const existing = index < 0 ? undefined : next.posts[index];
    const action = existing ? duplicates === 'update' ? 'update' : 'skip' : 'add';
    if (existing) {
      normalized = { ...normalized, id: existing.id };
      if (action === 'update') {
        normalized.revision = nextNoteRevision(next, normalized.id, existing);
        next.posts[index] = { ...existing, ...normalized };
      }
    } else {
      // Revisions are local concurrency tokens, never restored from another file.
      const previous = database.posts.find(post => post.id === normalized.id);
      normalized.revision = nextNoteRevision(next, normalized.id, previous);
      next.posts.push(normalized);
    }
    record('posts', normalized.id, normalized.angle, action);
    return normalized;
  });
  next.posts = next.posts.map(item => {
    if (item.sources !== undefined) {
      const sources = item.sources.map(source => {
        const references = source.articleId ? articleIds.get(source.articleId) : undefined;
        if (references?.size === 1) return { ...source, articleId: Array.from(references)[0] };
        return source;
      });
      item = withNoteSources(item, sources);
    }
    if (!item.articleId) return item;
    const references = articleIds.get(item.articleId);
    if (references?.size === 1) return { ...item, articleId: Array.from(references)[0] };
    if (references && item.sourceArticleLink) {
      const matchingIds = new Set(allArticles.filter(article => canonicalUrl(article.link) === canonicalUrl(item.sourceArticleLink!) && (!item.sourceArticleFeed || article.feedName === item.sourceArticleFeed)).map(article => article.id));
      if (matchingIds.size === 1) return { ...item, articleId: Array.from(matchingIds)[0] };
    }
    return item;
  });
  if (mode === 'merge' && data.lastFetchedAt && !next.lastFetchedAt) next.lastFetchedAt = data.lastFetchedAt;
  if (mode === 'replace' && data.cachedArticles === undefined) warnings.push('Cette sauvegarde ne contient pas de cache RSS : le cache existant est conservé.');
  if (mode === 'replace' && data.readArticleIds === undefined) warnings.push('Cette sauvegarde ne contient pas d’historique de lecture : l’historique existant est conservé.');
  const count = next.feeds.length + next.posts.length + next.savedArticles.length + (next.cachedArticles?.length || 0) + (next.readArticleIds?.length || 0);
  if (count > MAX_TRANSFER_RECORDS) throw new TransferError('Le résultat dépasserait 10 000 enregistrements. Aucun élément n’a été importé.');
  if (Buffer.byteLength(JSON.stringify(next), 'utf8') > MAX_TRANSFER_BYTES) throw new TransferError('Le résultat dépasserait 20 Mo. Aucun élément n’a été importé.', 413);
  const summary = { feeds: { added: 0, updated: 0, skipped: 0 }, posts: { added: 0, updated: 0, skipped: 0 }, articles: { added: 0, updated: 0, skipped: 0 } };
  const entries = Array.from(actions.values());
  for (const entry of entries) summary[entry.kind][entry.action === 'add' ? 'added' : entry.action === 'update' ? 'updated' : 'skipped']++;
  return {
    next,
    preview: { data, revision: databaseRevision(database), summary, warnings: warnings.slice(0, 100), entries: entries.slice(0, 500), ...(entries.length > 500 ? { truncated: true } : {}) },
  };
}

export async function listTransferBackups(): Promise<BackupInfo[]> {
  let filenames: string[];
  try { filenames = await fs.readdir(BACKUP_DIRECTORY); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const results = await Promise.all(filenames.filter(name => BACKUP_NAME.test(name)).map(async id => {
    try {
      const stat = await fs.lstat(path.join(BACKUP_DIRECTORY, id));
      if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
      return { id, createdAt: new Date(Number(BACKUP_NAME.exec(id)![1])).toISOString(), size: stat.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }));
  return results.filter((item): item is BackupInfo => item !== undefined).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
async function createAutomaticBackup(database: DatabaseSchema): Promise<BackupInfo> {
  const createdAt = new Date().toISOString();
  const id = `auto-${Date.parse(createdAt)}-${randomUUID()}.json`;
  const text = JSON.stringify(snapshotDatabase(database), null, 2);
  await fs.mkdir(BACKUP_DIRECTORY, { recursive: true });
  const temporaryFile = path.join(BACKUP_DIRECTORY, `.${id}.tmp`);
  try {
    await fs.writeFile(temporaryFile, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await fs.rename(temporaryFile, path.join(BACKUP_DIRECTORY, id));
  } finally { await fs.rm(temporaryFile, { force: true }); }
  return { id, createdAt, size: Buffer.byteLength(text, 'utf8') };
}
export async function readTransferBackup(id: string): Promise<{ id: string; text: string }> {
  if (path.basename(id) !== id || !BACKUP_NAME.test(id)) throw new TransferError('Identifiant de sauvegarde invalide.');
  const filename = path.join(BACKUP_DIRECTORY, id);
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new TransferError('Sauvegarde introuvable.', 404);
    return { id, text: await fs.readFile(filename, 'utf8') };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new TransferError('Sauvegarde introuvable.', 404);
    throw error;
  }
}
export async function getTransferSnapshot(): Promise<{ data: TransferData; revision: string; backups: BackupInfo[] }> {
  const database = await getDb();
  return { data: snapshotDatabase(database), revision: databaseRevision(database), backups: await listTransferBackups() };
}
export async function previewTransferImport(data: unknown, mode: ImportMode = 'merge', duplicates: DuplicatePolicy = 'skip'): Promise<ImportPreview> {
  return importPlan(await getDb(), data, mode, duplicates).preview;
}
export async function applyTransferImport(data: unknown, mode: ImportMode, duplicates: DuplicatePolicy, expectedRevision?: string): Promise<ApplyImportResult> {
  if (!expectedRevision || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new TransferError('Prévisualisez le fichier avant de confirmer l’import.');
  const result = await updateDb(async database => {
    if (databaseRevision(database) !== expectedRevision) throw new TransferError('Les données ont changé depuis la prévisualisation. Actualisez l’aperçu avant de confirmer.', 409);
    const plan = importPlan(database, data, mode, duplicates);
    const backup = await createAutomaticBackup(database);
    Object.assign(database, plan.next);
    if (!('lastFetchedAt' in plan.next)) delete database.lastFetchedAt;
    return { preview: plan.preview, revision: databaseRevision(database), backup };
  });
  // Only snapshots generated by this feature are eligible for retention cleanup.
  let backups: BackupInfo[] = [result.backup];
  try {
    backups = await listTransferBackups();
    await Promise.all(backups.slice(10).map(backup => fs.rm(path.join(BACKUP_DIRECTORY, backup.id), { force: true })));
    backups = backups.slice(0, 10);
  } catch {
    result.preview.warnings.push('Import effectué. Le nettoyage des anciennes sauvegardes n’a pas pu être terminé.');
  }
  return { success: true, ...result, backups };
}
