import { unzipSync, zipSync } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getNoteSources } from '@/lib/note-model';
import type { FeedSource, RSSArticle, SocialPost } from '@/types';

export type TransferTarget = 'notes' | 'feeds' | 'articles' | 'backup';
export type ExportFormat = 'json' | 'opml' | 'md' | 'txt' | 'html' | 'csv' | 'pdf';
export type TransferData = {
  version: 1;
  kind: TransferTarget;
  exportedAt: string;
  feeds?: FeedSource[];
  posts?: SocialPost[];
  savedArticles?: RSSArticle[];
  cachedArticles?: RSSArticle[];
  readArticleIds?: string[];
  lastFetchedAt?: string;
};
type ExportResult = { bytes: Uint8Array; mime: string; filename: string; warnings?: string[] };
type UnknownRecord = Record<string, unknown>;
type VirtualFile = { name: string; bytes: Uint8Array };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 1000;
const nativeHtmlId = 'rss-transfer-data';
const archiveManifest = 'rss-transfer-manifest.json';
const targets: TransferTarget[] = ['notes', 'feeds', 'articles', 'backup'];
const blankContent = () => ({
  tiktok: { hook: '', script: '', visualNotes: '', durationEstimate: '' },
  instagram: { caption: '', carouselSlides: [] as string[], hashtags: [] as string[] },
  linkedin: { title: '', body: '', keyTakeaways: [] as string[] },
});

export function createTransferData(kind: TransferTarget): TransferData {
  return { version: 1, kind, exportedAt: new Date().toISOString() };
}

function record(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function arrayRecords(value: unknown, field: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((item) => !record(item))) throw new Error(`Le champ « ${field} » doit être une liste d’objets.`);
  return value;
}
function id(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}
function stringValue(value: unknown, fallback = '') { return typeof value === 'string' ? value : fallback; }
function stableFeedId(name: string) {
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return `import-source-${(hash >>> 0).toString(16)}`;
}
function normalisePost(value: UnknownRecord, fallbackTitle = 'Note importée'): SocialPost {
  const now = new Date().toISOString();
  const base: UnknownRecord = { ...value };
  if (!('id' in base)) base.id = id('note');
  if (!('angle' in base)) base.angle = base.title ?? fallbackTitle;
  if (!('notes' in base) && ('body' in base || 'text' in base || typeof base.content === 'string')) base.notes = base.body ?? base.text ?? base.content;
  if (!('tags' in base)) base.tags = [];
  if (!('status' in base)) base.status = 'idea';
  if (!('platforms' in base)) base.platforms = [];
  if (!('createdAt' in base)) base.createdAt = now;
  if (!('updatedAt' in base)) base.updatedAt = base.createdAt;
  for (const alias of ['title', 'body', 'text', 'date']) delete base[alias];
  const defaults = blankContent();
  if (!('content' in base) || typeof base.content === 'string') base.content = defaults;
  else if (record(base.content)) {
    const content = { ...base.content };
    for (const platform of ['tiktok', 'instagram', 'linkedin'] as const) {
      if (!(platform in content)) content[platform] = defaults[platform];
      else if (record(content[platform])) content[platform] = { ...defaults[platform], ...content[platform] };
    }
    base.content = content;
  }
  return base as unknown as SocialPost;
}
function normaliseFeed(value: UnknownRecord): FeedSource {
  const base = { ...value };
  if (!('id' in base)) base.id = id('feed');
  if (!('url' in base)) base.url = base.xmlUrl ?? base.feedUrl ?? '';
  if (!('name' in base)) base.name = base.title ?? base.text ?? base.url;
  if (!('website' in base)) base.website = base.htmlUrl ?? base.url;
  if (!('category' in base)) base.category = 'general';
  if (!('language' in base)) base.language = 'fr';
  if (!('enabled' in base)) base.enabled = true;
  for (const alias of ['xmlUrl', 'feedUrl', 'title', 'text', 'htmlUrl']) delete base[alias];
  return base as unknown as FeedSource;
}
function normaliseArticle(value: UnknownRecord): RSSArticle {
  const base = { ...value };
  if (!('id' in base)) base.id = id('article');
  if (!('title' in base)) base.title = base.headline ?? '';
  if (!('link' in base)) base.link = base.url ?? '';
  if (!('feedName' in base)) base.feedName = base.source ?? 'Source importée';
  if (!('feedId' in base)) base.feedId = stableFeedId(stringValue(base.feedName, 'Source importée'));
  if (!('feedLanguage' in base)) base.feedLanguage = base.language ?? 'fr';
  if (!('category' in base)) base.category = 'general';
  if (!('pubDate' in base)) base.pubDate = base.date ?? base.publishedAt ?? new Date().toISOString();
  if (!('snippet' in base)) base.snippet = base.summary ?? base.description ?? '';
  for (const alias of ['headline', 'url', 'source', 'language', 'date', 'publishedAt', 'summary', 'description']) delete base[alias];
  return base as unknown as RSSArticle;
}

