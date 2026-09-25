/**
 * Fails the build if anything outside the allowlist made it into dist/.
 *
 *   node scripts/check-allowlist.ts
 *
 * Checks every built text file for:
 *   1. any `hideouts-io/<repo>` reference where <repo> isn't allowlisted, and
 *   2. the bare names of every non-allowlisted repository in the account
 *      (fetched live when a token is available, plus a fixed never-publish list).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_REPOS, INFRA_REPOS, GITHUB_OWNER } from '../src/data/projects.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

// Never publish these, even if they're renamed or the API is unavailable.
const NEVER = ['kali-ssh', 'OMG-Protocol-Watch', 'SplunkFound', 'DNS-domain_analyzer', 'macos-install-data'];

const allowed = new Set([...ALLOWED_REPOS, ...INFRA_REPOS].map((r) => r.toLowerCase()));
const forbidden = new Set(NEVER.map((n) => n.toLowerCase()));

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (token) {
  const res = await fetch(`https://api.github.com/users/${GITHUB_OWNER}/repos?per_page=100&type=all`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'hideouts.io-site-builder' },
  });
  if (res.ok) {
    for (const r of (await res.json()) as { name: string }[]) {
      if (!allowed.has(r.name.toLowerCase())) forbidden.add(r.name.toLowerCase());
    }
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else if (['.html', '.xml', '.json', '.txt', '.js', '.css', '.svg'].includes(extname(d.name))) yield p;
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ownerRef = new RegExp(`${GITHUB_OWNER}/([A-Za-z0-9_.-]+)`, 'gi');
const bareRes = [...forbidden].map((n) => [n, new RegExp(`(?<![\\w-])${escapeRe(n)}(?![\\w-])`, 'i')] as const);

const problems: string[] = [];
for await (const file of walk(DIST)) {
  const text = await readFile(file, 'utf8');
  const rel = relative(ROOT, file);
  for (const m of text.matchAll(ownerRef)) {
    const name = m[1].replace(/\.git$/, '');
    if (!allowed.has(name.toLowerCase()) && name.toLowerCase() !== GITHUB_OWNER.toLowerCase()) {
      problems.push(`${rel}: references non-allowlisted repo "${GITHUB_OWNER}/${name}"`);
    }
  }
  for (const [name, re] of bareRes) if (re.test(text)) problems.push(`${rel}: mentions excluded repo "${name}"`);
}

if (problems.length) {
  console.error(`✗ Allowlist check failed (${problems.length}):\n  ` + [...new Set(problems)].join('\n  '));
  process.exit(1);
}
console.log(
  `✓ Allowlist check passed: only the ${ALLOWED_REPOS.size} allowlisted repositories (plus ${INFRA_REPOS.size} infrastructure repos) appear in dist/`,
);
