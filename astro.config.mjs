// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { CSP_DIRECTIVES, CSP_SCRIPT_RESOURCES } from './src/data/csp.ts';

// https://astro.build/config
export default defineConfig({
  site: 'https://hideouts.io',
  trailingSlash: 'always',
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
  // README code is highlighted at content-render time (scripts/render-content.ts)
  // with CSS classes. Astro's own Markdown highlighter is unused, and its inline
  // styles would conflict with the CSP, so turn it off.
  markdown: { syntaxHighlight: false },
  security: {
    // Astro hashes every script and style it emits into a <meta> CSP.
    // The policy itself lives in src/data/csp.ts.
    csp: {
      algorithm: 'SHA-256',
      scriptDirective: { resources: [...CSP_SCRIPT_RESOURCES] },
      directives: [...CSP_DIRECTIVES],
    },
  },
});
