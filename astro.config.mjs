// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

// lastmod par fiche livre : date de fin de lecture (les autres pages n'en ont pas)
/** @param {string} text */
const slugify = (text) => text
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

/** @type {Array<{ id: string, title: string, endDate?: string }>} */
const books = JSON.parse(readFileSync(new URL('./public/data/books.json', import.meta.url), 'utf8')).books;
const lastmodBySlug = new Map(
  books
    .filter((b) => b.endDate)
    .map((b) => [slugify(b.title) || b.id, b.endDate])
);

// https://astro.build/config
export default defineConfig({
  site: 'https://lectures.yoandev.co',
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'viewport',
  },
  integrations: [
    tailwind(),
    sitemap({
      // Exclure les routes legacy /book/<id>/ (dupliquées par /book/<slug>/)
      filter: (page) => {
        // Legacy route: /book/<id>/ où id est numérique ou UUID.
        // On ne garde que les slugs (non-UUID, non-numeric).
        const m = page.match(/\/book\/([^/]+)\/?$/);
        if (!m) return true;
        const segment = m[1];
        // Numéric ou UUID v4 → c'est la route legacy, on exclut
        const isNumeric = /^\d+$/.test(segment);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
        return !isNumeric && !isUuid;
      },
      changefreq: 'weekly',
      priority: 0.7,
      serialize(item) {
        const m = item.url.match(/\/book\/([^/]+)\/?$/);
        const lastmod = m ? lastmodBySlug.get(m[1]) : null;
        if (lastmod) item.lastmod = new Date(lastmod).toISOString();
        return item;
      },
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  vite: {
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
