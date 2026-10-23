# Meshvise: website

The marketing site of [Meshvise](https://meshvise.com), industrial supervision software installed on the customer's own server.

Built with [Astro 6](https://astro.build/) into static pages, served by a [Cloudflare Worker](https://developers.cloudflare.com/workers/) that also handles the contact form (`POST /api/contact`).

## Dev

```sh
npm install
npm run dev       # http://127.0.0.1:4321
npm run build     # static output in ./dist
npm test          # vitest, reads ./dist: build first
```

## Deploy

A push on `master` runs the CI (build, then tests); when it passes, `.github/workflows/deploy.yml` deploys the Worker to `meshvise.com` and `www.meshvise.com`.

## Structure

```
src/
├── pages/          # thin routes per language (fr/, en/), llms.txt and llms-full.txt
├── components/     # pages/ holds one component per page
├── layouts/Base.astro
├── i18n/           # fr.json + en.json, every text of the site
├── styles/global.css
└── worker.js       # the Worker: static assets and /api/contact
```

French is the default language; every text lives in `src/i18n/{fr,en}.json`.
