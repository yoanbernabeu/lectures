#!/usr/bin/env node
/**
 * Génère les images OpenGraph 1200x630 dans public/og/ :
 *   - une par fiche livre (public/og/book/<slug>.png)
 *   - une par page genre (public/og/genre/<slug>.png)
 *   - une par page d'index (stats, auteurs, genres, editeurs)
 *
 * Incrémental : un manifeste (public/og/manifest.json) mémorise un hash des
 * données sources ; seules les images manquantes ou obsolètes sont régénérées.
 * Les images générées sont commitées — ce script ne tourne pas au build.
 *
 * Usage :
 *   npm run og:generate            # génère ce qui manque ou a changé
 *   npm run og:generate -- --force # régénère tout
 *
 * Prérequis : Google Chrome installé (rendu via puppeteer-core).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const OG_DIR = path.join(ROOT, 'public/og');
const MANIFEST_PATH = path.join(OG_DIR, 'manifest.json');
const FORCE = process.argv.includes('--force');
// --only=<motif> : ne génère que les sorties dont le chemin contient le motif
const ONLY = process.argv.find(a => a.startsWith('--only='))?.slice(7);

const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const books = JSON.parse(readFileSync(path.join(ROOT, 'public/data/books.json'), 'utf8')).books;
const cache = JSON.parse(readFileSync(path.join(ROOT, 'src/data/google-books-cache.json'), 'utf8')).entries ?? {};

const slugify = (text) => text
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const hash = (obj) => createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16);

// ---------- Données ----------

function coverUrlFor(book) {
  if (book.imageUrl) return book.imageUrl;
  const links = cache[book.googleBooksId]?.data?.imageLinks ?? {};
  return links.extraLarge ?? links.large ?? links.medium ?? links.thumbnail ?? null;
}

const STATUS_LABEL = { reading: 'En lecture', finished: 'Terminé', 'to-read': 'À lire' };

const genreCounts = new Map();
for (const b of books) for (const g of b.genres ?? []) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
const authorSet = new Set(books.flatMap(b => b.authors ?? []).map(a => a.trim()).filter(Boolean));
const finishedCount = books.filter(b => b.status === 'finished').length;

// ---------- Templates ----------

const FONTS = `
  @font-face {
    font-family: 'Fraunces Variable';
    src: url('file://${ROOT}/node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2') format('woff2-variations');
    font-weight: 100 900; font-style: normal;
  }
  @font-face {
    font-family: 'Fraunces Variable';
    src: url('file://${ROOT}/node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-italic.woff2') format('woff2-variations');
    font-weight: 100 900; font-style: italic;
  }
  @font-face {
    font-family: 'Inter Tight Variable';
    src: url('file://${ROOT}/node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2') format('woff2-variations');
    font-weight: 100 900; font-style: normal;
  }
`;

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; background: #0D0C0B; font-family: 'Inter Tight Variable', sans-serif; color: #F5F1E8; }
  .warmth { position: absolute; inset: 0; background:
    radial-gradient(ellipse 75% 70% at 50% -10%, rgba(224,161,104,0.20), transparent 70%),
    radial-gradient(ellipse 55% 50% at 90% 110%, rgba(192,85,60,0.14), transparent 60%); }
  .grain { position: absolute; inset: 0; opacity: 0.07; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
  .kicker { display: flex; align-items: center; gap: 16px; font-size: 16px; letter-spacing: 0.35em; text-transform: uppercase; color: rgba(224,161,104,0.85); }
  .kicker .line { display: inline-block; width: 48px; height: 1px; background: rgba(224,161,104,0.5); }
  .site { font-size: 17px; letter-spacing: 0.22em; text-transform: uppercase; color: #8A7D5C; }
  .display { font-family: 'Fraunces Variable', serif; font-variation-settings: 'opsz' 144, 'SOFT' 50, 'WONK' 0; font-weight: 420; letter-spacing: -0.03em; }
  .wonk { font-style: italic; color: #E0A168; font-variation-settings: 'opsz' 144, 'SOFT' 60, 'WONK' 1; }
`;

function bookHtml(book) {
  const cover = coverUrlFor(book);
  const authors = (book.authors ?? []).join(' · ');
  const rating = typeof book.rating === 'number' ? Math.max(0, Math.min(5, book.rating)) : 0;
  const stars = rating > 0
    ? `<div class="stars">${Array.from({ length: 5 }, (_, i) =>
        `<svg viewBox="0 0 24 24" class="${i < rating ? 'on' : 'off'}"><path fill="currentColor" d="M12 17.3 5.82 21l1.64-7.03L2 9.24l7.19-.62L12 2l2.81 6.62 7.19 .62-5.46 4.73L18.18 21z"/></svg>`).join('')}</div>`
    : '';
  const badges = [
    `<span class="badge">${STATUS_LABEL[book.status] ?? book.status}</span>`,
    book.abandoned ? '<span class="badge terracotta">Abandonné</span>' : '',
    book.favorite ? '<span class="badge">♥ Coup de cœur</span>' : '',
  ].join('');
  const titleSize = book.title.length > 60 ? 52 : book.title.length > 35 ? 62 : 76;

  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    ${FONTS} ${BASE_CSS}
    .content { position: relative; height: 100%; padding: 60px 72px 52px; display: flex; gap: 64px; align-items: center; }
    .text { flex: 1; display: flex; flex-direction: column; height: 100%; justify-content: space-between; padding: 8px 0 4px; }
    .middle { display: flex; flex-direction: column; gap: 26px; }
    h1 { font-size: ${titleSize}px; line-height: 1.04; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .authors { font-size: 19px; letter-spacing: 0.2em; text-transform: uppercase; color: #B8AB8A; }
    .badges { display: flex; gap: 12px; }
    .badge { border: 1px solid rgba(224,161,104,0.4); background: rgba(224,161,104,0.10); color: #E0A168;
      border-radius: 999px; padding: 8px 18px; font-size: 15px; letter-spacing: 0.14em; text-transform: uppercase; }
    .badge.terracotta { border-color: rgba(192,85,60,0.5); background: rgba(192,85,60,0.12); color: #C0553C; }
    .stars { display: flex; gap: 4px; }
    .stars svg { width: 30px; height: 30px; }
    .stars .on { color: #E0A168; } .stars .off { color: #3A3426; }
    .cover-wrap { position: relative; flex-shrink: 0; }
    .cover-glow { position: absolute; inset: -24px; background: linear-gradient(135deg, rgba(224,161,104,0.22), transparent 55%, rgba(192,85,60,0.14)); filter: blur(32px); }
    .cover { position: relative; width: 316px; height: 474px; object-fit: cover;
      box-shadow: 0 40px 80px -20px rgba(0,0,0,0.8), 0 16px 30px -12px rgba(0,0,0,0.6); }
    .no-cover { position: relative; width: 316px; height: 474px; background: #17140F; display: flex; align-items: center; justify-content: center;
      font-family: 'Fraunces Variable', serif; font-style: italic; font-size: 120px; color: rgba(224,161,104,0.6);
      box-shadow: 0 40px 80px -20px rgba(0,0,0,0.8); }
  </style></head><body>
    <div class="warmth"></div><div class="grain"></div>
    <div class="content">
      <div class="text">
        <p class="kicker"><span class="line"></span>Journal de lecture</p>
        <div class="middle">
          <h1 class="display">${esc(book.title)}</h1>
          ${authors ? `<p class="authors">${esc(authors)}</p>` : ''}
          ${stars}
          <div class="badges">${badges}</div>
        </div>
        <p class="site">lectures.yoandev.co</p>
      </div>
      <div class="cover-wrap">
        <div class="cover-glow"></div>
        ${cover
          ? `<img class="cover" src="${esc(cover)}" onerror="this.outerHTML='<div class=&quot;no-cover&quot;>${esc(book.title.slice(0, 1))}</div>'" />`
          : `<div class="no-cover">${esc(book.title.slice(0, 1))}</div>`}
      </div>
    </div>
  </body></html>`;
}

function textPageHtml({ kicker, line1, line2, sub }) {
  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    ${FONTS} ${BASE_CSS}
    .content { position: relative; height: 100%; padding: 64px 80px 56px; display: flex; flex-direction: column; justify-content: space-between; }
    h1 { font-size: 100px; line-height: 1.0; }
    .sub { font-family: 'Fraunces Variable', serif; font-style: italic; font-size: 30px; color: #B8AB8A; margin-top: 30px; }
    .footer { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid rgba(245,241,232,0.12); padding-top: 28px; }
    .tagline { font-family: 'Fraunces Variable', serif; font-style: italic; font-size: 24px; color: #B8AB8A; }
  </style></head><body>
    <div class="warmth"></div><div class="grain"></div>
    <div class="content">
      <p class="kicker"><span class="line"></span>${esc(kicker)}</p>
      <div>
        <h1 class="display">${line1}${line2 ? `<br/><span class="wonk">${line2}</span>` : ''}</h1>
        ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
      </div>
      <div class="footer">
        <p class="tagline"><span style="color:#E0A168">–</span> Ceci n'est pas une critique, c'est un journal.</p>
        <p class="site">lectures.yoandev.co</p>
      </div>
    </div>
  </body></html>`;
}

// ---------- Cibles ----------

function buildTargets() {
  const targets = [];
  for (const book of books) {
    const slug = book.title ? slugify(book.title) : book.id;
    targets.push({
      out: `book/${slug}.png`,
      hash: hash({ t: book.title, a: book.authors, r: book.rating, s: book.status,
        ab: book.abandoned, f: book.favorite, c: coverUrlFor(book) }),
      html: () => bookHtml(book),
    });
  }
  for (const [genre, count] of genreCounts) {
    targets.push({
      out: `genre/${slugify(genre)}.png`,
      hash: hash({ genre, count }),
      html: () => textPageHtml({
        kicker: 'Genre', line1: esc(genre), line2: '',
        sub: `${count} livre${count > 1 ? 's' : ''} dans la bibliothèque`,
      }),
    });
  }
  targets.push({
    out: 'stats.png',
    hash: hash({ n: books.length, f: finishedCount }),
    html: () => textPageHtml({
      kicker: 'Statistiques', line1: 'La bibliothèque', line2: 'en chiffres',
      sub: `${books.length} livres, dont ${finishedCount} terminés`,
    }),
  });
  targets.push({
    out: 'auteurs.png',
    hash: hash({ n: authorSet.size }),
    html: () => textPageHtml({
      kicker: 'Index', line1: 'Les', line2: 'auteurs', sub: `${authorSet.size} auteurs et autrices lus`,
    }),
  });
  targets.push({
    out: 'genres.png',
    hash: hash({ n: genreCounts.size }),
    html: () => textPageHtml({
      kicker: 'Index', line1: 'Les', line2: 'genres', sub: `${genreCounts.size} genres explorés`,
    }),
  });
  targets.push({
    out: 'editeurs.png',
    hash: hash({ n: books.length }),
    html: () => textPageHtml({
      kicker: 'Index', line1: 'Les', line2: 'éditeurs', sub: 'Les maisons qui peuplent la bibliothèque',
    }),
  });
  return targets;
}

// ---------- Rendu ----------

async function main() {
  if (!existsSync(CHROME)) {
    console.error(`[og] Chrome introuvable (${CHROME}). Définir CHROME_PATH.`);
    process.exit(1);
  }
  const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : {};
  let targets = buildTargets();
  if (ONLY) targets = targets.filter(t => t.out.includes(ONLY));
  const todo = targets.filter(t => FORCE || manifest[t.out] !== t.hash || !existsSync(path.join(OG_DIR, t.out)));
  console.log(`[og] ${targets.length} cibles, ${todo.length} à générer.`);
  if (!todo.length) return;

  mkdirSync(path.join(OG_DIR, 'book'), { recursive: true });
  mkdirSync(path.join(OG_DIR, 'genre'), { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--no-first-run', '--disable-extensions', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

  // Servi via file:// (et non setContent) : indispensable pour que Chrome
  // accepte de charger les polices file:// ; l'attente réseau est bornée
  // explicitement pour ne pas rester suspendu sur une couverture lente.
  const tmpHtml = path.join(tmpdir(), `og-render-${process.pid}.html`);

  let done = 0;
  for (const t of todo) {
    try {
      writeFileSync(tmpHtml, t.html());
      await page.goto(`file://${tmpHtml}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      // Attendre la couverture (max 8 s), puis capturer quoi qu'il arrive
      await page.evaluate(() => new Promise((resolve) => {
        const img = document.querySelector('img');
        if (!img || img.complete) return resolve(null);
        const to = setTimeout(resolve, 8000);
        img.addEventListener('load', () => { clearTimeout(to); resolve(null); });
        img.addEventListener('error', () => { clearTimeout(to); resolve(null); });
      }));
      await new Promise(r => setTimeout(r, 150));
      const raw = await page.screenshot();
      await sharp(raw)
        .resize(1200, 630)
        .png({ palette: true, quality: 90, compressionLevel: 9 })
        .toFile(path.join(OG_DIR, t.out));
      manifest[t.out] = t.hash;
      done++;
      if (done % 10 === 0 || done === todo.length) console.log(`  [${done}/${todo.length}]`);
    } catch (err) {
      console.warn(`  ⚠ ${t.out}: ${err.message}`);
    }
  }

  await browser.close();
  rmSync(tmpHtml, { force: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[og] Terminé : ${done}/${todo.length} générées.`);
}

main().catch(err => { console.error(err); process.exit(1); });
