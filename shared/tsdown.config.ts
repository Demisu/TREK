import { defineConfig } from 'tsdown';

export default defineConfig({
  // Root barrel + i18n metadata barrel + one entry per locale (lazy-load chunks),
  // plus the DOMPurify sanitisers, kept out of the root (src/sanitize/sanitize.ts)
  entry: [
    'src/index.ts',
    'src/roadtrip/planning.ts',
    'src/sanitize/sanitize.ts',
    'src/i18n/index.ts',
    'src/i18n/*/index.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  deps: {
    neverBundle: ['zod'],
  },
  target: false,
});
