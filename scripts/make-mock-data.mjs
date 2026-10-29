// Generates public/datasets/scenarios.json with clearly-labelled MOCK values.
// Replace this file's output with real IAT exports when they are available;
// the dashboard only depends on the JSON shape documented in README.md.
//
//   npm run mock-data

import { writeFileSync } from 'node:fs';

// Deterministic PRNG so the mock file is stable between runs.
let seed = 20261028;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const jitter = (spread) => 1 + (rand() * 2 - 1) * spread;

// Approximate household counts, used only to weight per-household outcomes.
const counties = [
  { fips: '13121', name: 'Fulton', households: 450000 },
  { fips: '13135', name: 'Gwinnett', households: 330000 },
  { fips: '13089', name: 'DeKalb', households: 300000 },
  { fips: '13067', name: 'Cobb', households: 290000 },
  { fips: '13057', name: 'Cherokee', households: 105000 },
  { fips: '13063', name: 'Clayton', households: 100000 },
  { fips: '13117', name: 'Forsyth', households: 85000 },
  { fips: '13151', name: 'Henry', households: 85000 },
  { fips: '13097', name: 'Douglas', households: 52000 },
  { fips: '13113', name: 'Fayette', households: 45000 },
  { fips: '13247', name: 'Rockdale', households: 34000 },
];

// The six outcomes are placeholders until the ERC's
// "Dashboard Scenarios and Outcomes" list is wired in.
const outcomes = [
  { id: 'ghg', label: 'Greenhouse gas emissions', unit: 'kt CO₂e / yr', better: 'lower', aggregate: 'sum', decimals: 0 },
  { id: 'bill', label: 'Average household electricity bill', unit: '$ / month', better: 'lower', aggregate: 'mean', decimals: 0 },
  { id: 'peak', label: 'Summer peak demand', unit: 'MW', better: 'lower', aggregate: 'sum', decimals: 0 },
  { id: 'burden', label: 'Energy burden, low-income households', unit: '% of income', better: 'lower', aggregate: 'mean', decimals: 1 },
  { id: 'unserved', label: 'Expected unserved energy', unit: 'MWh / yr', better: 'lower', aggregate: 'sum', decimals: 0 },
  { id: 'jobs', label: 'Local jobs supported', unit: 'jobs', better: 'higher', aggregate: 'sum', decimals: 0 },
];

const scenarios = [
  { id: 'bau', label: 'Business as usual', short: 'BAU', macap: null,
    description: 'Current policies and the utility resource plan, with forecast load growth including data centers.' },
  { id: 'm4', label: 'Residential efficiency retrofits', short: 'Retrofits', macap: 4,
    description: 'Envelope upgrades and heat pumps in existing homes, prioritising older housing stock.' },
  { id: 'm5', label: 'Green building codes', short: 'Codes', macap: 5,
    description: 'Stronger energy codes for new residential and commercial construction.' },
  { id: 'm20', label: 'Rooftop solar with batteries', short: 'Solar + storage', macap: 20,
    description: 'Behind-the-meter solar paired with home batteries that discharge during the evening peak.' },
];

// Relative effect of each scenario on each outcome (fraction change vs BAU).
const effects = {
  bau: { ghg: 0, bill: 0, peak: 0, burden: 0, unserved: 0, jobs: 0 },
  m4: { ghg: -0.09, bill: -0.14, peak: -0.07, burden: -0.22, unserved: -0.12, jobs: 0.06 },
  m5: { ghg: -0.04, bill: -0.05, peak: -0.03, burden: -0.04, unserved: -0.05, jobs: 0.03 },
  m20: { ghg: -0.11, bill: -0.09, peak: -0.12, burden: -0.08, unserved: -0.2, jobs: 0.09 },
};

// Per-household baselines (BAU) that get scaled by county size.
const baselinePerHH = { ghg: 0.0062, bill: 148, peak: 0.0042, burden: 7.8, unserved: 0.0021, jobs: 0.0024 };

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// values[scenarioId][countyFips][outcomeId]
const values = Object.fromEntries(scenarios.map((s) => [s.id, {}]));
for (const c of counties) {
  for (const s of scenarios) values[s.id][c.fips] = {};
  for (const o of outcomes) {
    // BAU: per-household baseline with county-to-county variation, scaled by size.
    const perHH = baselinePerHH[o.id] * jitter(0.12);
    const bau = o.aggregate === 'sum' ? perHH * c.households : perHH;
    values.bau[c.fips][o.id] = round(bau, o.decimals + 1);
    // Scenarios: BAU shifted by the scenario effect, varied by county.
    for (const s of scenarios) {
      if (s.id === 'bau') continue;
      values[s.id][c.fips][o.id] = round(bau * (1 + effects[s.id][o.id] * jitter(0.35)), o.decimals + 1);
    }
  }
}

const out = {
  meta: {
    mock: true,
    note: 'Illustrative values only. Not model output. Replace with Integrated Analysis Tool exports.',
    horizon: 2030,
    generated: new Date().toISOString().slice(0, 10),
  },
  counties,
  outcomes,
  scenarios,
  values,
};

writeFileSync(new URL('../public/datasets/scenarios.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('Wrote public/datasets/scenarios.json');
