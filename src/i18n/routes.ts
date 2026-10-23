import type { Lang } from './index';

/**
 * Slugs localisés des pages du site (spec docs/00-vision/vitrine.md).
 * Une seule source de vérité : Header, Footer, liens internes et bascule
 * de langue passent tous par `href()` / `alternateHref()`.
 */
export const ROUTES = {
  home: { fr: '', en: '' },
  why: { fr: 'pourquoi-superviser', en: 'why-supervise' },
  product: { fr: 'produit', en: 'product' },
  protocols: { fr: 'protocoles', en: 'protocols' },
  contact: { fr: 'contact', en: 'contact' },
  pricing: { fr: 'tarifs', en: 'pricing' },
  demo: { fr: 'demo', en: 'demo' },
  legal: { fr: 'mentions-legales', en: 'legal-notice' },
  privacy: { fr: 'confidentialite', en: 'privacy' },
} as const;

export type RouteKey = keyof typeof ROUTES;

export function href(lang: Lang, key: RouteKey, hash?: string): string {
  const slug = ROUTES[key][lang];
  const base = slug ? `/${lang}/${slug}/` : `/${lang}/`;
  return hash ? `${base}#${hash}` : base;
}

/** URL de la même page dans l'autre langue, à partir du pathname courant. */
export function alternateHref(pathname: string, from: Lang, to: Lang): string {
  const parts = pathname.split('/').filter(Boolean); // ['fr', 'produit']
  const slug = parts[1] ?? '';
  for (const key of Object.keys(ROUTES) as RouteKey[]) {
    if (ROUTES[key][from] === slug) return href(to, key);
  }
  return `/${to}/`;
}
