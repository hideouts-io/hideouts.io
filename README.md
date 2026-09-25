# hideouts.io

Source for [hideouts.io](https://hideouts.io), the home of the open-source macOS and iOS privacy and security apps and research published at [github.com/hideouts-io](https://github.com/hideouts-io).

It's a static [Astro](https://astro.build) site. Project pages are generated from each repository's README at build time, so GitHub stays the source of truth: update a README and the site follows on the next build.

- **Only allowlisted repositories are published.** See [The allowlist](#the-allowlist).
- **No tracking and no third-party requests.** No analytics, no cookies, no external fonts or images. README images are copied onto the site at build time.
- **Strict Content Security Policy.** Scripts and styles are allowed by hash only, with no `unsafe-inline`.

## Local development

Requires Node 24 or later.

```sh
npm install
export GITHUB_TOKEN=$(gh auth token)   # optional locally, required in CI
npm run content                        # fetch + render the allowlisted repos
npm run build                          # build dist/ and the search index
npm run verify                         # allowlist + internal link checks
npm run preview                        # serve dist/ at http://localhost:4321
```

`npm run dev` also works for editing layouts, but the production build is the only way to test search and the Content Security Policy.

| Script | What it does |
| --- | --- |
| `npm run content:fetch` | Downloads README, metadata, latest release, and README images for each allowlisted repo into `.cache/github/`. |
| `npm run content:render` | Renders READMEs to HTML (GitHub alerts, diagrams, syntax highlighting), optimizes images to WebP, and generates share images. Output goes to `src/generated/`, `public/media/`, and `public/og/`. |
| `npm run build` | `astro build`, then builds the Pagefind search index into `dist/pagefind/`. |
| `npm run check:allowlist` | Fails if anything outside the allowlist appears in `dist/`. |
| `npm run check:links` | Fails if any internal link, image, or `#anchor` in `dist/` doesn't resolve. |
| `npm run check` | TypeScript and Astro diagnostics. |

Generated files (`.cache/`, `src/generated/`, `public/media/`, `public/og/`, `src/styles/shiki.generated.css`) are git-ignored and rebuilt on every CI run.

## The allowlist

[`src/data/projects.ts`](src/data/projects.ts) is the only place repositories are defined. Anything not listed there is never fetched or rendered, including repositories created later. `check:allowlist` enforces this on every build. It fails on:

- any `hideouts-io/<repo>` reference to a repo that isn't listed, and
- the name of any repository in the account that isn't listed, plus a fixed never-publish list in [`scripts/check-allowlist.ts`](scripts/check-allowlist.ts).

### Add a repository

1. Make sure the repository is public and its README is ready to publish.
2. Add an entry to `PROJECTS` in `src/data/projects.ts`:

   ```ts
   {
     slug: 'new-tool',             // URL: /apps/new-tool/ or /research/new-tool/
     repo: 'New-Tool',             // exact GitHub repository name
     kind: 'app',                  // 'app' or 'research'
     platforms: ['macOS'],         // 'macOS' and/or 'iOS'
     name: 'New Tool',
     tagline: 'One sentence that says why it matters.',
     summary: 'Two sentences for cards, search results, and share previews.',
     highlights: ['Four short', 'feature bullets', 'shown on the', 'app page'],
     traits: ['Read-only'],        // only claims the README actually states
     order: 9,
   },
   ```

3. Run `npm run content && npm run build && npm run verify` and review the page.

The fields you write by hand (name, tagline, summary, highlights, traits) are the curated layer. Everything else comes from GitHub: description, license, stars, latest release and checksums, last commit date, README, screenshots, and logo.

### Hide part of a README: `stripSections`

To leave a README section off the site without changing the README, list its heading text:

```ts
stripSections: ['Repository'],
```

This removes the heading and everything under it, up to the next heading of the same or higher level. The build warns if the heading isn't found.

### How READMEs are adapted

- The title, badge rows, and the README's own table of contents are removed; the site shows its own.
- A `> **Scope:** …` blockquote becomes the page's "Scope & boundaries" panel.
- A logo near the top becomes the app icon.
- GitHub alerts (`> [!NOTE]`, `[!WARNING]`, …) become styled callouts.
- Sections titled "Raw evidence…" and "Direct observation vs. interpretation" become labeled panels.
- Mermaid diagrams become static light and dark SVGs, so no diagram JavaScript runs in the browser.
- Relative links point to GitHub. Links to other allowlisted repos point to their pages on this site.
- HTML is sanitized, and images from anywhere else are dropped.

## Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds, checks, and deploys to GitHub Pages.

| Trigger | Deploys? | External link check |
| --- | --- | --- |
| Push to `main` | Yes | Blocking |
| Pull request | No (checks only) | Blocking |
| Nightly (06:17 UTC) | Yes | Advisory |
| `repository_dispatch` (`content-update`) | Yes | Advisory |
| Manual (`workflow_dispatch`) | Yes | Blocking |

The nightly run keeps the site in sync with the READMEs. To publish a README change immediately, trigger a dispatch from anywhere with repo access:

```sh
gh api repos/hideouts-io/hideouts.io/dispatches -f event_type=content-update
```

### One-time GitHub setup

1. **Settings → Pages → Build and deployment → Source:** GitHub Actions.
2. **Settings → Pages → Custom domain:** `hideouts.io`, then tick **Enforce HTTPS** once the certificate is issued.
3. **Organization/account settings → Pages → Verified domains:** add `hideouts.io` and create the TXT record GitHub shows you. This stops anyone else from claiming the domain on GitHub Pages.

## DNS for hideouts.io

At your DNS provider:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `hideouts-io.github.io` |
| TXT | `_github-pages-challenge-hideouts-io` | *(value shown when verifying the domain)* |

Remove any other A, AAAA, or CNAME records for `@` and `www`. DNS can take up to 24 hours to propagate. Check it with:

```sh
dig hideouts.io +noall +answer -t A
dig www.hideouts.io +noall +answer -t CNAME
```

Once the records resolve, GitHub issues the HTTPS certificate automatically. Enable **Enforce HTTPS** after that.

## Security model

- **Content Security Policy.** Astro emits a `<meta>` CSP with SHA-256 hashes for every script and style. Only `'self'` is allowed for everything else, `frame-src` and `object-src` are `'none'`, and the one extra source is `'wasm-unsafe-eval'`, which the Pagefind search index needs to run WebAssembly (it doesn't allow JavaScript `eval`).
- **Inline handlers and inline `style` attributes are blocked by the CSP,** so don't add them. Put behavior in `src/scripts/site.ts` and styling in classes.
- **GitHub Pages can't set response headers.** HSTS, `frame-ancestors`, and `Permissions-Policy` therefore only apply if the site moves to Cloudflare Pages, which reads [`public/_headers`](public/_headers).
- **Vulnerability reports:** see [/security/](https://hideouts.io/security/) and [`/.well-known/security.txt`](public/.well-known/security.txt). Update the `Expires` date in `security.txt` before it lapses (currently 2027-09-24).

## Project layout

```text
scripts/
  fetch-github.ts      GitHub API → .cache/github/
  render-content.ts    README → HTML, images, diagrams, share images
  check-allowlist.ts   build fails on non-allowlisted repos
  check-links.ts       build fails on broken internal links
src/
  data/projects.ts     the allowlist and curated copy
  lib/content.ts       typed loader for generated content
  layouts/Base.astro   <head>, SEO, theme, header/footer
  components/          cards, icons, README body with table of contents
  pages/               home, apps, research, about, security, privacy, RSS, 404
  scripts/site.ts      theme toggle, copy buttons, table of contents, filters, lightbox, search
  styles/global.css    design tokens (dark and light), README styles
public/                favicon, CNAME, robots.txt, security.txt, _headers, og.png
```

## License

The site's source code is released under the [MIT License](LICENSE). Project content belongs to each project and is published under that project's own license. Apple, macOS, and iOS are trademarks of Apple Inc.; hideouts is not affiliated with Apple.
