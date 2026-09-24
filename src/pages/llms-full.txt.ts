/**
 * `/llms-full.txt` : tout le contenu du site en Markdown, pour les IA qui
 * veulent plus que le résumé de `/llms.txt`.
 *
 * Généré à la construction depuis les mêmes textes que les pages : il ne
 * peut pas dériver du site, ce qui était arrivé au résumé écrit à la main
 * (un essai gratuit de sept jours, une base lisible en SQL direct, restés
 * des mois après leur retrait). Anglais d'abord, la langue que lisent le
 * plus les assistants, puis le français, la langue du marché.
 */
import type { APIRoute } from 'astro';
import fr from '../i18n/fr.json';
import en from '../i18n/en.json';
import { FAQ_KEYS } from '../i18n/faq-keys';
import { href } from '../i18n/routes';

type Dict = typeof en;
type Lang = 'fr' | 'en';

const SITE = 'https://meshvise.com';

function section(lang: Lang, d: Dict): string {
  const url = (k: Parameters<typeof href>[1]) => `${SITE}${href(lang, k)}`;
  const l: string[] = [];
  const titre = (s: string) => l.push('', `## ${s}`, '');
  const sous = (s: string) => l.push('', `### ${s}`, '');
  const p = (...s: string[]) => l.push(...s);

  const fr_ = lang === 'fr';
  l.push(`# Meshvise (${fr_ ? 'français' : 'English'})`, '', `> ${d.home.meta.description}`);

  titre(`${d.nav.home}: ${url('home')}`);
  p(`${d.home.hero.title} ${d.home.hero.gains.map((g) => g.word.replace(/\.$/, '')).join(', ')}.`);
  for (const g of d.home.hero.gains) p(`- ${g.proof}`);
  sous(d.home.see.title);
  for (const f of d.home.see.features) p(`- **${f.title}**: ${f.body}`);

  titre(`${d.nav.why}: ${url('why')}`);
  p(`${d.why.hero.lead} ${d.why.hero.accent} ${d.why.hero.subtitle}`);
  for (const g of d.why.gains) p(`- **${g.title}**: ${g.body}`);

  titre(`${d.nav.product}: ${url('product')}`);
  p(d.product.hero.subtitle);
  sous(d.product.acq.title);
  p(`${d.product.acq.intro} ${d.product.acq.after}`);
  for (const k of ['hist', 'alarms', 'kpi', 'dash', 'synoptic', 'live', 'logic', 'trace', 'sec', 'ops'] as const) {
    p(`- **${d.product[k].title}**: ${d.product[k].body}`);
  }
  sous(d.product.assistant.title);
  p(`${d.product.assistant.lede} ${d.product.assistant.connect} ${d.product.assistant.made}`);
  p(`${fr_ ? 'Assistants' : 'Assistants'}: ${d.product.assistant.ias.join(', ')}.`);

  titre(`${d.nav.protocols}: ${url('protocols')}`);
  for (const pr of d.protocols.list) {
    p(`- **${pr.name}** (${pr.transport}): ${pr.desc} ${fr_ ? 'Équipements' : 'Equipment'}: ${pr.equipment}.`);
  }

  titre(`${d.nav.pricing}: ${url('pricing')}`);
  p(`${d.pricing.hero.lead} ${d.pricing.hero.accent} ${d.pricing.hero.subtitle}`);
  p(`- **${d.pricing.onprem.name}**: ${d.pricing.onprem.price} ${d.pricing.onprem.period}. ${d.pricing.onprem.setup}. ${d.pricing.onprem.tagline}`);
  for (const it of d.pricing.onprem.items) p(`  - ${it}`);
  p(`- **${d.pricing.managed.name}**: ${d.pricing.managed.price}. ${d.pricing.managed.tagline} ${d.pricing.managed.body}`);
  sous(d.pricing.faq_title);
  for (const k of FAQ_KEYS) {
    const q = (d.faq as Record<string, { q: string; a: string }>)[k];
    p(`**${q.q}** ${q.a}`, '');
  }

  titre(`${d.nav.contact}: ${url('contact')}`);
  p(`${d.contact.subtitle} contact@meshvise.com`);
  return l.join('\n');
}

export const GET: APIRoute = () =>
  new Response(`${section('en', en)}\n\n---\n\n${section('fr', fr as unknown as Dict)}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
