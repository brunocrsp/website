/**
 * `/llms.txt` : le résumé que lisent d'abord les IA, en anglais.
 *
 * Généré à la construction depuis les textes des pages, comme son jumeau
 * `/llms-full.txt`. Écrit à la main jusqu'au 2026-10-23, il avait dérivé
 * deux fois du site : un essai gratuit et une base lisible en SQL direct
 * restés des mois après leur retrait, puis le talon nocturne et « rien
 * n'est perdu quand le réseau coupe » (audit du 2026-10-19, DOC-29).
 */
import type { APIRoute } from 'astro';
import en from '../i18n/en.json';
import { href, type RouteKey } from '../i18n/routes';

const SITE = 'https://meshvise.com';

const LIENS: Array<[RouteKey, string]> = [
  ['home', en.nav.home],
  ['product', en.nav.product],
  ['protocols', en.nav.protocols],
  ['contact', en.nav.contact],
];

function resume(): string {
  const l: string[] = [];
  const p = (...s: string[]) => l.push(...s);

  p('# Meshvise', '', `> ${en.home.meta.description}`, '');
  p(`The full content of the site, in English and French, is at ${SITE}/llms-full.txt`);

  p('', `## ${en.home.see.title}`, '');
  for (const f of en.home.see.features) p(`- **${f.title}**: ${f.body}`);
  p(`- **${en.product.assistant.title}**: ${en.product.assistant.connect}`);

  p('', '## Links', '');
  for (const [k, nom] of LIENS) p(`- ${nom}: ${SITE}${href('fr', k)} · ${SITE}${href('en', k)}`);
  p('- Email: contact@meshvise.com');
  return l.join('\n') + '\n';
}

export const GET: APIRoute = () =>
  new Response(resume(), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
