import { geoIdentity, geoPath, type GeoPermissibleObjects } from 'd3-geo';

/* ---------- Data shapes (see README "Dashboard data") ---------- */
interface County { fips: string; name: string; state: string; households: number }
interface Outcome {
  id: string;
  label: string;
  unit: string;
  better: 'lower' | 'higher';
  aggregate: 'sum' | 'mean';
  decimals: number;
}
interface Scenario { id: string; label: string; short: string; macap: number | null; description: string }
interface ScenarioData {
  meta: { mock: boolean; note: string; horizon: number };
  counties: County[];
  outcomes: Outcome[];
  scenarios: Scenario[];
  values: Record<string, Record<string, Record<string, number>>>;
}
interface Region {
  id: string;
  label: string;
  short: string;
  description: string;
  approximate: boolean;
  counties: string[];
}
interface State { region: string; scenario: string; outcome: string; county: string | null }

const BASELINE = 'bau';
const CONTEXT_REGION = 'arc'; // outlined on the larger maps for orientation
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_W = 560;

/* ---------- Helpers ---------- */
const fmt = (v: number, d: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, cls?: string) => {
  const n = document.createElementNS(SVG_NS, tag);
  if (cls) n.setAttribute('class', cls);
  return n;
};

function readHash(): Partial<State> {
  const p = new URLSearchParams(location.hash.slice(1));
  return {
    region: p.get('r') ?? undefined,
    scenario: p.get('s') ?? undefined,
    outcome: p.get('o') ?? undefined,
    county: p.get('c'),
  };
}
function writeHash(s: State) {
  const p = new URLSearchParams({ r: s.region, s: s.scenario, o: s.outcome });
  if (s.county) p.set('c', s.county);
  history.replaceState(null, '', `#${p}`);
}

/** Squash longitudes so a planar projection keeps shapes right at Georgia's latitude. */
function scaleLon(g: GeoJSON.Geometry, k: number) {
  const walk = (c: any): void => {
    if (typeof c[0] === 'number') c[0] *= k;
    else c.forEach(walk);
  };
  if ('coordinates' in g) walk(g.coordinates);
}

