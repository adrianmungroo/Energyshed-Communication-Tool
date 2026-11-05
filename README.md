# Atlanta Energyshed communication tool (static site)

A static rebuild of the original Streamlit communication tool, built with [Astro](https://astro.build).
It compiles to plain HTML, CSS, JS and JSON, so it can be hosted on GitHub Pages
(or any static host) with no server or database.

## Run it locally

Requires Node 22.23.4 or newer (`node -v` to check).

```bash
npm install
npm run dev        # http://localhost:4321/communication-tool/
```

`npm run build` writes the finished site to `dist/`; `npm run preview` serves that build.

## What's here

```
Energyshed-Communication-Tool/
├─ public/
│  └─ datasets/
│     ├─ scenarios.json       Dashboard data (currently MOCK, see below)
│     ├─ counties.geojson     County outlines for every map area
│     └─ regions.json         Which counties make up each map area
├─ scripts/input/             HIFLD outlines for Georgia Power and Southern Company
├─ scripts/make-regions.mjs   Rebuilds counties.geojson and regions.json
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
  "counties":  [{ "fips": "13121", "name": "Fulton", "state": "GA", "households": 450000 }],
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
- `values` needs a row for every county in every map area (see below), or that area is
  hidden from the toggle.
- The page state is kept in the URL hash (`#r=arc&s=m4&o=bill&c=13121`), so a specific
  view can be shared as a link.

## Map areas

The dashboard map can switch between three areas, defined in `public/datasets/regions.json`:

| Toggle | Area | Counties |
|---|---|---|
| ARC 11 | The 11 Atlanta Regional Commission counties | 11 |
| Georgia Power | Georgia Power's retail service territory | 158 (all of Georgia except Fannin) |
| Southern Company | Southern Company (SOCO) balancing authority area | 250 (GA 158, AL 59, MS 24, FL 9) |

The Georgia Power and Southern Company areas come from the HIFLD outlines in
`scripts/input/` (`georgia-power.geojson`: Electric Retail Service Territories;
`soco.geojson`: Control Areas). A county joins an area when its centre lies inside the
outline, so counties a utility only partly serves are counted in or out as a whole.
On the two larger maps the ARC counties are outlined so people can find Atlanta.

To update the outlines, replace the files in `scripts/input/` and run:

```bash
npm run regions     # rebuilds counties.geojson and regions.json from the outlines
npm run mock-data   # regenerates mock values for any new counties
```

`npm run regions` downloads U.S. county outlines from GitHub the first time (cached in
`scripts/.cache/`). If an outline file is missing, that area falls back to whole states
and is labelled approximate on the map.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds the site and publishes it on every push to `main`.
The github.com mirror (https://github.com/adrianmungroo/Energyshed-Communication-Tool)
runs it and serves the site at https://adrianmungroo.github.io/Energyshed-Communication-Tool/.
Georgia Tech's GitHub has no Actions runners, so the workflow doesn't run there.

The base path is set from the repository name at build time. For a custom domain, build
with `BASE_PATH=/`.

## Still to do

- Move the seven Imgur-hosted figures on the Future page into `src/assets/images/`.
- Replace mock dashboard data with IAT exports, and the placeholder outcomes with the six
  in the ERC's "Dashboard Scenarios and Outcomes" document.
- Add census-tract granularity to the map (needs a tract GeoJSON and tract-level values).
