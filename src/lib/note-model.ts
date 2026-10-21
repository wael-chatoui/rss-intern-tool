import type { DatabaseSchema, NoteSource, RSSArticle, SocialPost } from '@/types';

const STATUSES = ['idea', 'in_progress', 'ready', 'published'] as const;
const PLATFORMS = ['tiktok', 'instagram', 'linkedin'] as const;
const POST_FIELDS = ['id', 'revision', 'notes', 'sources', 'articleId', 'sourceArticleTitle', 'sourceArticleLink', 'sourceArticleFeed', 'angle', 'tags', 'status', 'scheduledDate', 'scheduledTime', 'platforms', 'content', 'createdAt', 'updatedAt'];

export class NoteValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'NoteValidationError'; }
}
function invalid(field: string, message: string): never { throw new NoteValidationError(`${field} : ${message}`); }
function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field, 'objet attendu.');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: readonly string[], field: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(field, `champ non reconnu « ${key} ».`);
}
function text(value: unknown, field: string, maximum: number, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') invalid(field, 'texte attendu.');
  if (value.length > maximum) invalid(field, `maximum ${maximum} caractères.`);
  return value;
}
function texts(value: unknown, field: string, maximum: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) invalid(field, 'liste de 200 éléments maximum attendue.');
  return value.map((item, index) => text(item, `${field}[${index}]`, maximum));
}
function webLink(value: unknown, field: string): string {
  const link = text(value, field, 4096).trim();
  if (!link) return '';
  try { if (!['http:', 'https:'].includes(new URL(link).protocol)) invalid(field, 'URL HTTP ou HTTPS requise.'); }
  catch (error) { if (error instanceof NoteValidationError) throw error; invalid(field, 'URL invalide.'); }
  return link;
}
function optionalText(value: unknown, field: string, maximum: number): string | undefined {
  return value === undefined ? undefined : text(value, field, maximum);
}
function isoDate(value: unknown, field: string, fallback: string): string {
  const result = text(value, field, 100, fallback);
  if (!Number.isFinite(Date.parse(result))) invalid(field, 'date invalide.');
  const day = /^\d{4}-\d{2}-\d{2}/.exec(result)?.[0];
  if (day && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) invalid(field, 'jour invalide.');
  return result;
}

export function noteRevision(post: Pick<SocialPost, 'revision'>): number { return post.revision ?? 0; }

type RevisionHistory = Pick<DatabaseSchema, 'noteRevisions'>;
/** Revision history belongs to this server and must never be loaded from an import. */
export function rememberNoteRevision(database: RevisionHistory, id: string, revision: number): void {
  const journal = database.noteRevisions && typeof database.noteRevisions === 'object' && !Array.isArray(database.noteRevisions) ? database.noteRevisions : {};
  const previous = Object.prototype.hasOwnProperty.call(journal, id) ? journal[id] : 0;
  const floor = Number.isSafeInteger(previous) && previous >= 0 ? previous : 0;
  const value = Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
  // Imported IDs may include names such as __proto__; define a data property safely.
  Object.defineProperty(journal, id, { value: Math.max(floor, value), writable: true, enumerable: true, configurable: true });
  database.noteRevisions = journal;
}
export function nextNoteRevision(database: RevisionHistory, id: string, current?: Pick<SocialPost, 'revision'>): number {
  rememberNoteRevision(database, id, current ? noteRevision(current) : 0);
  const floor = database.noteRevisions![id];
  if (floor >= Number.MAX_SAFE_INTEGER) throw new NoteValidationError('La limite de révision de cette note est atteinte. Conservez son contenu dans une nouvelle note.');
  const revision = floor + 1;
  rememberNoteRevision(database, id, revision);
  return revision;
}

function sourceKey(source: NoteSource): string {
  if (source.link) {
    try { const link = new URL(source.link); link.hash = ''; return `url:${link.toString()}`; } catch { /* Legacy sources may have no URL. */ }
  }
  return source.articleId ? `id:${source.articleId}` : `label:${source.title}\n${source.feed}`;
}
export function mergeNoteSources(...lists: readonly NoteSource[][]): NoteSource[] {
  const result = new Map<string, NoteSource>();
  for (const source of lists.flat()) {
    const key = sourceKey(source);
    const previous = result.get(key);
    result.set(key, previous ? {
      ...source, ...previous,
      title: previous.title || source.title, link: previous.link || source.link, feed: previous.feed || source.feed,
      ...(previous.articleId || source.articleId ? { articleId: previous.articleId || source.articleId } : {}),
      ...(previous.excerpt || source.excerpt ? { excerpt: previous.excerpt || source.excerpt } : {}),
    } : { ...source });
  }
  return Array.from(result.values());
}
export function getNoteSources(post: Pick<SocialPost, 'sources' | 'articleId' | 'sourceArticleTitle' | 'sourceArticleLink' | 'sourceArticleFeed'>): NoteSource[] {
  if (post.sources !== undefined) return mergeNoteSources(post.sources);
  if (!post.articleId && !post.sourceArticleTitle && !post.sourceArticleLink && !post.sourceArticleFeed) return [];
  return [{ ...(post.articleId ? { articleId: post.articleId } : {}), title: post.sourceArticleTitle || '', link: post.sourceArticleLink || '', feed: post.sourceArticleFeed || '' }];
}
export function sourceFromArticle(article: RSSArticle): NoteSource {
  return { articleId: article.id, title: article.title, link: article.link, feed: article.feedName, ...(article.snippet && !article.snippet.startsWith('Aucun aperçu') ? { excerpt: article.snippet } : {}) };
}
export function noteSearchText(post: SocialPost): string {
  return [post.angle, post.notes || '', ...post.tags, ...getNoteSources(post).flatMap(source => [source.title, source.feed, source.link, source.excerpt || '']), ...Object.values(post.content).flatMap(content => Object.values(content).flat())].join(' ');
}
/** Keep older clients/exporters compatible while making sources the canonical reference list. */
export function withNoteSources<T extends SocialPost>(post: T, sources = getNoteSources(post)): T {
  const first = sources[0];
  return { ...post, sources, articleId: first?.articleId, sourceArticleTitle: first?.title || '', sourceArticleLink: first?.link || '', sourceArticleFeed: first?.feed || '' };
}