/* ---------- Mount ---------- */
export async function mountDashboard(root: HTMLElement) {
  const base = root.dataset.base ?? '/';
  const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  let data: ScenarioData;
  let geo: GeoJSON.FeatureCollection;
  let regions: Region[];
  try {
    const get = (f: string) => fetch(`${base}datasets/${f}`).then((r) => {
      if (!r.ok) throw new Error(f);
      return r.json();
    });
    [data, geo, { regions }] = await Promise.all([get('scenarios.json'), get('counties.geojson'), get('regions.json')]);
  } catch {
    q('[data-map-title]').textContent = "Couldn't load the scenario data. Reload the page to try again.";
    return;
  }

  const outcomeById = new Map(data.outcomes.map((o) => [o.id, o]));
  const scenarioById = new Map(data.scenarios.map((s) => [s.id, s]));
  const countyById = new Map(data.counties.map((c) => [c.fips, c]));
  // Areas whose counties all have data
  regions = regions.filter((r) => r.counties.every((f) => countyById.has(f)));
  const regionById = new Map(regions.map((r) => [r.id, r]));
  q('[data-horizon]').textContent = String(data.meta.horizon);

  const k = Math.cos((33 * Math.PI) / 180);
  for (const f of geo.features) scaleLon(f.geometry, k);
  const featureById = new Map(geo.features.map((f) => [String(f.properties?.fips ?? f.id), f]));

  const fromHash = readHash();
  const region0 = regionById.get(fromHash.region ?? '') ?? regions[0];
  const state: State = {
    region: region0.id,
    scenario: scenarioById.has(fromHash.scenario ?? '') ? fromHash.scenario! : data.scenarios[1]?.id ?? BASELINE,
    outcome: outcomeById.has(fromHash.outcome ?? '') ? fromHash.outcome! : data.outcomes[0].id,
    county: region0.counties.includes(fromHash.county ?? '') ? fromHash.county! : null,
  };
  const currentRegion = () => regionById.get(state.region)!;
  const countyName = (c: County) => `${c.name} County, ${c.state}`;

  /* Values: one county, or the current area (sum, or household-weighted mean) */
  const value = (scenario: string, outcome: string, county: string | null): number => {
    const o = outcomeById.get(outcome)!;
    const rows = data.values[scenario];
    if (county) return rows[county][outcome];
    const list = currentRegion().counties;
    if (o.aggregate === 'sum') return list.reduce((t, f) => t + rows[f][outcome], 0);
    const hh = list.reduce((t, f) => t + countyById.get(f)!.households, 0);
    return list.reduce((t, f) => t + rows[f][outcome] * countyById.get(f)!.households, 0) / hh;
  };
  const pctChange = (scenario: string, outcome: string, county: string | null) => {
    const b = value(BASELINE, outcome, county);
    return b === 0 ? 0 : (value(scenario, outcome, county) - b) / b;
  };
  /** +1 good, -1 bad, 0 none, for a fractional change in an outcome. */
  const tone = (o: Outcome, change: number) => {
    if (Math.abs(change) < 0.0005) return 0;
    return (change < 0) === (o.better === 'lower') ? 1 : -1;
  };
  const toneClass = (t: number) => (t > 0 ? 'pill--better' : t < 0 ? 'pill--worse' : '');

  /* ---------- Scenario picker ---------- */
  const select = q<HTMLSelectElement>('[data-scenario]');
  for (const s of data.scenarios) {
    const opt = el('option', '', s.macap ? `${s.label} (MACAP ${s.macap})` : s.label);
    opt.value = s.id;
    select.append(opt);
  }
  select.addEventListener('change', () => update({ scenario: select.value }));

  /* ---------- Area toggle ---------- */
  const toggle = q('[data-regions]');
  const regionButtons = new Map<string, HTMLButtonElement>();
  for (const r of regions) {
    const b = el('button', 'seg__btn', r.short);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (r.id === state.region) return;
      const keep = state.county && r.counties.includes(state.county) ? state.county : null;
      update({ region: r.id, county: keep }, true);
    });
    toggle.append(b);
    regionButtons.set(r.id, b);
  }

  /* ---------- County search (keyboard-friendly on the large maps) ---------- */
  const countySelect = q<HTMLSelectElement>('[data-county-select]');
  countySelect.addEventListener('change', () => update({ county: countySelect.value || null }));
  function fillCountySelect() {
    const opts = currentRegion()
      .counties.map((f) => countyById.get(f)!)
      .sort((a, b) => a.name.localeCompare(b.name));
    const multiState = new Set(opts.map((c) => c.state)).size > 1;
    countySelect.replaceChildren(el('option', '', `Whole area (${opts.length} counties)`));
    (countySelect.firstChild as HTMLOptionElement).value = '';
    for (const c of opts) {
      const o = el('option', '', multiState ? `${c.name}, ${c.state}` : c.name);
      o.value = c.fips;
      countySelect.append(o);
    }
  }

  /* ---------- Map ---------- */
  const mapWrap = q('[data-map]');
  let countyPaths = new Map<string, SVGPathElement>();

  function drawMap() {
    const r = currentRegion();
    const feats = r.counties.map((f) => featureById.get(f)!).filter(Boolean);
    const fc = { type: 'FeatureCollection', features: feats } as GeoPermissibleObjects;
    const projection = geoIdentity().reflectY(true).fitWidth(MAP_W - 16, fc);
    const path = geoPath(projection);
    const [[, y0], [, y1]] = path.bounds(fc);
    projection.translate([projection.translate()[0] + 8, projection.translate()[1] + 8 - y0]);
    const H = Math.ceil(y1 - y0) + 16;

    const large = feats.length > 30;
    const svg = svgEl('svg', large ? 'is-large' : '');
    svg.setAttribute('viewBox', `0 0 ${MAP_W} ${H}`);
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', `Map of the ${feats.length} counties in the ${r.label}`);
    countyPaths = new Map();
    const labels = svgEl('g');

    for (const f of feats) {
      const fips = String(f.properties?.fips ?? f.id);
      const c = countyById.get(fips)!;
      const p = svgEl('path', 'county');
      p.setAttribute('d', path(f) ?? '');
      p.setAttribute('role', 'button');
      // Small maps: every county is a tab stop. Large maps: use the county list instead.
      p.setAttribute('tabindex', large ? '-1' : '0');
      p.addEventListener('click', () => update({ county: state.county === fips ? null : fips }));
      p.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          update({ county: state.county === fips ? null : fips });
        }
      });
      p.append(svgEl('title'));
      svg.append(p);
      countyPaths.set(fips, p);

      if (!large) {
        const [x, y] = path.centroid(f);
        const t = svgEl('text', 'county-label');
        t.setAttribute('x', String(x));
        t.setAttribute('y', String(y));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.textContent = c.name;
        labels.append(t);
      }
    }

    // On the bigger areas, outline the Atlanta region so people can find it.
    const context = regionById.get(CONTEXT_REGION);
    if (r.id !== CONTEXT_REGION && context) {
      const g = svgEl('g', 'context-outline');
      for (const fips of context.counties) {
        const f = featureById.get(fips);
        if (!f) continue;
        const p = svgEl('path');
        p.setAttribute('d', path(f) ?? '');
        g.append(p);
      }
      svg.append(g);
    }
    svg.append(labels);
    mapWrap.replaceChildren(svg);
    fillCountySelect();
  }

  q('[data-clear-county]').addEventListener('click', () => update({ county: null }));

  /* ---------- Outcome tiles ---------- */
  const tiles = new Map<string, HTMLButtonElement>();
  const tileWrap = q('[data-outcomes]');
  for (const o of data.outcomes) {
    const b = el('button', 'tile');
    b.type = 'button';
    b.addEventListener('click', () => update({ outcome: o.id }));
    tileWrap.append(b);
    tiles.set(o.id, b);
  }

  /* ---------- Render ---------- */
  function render() {
    const r = currentRegion();
    const o = outcomeById.get(state.outcome)!;
    const s = scenarioById.get(state.scenario)!;
    const isBase = s.id === BASELINE;
    const place = state.county ? countyName(countyById.get(state.county)!) : r.label;

    // Area toggle + note
    for (const [id, b] of regionButtons) b.setAttribute('aria-pressed', String(id === r.id));
    const note = q('[data-region-note]');
    note.textContent = r.description;
    note.classList.toggle('is-approx', r.approximate);
    q('[data-context-key]').hidden = r.id === CONTEXT_REGION;
    countySelect.value = state.county ?? '';

    // Map: % change vs BAU, or per-household baseline values for BAU itself.
    const perHH = (fips: string) => {
      const v = data.values[BASELINE][fips][o.id];
      return o.aggregate === 'sum' ? (v / countyById.get(fips)!.households) * 1000 : v;
    };
    let lo = Infinity;
    let hi = -Infinity;
    let maxAbs = 0;
    for (const fips of r.counties) {
      if (isBase) {
        const v = perHH(fips);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      } else {
        maxAbs = Math.max(maxAbs, Math.abs(pctChange(s.id, o.id, fips)));
      }
    }

    for (const [fips, p] of countyPaths) {
      const name = countyName(countyById.get(fips)!);
      let fill: string;
      let tip: string;
      if (isBase) {
        const v = perHH(fips);
        const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
        fill = `color-mix(in oklab, var(--accent) ${Math.round(15 + t * 75)}%, var(--map-neutral))`;
        tip = `${name}: ${fmt(v, o.aggregate === 'sum' ? 2 : o.decimals)} ${o.aggregate === 'sum' ? `${o.unit} per 1,000 households` : o.unit}`;
      } else {
        const ch = pctChange(s.id, o.id, fips);
        const tn = tone(o, ch);
        const strength = maxAbs ? Math.abs(ch) / maxAbs : 0;
        fill = tn === 0
          ? 'var(--map-neutral)'
          : `color-mix(in oklab, ${tn > 0 ? 'var(--better)' : 'var(--worse)'} ${Math.round(15 + strength * 75)}%, var(--map-neutral))`;
        tip = `${name}: ${ch > 0 ? '+' : ''}${fmt(ch * 100, 1)}% compared with business as usual`;
      }
      p.style.fill = fill;
      p.querySelector('title')!.textContent = tip;
      p.setAttribute('aria-label', tip);
      p.setAttribute('aria-pressed', String(state.county === fips));
      p.classList.toggle('is-selected', state.county === fips);
    }
    // Keep the selected county's outline on top.
    if (state.county) countyPaths.get(state.county)?.parentNode?.insertBefore(
      countyPaths.get(state.county)!,
      mapWrap.querySelector('.context-outline'),
    );

    q('[data-map-title]').textContent = o.label;
    q('[data-map-sub]').textContent = isBase
      ? `Business as usual, ${data.meta.horizon}${o.aggregate === 'sum' ? ', per 1,000 households' : ''}`
      : `${s.label} compared with business as usual`;
    (q('[data-clear-county]') as HTMLButtonElement).hidden = !state.county;

    const legend = q('[data-legend]');
    legend.replaceChildren();
    const ramp = el('span', 'legend__ramp');
    if (isBase) {
      ramp.style.background = 'linear-gradient(90deg, color-mix(in oklab, var(--accent) 15%, var(--map-neutral)), var(--accent))';
      legend.append(el('span', '', 'Lower'), ramp, el('span', '', 'Higher'));
    } else {
      ramp.style.background = 'linear-gradient(90deg, var(--worse), var(--map-neutral), var(--better))';
      legend.append(el('span', '', `Worse (up to ${fmt(maxAbs * 100, 0)}%)`), ramp, el('span', '', 'Better'));
    }

    // Header
    q('[data-scenario-title]').textContent = s.label;
    q('[data-scenario-desc]').textContent = isBase
      ? `${s.description} This is the reference case the other scenarios are compared against.`
      : `${s.description} Compared with business as usual.`;
    q('[data-scenario-tag]').textContent = s.macap ? `MACAP measure ${s.macap}` : 'Reference case';
    select.value = s.id;

    // Tiles
    q('[data-place]').textContent = place;
    for (const oc of data.outcomes) {
      const b = tiles.get(oc.id)!;
      const v = value(s.id, oc.id, state.county);
      const ch = pctChange(s.id, oc.id, state.county);
      const tn = tone(oc, ch);
      b.setAttribute('aria-pressed', String(oc.id === state.outcome));
      const delta = el('span', 'tile__delta');
      if (isBase) delta.append(el('span', 'tile__delta--plain', 'Reference case'));
      else
        delta.append(
          el('span', `pill ${toneClass(tn)}`, `${ch > 0 ? '+' : '−'}${fmt(Math.abs(ch) * 100, 1)}%`),
          el('span', 'tile__vs', 'vs BAU'),
        );
      b.replaceChildren(
        el('span', 'tile__label', oc.label),
        el('span', 'tile__value', fmt(v, oc.decimals)),
        el('span', 'tile__unit', oc.unit),
        delta,
      );
    }

    // Comparison bars
    q('[data-compare-title]').textContent = `${o.label}, ${place}`;
    const vals = data.scenarios.map((sc) => ({ sc, v: value(sc.id, o.id, state.county) }));
    const max = Math.max(...vals.map((x) => x.v)) || 1;
    const bars = el('div', 'bars');
    for (const { sc, v } of vals) {
      const row = el('div', 'bar');
      const current = sc.id === state.scenario;
      row.append(el('span', `bar__name${current ? ' is-current' : ''}`, sc.label));
      const track = el('span', 'bar__track');
      const fill = el('span', `bar__fill${sc.id === BASELINE ? ' is-bau' : ''}${current ? ' is-current' : ''}`);
      fill.style.width = `${(v / max) * 100}%`;
      track.append(fill);
      row.append(track, el('span', 'bar__value', `${fmt(v, o.decimals)} ${o.unit}`));
      bars.append(row);
    }
    q('[data-compare]').replaceChildren(bars);
  }

  function update(patch: Partial<State>, redraw = false) {
    Object.assign(state, patch);
    writeHash(state);
    if (redraw) drawMap();
    render();
  }

  // Follow manual edits to the address (e.g. a pasted link on an open page).
  window.addEventListener('hashchange', () => {
    const h = readHash();
    const r = regionById.get(h.region ?? '') ?? currentRegion();
    update(
      {
        region: r.id,
        scenario: scenarioById.has(h.scenario ?? '') ? h.scenario! : state.scenario,
        outcome: outcomeById.has(h.outcome ?? '') ? h.outcome! : state.outcome,
        county: r.counties.includes(h.county ?? '') ? h.county! : null,
      },
      r.id !== state.region,
    );
  });

  drawMap();
  render();
}
