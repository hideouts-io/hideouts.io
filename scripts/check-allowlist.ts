/**
 * Fails the build if anything outside the allowlist made it into dist/.
 *
 *   node scripts/check-allowlist.ts
 *
 * Checks every built text file for:
 *   1. any `hideouts-io/<repo>` reference without a catalog or scoped allowance (fails),
 *   2. the bare name of a never-publish or private repository (fails), and
 *   3. the bare name of any other repository in the account that isn't
 *      allowlisted, fetched live when a token is available (warns: a README may
 *      mention a new repo by name before it's added here; the renderer already
 *      turns links to such repos into plain text).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_REPOS, FORMER_REPO_NAMES, INFRA_REPOS, GITHUB_OWNER } from '../src/data/projects.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

// BN7 is a standalone publication, not a catalog project. Exclusion checks still apply.
const BN7_REFERENCE_FILES = new Set<string>([
  join('dist', 'bridgenode7', 'index.html'),
  join('dist', 'bridgenode7', 'manifest.json'),
]);

// Never publish these, even if they're renamed or the API is unavailable.
const NEVER = ['kali-ssh', 'OMG-Protocol-Watch', 'SplunkFound', 'DNS-domain_analyzer', 'macos-install-data'];

const allowed = new Set([...ALLOWED_REPOS, ...FORMER_REPO_NAMES, ...INFRA_REPOS].map((r) => r.toLowerCase()));
const forbidden = new Set(NEVER.map((n) => n.toLowerCase()));
const unlisted = new Set<string>();

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (token) {
  const res = await fetch(`https://api.github.com/users/${GITHUB_OWNER}/repos?per_page=100&type=all`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'hideouts.io-site-builder' },
  });
  if (res.ok) {
    for (const r of (await res.json()) as { name: string; private: boolean }[]) {
      const name = r.name.toLowerCase();
      if (allowed.has(name)) continue;
      // Private repos and anything on the never-publish list fail the build; other
      // public repos that simply aren't listed yet only warn.
      if (r.private || NEVER.some((n) => name.startsWith(n.toLowerCase()))) forbidden.add(name);
      else unlisted.add(name);
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
const bareRe = (n: string) => [n, new RegExp(`(?<![\\w-])${escapeRe(n)}(?![\\w-])`, 'i')] as const;
const bareRes = [...forbidden].map(bareRe);
const unlistedRes = [...unlisted].map(bareRe);

const problems: string[] = [];
const warnings: string[] = [];
for await (const file of walk(DIST)) {
  const text = await readFile(file, 'utf8');
  const rel = relative(ROOT, file);
  for (const m of text.matchAll(ownerRef)) {
    const name = m[1].replace(/\.git$/, '');
    const scopedReference = name.toLowerCase() === 'bn7' && BN7_REFERENCE_FILES.has(rel);
    if (!allowed.has(name.toLowerCase()) && name.toLowerCase() !== GITHUB_OWNER.toLowerCase() && !scopedReference) {
      problems.push(`${rel}: references non-allowlisted repo "${GITHUB_OWNER}/${name}"`);
    }
  }
  for (const [name, re] of bareRes) if (re.test(text)) problems.push(`${rel}: mentions excluded repo "${name}"`);
  for (const [name, re] of unlistedRes) if (re.test(text)) warnings.push(`${rel}: mentions unlisted repo "${name}"`);
}

if (warnings.length) {
  console.warn(
    `! Not on the allowlist, mentioned by name (${warnings.length}):\n  ` + [...new Set(warnings)].join('\n  '),
  );
}

if (problems.length) {
  console.error(`✗ Allowlist check failed (${problems.length}):\n  ` + [...new Set(problems)].join('\n  '));
  process.exit(1);
}
console.log(
  `✓ Allowlist check passed: ${ALLOWED_REPOS.size} catalog repositories, ${FORMER_REPO_NAMES.size} former names, ${INFRA_REPOS.size} infrastructure repositories; BN7 references allowed only in its standalone index and manifest`,
);