export function validateNoteSources(value: unknown): NoteSource[] | undefined {
  if (value !== undefined) {
    if (!Array.isArray(value) || value.length > 200) invalid('Sources', 'liste de 200 sources maximum attendue.');
    return mergeNoteSources(value.map((value, index) => {
      const source = record(value, `Source ${index + 1}`); fields(source, ['articleId', 'title', 'link', 'feed', 'excerpt'], `Source ${index + 1}`);
      return { articleId: optionalText(source.articleId, 'Identifiant article', 200), title: text(source.title, 'Titre source', 2000), link: webLink(source.link, 'Lien source'), feed: text(source.feed, 'Média source', 500), excerpt: optionalText(source.excerpt, 'Extrait source', 100_000) };
    }));
  }
  return undefined;
}

/** Parse untrusted note input. Defaults support legacy notes; existing fields are preserved by PUT before parsing. */
export function validateNotePost(value: unknown, options: { id?: string; now?: string; requireRevision?: boolean } = {}): SocialPost {
  const item = record(value, 'Note');
  fields(item, POST_FIELDS, 'Note');
  if (item.id !== undefined) text(item.id, 'Identifiant', 200);
  if (options.requireRevision && item.revision === undefined) invalid('Révision', 'révision de la note requise.');
  if (item.revision !== undefined && (!Number.isSafeInteger(item.revision) || (item.revision as number) < 0)) invalid('Révision', 'entier positif ou nul attendu.');
  const now = options.now || new Date().toISOString();
  const content = record(item.content === undefined ? {} : item.content, 'Contenu'); fields(content, PLATFORMS, 'Contenu');
  const tiktok = record(content.tiktok === undefined ? {} : content.tiktok, 'TikTok'); fields(tiktok, ['hook', 'script', 'visualNotes', 'durationEstimate'], 'TikTok');
  const instagram = record(content.instagram === undefined ? {} : content.instagram, 'Instagram'); fields(instagram, ['caption', 'carouselSlides', 'hashtags'], 'Instagram');
  const linkedin = record(content.linkedin === undefined ? {} : content.linkedin, 'LinkedIn'); fields(linkedin, ['title', 'body', 'keyTakeaways'], 'LinkedIn');
  const status = item.status === undefined ? 'idea' : item.status;
  if (!STATUSES.includes(status as typeof STATUSES[number])) invalid('Statut', 'valeur non reconnue.');
  const platforms = item.platforms === undefined ? [] : item.platforms;
  if (!Array.isArray(platforms) || platforms.length > 3 || platforms.some(platform => !PLATFORMS.includes(platform))) invalid('Canaux', 'liste de canaux invalide.');
  const scheduledDate = optionalText(item.scheduledDate, 'Date prévue', 10);
  if (scheduledDate && (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !Number.isFinite(Date.parse(`${scheduledDate}T00:00:00Z`)) || new Date(`${scheduledDate}T00:00:00Z`).toISOString().slice(0, 10) !== scheduledDate)) invalid('Date prévue', 'jour invalide (AAAA-MM-JJ attendu).');
  const scheduledTime = optionalText(item.scheduledTime, 'Heure prévue', 5);
  if (scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime)) invalid('Heure prévue', 'heure invalide (HH:mm attendu).');
  const sources = validateNoteSources(item.sources);
  const createdAt = isoDate(item.createdAt, 'Création', now);
  const post: SocialPost = {
    id: options.id || text(item.id, 'Identifiant', 200), revision: item.revision as number | undefined,
    angle: text(item.angle, 'Titre', 2000, 'Note sans titre'), notes: optionalText(item.notes, 'Notes', 1_000_000),
    sources, articleId: optionalText(item.articleId, 'Identifiant article', 200),
    sourceArticleTitle: optionalText(item.sourceArticleTitle, 'Titre source', 2000), sourceArticleLink: item.sourceArticleLink === undefined ? undefined : webLink(item.sourceArticleLink, 'Lien source'), sourceArticleFeed: optionalText(item.sourceArticleFeed, 'Média source', 500),
    tags: texts(item.tags, 'Mots-clés', 200), status: status as SocialPost['status'], scheduledDate, scheduledTime, platforms: Array.from(new Set(platforms)) as SocialPost['platforms'],
    content: {
      tiktok: { hook: text(tiktok.hook, 'Accroche', 10_000), script: text(tiktok.script, 'Script', 1_000_000), visualNotes: text(tiktok.visualNotes, 'Notes visuelles', 100_000), durationEstimate: text(tiktok.durationEstimate, 'Durée', 100) },
      instagram: { caption: text(instagram.caption, 'Légende', 1_000_000), carouselSlides: texts(instagram.carouselSlides, 'Slides', 100_000), hashtags: texts(instagram.hashtags, 'Hashtags', 200) },
      linkedin: { title: text(linkedin.title, 'Titre LinkedIn', 2000), body: text(linkedin.body, 'Publication', 1_000_000), keyTakeaways: texts(linkedin.keyTakeaways, 'Points clés', 100_000) },
    }, createdAt, updatedAt: isoDate(item.updatedAt, 'Modification', createdAt),
  };
  return withNoteSources(post);
}
