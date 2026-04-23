#!/usr/bin/env node
// diff.mjs — Compare les étagères Babelio à public/data/books.json.
//
// Sortie JSON sur stdout :
//   {
//     "summary": { "babelio_total": N, "local_total": M, "to_add": X, "to_update": Y },
//     "to_add":    [ { babelio: {...}, mappedStatus, mappedAbandoned } ],
//     "to_update": [ { babelio: {...}, local: {...}, changes: { status?, rating?, ... } } ]
//   }
//
// Usage :
//   node .claude/skills/lectures-sync/scripts/diff.mjs            # compare et imprime
//   node .claude/skills/lectures-sync/scripts/diff.mjs --shelves lus,en-cours
//
// Le matching local ↔ Babelio est :
//   1. babelioBookId === book_id (fiable, prioritaire)
//   2. fallback : titre normalisé + premier auteur normalisé

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');
const BOOKS_JSON = resolve(REPO_ROOT, 'public/data/books.json');

const SHELVES = ['lus', 'en-cours', 'a-lire', 'abandonnes'];

// --- args ---
const args = process.argv.slice(2);
let shelves = SHELVES;
const shelvesIdx = args.indexOf('--shelves');
if (shelvesIdx !== -1 && args[shelvesIdx + 1]) {
  shelves = args[shelvesIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
}

// --- helpers ---
const normalize = (s) =>
  (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')        // ponctuation
    .trim();

const keyOf = (title, author) => `${normalize(title)}::${normalize((author || '').split(/[,;&]/)[0])}`;

const STATUS_MAP = {
  'Lu':         { status: 'finished', abandoned: false },
  'Abandonné':  { status: 'finished', abandoned: true  },
  'En cours':   { status: 'reading',  abandoned: false },
  'À lire':     { status: 'to-read',  abandoned: false },
};

function babelioFetch(shelf) {
  try {
    const out = execFileSync('babeliocli', ['books', '--shelf', shelf], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const json = JSON.parse(out);
    return json.books || [];
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    if (/session expired|HTTP 403|HTTP 401/i.test(stderr)) {
      console.error(`[!] Session Babelio expirée ou refusée. Reconnecte-toi avec : babeliocli login`);
      process.exit(2);
    }
    console.error(`[!] Erreur babeliocli sur shelf "${shelf}": ${stderr || err.message}`);
    process.exit(1);
  }
}

// --- main ---
const localData = JSON.parse(readFileSync(BOOKS_JSON, 'utf8'));
const localBooks = localData.books || [];

// Index local : par babelioBookId, et par (titreNorm, auteurNorm)
const byBabelioId = new Map();
const byTitleAuthor = new Map();
for (const b of localBooks) {
  if (b.babelioBookId) byBabelioId.set(String(b.babelioBookId), b);
  byTitleAuthor.set(keyOf(b.title, b.authors?.[0]), b);
}

// Aggrège tous les livres Babelio en dédoublonnant sur book_id
const babelioMap = new Map();
for (const shelf of shelves) {
  const books = babelioFetch(shelf);
  for (const bk of books) {
    if (!babelioMap.has(bk.book_id)) babelioMap.set(bk.book_id, bk);
  }
}
const babelioBooks = [...babelioMap.values()];

const toAdd = [];
const toUpdate = [];

for (const bb of babelioBooks) {
  const local = byBabelioId.get(String(bb.book_id)) || byTitleAuthor.get(keyOf(bb.title, bb.author));
  const mapped = STATUS_MAP[bb.status] || null;
  if (!mapped) continue; // ignore Pense bête / Possédé

  if (!local) {
    toAdd.push({
      babelio: bb,
      mappedStatus: mapped.status,
      mappedAbandoned: mapped.abandoned,
    });
    continue;
  }

  // Détection des updates
  const changes = {};
  if (local.status !== mapped.status) changes.status = { from: local.status, to: mapped.status };
  if ((local.abandoned || false) !== mapped.abandoned) changes.abandoned = { from: !!local.abandoned, to: mapped.abandoned };
  if (bb.rating && bb.rating > 0 && local.rating !== bb.rating) changes.rating = { from: local.rating, to: bb.rating };
  if (bb.read_start && !local.startDate) changes.startDate = { from: null, to: bb.read_start };
  if (bb.read_end && !local.endDate) changes.endDate = { from: null, to: bb.read_end };
  if (!local.babelioBookId) changes.babelioBookId = { from: null, to: bb.book_id };

  if (Object.keys(changes).length > 0) {
    toUpdate.push({ babelio: bb, local: { id: local.id, title: local.title }, changes });
  }
}

const result = {
  summary: {
    babelio_total: babelioBooks.length,
    local_total: localBooks.length,
    to_add: toAdd.length,
    to_update: toUpdate.length,
    shelves,
  },
  to_add: toAdd,
  to_update: toUpdate,
};

process.stdout.write(JSON.stringify(result, null, 2));
