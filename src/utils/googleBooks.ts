import cacheFile from '../data/google-books-cache.json';

export interface GoogleBookData {
  title: string;
  authors: string[];
  description?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  pageCount?: number | null;
  imageLinks: Record<string, string>;
}

type CacheFile = {
  _meta?: unknown;
  entries: Record<string, { data: GoogleBookData | null; fetchedAt?: string; reason?: string }>;
};

const CACHE = (cacheFile as unknown as CacheFile).entries || {};

/**
 * Récupère les métadonnées Google Books d'un livre depuis le cache local commité.
 *
 * Ne fait AUCUN appel réseau : on utilise uniquement src/data/google-books-cache.json.
 * Pour rafraîchir le cache, lancer `npm run cache:refresh`.
 *
 * - `id` = Google Books ID classique → lookup dans le cache
 * - `id` commence par `local:` → pas de metadata (fiche construite à la main)
 * - `id` absent du cache → null (on loggue un warn pour signaler qu'il faut refresh)
 */
export async function fetchGoogleBooksData(id: string): Promise<GoogleBookData | null> {
  if (!id || id.startsWith('local:')) return null;

  const hit = CACHE[id];
  if (hit) return hit.data ?? null;

  // Pas en cache → signaler sans bloquer le build
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    console.warn(`[google-books-cache] Miss pour "${id}". Lance \`npm run cache:refresh\` pour mettre à jour.`);
  }
  return null;
}
