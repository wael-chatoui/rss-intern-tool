import { getNoteSources } from '@/lib/note-model';
import type { TransferData, TransferTarget } from './transfer-formats';
import type { PDFFont, PDFPage } from 'pdf-lib';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 500;
const MAX_TEXT = 2_000_000;

/** Extract text locally in the browser. PDF scripts and external resources are never executed. */
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; warnings: string[] }> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error('Le PDF dépasse la limite de 20 Mo.');
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  const task = getDocument({ data: bytes.slice(), stopAtErrors: true, disableFontFace: true, useSystemFonts: true });
  let document;
  try {
    document = await task.promise;
    if (document.numPages > MAX_PAGES) throw new Error(`Le PDF dépasse la limite de ${MAX_PAGES} pages.`);
    const pages: string[] = [];
    let length = 0;
    let emptyPages = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let previousY: number | undefined;
      let pageText = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5];
        if (previousY !== undefined && Math.abs(y - previousY) > 3 && !pageText.endsWith('\n')) pageText += '\n';
        else if (pageText && !/\s$/.test(pageText) && item.str && !/^\s/.test(item.str)) pageText += ' ';
        pageText += item.str;
        if (item.hasEOL) pageText += '\n';
        previousY = y;
      }
      length += pageText.length;
      if (length > MAX_TEXT) throw new Error('Le PDF contient trop de texte. Limite : 2 millions de caractères.');
      if (pageText.trim()) pages.push(pageText.trim());
      else emptyPages++;
      page.cleanup();
    }
    const text = pages.join('\n\n');
    if (!text.trim()) throw new Error('Ce PDF ne contient pas de texte extractible. Un OCR est nécessaire pour un document scanné.');
    return { text, warnings: emptyPages ? [`${emptyPages} page(s) sans texte extractible. Un OCR est nécessaire pour ces pages.`] : [] };
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'PasswordException') throw new Error('Le PDF est protégé par un mot de passe. Importez une copie déverrouillée.');
    if (cause instanceof Error && cause.name === 'InvalidPDFException') throw new Error('Le fichier PDF est invalide ou endommagé.');
    throw cause;
  } finally {
    await task.destroy();
  }
}

const labels: Record<string, string> = { idea: 'Idée', in_progress: 'En rédaction', ready: 'Prêt à publier', published: 'Publié' };
const dateString = (value?: string) => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(value)) : '';
const plain = (value?: string) => {
  if (!value) return '';
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    doc.querySelectorAll('script,style,iframe,object').forEach(node => node.remove());
    doc.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    doc.querySelectorAll('p,div,li,h1,h2,h3,blockquote').forEach(node => node.append('\n'));
    return doc.body.textContent?.trim() || '';
  }
  return value.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
};

