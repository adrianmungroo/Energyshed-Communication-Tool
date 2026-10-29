# Atlanta Energyshed communication tool (static site)

A static rebuild of the Streamlit app in the repo root, built with [Astro](https://astro.build).
It compiles to plain HTML, CSS, JS and JSON, so it can be hosted on GitHub Pages
(or any static host) with no server or database.

# Human note (Adrian Mungroo)
- This entire project is AI generated. Please feel free to edit this as you see fit. 

## Run it locally

Requires Node 22.23.4 or newer (`node -v` to check).

```bash
cd site
npm install
npm run dev        # http://localhost:4321/communication-tool/
```

`npm run build` writes the finished site to `site/dist/`; `npm run preview` serves that build.

## What's here

```
site/
├─ public/
│  └─ datasets/
│     ├─ scenarios.json       Dashboard data (currently MOCK, see below)
│     └─ arc-counties.geojson Boundaries for the 11 ARC counties
├─ scripts/make-mock-data.mjs Regenerates the mock scenarios.json
└─ src/
   ├─ assets/images/          Figures used on the pages (optimized at build time)
   ├─ assets/unused-images/   Figures from the old app not used yet (not published)
   ├─ images.ts               Looks up figures by file name for <Figure src="...">
   ├─ site.ts                 Chapter order, nav labels, base-path helper
   ├─ layouts/Base.astro      Header, nav, footer
   ├─ components/             Figure, PageHead, NextChapter, LoadCurve (home-page hero)
   ├─ pages/                  One file per page; URL = file name
   ├─ scripts/dashboard.ts    Dashboard map, outcome tiles, comparison bars
   └─ styles/global.css       Design tokens (colours, type scale), base styles
```

Pages: `/` (Defining the energyshed), `/efficiency/`, `/local-generation/`, `/grid/`,
`/future/` and `/dashboard/`.

## Images

Put figures in `src/assets/images/` and reference them by file name, e.g.
`<Figure src="grid_structure.png" alt="..." />`. Astro converts them to WebP and makes
several sizes at build time, so phones download small files. Don't put figures in
`public/`: files there are published as-is, at full size. A misspelled file name fails
the build with a message naming the missing image.

## Dashboard data

The dashboard reads one static file, `public/datasets/scenarios.json`. **Its current
contents are mock values** produced by `npm run mock-data`. To show real results, export
Integrated Analysis Tool (IAT) output into the same shape:

```jsonc
{
  "meta": { "mock": false, "note": "...", "horizon": 2030 },
  "counties":  [{ "fips": "13121", "name": "Fulton", "households": 450000 }],
  "outcomes":  [{ "id": "ghg", "label": "Greenhouse gas emissions", "unit": "kt CO₂e / yr",
                  "better": "lower", "aggregate": "sum", "decimals": 0 }],
  "scenarios": [{ "id": "bau", "label": "Business as usual", "short": "BAU",
                  "macap": null, "description": "..." }],
  "values": { "<scenarioId>": { "<countyFips>": { "<outcomeId>": 123.4 } } }
}
```

- The scenario with id `bau` is the baseline that the others are compared against.
- `aggregate: "sum"` outcomes are added up across counties for the regional total.
  `"mean"` outcomes are weighted by households.
- Scenarios, outcomes and counties are all read from the file, so adding a MACAP measure
  or swapping in the ERC's final six outcomes needs no code changes.
- The page state is kept in the URL hash (`#s=m4&o=bill&c=13121`), so a specific view
  can be shared as a link.

## Deploying to GitHub Pages

`site/deploy-site.yml` is a GitHub Actions workflow that builds `site/` and publishes it on
every push to `main` that touches `site/`. GitHub only runs workflows from the repo root, so
move it there once:

```bash
mkdir -p .github/workflows && git mv site/deploy-site.yml .github/workflows/
```

Then, in the GitHub repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.

The site is built for `https://<owner>.github.io/<repo>/`. For a custom domain, build with
`BASE_PATH=/`.

## Still to do

- Move the seven Imgur-hosted figures on the Future page into `src/assets/images/`.
- Replace mock dashboard data with IAT exports, and the placeholder outcomes with the six
  in the ERC's "Dashboard Scenarios and Outcomes" document.
- Move `site/deploy-site.yml` into `.github/workflows/` (see above).
- Add census-tract granularity to the map (needs a tract GeoJSON and tract-level values).
