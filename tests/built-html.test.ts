/**
 * Post-build assertions on the static HTML output.
 *
 * Runs after `npm run build` against ./dist/. Catches the kind of
 * regressions that have already bitten us once (hardcoded localhost:8000
 * URLs, personal email exposure, broken `href="#"` links, dead waitlist
 * anchors). Faster and more meaningful than rendering individual Astro
 * components in isolation, because we test exactly what visitors see.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import en from '../src/i18n/en.json';

const dist = resolve(__dirname, '..', 'dist');
const pages = {
  apex: resolve(dist, 'index.html'),
  fr: resolve(dist, 'fr', 'index.html'),
  en: resolve(dist, 'en', 'index.html'),
  fr_why: resolve(dist, 'fr', 'pourquoi-superviser', 'index.html'),
  en_why: resolve(dist, 'en', 'why-supervise', 'index.html'),
  fr_product: resolve(dist, 'fr', 'produit', 'index.html'),
  en_product: resolve(dist, 'en', 'product', 'index.html'),
  fr_protocols: resolve(dist, 'fr', 'protocoles', 'index.html'),
  en_protocols: resolve(dist, 'en', 'protocols', 'index.html'),
  fr_pricing: resolve(dist, 'fr', 'tarifs', 'index.html'),
  en_pricing: resolve(dist, 'en', 'pricing', 'index.html'),
  fr_demo: resolve(dist, 'fr', 'demo', 'index.html'),
  en_demo: resolve(dist, 'en', 'demo', 'index.html'),
  fr_contact: resolve(dist, 'fr', 'contact', 'index.html'),
  en_contact: resolve(dist, 'en', 'contact', 'index.html'),
  fr_legal: resolve(dist, 'fr', 'mentions-legales', 'index.html'),
  en_legal: resolve(dist, 'en', 'legal-notice', 'index.html'),
  fr_privacy: resolve(dist, 'fr', 'confidentialite', 'index.html'),
  en_privacy: resolve(dist, 'en', 'privacy', 'index.html'),
};
type Page = keyof typeof pages;
const SITE = Object.keys(pages).filter((k) => k !== 'apex') as Page[];

let html: Record<Page, string>;

beforeAll(() => {
  for (const [name, path] of Object.entries(pages)) {
    if (!existsSync(path)) {
      throw new Error(
        `Missing built page: ${path}. Run \`npm run build\` first.`
      );
    }
  }
  html = Object.fromEntries(
    Object.entries(pages).map(([name, path]) => [name, readFileSync(path, 'utf-8')]),
  ) as Record<Page, string>;
});

describe('Built pages exist and have a <title>', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang}/index.html has a <title>`, () => {
      expect(html[lang]).toMatch(/<title>[^<]+<\/title>/);
    });
    it(`${lang}/contact/index.html has a <title>`, () => {
      const key = `${lang}_contact` as keyof typeof html;
      expect(html[key]).toMatch(/<title>[^<]+<\/title>/);
    });
  }
});

describe('No prod-breaking hardcoded URLs', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} has no http://localhost LINKS (terminal mocks are allowed)`, () => {
      // Block real <a href> / <img src> pointing at localhost; allow it
      // in code / pre blocks (terminal mocks where it's the user's own
      // self-hosted URL after `docker compose up`).
      expect(html[lang]).not.toMatch(/(href|src)=["']http:\/\/localhost/);
    });

    it(`${lang} has no bruno.crespo74 personal email`, () => {
      expect(html[lang]).not.toMatch(/bruno\.crespo74/);
    });

    it(`${lang} has no broken href="#" anchors (excluding heading anchors)`, () => {
      // Strip valid anchors like href="#features" before checking
      const withoutValidAnchors = html[lang].replace(/href="#[a-z][a-z0-9-]*"/gi, '');
      expect(withoutValidAnchors).not.toMatch(/href="#"/);
    });
  }
});

describe('Contact mailto goes to the right address', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} mailto links use contact@meshvise.com`, () => {
      const mailtos = html[lang].match(/mailto:([^"'\s<>]+)/g) ?? [];
      expect(mailtos.length).toBeGreaterThan(0);
      for (const mailto of mailtos) {
        // Allow ?subject=... and similar URL params, just check the address.
        const addr = mailto.replace(/^mailto:/, '').split('?')[0];
        expect(addr).toBe('contact@meshvise.com');
      }
    });
  }
});

describe('Removed components are really gone', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} has no #waitlist anchor (component was removed)`, () => {
      expect(html[lang]).not.toMatch(/href="#waitlist"/);
    });
  }
});

describe('Apex root redirects to /fr/', () => {
  it('apex page is a redirect stub pointing to /fr/', () => {
    expect(html.apex).toMatch(/url=\/fr\//);
  });
});

// Depuis le 2026-09-23, tous les « Prendre contact » mènent à la page
// Contact, qui porte le seul formulaire de demande ; la page d'essai est
// retirée, l'essai se demande là, sujet « essai » choisi d'office.
describe('Contact pages collect a request with its topic', () => {
  for (const lang of ['fr', 'en'] as const) {
    const key = `${lang}_contact` as keyof typeof html;

    it(`${lang}/contact/index.html has a request form with topic, name, email, company, install`, () => {
      expect(html[key]).toMatch(/data-contact-form/);
      expect(html[key]).toMatch(/name="topic"/);
      expect(html[key]).toMatch(/name="name"/);
      expect(html[key]).toMatch(/name="email"/);
      expect(html[key]).toMatch(/name="company"/);
      expect(html[key]).toMatch(/name="install"/);
    });

    it(`${lang}/contact/index.html offers the licence, managed operations and trial topics`, () => {
      for (const topic of ['licence', 'exploitation', 'essai']) {
        expect(html[key]).toContain(`value="${topic}"`);
      }
    });

    it(`${lang}/contact/index.html does not issue a self-serve licence`, () => {
      expect(html[key]).not.toContain("'/api/trial'");
    });
  }
});

// La démo ne s'ouvre qu'après le formulaire de la page Démo (2026-10-26) :
// la page le porte, dit à quoi servent les coordonnées et renvoie à la
// politique de confidentialité, qui décrit ce formulaire et le cookie de la
// démo.
describe('Demo page opens the demo through its access form', () => {
  for (const lang of ['fr', 'en'] as const) {
    const page = (h: Record<Page, string>) => h[`${lang}_demo` as Page];
    it(`${lang}/demo/index.html has the access form: name, company, email, optional phone`, () => {
      const p = page(html);
      expect(p).toMatch(/data-demo-access/);
      expect(p).toContain("'/api/demo-access'");
      for (const field of ['name', 'company', 'email']) expect(p).toMatch(new RegExp(`name="${field}"[^>]*required`));
      expect(p).toMatch(/name="phone"/);
      expect(p).not.toMatch(/name="phone"[^>]*required/);
      expect(p).toContain(lang === 'fr' ? 'href="/fr/confidentialite/"' : 'href="/en/privacy/"');
      expect(p).toContain('href="https://demo.meshvise.com/"');
    });

    it(`${lang} privacy policy describes the demo access form and its cookie`, () => {
      const p = html[`${lang}_privacy`];
      expect(p).toContain(lang === 'fr' ? 'formulaire d&#39;accès à la démo' : 'demo access form');
      expect(p).toContain('demo.meshvise.com');
    });
  }
});

describe('Landing pages send the trial request to the Contact page', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang}/index.html links to /${lang}/contact/?sujet=essai`, () => {
      expect(html[lang]).toContain(`href="/${lang}/contact/?sujet=essai"`);
    });
  }
});

describe('Hard-rule lint on built HTML', () => {
  const EM_DASH = '—';
  const FORBIDDEN_NAMES = [
    'Niagara',
    'Ignition',
    'EcoStruxure',
    'Tridium',
    'Inductive Automation',
    'Workbench',
    'JACE',
  ];
  const OPEN_SOURCE_PATTERNS = [/open[- ]source/i, /source[- ]available/i];

  for (const key of SITE) {
    it(`${key} contains no em-dash`, () => {
      expect(html[key]).not.toContain(EM_DASH);
    });

    it(`${key} contains no banned competitor name`, () => {
      for (const name of FORBIDDEN_NAMES) {
        expect(html[key], `banned name "${name}" in ${key}`).not.toMatch(
          new RegExp(`\\b${name}\\b`),
        );
      }
    });

    it(`${key} does not mention "open source" or "source available"`, () => {
      for (const pattern of OPEN_SOURCE_PATTERNS) {
        expect(html[key]).not.toMatch(pattern);
      }
    });
  }
});

// La structure du site depuis le 2026-09-23 : les entrées de la barre (Contact
// ajouté le 2026-10-23), les pages supprimées ne sont plus liées nulle part.
describe('Navigation', () => {
  for (const lang of ['fr', 'en'] as const) {
    const nav = () => {
      const m = html[lang].match(/<nav class="hidden lg:flex[^"]*" aria-label="Primary">([\s\S]*?)<\/nav>/);
      if (!m) throw new Error(`primary nav not found in ${lang}`);
      return m[1];
    };

    it(`${lang} top bar lists home, why, product, protocols, pricing, contact`, () => {
      const liens = [...nav().matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      expect(liens).toEqual(
        lang === 'fr'
          ? ['/fr/', '/fr/pourquoi-superviser/', '/fr/produit/', '/fr/protocoles/', '/fr/tarifs/', '/fr/contact/']
          : ['/en/', '/en/why-supervise/', '/en/product/', '/en/protocols/', '/en/pricing/', '/en/contact/'],
      );
    });

    it(`${lang} header demo button leads to the demo page`, () => {
      expect(html[lang]).toContain(`href="/${lang}/demo/" class="btn btn-primary"`);
    });
  }

  for (const key of SITE) {
    it(`${key} links to no removed page`, () => {
      expect(html[key]).not.toMatch(/href="\/(fr|en)\/(guides|faq|a-propos|about|integrateurs|integrators|trial|preview-motion)\//);
    });
  }
});

describe('Personas section', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} home renders four persona tabs and panels`, () => {
      const m = html[lang].match(/<section id="personas"[\s\S]*?<\/section>/);
      expect(m).not.toBeNull();
      expect(m![0].match(/role="tab"/g) ?? []).toHaveLength(4);
      expect(m![0].match(/role="tabpanel"/g) ?? []).toHaveLength(4);
    });
  }
});

// La FAQ vit sur la page Tarifs, réduite aux questions d'un acheteur, et son
// balisage FAQPage n'est émis que là.
describe('FAQ on the pricing page', () => {
  const QUESTIONS = ['trial_how', 'demo_vs_trial', 'hardware', 'support', 'updates', 'disappear', 'notfor'];
  for (const lang of ['fr', 'en'] as const) {
    const key = `${lang}_pricing` as Page;

    it(`${lang} pricing page shows the seven buyer questions`, () => {
      for (const q of QUESTIONS) expect(html[key]).toContain(`id="faq-${q}"`);
    });

    it(`${lang} FAQPage structured data only on the pricing page`, () => {
      expect(html[key]).toContain('"@type":"FAQPage"');
      expect(html[lang]).not.toContain('"@type":"FAQPage"');
    });
  }
});

describe('Pricing page', () => {
  for (const lang of ['fr', 'en'] as const) {
    const key = `${lang}_pricing` as Page;

    it(`${lang} shows the licence price`, () => {
      expect(html[key]).toContain(lang === 'fr' ? '2 400 €' : '€2,400');
    });

    it(`${lang} offer buttons lead to the request form on the page, with their topic`, () => {
      expect(html[key]).toMatch(/href="#demande" data-sujet="licence"/);
      expect(html[key]).toMatch(/href="#demande" data-sujet="exploitation"/);
      expect(html[key]).toContain('id="demande"');
      expect(html[key]).toMatch(/name="topic" value="licence" checked/);
    });

    it(`${lang} keeps the anchor the homepage links to`, () => {
      expect(html[key]).toContain('id="exploitation-deleguee"');
    });

    it(`${lang} announces every update, major versions included`, () => {
      expect(html[key]).toMatch(lang === 'fr' ? /majeures comprises/ : /major versions included/);
    });
  }
});

describe('Footer', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} footer links to the contact page`, () => {
      const f = html[lang].match(/<footer[\s\S]*<\/footer>/)![0];
      expect(f).toContain(`href="/${lang}/contact/"`);
    });
  }

  // Les mentions légales doivent être accessibles depuis chaque page.
  for (const key of SITE) {
    it(`${key} footer links to the legal notice and the privacy policy`, () => {
      const lang = key.startsWith('en') ? 'en' : 'fr';
      const f = html[key].match(/<footer[\s\S]*<\/footer>/)![0];
      expect(f).toContain(lang === 'fr' ? 'href="/fr/mentions-legales/"' : 'href="/en/legal-notice/"');
      expect(f).toContain(lang === 'fr' ? 'href="/fr/confidentialite/"' : 'href="/en/privacy/"');
    });
  }
});

// Une capture manquante réserve sa place avec un cadre vide (ProductShot) :
// utile en développement, jamais en production.
describe('Product captures', () => {
  for (const key of SITE) {
    it(`${key} ships no empty capture slot`, () => {
      expect(html[key]).not.toMatch(/class="attente/);
    });
  }

  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} home and product pages show their captures`, () => {
      expect(html[lang]).toMatch(/<img[^>]+alt="[^"]*"[^>]*class="capture/);
      expect(html[`${lang}_product`].match(/class="capture/g)?.length).toBe(7);
    });
  }
});

describe('Legal pages', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} legal notice names the host and links to the privacy policy`, () => {
      const p = html[`${lang}_legal`];
      expect(p).toContain('Cloudflare, Inc., 101 Townsend St.');
      expect(p).toContain('contact@meshvise.com');
      expect(p).toContain(lang === 'fr' ? 'href="/fr/confidentialite/"' : 'href="/en/privacy/"');
    });

    it(`${lang} privacy policy names every processor and the authority`, () => {
      const p = html[`${lang}_privacy`];
      for (const s of ['Cloudflare', 'Resend', 'Google', 'href="https://www.cnil.fr"', 'href="mailto:contact@meshvise.com"']) {
        expect(p, s).toContain(s);
      }
      expect(p).toContain(lang === 'fr' ? 'href="/fr/mentions-legales/"' : 'href="/en/legal-notice/"');
    });

    it(`${lang} legal pages leave no token unreplaced`, () => {
      for (const key of [`${lang}_legal`, `${lang}_privacy`] as const) {
        expect(html[key]).not.toMatch(/\{[a-z]+\}/);
      }
    });
  }
});

// Ce que lisent les moteurs et les IA : le résumé écrit à la main ne doit
// plus reprendre de promesse retirée, le fichier complet est généré depuis
// les textes du site, et chaque page porte ses données structurées.
describe('Files for search engines and AI', () => {
  const lire = (f: string) => readFileSync(resolve(dist, f), 'utf-8');

  it('llms.txt makes no withdrawn promise', () => {
    const t = lire('llms.txt');
    expect(t).not.toMatch(/7-day|seven-day|free trial|€0|PostgreSQL|Power BI|direct read/i);
    expect(t).not.toMatch(/night-time|baseload|nothing is lost|templates ready|timers/i);
    expect(t).toContain('https://meshvise.com/llms-full.txt');
  });

  it('llms.txt is generated from the site texts', () => {
    const t = lire('llms.txt');
    expect(t).toContain(en.home.meta.description);
    for (const f of en.home.see.features) expect(t).toContain(f.body);
    expect(t).toContain(en.pricing.onprem.price);
    expect(t).toContain('https://meshvise.com/fr/contact/');
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('—');
  });

  it('llms-full.txt carries every page in both languages', () => {
    const t = lire('llms-full.txt');
    for (const s of ['/en/why-supervise/', '/en/product/', '/en/protocols/', '/en/pricing/', '/en/contact/',
                     '/fr/pourquoi-superviser/', '/fr/produit/', '/fr/protocoles/', '/fr/tarifs/', '/fr/contact/']) {
      expect(t).toContain(`https://meshvise.com${s}`);
    }
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('—');
  });

  it('robots.txt opens the site and points to the sitemap', () => {
    const t = lire('robots.txt');
    expect(t).toMatch(/User-agent: \*\s+Allow: \//);
    expect(t).toContain('Sitemap: https://meshvise.com/sitemap-index.xml');
  });

  for (const lang of ['fr', 'en'] as const) {
    it(`${lang} home has Organization, WebSite and SoftwareApplication data, and a PNG share image`, () => {
      for (const type of ['Organization', 'WebSite', 'SoftwareApplication']) {
        expect(html[lang]).toContain(`"@type":"${type}"`);
      }
      expect(html[lang]).toContain('property="og:image" content="https://meshvise.com/og-image.png"');
    });
  }
});

describe('Security headers', () => {
  // Cloudflare pose `_headers` sur chaque fichier servi : sans lui, la
  // vitrine partait sans aucun en-tête de sécurité (2026-10-25/MEL-11).
  const headers = () => readFileSync(resolve(dist, '_headers'), 'utf-8');

  it('_headers covers every file with the six headers of the demo', () => {
    const t = headers();
    expect(t).toMatch(/^\/\*$/m);
    for (const h of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Frame-Options',
                     'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
      expect(t).toMatch(new RegExp(`^  ${h}: \\S`, 'm'));
    }
    expect(t).toContain("default-src 'self'");
    expect(t).toContain("frame-ancestors 'none'");
    expect(t).toContain("object-src 'none'");
  });

  // La CSP n'admet que le site lui-même : un script, une feuille ou une
  // police tirée d'ailleurs serait bloquée chez le visiteur.
  for (const name of SITE) {
    it(`${name} loads nothing from another origin`, () => {
      expect(html[name]).not.toMatch(/<(script|link|img|iframe)\b[^>]*\b(src|href)="(https?:)?\/\/(?!meshvise\.com[/"])[^"]*"[^>]*>/i);
    });
  }
});
