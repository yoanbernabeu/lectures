# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — starts the Astro dev server on `localhost:4321`
- `npm run build` — builds the static site to `./dist/`
- `npm run preview` — serves the built site locally
- `npm run astro -- <cmd>` — runs Astro CLI commands (`astro check`, `astro add`, …)

There is no test suite and no lint/format command configured.

## Architecture

Static personal reading journal ("lectures.yoandev.co"), built with **Astro 5 + Tailwind + daisyUI + Alpine.js**, with a React integration available. Output is fully static.

### Data flow

- The single source of truth is `public/data/books.json` (shape defined by `src/types/book.ts`: `Book` with `googleBooksId`, `status`, `genres`, `progress`, `rating`, `comment`, `abandoned`, `favorite`, …). Each book references a Google Books volume via `googleBooksId`.
- Pages import it via the `@data/*` path alias (see `tsconfig.json` → `baseUrl: "."` and `paths: { "@data/*": ["public/data/*"] }`). Imports look like `import booksData from '@data/books.json'`.
- At build time, `src/utils/googleBooks.ts` calls the Google Books API (`https://www.googleapis.com/books/v1/volumes/<id>`) with retries and an in-memory cache. It rewrites image URLs to force highest quality (`zoom=3`, `img=1`, `https://`).
- Client-side filtering/sorting lives in `src/components/FilterBar.astro` (Alpine.js). `BookCard.astro` renders each book; cards carry `data-book-status`, `data-book-title`, and `data-favorite` attributes that the filter bar reads.

### Routes

- `src/pages/index.astro` — home grid, shuffles the full book list on every build.
- `src/pages/book/[slug].astro` — canonical per-book page; `getStaticPaths` fetches Google Books data for each book and uses `slugify(title)` as the URL slug (falling back to `book.id`).
- `src/pages/book/[id].astro` — legacy/alternate per-book route keyed by `book.id` (no Google Books fetch; uses the embedded Google Books preview iframe).
- `src/pages/admin.astro` — book management UI. **Guarded by `import.meta.env.PROD` → redirects to `/404` in production.** It is only usable during `npm run dev`; it reads `/data/books.json` client-side and lets the user search Google Books to add/edit entries. Writes are not persisted server-side — the generated JSON must be copied back into `public/data/books.json` manually.

### Styling

- `tailwind.config.mjs` defines a custom daisyUI theme `mytheme` (dark palette with indigo primary `#6366f1` / violet secondary `#8b5cf6`). `darkTheme: "mytheme"` is set and `<html data-theme="mytheme">` is hardcoded in `Layout.astro`. The legacy `@tailwindcss/line-clamp` plugin is registered.
- `Layout.astro` wires SEO via `astro-seo`, initializes Alpine with the `@alpinejs/collapse` plugin, and loads Inter from Google Fonts.

### Conventions

- UI copy and comments are in French — keep that.
- When adding a book, extend `public/data/books.json` (not a TS module) and make sure `googleBooksId` is valid — the build will retry up to 10 times per ID and warn (not fail) on missing data, but a bad ID means no metadata/cover.
