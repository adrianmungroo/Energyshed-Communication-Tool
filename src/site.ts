/** Prefix a site-relative path with the configured base (GitHub Pages subpath). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.replace(/^\//, '');
  return `${base}/${clean}`;
}

export interface Chapter {
  slug: string; // path relative to base, '' for home
  title: string;
  short: string; // nav label
}

/** The explainer pages, in reading order. */
export const chapters: Chapter[] = [
  { slug: '', title: 'Defining the energyshed', short: 'Energyshed' },
  { slug: 'efficiency/', title: 'Energy efficiency', short: 'Efficiency' },
  { slug: 'local-generation/', title: 'Local generation and storage', short: 'Local generation' },
  { slug: 'grid/', title: 'The grid under pressure', short: 'Grid' },
  { slug: 'future/', title: 'Looking to the future', short: 'Future' },
];

export const dashboard = { slug: 'dashboard/', title: 'Compare scenarios' };
