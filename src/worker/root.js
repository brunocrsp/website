// La racine du site (2026-10-26) : une redirection HTTP vers la page
// d'accueil dans la langue que le navigateur préfère. Jusque-là, `/` servait
// la page de redirection qu'Astro génère pour `src/pages/index.astro` : un
// « Redirecting to: /fr/ » affiché deux secondes avant la vraie page, et
// toujours en français. Cette page reste dans le build pour `npm run dev`,
// où le worker ne tourne pas ; en ligne, `run_worker_first` (wrangler.jsonc)
// envoie `/` ici avant les fichiers statiques.

/** Celle des deux langues que le navigateur préfère ; le français à défaut. */
export function rootLang(acceptLanguage) {
  let best = 'fr';
  let bestQ = 0;
  for (const part of (acceptLanguage || '').split(',')) {
    const [tag, ...params] = part.trim().toLowerCase().split(';');
    const lang = tag.split('-')[0];
    if (lang !== 'fr' && lang !== 'en') continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const weight = q ? Number(q.slice(2)) : 1;
    if (weight > bestQ) {
      best = lang;
      bestQ = weight;
    }
  }
  return best;
}

export function handleRoot(request) {
  const url = new URL(request.url);
  const target = new URL(`/${rootLang(request.headers.get('Accept-Language'))}/`, url);
  target.search = url.search;
  return new Response(null, {
    status: 302,
    headers: {
      location: target.toString(),
      // La réponse dépend de la langue du navigateur : aucun cache partagé
      // ne doit la servir à un autre.
      vary: 'Accept-Language',
      'cache-control': 'private, no-cache',
      // `public/_headers` ne s'applique pas aux réponses du worker ; la
      // racine est la première adresse que tape un visiteur.
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
    },
  });
}
