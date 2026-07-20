#!/usr/bin/env node
/**
 * Validation de public/data/books.json avant build.
 *
 * Erreurs (bloquantes, exit 1) : champs obligatoires manquants, statut inconnu,
 * doublons d'id ou de slug, genre hors taxonomie, incohérences dates/progress/rating.
 * Avertissements (non bloquants) : livre terminé sans endDate, id absent du cache Google Books.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const books = JSON.parse(readFileSync(join(root, 'public/data/books.json'), 'utf8')).books;
const cache = JSON.parse(readFileSync(join(root, 'src/data/google-books-cache.json'), 'utf8')).entries ?? {};

const STATUSES = new Set(['finished', 'reading', 'to-read']);
const GENRES = new Set([
  'tech', 'non-fiction', 'business', 'self-help', 'sci-fi', 'space-opera',
  'nouvelles', 'dystopie', 'post-apo', 'roman', 'essai', 'classique', 'fantasy',
  'historique', 'thriller', 'horreur', 'jeunesse', 'cyberpunk', 'biopunk', 'uchronie',
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const slugify = (s) => s
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

const errors = [];
const warnings = [];
const seenIds = new Map();
const seenSlugs = new Map();

const isValidDate = (s) => DATE_RE.test(s) && !Number.isNaN(new Date(s).getTime());

for (const book of books) {
  const label = book.title ?? book.id ?? '<sans id>';

  for (const field of ['id', 'googleBooksId', 'status', 'title']) {
    if (typeof book[field] !== 'string' || book[field].length === 0) {
      errors.push(`${label} : champ "${field}" manquant ou invalide`);
    }
  }

  if (book.status && !STATUSES.has(book.status)) {
    errors.push(`${label} : statut inconnu "${book.status}"`);
  }

  if (book.id) {
    if (seenIds.has(book.id)) errors.push(`Doublon d'id "${book.id}" (${seenIds.get(book.id)} / ${label})`);
    seenIds.set(book.id, label);
  }

  if (book.title) {
    const slug = slugify(book.title) || book.id;
    if (seenSlugs.has(slug)) errors.push(`Collision de slug "${slug}" (${seenSlugs.get(slug)} / ${label})`);
    seenSlugs.set(slug, label);
  }

  if (!Array.isArray(book.genres) || book.genres.length === 0) {
    errors.push(`${label} : aucun genre`);
  } else {
    for (const g of book.genres) {
      if (!GENRES.has(g)) errors.push(`${label} : genre hors taxonomie "${g}"`);
    }
  }

  if (typeof book.progress === 'number' && book.status !== 'reading') {
    errors.push(`${label} : "progress" présent hors statut reading`);
  }

  for (const field of ['startDate', 'endDate']) {
    if (book[field] != null && !isValidDate(book[field])) {
      errors.push(`${label} : ${field} invalide "${book[field]}"`);
    }
  }
  if (book.startDate && book.endDate && isValidDate(book.startDate) && isValidDate(book.endDate)
    && book.endDate < book.startDate) {
    errors.push(`${label} : endDate (${book.endDate}) antérieure à startDate (${book.startDate})`);
  }

  if (book.rating != null && (!Number.isInteger(book.rating) || book.rating < 1 || book.rating > 5)) {
    errors.push(`${label} : rating invalide "${book.rating}" (entier 1-5 attendu)`);
  }

  if (book.status === 'finished' && !book.endDate) {
    warnings.push(`${label} : terminé sans endDate (exclu des stats temporelles)`);
  }
  if (book.googleBooksId && !book.googleBooksId.startsWith('local:') && !(book.googleBooksId in cache)) {
    warnings.push(`${label} : "${book.googleBooksId}" absent du cache Google Books (npm run cache:refresh)`);
  }
}

if (warnings.length) {
  console.warn(`⚠ ${warnings.length} avertissement(s) :`);
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error(`✖ ${errors.length} erreur(s) dans books.json :`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✔ books.json valide (${books.length} livres, ${warnings.length} avertissement(s))`);