/** Only missing defaults are filled here. The API validates every field before persistence. */
function jsonData(value: unknown, target: TransferTarget): TransferData {
  if (Array.isArray(value)) {
    const items = arrayRecords(value, target);
    const result = createTransferData(target);
    if (target === 'notes') result.posts = items.map((item) => normalisePost(item));
    else if (target === 'feeds') result.feeds = items.map(normaliseFeed);
    else if (target === 'articles') result.savedArticles = items.map(normaliseArticle);
    else throw new Error('Une sauvegarde doit contenir un objet avec feeds, posts et savedArticles.');
    return result;
  }
  if (!record(value)) throw new Error('Le fichier JSON doit contenir un objet ou une liste.');
  if ('version' in value && value.version !== 1) throw new Error('Cette version du format de transfert n’est pas prise en charge.');
  if ('kind' in value && !targets.includes(value.kind as TransferTarget)) throw new Error('Le type de transfert JSON est invalide.');
  const result = createTransferData(target);
  if (typeof value.exportedAt === 'string') result.exportedAt = value.exportedAt;
  let found = false;
  if (target === 'notes' || target === 'backup') {
    const key = 'posts' in value ? 'posts' : Array.isArray(value.notes) ? 'notes' : null;
    if (key) { result.posts = arrayRecords(value[key], key).map((item) => normalisePost(item)); found = true; }
    else if (target === 'notes' && ('angle' in value || 'title' in value || typeof value.notes === 'string' || 'body' in value || 'text' in value)) {
      result.posts = [normalisePost(value)]; found = true;
    }
  }
  if (target === 'feeds' || target === 'backup') {
    const key = 'feeds' in value ? 'feeds' : Array.isArray(value.sources) ? 'sources' : null;
    if (key) { result.feeds = arrayRecords(value[key], key).map(normaliseFeed); found = true; }
    else if (target === 'feeds' && ('url' in value || 'xmlUrl' in value || 'feedUrl' in value)) { result.feeds = [normaliseFeed(value)]; found = true; }
  }
  if (target === 'articles' || target === 'backup') {
    const key = 'savedArticles' in value ? 'savedArticles' : 'articles' in value ? 'articles' : null;
    if (key) { result.savedArticles = arrayRecords(value[key], key).map(normaliseArticle); found = true; }
    if ('cachedArticles' in value) { result.cachedArticles = arrayRecords(value.cachedArticles, 'cachedArticles').map(normaliseArticle); found = true; }
    if ('readArticleIds' in value) {
      if (!Array.isArray(value.readArticleIds) || value.readArticleIds.some((item) => typeof item !== 'string')) throw new Error('Le champ « readArticleIds » doit contenir uniquement des identifiants texte.');
      result.readArticleIds = value.readArticleIds;
    }
    if ('lastFetchedAt' in value) {
      if (typeof value.lastFetchedAt !== 'string') throw new Error('Le champ « lastFetchedAt » doit être une date au format texte.');
      result.lastFetchedAt = value.lastFetchedAt;
    }
    if (!found && target === 'articles' && ('title' in value || 'link' in value || 'url' in value)) { result.savedArticles = [normaliseArticle(value)]; found = true; }
  }
  if (!found) throw new Error(`Le fichier ne contient aucune collection compatible avec la cible « ${target} ».`);
  if (target === 'backup' && (!('feeds' in result) || !('posts' in result) || !('savedArticles' in result))) throw new Error('La sauvegarde doit contenir les collections feeds, posts et savedArticles, même vides.');
  return result;
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Le fichier JSON est mal formé.'); }
}
function decodeText(bytes: Uint8Array) {
  try { return decoder.decode(bytes).replace(/^\uFEFF/, ''); }
  catch { throw new Error('Le fichier texte doit être encodé en UTF-8.'); }
}
function baseName(name: string) { return name.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]*$/, '') || 'Note importée'; }
function extension(name: string) { return name.toLocaleLowerCase('en').split('.').pop() || ''; }
function textNote(title: string, notes: string) { return normalisePost({ angle: title, notes }); }

