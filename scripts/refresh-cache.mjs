#!/usr/bin/env node
/**
 * Rafraîchit src/data/google-books-cache.json en interrogeant 3 sources :
 *   - Google Books (pour les IDs classiques)
 *   - OpenLibrary (pour les IDs "local:openlibrary:<key>")
 *   - Babelio via babeliocli (pour les IDs "local:babelio:<book_id>")
 *
 * Usage :
 *   node scripts/refresh-cache.mjs              # ne fetch que les IDs manquants ou nuls
 *   node scripts/refresh-cache.mjs --force      # refetch tout
 *   node scripts/refresh-cache.mjs --id=<id>    # ne refetch qu'un ID précis
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const BOOKS_PATH = path.join(ROOT, 'public/data/books.json');
const CACHE_PATH = path.join(ROOT, 'src/data/google-books-cache.json');

const GOOGLE_API = 'https://www.googleapis.com/books/v1/volumes';
const OPENLIB_API = 'https://openlibrary.org';
const OPENLIB_COVERS = 'https://covers.openlibrary.org/b/id';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const SINGLE_ID = args.find(a => a.startsWith('--id='))?.slice(5);

function log(msg) { process.stdout.write(`[cache] ${msg}\n`); }
function warn(msg) { process.stderr.write(`[cache] ⚠ ${msg}\n`); }

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf-8'));
}
async function writeJson(p, data) {
  await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ---------- Source adapters ----------

function rewriteGoogleImg(url) {
  if (typeof url !== 'string') return url;
  return url
    .replace(/^http:\/\//, 'https://')
    .replace(/&zoom=\d/, '&zoom=3')
    .replace(/&img=\d/, '&img=1');
}

function extractGoogleVolume(data) {
  const v = data.volumeInfo || {};
  const imageLinks = {};
  if (v.imageLinks) {
    for (const [size, url] of Object.entries(v.imageLinks)) {
      if (typeof url === 'string') imageLinks[size] = rewriteGoogleImg(url);
    }
  }
  return {
    title: v.title || '',
    authors: Array.isArray(v.authors) ? v.authors : [],
    description: v.description ?? null,
    publisher: v.publisher ?? null,
    publishedDate: v.publishedDate ?? null,
    pageCount: typeof v.pageCount === 'number' ? v.pageCount : null,
    imageLinks,
  };
}

async function fetchWithRetry(url, attempt = 0) {
  try {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 4) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 600));
        return fetchWithRetry(url, attempt + 1);
      }
      return { ok: false, status: res.status };
    }
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, json: await res.json() };
  } catch (err) {
    if (attempt < 4) {
      await new Promise(r => setTimeout(r, 2 ** attempt * 500));
      return fetchWithRetry(url, attempt + 1);
    }
    return { ok: false, error: err.message };
  }
}

async function fetchFromGoogle(id) {
  const r = await fetchWithRetry(`${GOOGLE_API}/${id}`);
  if (!r.ok) return null;
  return extractGoogleVolume(r.json);
}

/**
 * Fallback : quand Google Books retourne 404/indispo, on tente OpenLibrary par titre+auteur.
 * Retourne null si aucun candidat fiable trouvé.
 */
async function fetchFromOpenLibrarySearch(book) {
  if (!book?.title) return null;
  const title = encodeURIComponent(book.title);
  const author = encodeURIComponent((book.authors || [])[0] || '');
  const url = `${OPENLIB_API}/search.json?title=${title}${author ? `&author=${author}` : ''}&limit=3`;
  const r = await fetchWithRetry(url);
  if (!r.ok) return null;
  const doc = (r.json.docs || [])[0];
  if (!doc?.key) return null;
  const data = await fetchFromOpenLibraryKey(doc.key);
  if (!data) return null;
  // L'OL work a parfois pas d'auteur — on garde ceux du livre local
  if (!data.authors.length && book.authors) data.authors = book.authors;
  if (!data.title) data.title = book.title;
  return data;
}

async function fetchFromOpenLibraryKey(key) {
  // key = "OL123456W" ou "/works/OL123456W"
  const cleanKey = key.startsWith('/works/') ? key : `/works/${key}`;
  const r = await fetchWithRetry(`${OPENLIB_API}${cleanKey}.json`);
  if (!r.ok) return null;
  const w = r.json;

  // La description peut être string ou { value: string }
  let description = null;
  if (typeof w.description === 'string') description = w.description;
  else if (w.description?.value) description = w.description.value;

  // Auteurs : besoin d'un 2ème appel par auteur (w.authors est un array de refs)
  const authors = [];
  if (Array.isArray(w.authors)) {
    for (const a of w.authors.slice(0, 3)) {
      const authorKey = a.author?.key || a.key;
      if (!authorKey) continue;
      const ar = await fetchWithRetry(`${OPENLIB_API}${authorKey}.json`);
      if (ar.ok && ar.json?.name) authors.push(ar.json.name);
    }
  }

  const coverId = Array.isArray(w.covers) ? w.covers[0] : null;
  const imageLinks = {};
  if (coverId) {
    imageLinks.thumbnail = `${OPENLIB_COVERS}/${coverId}-M.jpg`;
    imageLinks.large = `${OPENLIB_COVERS}/${coverId}-L.jpg`;
    imageLinks.extraLarge = `${OPENLIB_COVERS}/${coverId}-L.jpg`;
  }

  return {
    title: w.title || '',
    authors,
    description,
    publisher: null,
    publishedDate: w.first_publish_date ?? null,
    pageCount: null,
    imageLinks,
  };
}

