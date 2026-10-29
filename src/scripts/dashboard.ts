import { geoIdentity, geoPath, type GeoPermissibleObjects } from 'd3-geo';

/* ---------- Data shapes (see README "Dashboard data") ---------- */
interface County { fips: string; name: string; households: number }
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
interface State { scenario: string; outcome: string; county: string | null }

const BASELINE = 'bau';
const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- Helpers ---------- */
const fmt = (v: number, d: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function readHash(): Partial<State> {
  const p = new URLSearchParams(location.hash.slice(1));
  return { scenario: p.get('s') ?? undefined, outcome: p.get('o') ?? undefined, county: p.get('c') };
}
function writeHash(s: State) {
  const p = new URLSearchParams({ s: s.scenario, o: s.outcome });
  if (s.county) p.set('c', s.county);
  history.replaceState(null, '', `#${p}`);
}

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
  try {
    [data, geo] = await Promise.all([
      fetch(`${base}datasets/scenarios.json`).then((r) => r.json()),
      fetch(`${base}datasets/arc-counties.geojson`).then((r) => r.json()),
    ]);
  } catch {
    q('[data-map-title]').textContent = "Couldn't load the scenario data. Reload the page to try again.";
    return;
  }

  const outcomeById = new Map(data.outcomes.map((o) => [o.id, o]));
  const scenarioById = new Map(data.scenarios.map((s) => [s.id, s]));
  const countyById = new Map(data.counties.map((c) => [c.fips, c]));
  q('[data-horizon]').textContent = String(data.meta.horizon);

  const fromHash = readHash();
  const state: State = {
    scenario: scenarioById.has(fromHash.scenario ?? '') ? fromHash.scenario! : data.scenarios[1]?.id ?? BASELINE,
    outcome: outcomeById.has(fromHash.outcome ?? '') ? fromHash.outcome! : data.outcomes[0].id,
    county: countyById.has(fromHash.county ?? '') ? fromHash.county! : null,
  };

  /* Values: county or region (sum, or household-weighted mean) */
  const value = (scenario: string, outcome: string, county: string | null): number => {
    const o = outcomeById.get(outcome)!;
    const rows = data.values[scenario];
    if (county) return rows[county][outcome];
    if (o.aggregate === 'sum') return data.counties.reduce((t, c) => t + rows[c.fips][outcome], 0);
    const hh = data.counties.reduce((t, c) => t + c.households, 0);
    return data.counties.reduce((t, c) => t + rows[c.fips][outcome] * c.households, 0) / hh;
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
  select.value = state.scenario;
  select.addEventListener('change', () => update({ scenario: select.value }));

  /* ---------- Map ---------- */
  const W = 520;
  const H = 520;
  // Planar equirectangular projection corrected for latitude. Avoids the
  // spherical winding-order pitfalls of d3's geo projections on raw GeoJSON.
  const k = Math.cos((33.8 * Math.PI) / 180);
  for (const f of geo.features) scaleLon(f.geometry, k);
  const projection = geoIdentity().reflectY(true).fitExtent([[8, 8], [W - 8, H - 8]], geo as GeoPermissibleObjects);
  const path = geoPath(projection);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Map of the 11 counties in the Atlanta region');
  const countyPaths = new Map<string, SVGPathElement>();
  const labels = document.createElementNS(SVG_NS, 'g');

  for (const f of geo.features) {
    const fips = String(f.properties?.fips ?? f.id);
    const c = countyById.get(fips);
    if (!c) continue;
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', path(f) ?? '');
    p.setAttribute('class', 'county');
    p.setAttribute('tabindex', '0');
    p.setAttribute('role', 'button');
    p.addEventListener('click', () => update({ county: state.county === fips ? null : fips }));
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        update({ county: state.county === fips ? null : fips });
      }
    });
    const title = document.createElementNS(SVG_NS, 'title');
    p.append(title);
    svg.append(p);
    countyPaths.set(fips, p);

    const [x, y] = path.centroid(f);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('class', 'county-label');
    t.textContent = c.name;
    labels.append(t);
  }
  svg.append(labels);
  q('[data-map]').append(svg);
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
    const o = outcomeById.get(state.outcome)!;
    const s = scenarioById.get(state.scenario)!;
    const isBase = s.id === BASELINE;
    const place = state.county ? `${countyById.get(state.county)!.name} County` : 'Atlanta region';

    // Map: % change vs BAU, or per-household baseline values for BAU itself.
    const perHH = (fips: string) => {
      const v = data.values[BASELINE][fips][o.id];
      return o.aggregate === 'sum' ? (v / countyById.get(fips)!.households) * 1000 : v;
    };
    let lo = Infinity;
    let hi = -Infinity;
    let maxAbs = 0;
    for (const c of data.counties) {
      if (isBase) {
        const v = perHH(c.fips);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      } else {
        maxAbs = Math.max(maxAbs, Math.abs(pctChange(s.id, o.id, c.fips)));
      }
    }

    for (const [fips, p] of countyPaths) {
      const name = countyById.get(fips)!.name;
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

    q('[data-map-title]').textContent = o.label;
    q('[data-map-sub]').textContent = isBase
      ? `Business as usual, ${data.meta.horizon}${o.aggregate === 'sum' ? ', per 1,000 households' : ''}`
      : `${s.label} compared with business as usual`;
    (q('[data-clear-county]') as HTMLButtonElement).hidden = !state.county;

    const legend = q('[data-legend]');
    legend.replaceChildren();
    if (isBase) {
      const ramp = el('span', 'legend__ramp');
      ramp.style.background = 'linear-gradient(90deg, color-mix(in oklab, var(--accent) 15%, var(--map-neutral)), var(--accent))';
      legend.append(el('span', '', 'Lower'), ramp, el('span', '', 'Higher'));
    } else {
      const ramp = el('span', 'legend__ramp');
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

  function update(patch: Partial<State>) {
    Object.assign(state, patch);
    writeHash(state);
    render();
  }

  render();
}
