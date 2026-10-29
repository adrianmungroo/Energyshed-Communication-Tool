import type { ImageMetadata } from 'astro';

// Every raster image under src/assets/images, keyed by its path relative to
// that folder (e.g. "grid_structure.png", "temp_images/ss1.png"). Astro resizes
// and converts these to WebP at build time.
const files = import.meta.glob<{ default: ImageMetadata }>('./assets/images/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
});

const byName = new Map(
  Object.entries(files).map(([path, mod]) => [path.replace('./assets/images/', ''), mod.default]),
);

/** Look up an image by file name. Fails the build if the file is missing. */
export function image(name: string): ImageMetadata {
  const found = byName.get(name);
  if (!found) {
    throw new Error(`Image "${name}" not found in src/assets/images. Check the file name and extension.`);
  }
  return found;
}
