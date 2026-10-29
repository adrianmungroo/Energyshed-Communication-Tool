// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves a project site at https://<user>.github.io/<repo>/.
// Override with SITE_URL / BASE_PATH env vars if the repo or host changes
// (e.g. BASE_PATH=/ for a custom domain).
const site = process.env.SITE_URL ?? 'https://adrianmungroo.github.io';
const base = process.env.BASE_PATH ?? '/communication-tool';

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
