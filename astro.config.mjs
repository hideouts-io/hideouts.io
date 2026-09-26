// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

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
    // No 'unsafe-inline', no third-party origins.
    csp: {
      algorithm: 'SHA-256',
      // Pagefind's search index runs as WebAssembly; that needs 'wasm-unsafe-eval' (it does not allow JS eval).
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'"] },
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-src 'none'",
        "worker-src 'self'",
        // No 'upgrade-insecure-requests': every asset URL is same-origin and relative,
        // and GitHub Pages' "Enforce HTTPS" redirects HTTP at the server. The directive
        // broke the whole site (CSS/JS blocked) while the HTTPS certificate was pending.
      ],
    },
  },
});