async function fetchFromBabelio(bookId, book) {
  // On a besoin de l'URL path Babelio. On peut la reconstruire depuis le title slug si besoin,
  // mais le plus fiable est d'utiliser `babeliocli search "<title>"` puis babeliocli book <url_path>.
  // Pour éviter du scraping compliqué, on va faire `babeliocli book` avec le URL path qu'on reconstruit.
  // Format attendu : /livres/<Slug>/<book_id>
  // Si le book passé a un `babelioBookId` + title, on peut deviner le path.

  // Utilisons la search qui retourne l'url exacte.
  try {
    const title = book?.title || '';
    const q = title.replace(/"/g, '').slice(0, 80);
    const { stdout } = await execAsync(`babeliocli search ${JSON.stringify(q)}`, { timeout: 15000 });
    const payload = JSON.parse(stdout);
    const match = (payload.results || []).find(r => String(r.book_id) === String(bookId));
    if (!match) return null;

    const urlPath = match.url.replace(/^https?:\/\/[^/]+/, '');
    const { stdout: bookJson } = await execAsync(`babeliocli book ${JSON.stringify(urlPath)}`, { timeout: 15000 });
    const bookData = JSON.parse(bookJson);
    return {
      title: bookData.title || '',
      authors: bookData.author ? [bookData.author] : [],
      description: bookData.synopsis ?? null,
      publisher: bookData.publisher ?? null,
      publishedDate: null,
      pageCount: typeof bookData.pages === 'number' ? bookData.pages : null,
      imageLinks: {}, // Babelio cover non exposée par CLI
    };
  } catch {
    return null;
  }
}

// ---------- Routeur ----------

async function fetchForBook(id, book) {
  if (id.startsWith('local:openlibrary:')) {
    const key = id.slice('local:openlibrary:'.length);
    return { data: await fetchFromOpenLibraryKey(key), source: 'openlibrary' };
  }
  if (id.startsWith('local:babelio:')) {
    const bid = id.slice('local:babelio:'.length);
    return { data: await fetchFromBabelio(bid, book), source: 'babelio' };
  }
  if (id.startsWith('local:')) {
    return { data: null, source: 'local-unknown' };
  }
  // Google Books en priorité
  const gb = await fetchFromGoogle(id);
  if (gb) return { data: gb, source: 'google' };
  // Fallback : OpenLibrary par titre + auteur
  const ol = await fetchFromOpenLibrarySearch(book);
  if (ol) return { data: ol, source: 'openlibrary-fallback' };
  // Dernier recours : Babelio via babeliocli (si on a un babelioBookId)
  if (book?.babelioBookId) {
    const bab = await fetchFromBabelio(book.babelioBookId, book);
    if (bab) return { data: bab, source: 'babelio-fallback' };
  }
  return { data: null, source: 'google' };
}

// ---------- Main ----------

async function main() {
  const { books } = await readJson(BOOKS_PATH);
  const cache = await readJson(CACHE_PATH).catch(() => ({ _meta: { schema: 1 }, entries: {} }));
  cache.entries = cache.entries || {};

  // Map id → book (pour passer le book complet au fetcher si besoin)
  const byId = new Map();
  for (const b of books) {
    if (b.googleBooksId) byId.set(b.googleBooksId, b);
  }

  const allIds = [...byId.keys()];
  let targets;
  if (SINGLE_ID) {
    targets = [SINGLE_ID];
  } else if (FORCE) {
    targets = allIds;
  } else {
    targets = allIds.filter(id => {
      const existing = cache.entries[id];
      if (!existing) return true;
      if (existing.data === null && existing.reason !== 'local-unknown') return true;
      return false;
    });
  }

  log(`Cache : ${Object.keys(cache.entries).length} entrées. À traiter : ${targets.length}/${allIds.length}.`);
  if (targets.length === 0) {
    log('Rien à fetcher — cache à jour.');
    return;
  }

  const CONCURRENCY = 3;
  const DELAY_MS = 180;
  let ok = 0, miss = 0, done = 0;
  const perSource = { google: 0, openlibrary: 0, babelio: 0, 'local-unknown': 0 };

  async function worker(queue) {
    while (queue.length) {
      const id = queue.shift();
      const book = byId.get(id);
      const { data, source } = await fetchForBook(id, book);
      cache.entries[id] = {
        data,
        fetchedAt: new Date().toISOString(),
        source,
        ...(data === null ? { reason: source === 'local-unknown' ? 'local-unknown' : 'miss' } : {}),
      };
      if (data) { ok++; perSource[source] = (perSource[source] || 0) + 1; }
      else { miss++; }
      done++;
      if (done % 10 === 0 || done === targets.length) {
        process.stdout.write(`  [${done}/${targets.length}] ok=${ok} miss=${miss}\n`);
      }
      if (done % 10 === 0) await writeJson(CACHE_PATH, cache);
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  const queue = [...targets];
  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue));
  await Promise.all(workers);
  await writeJson(CACHE_PATH, cache);

  log(`Terminé. ${ok} succès, ${miss} échecs.`);
  log(`Détail sources : Google ${perSource.google || 0}, OpenLibrary ${perSource.openlibrary || 0}, Babelio ${perSource.babelio || 0}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
