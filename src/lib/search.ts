/** Search text, never HTML rendering. Decode common entities before indexing RSS content. */
export function normalizeSearchText(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' }[entity] || entity))
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => { const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code); return number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' '; })
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}
