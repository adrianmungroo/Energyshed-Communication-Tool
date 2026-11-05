// Builds the map geography for the dashboard:
//   public/datasets/counties.geojson  every county the dashboard can show
//   public/datasets/regions.json      which counties belong to each map area
//
//   npm run regions
//
// Georgia Power and Southern Company are APPROXIMATED from whole states until
// official outlines are added. To make them exact, save the HIFLD outlines as
//   scripts/input/georgia-power.geojson   (Electric Retail Service Territories)
//   scripts/input/soco.geojson            (Control Areas / balancing authorities)
// and re-run. Counties whose centre falls inside an outline are then included.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { geoArea, geoCentroid, geoContains } from 'd3-geo';

const here = (p) => new URL(p, import.meta.url);
const COUNTIES_URL = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';
const CACHE = here('./.cache/us-counties.geojson');

// States the outlines can reach (GA, AL, MS, FL). Counties outside every area are dropped.
const STATES = { '13': 'GA', '01': 'AL', '28': 'MS', '12': 'FL' };

const ARC = ['13057', '13063', '13067', '13089', '13097', '13113', '13117', '13121', '13135', '13151', '13247'];

async function loadCounties() {
  if (!existsSync(CACHE)) {
    console.log('Downloading U.S. county outlines…');
    const res = await fetch(COUNTIES_URL);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${COUNTIES_URL}`);
    mkdirSync(here('./.cache/'), { recursive: true });
    writeFileSync(CACHE, await res.text());
  }
  const all = JSON.parse(readFileSync(CACHE, 'utf8'));
  return all.features.filter((f) => STATES[f.id.slice(0, 2)]);
}

/**
 * Split an outline into single polygons with the ring order d3 expects.
 * GeoJSON files differ in winding order; d3 reads a polygon wound the "wrong" way
 * as everything on Earth except that shape, so any polygon covering more than
 * half the globe gets its rings reversed.
 */
function polygons(feature) {
  const g = feature.geometry;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return list.map((rings) => {
    const poly = { type: 'Polygon', coordinates: rings };
    return geoArea(poly) > 2 * Math.PI ? { type: 'Polygon', coordinates: rings.map((r) => [...r].reverse()) } : poly;
  });
}

/** Counties whose centre lies inside an outline file, or null if there is no file. */
function fromOutline(file, counties) {
  const path = here(`./input/${file}`);
  if (!existsSync(path)) return null;
  const outline = JSON.parse(readFileSync(path, 'utf8'));
  if (!outline.features?.length) throw new Error(`${file} has no features.`);
  const polys = outline.features.flatMap(polygons);
  const inside = counties.filter((c) => {
    const pt = geoCentroid(c);
    return polys.some((p) => geoContains(p, pt));
  });
  console.log(`${file}: ${inside.length} counties inside the outline`);
  return inside.map((c) => c.id);
}

const counties = await loadCounties();
const inState = (...codes) => counties.filter((c) => codes.includes(c.id.slice(0, 2))).map((c) => c.id);

const gpcExact = fromOutline('georgia-power.geojson', counties);
const socoExact = fromOutline('soco.geojson', counties);

const regions = [
  {
    id: 'arc',
    label: 'Atlanta region',
    short: 'ARC 11',
    description: 'The 11 counties of the Atlanta Regional Commission.',
    approximate: false,
    counties: ARC,
  },
  {
    id: 'gpc',
    label: 'Georgia Power service area',
    short: 'Georgia Power',
    description: gpcExact
      ? "Counties whose centre lies inside Georgia Power's retail service territory (HIFLD). Georgia Power shares many of them with EMCs and city utilities."
      : 'Shown as all 159 Georgia counties until the official outline is added. In reality Georgia Power shares many counties with EMCs and city utilities.',
    approximate: !gpcExact,
    counties: gpcExact ?? inState('13'),
  },
  {
    id: 'soco',
    label: 'Southern Company balancing area',
    short: 'Southern Company',
    description: socoExact
      ? 'Counties whose centre lies inside the Southern Company (SOCO) balancing authority area (HIFLD): most of Georgia and Alabama plus parts of Mississippi and the Florida panhandle.'
      : 'Shown as Georgia and Alabama until the official outline is added. The real area also covers part of Mississippi and leaves out TVA-served parts of north Alabama and north Georgia.',
    approximate: !socoExact,
    counties: socoExact ?? inState('13', '01'),
  },
];

// Keep only counties used by at least one area; small properties only.
const used = new Set(regions.flatMap((r) => r.counties));
const features = counties
  .filter((c) => used.has(c.id))
  .map((c) => ({
    type: 'Feature',
    id: c.id,
    properties: { fips: c.id, name: c.properties.NAME, state: STATES[c.id.slice(0, 2)] },
    // Round coordinates to ~10 m to keep the file small.
    geometry: roundGeometry(c.geometry),
  }));

function roundGeometry(g) {
  const r = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(4), +c[1].toFixed(4)] : c.map(r));
  return { type: g.type, coordinates: r(g.coordinates) };
}

writeFileSync(here('../public/datasets/counties.geojson'), JSON.stringify({ type: 'FeatureCollection', features }));
writeFileSync(here('../public/datasets/regions.json'), JSON.stringify({ regions }, null, 2) + '\n');
for (const r of regions) console.log(`${r.short}: ${r.counties.length} counties${r.approximate ? ' (approximate)' : ''}`);
console.log(`Wrote ${features.length} counties to public/datasets/counties.geojson`);
