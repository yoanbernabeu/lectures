// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import sitemap from '@astrojs/sitemap';

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
      lastmod: new Date(),
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