function parseMarkdown(text: string, filename: string, target: TransferTarget): TransferData {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let metadata: unknown;
  if (frontmatter) {
    try { metadata = parseYaml(frontmatter[1], { maxAliasCount: 0, uniqueKeys: true, strict: true }); }
    catch { throw new Error('Les métadonnées YAML du Markdown sont invalides (les alias ne sont pas autorisés).'); }
    if (record(metadata) && 'rss_note' in metadata) {
      const native = metadata.rss_note;
      if (!record(native) || native.version !== 1 || !record(native.post)) throw new Error('Les métadonnées natives de la note sont invalides.');
      if (target !== 'notes') throw new Error('Ce fichier Markdown contient une note. Choisissez la cible Notes.');
      return { ...createTransferData('notes'), posts: [normalisePost(native.post)] };
    }
    if (record(metadata) && 'rss_transfer' in metadata) return jsonData(metadata.rss_transfer, target);
  }
  if (target !== 'notes') throw new Error('Ce fichier Markdown ne contient pas de métadonnées d’articles natives. Importez-le dans Notes.');
  const body = frontmatter ? text.slice(frontmatter[0].length) : text;
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const values = record(metadata) ? metadata : {};
  const post = normalisePost({
    ...values,
    angle: values.angle ?? values.title ?? heading ?? baseName(filename),
    notes: body,
    ...(typeof values.date === 'string' && !('scheduledDate' in values) ? { scheduledDate: values.date } : {}),
  });
  return { ...createTransferData('notes'), posts: [post] };
}

function htmlEscape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', ugrave: 'ù', ouml: 'ö', ndash: '–', mdash: '—', hellip: '…' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? all;
    const code = parseInt(entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1), entity[1].toLowerCase() === 'x' ? 16 : 10);
    return code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : all;
  });
}
function htmlText(html: string) {
  const cleaned = html.replace(/<(script|style|noscript|iframe|form|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  if (typeof DOMParser !== 'undefined') {
    // Strip attributes before parsing, so even detached HTML cannot request remote images or frames.
    const inert = cleaned.replace(/<([a-z][\w:-]*)\b[^>]*>/gi, '<$1>').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|blockquote|section|article)\s*>/gi, '$&\n\n');
    const document = new DOMParser().parseFromString(inert, 'text/html');
    return (document.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  return decodeEntities(cleaned.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|h[1-6]|li|blockquote|section|article)\s*>/gi, '\n\n').replace(/<[^>]*>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function parseHtml(text: string, filename: string, target: TransferTarget): TransferData {
  const scripts = Array.from(text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi));
  const native = scripts.find((match) => /\bid\s*=\s*["']rss-transfer-data["']/i.test(match[1]) && /\btype\s*=\s*["']application\/json["']/i.test(match[1]));
  if (native) return jsonData(safeJsonParse(native[2]), target);
  if (target !== 'notes') throw new Error('Ce fichier HTML ne contient pas de métadonnées d’articles natives. Importez-le dans Notes.');
  const heading = text.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1] || text.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const body = text.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] || text.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i, '');
  return { ...createTransferData('notes'), posts: [textNote(heading ? htmlText(heading) : baseName(filename), htmlText(body))] };
}

function parseOpml(text: string): TransferData {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('Les déclarations de type et les entités externes sont interdites dans un fichier OPML.');
  const valid = XMLValidator.validate(text);
  if (valid !== true) throw new Error('Le fichier OPML est mal formé.');
  const parser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false, trimValues: false, processEntities: { maxTotalExpansions: 10000 }, isArray: (tagName) => tagName === 'outline' });
  const parsed: unknown = parser.parse(text);
  if (!record(parsed) || !record(parsed.opml) || !('body' in parsed.opml)) throw new Error('Le fichier doit contenir une structure OPML avec un élément body.');
  if (!record(parsed.opml.body)) {
    if (typeof parsed.opml.body === 'string' && !parsed.opml.body.trim()) return { ...createTransferData('feeds'), feeds: [] };
    throw new Error('L’élément body du fichier OPML est invalide.');
  }
  const feeds: FeedSource[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 100) throw new Error('Le fichier OPML contient trop de niveaux de dossiers.');
    const nodes = Array.isArray(value) ? value : value === undefined ? [] : [value];
    for (const node of nodes) {
      if (!record(node)) continue;
      if (typeof node['@_xmlUrl'] === 'string') {
        feeds.push(normaliseFeed({
          id: node['@_rssId'] ?? id('feed'), name: node['@_title'] ?? node['@_text'] ?? node['@_xmlUrl'],
          url: node['@_xmlUrl'], website: node['@_htmlUrl'] ?? node['@_xmlUrl'],
          category: node['@_rssCategory'] ?? node['@_category'] ?? 'trends',
          language: node['@_rssLanguage'] ?? node['@_language'] ?? 'fr',
          enabled: node['@_rssEnabled'] === undefined && node['@_enabled'] === undefined ? true : !['false', '0'].includes(String(node['@_rssEnabled'] ?? node['@_enabled']).toLowerCase()),
          ...(typeof node['@_rssFavicon'] === 'string' ? { favicon: node['@_rssFavicon'] } : {}),
        }));
      }
      visit(node.outline, depth + 1);
    }
  };
  visit(parsed.opml.body.outline, 0);
  return { ...createTransferData('feeds'), feeds };
}

