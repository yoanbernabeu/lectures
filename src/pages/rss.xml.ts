import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import booksData from '@data/books.json';
import type { Book } from '../types/book';
import { slugify } from '../utils/slugify';

function stripHtml(s?: string | null) {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(context: APIContext) {
  const books = booksData.books as Book[];

  // Livres terminés, du plus récent au plus ancien (sans date → fin de flux)
  const finished = books
    .filter(b => b.status === 'finished')
    .sort((a, b) => {
      const da = a.endDate ? new Date(a.endDate).getTime() : 0;
      const db = b.endDate ? new Date(b.endDate).getTime() : 0;
      return db - da;
    });

  return rss({
    title: 'Lectures · YoanDev',
    description: 'Journal de lecture personnel de Yoan Bernabeu : critiques, notes et recommandations.',
    site: context.site ?? 'https://lectures.yoandev.co',
    trailingSlash: true,
    customData: '<language>fr-FR</language>',
    items: finished.map(book => {
      const authors = (book.authors || []).join(', ');
      const rating = typeof book.rating === 'number' && book.rating > 0 ? ` (note : ${book.rating}/5)` : '';
      const body = book.comment
        ? stripHtml(book.comment)
        : stripHtml(book.description).slice(0, 500);
      return {
        title: `${book.title}${authors ? ', de ' + authors : ''}${rating}`,
        link: `/book/${book.title ? slugify(book.title) : book.id}/`,
        description: body || `Lecture terminée : ${book.title}.`,
        pubDate: book.endDate ? new Date(book.endDate) : undefined,
        categories: book.genres || [],
      };
    }),
  });
}
