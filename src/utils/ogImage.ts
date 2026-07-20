import { existsSync } from 'node:fs';
import path from 'node:path';

const OG_DIR = path.resolve('public/og');

/**
 * URL absolue d'une image OG générée par scripts/generate-og.mjs,
 * ou null si elle n'a pas (encore) été générée — la page retombe
 * alors sur son image OpenGraph par défaut.
 */
export function ogImageUrl(relPath: string): string | null {
  return existsSync(path.join(OG_DIR, relPath))
    ? `https://lectures.yoandev.co/og/${relPath}`
    : null;
}