function csvRows(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0];
  let quoted = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (let i = 0; i < first.length; i++) {
    if (first[i] === '"') { if (quoted && first[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && first[i] in counts) counts[first[i]]++;
  }
  const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows: string[][] = [];
  let row: string[] = [], field = '', inside = false, closed = false;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); if (row.some((cell) => cell.length)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (inside) {
      if (character === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inside = false; closed = true; }
      } else field += character;
    } else if (character === delimiter) pushField();
    else if (character === '\n' || character === '\r') { if (character === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else if (character === '"') {
      if (field || closed) throw new Error('Le CSV contient un guillemet inattendu.');
      inside = true;
    } else if (closed) { if (!/[ \t]/.test(character)) throw new Error('Le CSV contient du texte après un champ entre guillemets.'); }
    else field += character;
  }
  if (inside) throw new Error('Le CSV contient un champ entre guillemets non terminé.');
  if (field || row.length || closed) pushRow();
  return rows;
}
function normalisedHeader(value: string) { return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase(); }
function parseCsv(text: string): TransferData {
  const rows = csvRows(text);
  if (!rows.length) throw new Error('Le fichier CSV est vide.');
  const headers = rows.shift()!.map(normalisedHeader);
  if (new Set(headers).size !== headers.length) throw new Error('Le CSV contient des noms de colonnes en double.');
  const nativeIndex = headers.indexOf('__rss_article');
  const versionIndex = headers.indexOf('__rss_transfer_version');
  const collectionIndex = headers.indexOf('__rss_collection');
  const aliases: Record<string, string> = { titre: 'title', headline: 'title', url: 'link', lien: 'link', source: 'feedName', feedname: 'feedName', feedid: 'feedId', feedlanguage: 'feedLanguage', langue: 'feedLanguage', date: 'pubDate', pubdate: 'pubDate', publishedat: 'pubDate', resume: 'snippet', summary: 'snippet', description: 'snippet', contenu: 'content', auteur: 'author', imageurl: 'imageUrl', categorie: 'category', lu: 'read', enregistre: 'saved' };
  if (nativeIndex < 0 && !headers.some((header) => ['title', 'titre', 'headline', 'link', 'url', 'lien'].includes(header))) throw new Error('Le CSV doit contenir au moins une colonne titre ou lien.');
  const cachedArticles: RSSArticle[] = [];
  const articles = rows.flatMap((row, index) => {
    if (row.length !== headers.length) throw new Error(`Le CSV contient ${row.length} champs à la ligne ${index + 2}, au lieu de ${headers.length}.`);
    if (nativeIndex >= 0) {
      if (versionIndex < 0 || row[versionIndex] !== '1') throw new Error('La version du CSV natif est invalide.');
      const value = safeJsonParse(row[nativeIndex]);
      if (!record(value)) throw new Error(`Les métadonnées de l’article à la ligne ${index + 2} sont invalides.`);
      if ('savedArticles' in value || 'cachedArticles' in value) {
        const snapshot = jsonData(value, 'articles');
        cachedArticles.push(...(snapshot.cachedArticles || []));
        return snapshot.savedArticles || [];
      }
      const article = normaliseArticle(value);
      if (collectionIndex >= 0 && row[collectionIndex] === 'cachedArticles') { cachedArticles.push(article); return []; }
      if (collectionIndex >= 0 && row[collectionIndex] !== 'savedArticles') throw new Error('La collection du CSV natif est invalide.');
      return [article];
    }
    const values: UnknownRecord = {};
    headers.forEach((header, column) => {
      const key = aliases[header] || header;
      values[key] = ['saved', 'read'].includes(key) ? ['true', '1', 'oui'].includes(row[column].trim().toLowerCase()) : row[column];
    });
    return [normaliseArticle(values)];
  });
  return { ...createTransferData('articles'), savedArticles: articles, ...(cachedArticles.length ? { cachedArticles } : {}) };
}

async function parseFile(file: VirtualFile, target: TransferTarget, warnings: string[]): Promise<TransferData> {
  const ext = extension(file.name);
  if (ext === 'pdf') {
    if (target !== 'notes') throw new Error('Les fichiers PDF s’importent dans Notes.');
    const { extractPdfText } = await import('./transfer-pdf');
    const result = await extractPdfText(file.bytes);
    warnings.push(...result.warnings);
    if (!result.text.trim()) throw new Error('Aucun texte n’a été trouvé dans le PDF. Les PDF numérisés nécessitent une reconnaissance de texte.');
    warnings.push(`${file.name} : le PDF est importé comme texte, sans mise en page ni métadonnées éditoriales.`);
    return { ...createTransferData('notes'), posts: [textNote(baseName(file.name), result.text)] };
  }
  const text = decodeText(file.bytes);
  if (ext === 'json') return jsonData(safeJsonParse(text), target);
  if (target === 'feeds' && (ext === 'opml' || ext === 'xml')) return parseOpml(text);
  if (ext === 'md' || ext === 'markdown') return parseMarkdown(text, file.name, target);
  if (ext === 'html' || ext === 'htm') {
    const result = parseHtml(text, file.name, target);
    if (!new RegExp(`\\bid\\s*=\\s*["']${nativeHtmlId}["']`, 'i').test(text)) warnings.push(`${file.name} : le HTML externe est importé en texte ; les images et la mise en page sont omises.`);
    return result;
  }
  if (target === 'articles' && ext === 'csv') return parseCsv(text);
  if (target === 'notes' && (ext === 'txt' || ext === 'text')) {
    warnings.push(`${file.name} : le texte seul ne contient pas de statut, de dates, de sources ni de déclinaisons multicanal.`);
    return { ...createTransferData('notes'), posts: [textNote(baseName(file.name), text)] };
  }
  throw new Error(`Le format .${ext || '(sans extension)'} n’est pas compatible avec cette cible.`);
}

function unpack(file: VirtualFile, target: TransferTarget, warnings: string[]): VirtualFile[] {
  if (target !== 'notes') throw new Error('Les archives ZIP s’importent dans Notes.');
  let total = 0, count = 0;
  let entries: ReturnType<typeof unzipSync>;
  try {
    entries = unzipSync(file.bytes, { filter: (entry) => {
      if (entry.name.endsWith('/')) return false;
      if (++count > MAX_FILES) throw new Error('L’archive contient trop de fichiers.');
      total += entry.originalSize;
      if (entry.originalSize > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) throw new Error('L’archive dépasse la limite de taille décompressée.');
      if (/(?:^|\/)\.\.(?:\/|$)/.test(entry.name) || /^(?:[A-Za-z]:|\/|\\)/.test(entry.name) || entry.name.includes('\\')) throw new Error('L’archive contient un chemin de fichier invalide.');
      return true;
    } });
  } catch (error) { throw new Error(error instanceof Error && error.message.startsWith('L’archive') ? error.message : 'L’archive ZIP est invalide ou endommagée.'); }
  const manifestBytes = entries[archiveManifest];
  if (manifestBytes) {
    const manifest = safeJsonParse(decodeText(manifestBytes));
    if (!record(manifest) || manifest.version !== 1 || manifest.kind !== 'notes') throw new Error('Le manifeste de l’archive de notes est invalide.');
    // Native archives contain both a lossless snapshot and readable documents. Import the snapshot once.
    if ('posts' in manifest) return [{ name: 'notes.json', bytes: manifestBytes }];
    if (!Array.isArray(manifest.files) || manifest.files.some((name) => typeof name !== 'string' || name === archiveManifest || !(name in entries))) throw new Error('Le manifeste de l’archive référence des fichiers manquants.');
    return manifest.files.map((name) => ({ name: name as string, bytes: entries[name as string] }));
  }
  return Object.entries(entries).flatMap(([name, bytes]) => {
    if (name.startsWith('__MACOSX/') || name.split('/').pop()?.startsWith('.')) return [];
    if (!['json', 'md', 'markdown', 'txt', 'text', 'html', 'htm', 'pdf'].includes(extension(name))) { warnings.push(`${name} : format ignoré dans l’archive.`); return []; }
    return [{ name, bytes }];
  });
}

export async function parseTransferFiles(files: File[], target: TransferTarget): Promise<{ data: TransferData; warnings: string[] }> {
  if (!targets.includes(target)) throw new Error('La cible de transfert est invalide.');
  if (!files.length) throw new Error('Sélectionnez au moins un fichier.');
  if (files.length > MAX_FILES) throw new Error('Sélectionnez au maximum 1 000 fichiers.');
  if (target === 'backup' && files.length !== 1) throw new Error('Importez une sauvegarde JSON à la fois.');
  const warnings: string[] = [];
  const virtual: VirtualFile[] = [];
  let inputSize = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} : la taille maximale est de 20 Mo.`);
    inputSize += file.size;
    if (inputSize > MAX_TOTAL_BYTES) throw new Error('La sélection dépasse la limite totale de 100 Mo.');
    const item = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    if (extension(file.name) === 'zip') virtual.push(...unpack(item, target, warnings));
    else virtual.push(item);
  }
  if (!virtual.length) throw new Error('Aucun fichier compatible n’a été trouvé.');
  if (virtual.length > MAX_FILES || virtual.reduce((sum, item) => sum + item.bytes.length, 0) > MAX_TOTAL_BYTES) throw new Error('Les fichiers décompressés dépassent les limites de l’import.');
  const data = createTransferData(target);
  for (const file of virtual) {
    let parsed: TransferData;
    try { parsed = await parseFile(file, target, warnings); }
    catch (error) { throw new Error(`${file.name} : ${error instanceof Error ? error.message : 'Le fichier n’a pas pu être lu.'}`); }
    for (const key of ['feeds', 'posts', 'savedArticles', 'cachedArticles', 'readArticleIds'] as const) {
      if (parsed[key] !== undefined) (data as unknown as UnknownRecord)[key] = [...(data[key] || []), ...parsed[key]!];
    }
    if (parsed.lastFetchedAt !== undefined) data.lastFetchedAt = parsed.lastFetchedAt;
    if (files.length === 1) data.exportedAt = parsed.exportedAt;
  }
  return { data, warnings: Array.from(new Set(warnings)) };
}

function postTitle(post: SocialPost) { return post.angle || 'Note sans titre'; }
function readablePost(post: SocialPost): string {
  const sections = [`# ${postTitle(post)}`, post.notes || ''];
  const sources = getNoteSources(post);
  if (sources.length) sections.push(`## Sources\n${sources.map((source, index) => `${index + 1}. ${source.title}\n${source.feed}\n${source.link}${source.excerpt ? `\n${source.excerpt}` : ''}`).join('\n\n')}`);
  if (post.content.tiktok.hook || post.content.tiktok.script || post.content.tiktok.visualNotes || post.content.tiktok.durationEstimate) sections.push(`## TikTok\n\n### Accroche\n${post.content.tiktok.hook}\n\n### Script\n${post.content.tiktok.script}\n\n### Mise en images\n${post.content.tiktok.visualNotes}\n\nDurée : ${post.content.tiktok.durationEstimate}`);
  if (post.content.instagram.caption || post.content.instagram.carouselSlides.length || post.content.instagram.hashtags.length) sections.push(`## Instagram\n\n${post.content.instagram.caption}\n\n${post.content.instagram.carouselSlides.map((slide, index) => `### Diapositive ${index + 1}\n${slide}`).join('\n\n')}\n\n${post.content.instagram.hashtags.join(' ')}`);
  if (post.content.linkedin.title || post.content.linkedin.body || post.content.linkedin.keyTakeaways.length) sections.push(`## LinkedIn\n\n### ${post.content.linkedin.title || 'Publication'}\n${post.content.linkedin.body}\n\n${post.content.linkedin.keyTakeaways.map((point) => `- ${point}`).join('\n')}`);
  return sections.join('\n\n');
}

/** Native metadata is authoritative on reimport and preserves the complete note, including all channels. */
export function noteMarkdown(post: SocialPost): string {
  return `---\n${stringifyYaml({ rss_note: { version: 1, post } }, { aliasDuplicateObjects: false, lineWidth: 0 })}---\n\n${readablePost(post)}\n`;
}
function safeName(value: string, fallback: string) {
  return value.normalize('NFC').replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').replace(/^\.+/, '').trim().slice(0, 90) || fallback;
}
function exportSlice(data: TransferData, target: TransferTarget): TransferData {
  const result: TransferData = { version: 1, kind: target, exportedAt: data.exportedAt || new Date().toISOString() };
  if (target === 'feeds' || target === 'backup') result.feeds = data.feeds || [];
  if (target === 'notes' || target === 'backup') result.posts = data.posts || [];
  if (target === 'articles' || target === 'backup') {
    result.savedArticles = data.savedArticles || [];
    if (data.cachedArticles !== undefined) result.cachedArticles = data.cachedArticles;
    if (data.readArticleIds !== undefined) result.readArticleIds = data.readArticleIds;
    if (data.lastFetchedAt !== undefined) result.lastFetchedAt = data.lastFetchedAt;
  }
  return result;
}
function htmlDocument(title: string, body: string, data: TransferData) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${htmlEscape(title)}</title><style>body{font:16px/1.7 Georgia,serif;color:#242a27;background:#faf9f6;margin:0}main{max-width:760px;margin:40px auto;padding:36px;background:white}article+article{border-top:1px solid #e4e7df;margin-top:40px;padding-top:30px}h1,h2{line-height:1.25}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#285b45}small{color:#6c726c}@media print{main{margin:0;padding:0}}</style></head><body><main>${body}</main><script type="application/json" id="${nativeHtmlId}">${json}</script></body></html>\n`;
}
function postHtml(post: SocialPost, data: TransferData) {
  return htmlDocument(postTitle(post), `<article><h1>${htmlEscape(postTitle(post))}</h1><pre>${htmlEscape(readablePost(post).replace(/^# [^\n]*\n\n/, ''))}</pre></article>`, data);
}
function articleText(article: RSSArticle) {
  return `# ${article.title}\n\nSource : ${article.feedName}\nDate : ${article.pubDate}\nLien : ${article.link}\n${article.author ? `Auteur : ${article.author}\n` : ''}\n${article.snippet}\n\n${article.content ? htmlText(article.content) : ''}`;
}
function escapeCsv(value: unknown) {
  let cell = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(cell) || /^[\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

export async function buildTransferExport(data: TransferData, target: TransferTarget, format: ExportFormat): Promise<ExportResult> {
  if (!targets.includes(target)) throw new Error('La cible de transfert est invalide.');
  const allowed: Record<TransferTarget, ExportFormat[]> = { backup: ['json'], feeds: ['json', 'opml'], notes: ['json', 'md', 'txt', 'html', 'pdf'], articles: ['json', 'csv', 'md', 'html', 'pdf'] };
  if (!allowed[target].includes(format)) throw new Error('Ce format d’export n’est pas compatible avec la sélection.');
  const slice = exportSlice(data, target);
  const stem = `${target}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'pdf') {
    const { createTransferPdf } = await import('./transfer-pdf');
    return createTransferPdf(slice, target);
  }
  if (format === 'json') return { bytes: encoder.encode(JSON.stringify(slice, null, 2)), mime: 'application/json;charset=utf-8', filename: `${stem}.json` };
  if (format === 'opml') {
    const outlines = (slice.feeds || []).map((feed) => `    <outline type="rss" text="${htmlEscape(feed.name)}" title="${htmlEscape(feed.name)}" xmlUrl="${htmlEscape(feed.url)}" htmlUrl="${htmlEscape(feed.website)}" rssId="${htmlEscape(feed.id)}" rssCategory="${htmlEscape(feed.category)}" rssLanguage="${htmlEscape(feed.language)}" rssEnabled="${feed.enabled ? 'true' : 'false'}"${feed.favicon !== undefined ? ` rssFavicon="${htmlEscape(feed.favicon)}"` : ''} />`).join('\n');
    return { bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Sources RSS</title></head><body>\n${outlines}\n</body></opml>\n`), mime: 'text/x-opml;charset=utf-8', filename: `${stem}.opml` };
  }
  if (target === 'notes') {
    const posts = slice.posts || [];
    if (!posts.length) throw new Error('Aucune note à exporter.');
    const documentFor = (post: SocialPost) => format === 'md' ? noteMarkdown(post) : format === 'html' ? postHtml(post, { ...slice, posts: [post] }) : `${postTitle(post)}\n${'='.repeat(Math.min(postTitle(post).length, 80))}\n\n${post.notes || ''}\n`;
    const mime = format === 'md' ? 'text/markdown;charset=utf-8' : format === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
    const warnings = format === 'txt' ? ['TXT exporte uniquement le titre et le texte des notes. Le statut, les dates, les sources, les mots-clés et les déclinaisons multicanal ne figurent pas dans les fichiers texte.'] : undefined;
    if (posts.length === 1) return { bytes: encoder.encode(documentFor(posts[0])), mime, filename: `${safeName(postTitle(posts[0]), 'note')}.${format}`, ...(warnings ? { warnings } : {}) };
    const entries: Record<string, Uint8Array> = {};
    posts.forEach((post, index) => { entries[`${String(index + 1).padStart(3, '0')}-${safeName(postTitle(post), 'note')}.${format}`] = encoder.encode(documentFor(post)); });
    // The manifest is the authoritative snapshot. Readable files are never imported a second time.
    entries[archiveManifest] = encoder.encode(JSON.stringify({ ...slice, files: Object.keys(entries), documentFormat: format }, null, 2));
    return { bytes: zipSync(entries, { level: 6 }), mime: 'application/zip', filename: `${stem}.zip`, ...(warnings ? { warnings: [...warnings, 'Le manifeste JSON inclus dans le ZIP conserve les métadonnées pour une restauration complète.'] } : {}) };
  }
  const articles = Array.from(new Map([...(slice.savedArticles || []), ...(slice.cachedArticles || [])].map((article) => [article.id, article])).values());
  if (format === 'csv') {
    const columns = ['__rss_transfer_version', '__rss_collection', 'id', 'title', 'feedId', 'feedName', 'feedLanguage', 'category', 'link', 'pubDate', 'author', 'snippet', 'content', 'imageUrl', 'saved', 'read', '__rss_article'];
    const savedById = new Map((slice.savedArticles || []).map((article) => [article.id, article]));
    const cachedById = new Map((slice.cachedArticles || []).map((article) => [article.id, article]));
    const rows = articles.map((article) => {
      const snapshot = { ...(savedById.has(article.id) ? { savedArticles: [savedById.get(article.id)!] } : {}), ...(cachedById.has(article.id) ? { cachedArticles: [cachedById.get(article.id)!] } : {}) };
      return columns.map((column) => escapeCsv(column === '__rss_transfer_version' ? '1' : column === '__rss_collection' ? Object.keys(snapshot).join('|') : column === '__rss_article' ? JSON.stringify(snapshot) : article[column as keyof RSSArticle])).join(',');
    });
    return { bytes: encoder.encode(`\uFEFF${columns.map(escapeCsv).join(',')}\r\n${rows.join('\r\n')}\r\n`), mime: 'text/csv;charset=utf-8', filename: `${stem}.csv`, warnings: ['Les cellules pouvant être interprétées comme des formules sont protégées. Les métadonnées natives permettent de réimporter les valeurs originales.'] };
  }
  if (format === 'md') return { bytes: encoder.encode(`---\n${stringifyYaml({ rss_transfer: slice }, { aliasDuplicateObjects: false, lineWidth: 0 })}---\n\n${articles.map(articleText).join('\n\n---\n\n')}\n`), mime: 'text/markdown;charset=utf-8', filename: `${stem}.md` };
  if (format === 'html') return { bytes: encoder.encode(htmlDocument('Articles enregistrés', articles.map((article) => `<article><h1>${htmlEscape(article.title)}</h1><small>${htmlEscape(article.feedName)} · ${htmlEscape(article.pubDate)}</small><p><a href="${htmlEscape(/^https?:\/\//i.test(article.link) ? article.link : '#')}">${htmlEscape(article.link)}</a></p><pre>${htmlEscape(article.snippet)}\n\n${htmlEscape(article.content ? htmlText(article.content) : '')}</pre></article>`).join('\n'), slice)), mime: 'text/html;charset=utf-8', filename: `${stem}.html` };
  throw new Error('Ce format d’export n’est pas pris en charge.');
}
