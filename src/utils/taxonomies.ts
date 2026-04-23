import booksData from '../../public/data/books.json';
import type { Book } from '../types/book';
import { slugify } from './slugify';
import { fetchGoogleBooksData } from './googleBooks';

export type TaxonomyKind = 'auteur' | 'genre' | 'editeur';

export interface TaxonomyEntry {
  slug: string;
  name: string;
  count: number;
  books: Book[];
}

const ALL_BOOKS = booksData.books as Book[];

/**
 * Regroupe les livres par auteur (chaque livre peut avoir plusieurs auteurs).
 */
export function getAuthors(): TaxonomyEntry[] {
  const map = new Map<string, TaxonomyEntry>();
  for (const book of ALL_BOOKS) {
    for (const name of book.authors ?? []) {
      const clean = name.trim();
      if (!clean) continue;
      const slug = slugify(clean);
      if (!slug) continue;
      const existing = map.get(slug);
      if (existing) {
        if (!existing.books.includes(book)) existing.books.push(book);
        existing.count = existing.books.length;
      } else {
        map.set(slug, { slug, name: clean, count: 1, books: [book] });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Regroupe les livres par genre. Les genres viennent de books.json directement.
 */
export function getGenres(): TaxonomyEntry[] {
  const map = new Map<string, TaxonomyEntry>();
  for (const book of ALL_BOOKS) {
    for (const genre of book.genres ?? []) {
      const clean = genre.trim();
      if (!clean) continue;
      const slug = slugify(clean);
      if (!slug) continue;
      const existing = map.get(slug);
      if (existing) {
        existing.books.push(book);
        existing.count++;
      } else {
        map.set(slug, { slug, name: clean, count: 1, books: [book] });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
}

/**
 * Regroupe par éditeur. Le publisher est récupéré via Google Books au build.
 * Les livres dont on ne peut pas déterminer le publisher sont omis.
 *
 * Retourne une promesse (appel réseau au build).
 */
export async function getPublishers(): Promise<TaxonomyEntry[]> {
  const map = new Map<string, TaxonomyEntry>();
  const enriched = await Promise.all(
    ALL_BOOKS.map(async (book) => {
      const data = await fetchGoogleBooksData(book.googleBooksId);
      const publisher = data?.publisher?.trim();
      return { book, publisher };
    })
  );
  for (const { book, publisher } of enriched) {
    if (!publisher) continue;
    const clean = normalizePublisher(publisher);
    const slug = slugify(clean);
    if (!slug) continue;
    const existing = map.get(slug);
    if (existing) {
      existing.books.push(book);
      existing.count++;
    } else {
      map.set(slug, { slug, name: clean, count: 1, books: [book] });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
}

/**
 * Normalise des variantes mineures de nom d'éditeur (ex: "L'Atalante" vs "L'Atalante ").
 */
function normalizePublisher(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*(Livre|Roman|Poche|Grand format)$/i, '')
    .replace(/’/g, "'")
    .trim();
}

/**
 * Helpers pour les pages [slug].
 */
export async function getAuthorBySlug(slug: string) {
  return getAuthors().find(e => e.slug === slug) ?? null;
}
export async function getGenreBySlug(slug: string) {
  return getGenres().find(e => e.slug === slug) ?? null;
}
export async function getPublisherBySlug(slug: string) {
  const all = await getPublishers();
  return all.find(e => e.slug === slug) ?? null;
}