export async function createTransferPdf(data: TransferData, target: TransferTarget): Promise<{ bytes: Uint8Array; mime: string; filename: string; warnings: string[] }> {
  if (target !== 'notes' && target !== 'articles') throw new Error('Le PDF est disponible pour les notes et les articles.');
  const [{ PDFDocument, rgb }, fontkit] = await Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit')]);
  const loadFont = async (name: string) => {
    const response = await fetch(`/fonts/${name}.ttf`);
    if (!response.ok) throw new Error('Impossible de charger les polices PDF. Rechargez la page et réessayez.');
    return new Uint8Array(await response.arrayBuffer());
  };
  const [regularBytes, boldBytes, symbolsBytes, emojiBytes] = await Promise.all([loadFont('NotoSans-Regular'), loadFont('NotoSans-Bold'), loadFont('NotoSansSymbols2-Regular'), loadFont('NotoEmoji-Regular')]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit.default);
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });
  const symbols = await pdf.embedFont(symbolsBytes, { subset: true });
  const emoji = await pdf.embedFont(emojiBytes, { subset: false });
  const normalSet = new Set(regular.getCharacterSet());
  const symbolSet = new Set(symbols.getCharacterSet());
  const emojiSet = new Set(emoji.getCharacterSet());
  const unsupported = new Set<string>();
  pdf.setTitle(target === 'notes' ? 'Notes' : 'Articles de veille');
  pdf.setAuthor('La rédaction');
  pdf.setCreator('La rédaction, export PDF');
  pdf.setLanguage('fr-FR');
  const width = 595.28, height = 841.89, margin = 52;
  const ink = rgb(.14, .16, .15), muted = rgb(.40, .44, .40), green = rgb(.16, .36, .27);
  let page: PDFPage;
  let y = height - 76;
  let pageNumber = 0;
  const pageHeader = target === 'notes' ? 'Notes' : 'Veille RSS';
  const newPage = () => {
    page = pdf.addPage([width, height]);
    pageNumber++;
    page.drawText(`La rédaction / ${pageHeader}`, { x: margin, y: height - 34, size: 8, font: regular, color: muted });
    page.drawLine({ start: { x: margin, y: height - 45 }, end: { x: width - margin, y: height - 45 }, thickness: .5, color: rgb(.86, .88, .84) });
    page.drawText(String(pageNumber), { x: width - margin - 10, y: 28, size: 8, font: regular, color: muted });
    y = height - 76;
  };
  newPage();
  const clean = (text: string) => Array.from(text.normalize('NFC')).map(character => {
    const code = character.codePointAt(0)!;
    if (character === '\t') return '    ';
    if (code < 32 && character !== '\n') return '';
    if (code === 0xfe0f || code === 0xfe0e || code === 0x200d) return '';
    if (normalSet.has(code) || symbolSet.has(code) || emojiSet.has(code) || character === '\n') return character;
    unsupported.add(character);
    return `[U+${code.toString(16).toUpperCase()}]`;
  }).join('');
  const runs = (text: string, weight: 'normal' | 'bold') => {
    const result: { text: string; font: PDFFont }[] = [];
    for (const character of Array.from(text)) {
      const font = normalSet.has(character.codePointAt(0)!) ? weight === 'bold' ? bold : regular : symbolSet.has(character.codePointAt(0)!) ? symbols : emoji;
      const last = result[result.length - 1];
      if (last?.font === font) last.text += character;
      else result.push({ text: character, font });
    }
    return result;
  };
  const textWidth = (text: string, size: number, weight: 'normal' | 'bold') => runs(text, weight).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  const paragraph = (text: string, size = 10, weight: 'normal' | 'bold' = 'normal', color = ink, gap = 10) => {
    if (!text?.trim()) return;
    for (const source of clean(text).replace(/\r\n?/g, '\n').split('\n')) {
      if (!source.trim()) { y -= size * .75; continue; }
      const words = source.match(/\S+\s*/g) || [];
      let line = '';
      const drawLine = () => {
        if (y < 58 + size) newPage();
        let x = margin;
        for (const run of runs(line.trimEnd(), weight)) {
          page.drawText(run.text, { x, y, size, font: run.font, color });
          x += run.font.widthOfTextAtSize(run.text, size);
        }
        y -= size * 1.55;
        line = '';
      };
      for (const word of words) {
        if (line && textWidth(line + word, size, weight) > width - margin * 2) drawLine();
        if (textWidth(word, size, weight) <= width - margin * 2) line += word;
        else for (const character of Array.from(word)) {
          if (line && textWidth(line + character, size, weight) > width - margin * 2) drawLine();
          line += character;
        }
      }
      if (line) drawLine();
    }
    y -= gap;
  };
  const section = (title: string, value?: string) => { if (!value?.trim()) return; if (y < 110) newPage(); paragraph(title, 11, 'bold', green, 3); paragraph(value); };
  if (target === 'notes') {
    const posts = data.posts || [];
    if (!posts.length) throw new Error('Aucune note à exporter.');
    for (let i = 0; i < posts.length; i++) {
      if (i > 0) newPage();
      const post = posts[i];
      paragraph(post.angle || 'Note sans titre', 21, 'bold', ink, 10);
      paragraph([labels[post.status], post.scheduledDate ? `Publication : ${post.scheduledDate}${post.scheduledTime ? ` ${post.scheduledTime}` : ''}` : '', post.tags?.length ? `Mots-clés : ${post.tags.join(', ')}` : ''].filter(Boolean).join(' | '), 8, 'normal', muted, 15);
      paragraph(post.notes || '', 10.5);
      getNoteSources(post).forEach((source, index) => section(`Source ${index + 1}`, [source.title, source.feed, source.link, source.excerpt].filter(Boolean).join('\n')));
      const tik = post.content?.tiktok;
      if (tik && (tik.hook || tik.script || tik.visualNotes)) {
        section('TikTok / Accroche', tik.hook); section('TikTok / Script', tik.script); section('TikTok / Mise en images', tik.visualNotes);
        if (tik.durationEstimate) paragraph(`Durée estimée : ${tik.durationEstimate}`, 8, 'normal', muted);
      }
      const ig = post.content?.instagram;
      if (ig && (ig.caption || ig.carouselSlides?.length || ig.hashtags?.length)) {
        section('Instagram / Légende', ig.caption);
        section('Instagram / Carrousel', ig.carouselSlides?.map((slide, index) => `${index + 1}. ${slide}`).join('\n\n'));
        if (ig.hashtags?.length) paragraph(ig.hashtags.join(' '), 9, 'normal', muted);
      }
      const linkedin = post.content?.linkedin;
      if (linkedin && (linkedin.title || linkedin.body || linkedin.keyTakeaways?.length)) {
        section('LinkedIn', [linkedin.title, linkedin.body].filter(Boolean).join('\n\n'));
        section('Points à retenir', linkedin.keyTakeaways?.map(point => `• ${point}`).join('\n'));
      }
    }
  } else {
    const articles = Array.from(new Map([...(data.cachedArticles || []), ...(data.savedArticles || [])].map(article => [article.id, article])).values());
    if (!articles.length) throw new Error('Aucun article à exporter.');
    for (let i = 0; i < articles.length; i++) {
      if (i > 0) newPage();
      const article = articles[i];
      paragraph(article.title, 21, 'bold', ink, 10);
      paragraph([article.feedName, dateString(article.pubDate), article.author].filter(Boolean).join(' | '), 8, 'normal', muted, 15);
      paragraph(plain(article.snippet), 11);
      const content = plain(article.content);
      if (content && content !== plain(article.snippet)) paragraph(content, 10.5);
      section('Lien source', article.link);
    }
  }
  const warnings = unsupported.size ? [`${unsupported.size} caractère(s) absent(s) des polices PDF représenté(s) par leur code Unicode [U+…].`] : [];
  const bytes = await pdf.save();
  return { bytes, mime: 'application/pdf', filename: `${target === 'notes' ? 'notes' : 'veille'}-${new Date().toISOString().slice(0, 10)}.pdf`, warnings };
}
