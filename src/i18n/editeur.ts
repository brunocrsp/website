/**
 * L'éditeur du site, lu par les mentions légales et la politique de
 * confidentialité dans les deux langues. Ce ne sont pas des textes à
 * traduire : une seule source.
 *
 * Un champ vide s'affiche « à compléter » sur la page, et fait échouer la
 * construction en CI (`process.env.CI`, posé par GitHub Actions) : le site
 * ne part pas en production sans son éditeur. À reprendre à la création de
 * la société : raison sociale, forme, capital, siège, RCS.
 */
import { t, type Lang } from './index';
import { href } from './routes';

export const EDITEUR = {
  /** Prénom et nom de l'entrepreneur individuel. */
  nom: 'Bruno Crespo',
  /** Adresse postale, ou adresse de domiciliation. */
  adresse: '602 route de la Molière, 74150 Marcellaz-Albanais, France',
  siren: '104 366 406',
  /** Un moyen de contact direct, exigé d'un éditeur professionnel. */
  telephone: '+33 6 09 68 98 79',
  /** Le directeur de la publication, a priori l'éditeur lui-même. */
  directeur: 'Bruno Crespo',
};

export type ChampEditeur = keyof typeof EDITEUR;

export function champsManquants(): ChampEditeur[] {
  return (Object.keys(EDITEUR) as ChampEditeur[]).filter((k) => !EDITEUR[k].trim());
}

export function exigerEditeurEnCI(): void {
  const manquants = champsManquants();
  if (manquants.length && process.env.CI) {
    throw new Error(`Mentions légales incomplètes : champs vides dans src/i18n/editeur.ts (${manquants.join(', ')}).`);
  }
}

/** Une valeur des pages légales : du texte, un lien, ou un champ à compléter. */
export interface Jeton {
  texte: string;
  href?: string;
  manque?: boolean;
}

export function valeurEditeur(lang: Lang, champ: ChampEditeur): Jeton {
  const v = EDITEUR[champ].trim();
  return v ? { texte: v } : { texte: t(lang, 'legal.pending'), manque: true };
}

/** Les jetons que les textes des deux pages légales peuvent citer. */
export function jetonsLegaux(lang: Lang): Record<string, Jeton> {
  return {
    nom: valeurEditeur(lang, 'nom'),
    email: { texte: 'contact@meshvise.com', href: 'mailto:contact@meshvise.com' },
    legal: { texte: t(lang, 'privacy.legal_link'), href: href(lang, 'legal') },
    privacy: { texte: t(lang, 'legal.privacy_link'), href: href(lang, 'privacy') },
    cloudflare: { texte: 'cloudflare.com', href: 'https://www.cloudflare.com' },
    cnil: { texte: 'cnil.fr', href: 'https://www.cnil.fr' },
  };
}
