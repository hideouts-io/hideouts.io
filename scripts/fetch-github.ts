/**
 * Step 1 of the content pipeline: download everything the site needs from
 * GitHub for the allowlisted repositories only, into .cache/github/.
 *
 *   node scripts/fetch-github.ts
 *
 * Uses GITHUB_TOKEN (or GH_TOKEN) when present. In CI a token is required so a
 * rate-limited anonymous build can never publish a half-empty site.
 *
 * Failure handling:
 *   - Each repo is downloaded into a temporary folder and swapped in only when
 *     complete, so a failed run never leaves a half-written cache.
 *   - If GitHub is unavailable for a repo that was fetched before, the last good
 *     copy is kept and the build continues (with a warning).
 *   - A repo that is missing or private is a hard failure: never publish it
 *     from a stale cache.
 */
import { mkdir, readFile, writeFile, rm, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GITHUB_OWNER, PROJECTS } from '../src/data/projects.ts';
import { imageSources } from '../src/lib/image-sources.ts';
import {
  jsonObject,
  resolveDocumentationLink,
  validateCommitSha,
  validateReadmeSource,
  type JsonValue,
  type ReadmeSource,
} from '../src/lib/readme-source.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(ROOT, '.cache/github');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!token && process.env.CI) {
  console.error('✗ GITHUB_TOKEN is required in CI. Refusing to build from anonymous API calls.');
  process.exit(1);
}

const headers: Record<string, string> = {
  'User-Agent': 'hideouts.io-site-builder',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

/** Errors that must stop the build even when a cached copy exists. */
class FatalError extends Error {}

async function api(path: string, accept = 'application/vnd.github+json') {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { ...headers, Accept: accept },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const hint = remaining === '0' ? ' (rate limit exhausted; set GITHUB_TOKEN)' : '';
    throw new Error(`GitHub API ${res.status} for ${path}${hint}`);
  }
  return accept.includes('raw') ? res.text() : res.json();
}

const IMAGE_RE = [
  /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, // ![alt](src "title")
  /<img[^>]+src=["']([^"']+)["']/gi, // <img src="">
];
const BADGE_RE = /(img\.shields\.io|badge\.svg|badgen\.net|\/workflows\/.+\/badge)/i;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Resolve a README image reference to a downloadable URL inside the repo (or external). */
function resolveImage(src: string, repo: string, source: ReadmeSource): { url: string; repoPath?: string } | null {
  if (BADGE_RE.test(src) || src.startsWith('data:')) return null;
  const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refs = [source.ref, encodeURIComponent(source.ref), source.commitSha].map(escapePattern).join('|');
  const inRepo = new RegExp(
    `^https?://(?:raw\\.githubusercontent\\.com/${GITHUB_OWNER}/${escapePattern(repo)}/(?:${refs}|[^/]+)/|github\\.com/${GITHUB_OWNER}/${escapePattern(repo)}/(?:blob|raw)/(?:${refs}|[^/]+)/)(.+?)([?#].*)?$`,
    'i',
  );
  const m = src.match(inRepo);
  if (!m && /^https?:\/\//i.test(src)) return { url: src };
  const resolved = new URL(resolveDocumentationLink(repo, source, m ? `/${m[1]}` : src));
  const root = new URL(`https://github.com/${GITHUB_OWNER}/${repo}/blob/${source.commitSha}/`);
  const clean = resolved.pathname.slice(root.pathname.length);
  return {
    url: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${repo}/${source.commitSha}/${clean}`,
    repoPath: decodeURI(clean),
  };
}

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': headers['User-Agent'] },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.warn(`  ! image ${res.status}: ${url}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) {
    console.warn(`  ! image too large (${buf.length} bytes), skipped: ${url}`);
    return null;
  }
  return buf;
}

await mkdir(CACHE, { recursive: true });
const fetchedAt = new Date().toISOString();

/**
 * Shared community health files in hideouts-io/.github apply to every repo that
 * lacks its own copy. Look them up once; missing or unreachable means "none".
 */
async function sharedFile(path: string) {
  const found = await api(`/repos/${GITHUB_OWNER}/.github/contents/${path}`).catch(() => null);
  return found?.html_url ?? null;
}
const shared = {
  contributing: await sharedFile('CONTRIBUTING.md'),
  codeOfConduct: await sharedFile('CODE_OF_CONDUCT.md'),
};

/**
 * A repo's "homepage" setting can outlive the site it points to. Keep it only if
 * it currently answers; drop it on a definite 4xx/5xx. Network errors keep it,
 * so a flaky connection doesn't remove a working link.
 */
async function liveHomepage(url: string | null, repo: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': headers['User-Agent'] },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status >= 400) {
      console.warn(`  ! ${repo} homepage ${url} returned ${res.status}; not linking it`);
      return null;
    }
  } catch {
    // Unreachable right now: keep the link rather than guess.
  }
  return url;
}

/** Contributing guide and code of conduct: the repo's own, else the shared default. */
function communityFiles(community: any) {
  const own: string | null = community?.files?.contributing?.html_url ?? null;
  const ownCoc: string | null =
    community?.files?.code_of_conduct_file?.html_url ?? community?.files?.code_of_conduct?.html_url ?? null;
  const isShared = (url: string | null) => Boolean(url?.includes(`/${GITHUB_OWNER}/.github/`));
  return {
    contributingUrl: own ?? shared.contributing,
    contributingShared: isShared(own) || (!own && Boolean(shared.contributing)),
    codeOfConductUrl: ownCoc ?? shared.codeOfConduct,
  };
}

/**
 * README commits as revision entries: the first line of each message, with a
 * merge commit's pull-request title in place of "Merge pull request #N from …".
 */
function revisions(commits: any[], limit = 5) {
  return commits
    .map((c) => {
      const lines = String(c.commit?.message ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^co-authored-by:/i.test(l));
      const merge = /^Merge (pull request|branch)\b/i.test(lines[0] ?? '');
      const message = merge ? lines[1] : lines[0];
      return message
        ? { sha: c.sha as string, date: c.commit.committer.date as string, message, url: c.html_url as string }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .slice(0, limit);
}

/** Resolve branches and lightweight or annotated tags, never a release's target_commitish. */
async function resolveRef(repo: string, ref: string): Promise<string> {
  const encodedRef = ref.split('/').map(encodeURIComponent).join('/');
  const reference = jsonObject(await api(`/repos/${GITHUB_OWNER}/${repo}/git/ref/${encodedRef}`), `${repo} ${ref}`);
  if (reference.ref !== `refs/${ref}`) throw new FatalError(`${repo}: GitHub did not resolve the exact ref ${ref}`);
  let object = jsonObject(reference.object, `${repo} ${ref} object`);
  const visited = new Set<string>();
  for (let depth = 0; depth < 10; depth++) {
    const sha = validateCommitSha(object.sha, `${repo} ${ref} object SHA`);
    if (object.type === 'commit') return sha;
    if (object.type !== 'tag' || !ref.startsWith('tags/') || visited.has(sha))
      throw new FatalError(`${repo}: ${ref} does not resolve to a commit`);
    visited.add(sha);
    const tag = jsonObject(await api(`/repos/${GITHUB_OWNER}/${repo}/git/tags/${sha}`), `${repo} tag ${sha}`);
    if (tag.sha !== sha) throw new FatalError(`${repo}: annotated tag ${sha} returned a different object`);
    object = jsonObject(tag.object, `${repo} tag ${sha} object`);
  }
  throw new FatalError(`${repo}: ${ref} exceeds 10 annotated tag objects; select a direct release tag`);
}

/** Fetch one README object at an already resolved commit and verify its distinct Git blob ID. */
async function fetchReadme(
  repo: string,
  ref: string,
  commitSha: string,
): Promise<{ readme: string; bytes: Buffer; source: ReadmeSource }> {
  const context = `${repo} README at ${commitSha}`;
  const payload = jsonObject(await api(`/repos/${GITHUB_OWNER}/${repo}/readme?ref=${commitSha}`), context);
  const source = validateReadmeSource({ ref, commitSha, path: payload.path, blobSha: payload.sha }, context);
  if (payload.type !== 'file' || payload.encoding !== 'base64' || typeof payload.content !== 'string')
    throw new FatalError(`${context}: expected base64 file content; check the README and run npm run content`);
  const content = payload.content.replace(/\n/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))
    throw new FatalError(`${context}: invalid base64 content; run npm run content`);
  const bytes = Buffer.from(content, 'base64');
  const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blobSha !== source.blobSha) throw new FatalError(`${context}: README bytes do not match blob ${source.blobSha}`);
  return { readme: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes, source };
}

async function fetchProject(p: (typeof PROJECTS)[number]) {
  const repo = await api(`/repos/${GITHUB_OWNER}/${p.repo}`);
  if (!repo) throw new FatalError(`Allowlisted repo ${p.repo} was not found (renamed, deleted, or private?)`);
  if (repo.private) throw new FatalError(`Allowlisted repo ${p.repo} is private. Refusing to publish it.`);

  const branch: string = repo.default_branch;
  if (typeof branch !== 'string' || !branch) throw new FatalError(`${p.repo}: missing default branch`);
  const commitSha = await resolveRef(p.repo, `heads/${branch}`);
  const snapshot = await fetchReadme(p.repo, branch, commitSha);
  const { readme, source: readmeSource } = snapshot;
  const releasePath = p.releaseTag ? `tags/${encodeURIComponent(p.releaseTag)}` : 'latest';
  const release = await api(`/repos/${GITHUB_OWNER}/${p.repo}/releases/${releasePath}`);
  if (p.releaseTag && (!release || release.draft || release.tag_name !== p.releaseTag))
    throw new FatalError(`${p.repo}: configured release ${p.releaseTag} is not published`);
  if (release && typeof release.prerelease !== 'boolean')
    throw new FatalError(`${p.repo}: release ${release.tag_name} has no valid prerelease status`);
  const releaseTag: string | null = release ? release.tag_name : null;
  if (release && (typeof releaseTag !== 'string' || !releaseTag))
    throw new FatalError(`${p.repo}: release has no valid tag name`);
  const releaseCommitSha = releaseTag ? await resolveRef(p.repo, `tags/${releaseTag}`) : null;
  const releaseReadme = releaseTag && releaseCommitSha ? await fetchReadme(p.repo, releaseTag, releaseCommitSha) : null;
  const commits = await api(`/repos/${GITHUB_OWNER}/${p.repo}/commits?sha=${commitSha}&per_page=1`);
  const updatedAt: string = commits?.[0]?.commit?.committer?.date ?? repo.pushed_at;
  // Needs a token with repo access; treat "unknown" as not enabled.
  const pvr = token
    ? await api(`/repos/${GITHUB_OWNER}/${p.repo}/private-vulnerability-reporting`).catch(() => null)
    : null;
  // Contributing guide, code of conduct, and security policy, if the repo has them.
  const community = await api(`/repos/${GITHUB_OWNER}/${p.repo}/community/profile`).catch(() => null);
  // Research: the README's recent revisions, shown as a revision history.
  const history =
    p.kind === 'research'
      ? await api(
          `/repos/${GITHUB_OWNER}/${p.repo}/commits?sha=${commitSha}&path=${encodeURIComponent(readmeSource.path)}&per_page=10`,
        ).catch(() => null)
      : null;

  const finalDir = join(CACHE, p.slug);
  const dir = join(CACHE, `.${p.slug}.partial`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'images'), { recursive: true });

  // Download every non-badge image the README references.
  const images: Record<string, { file: string; repoPath?: string }> = {};
  const refs = new Set<string>();
  for (const re of IMAGE_RE) for (const m of readme.matchAll(re)) refs.add(m[1]);
  for (const m of readme.matchAll(/<(?:source|img)\b[^>]+srcset=["']([^"']+)["']/gi))
    for (const source of imageSources(m[1])) refs.add(source.src);
  // Linked full-size images, e.g. [![x](a.png)](a.png)
  for (const m of readme.matchAll(/\]\(\s*([^)\s]+\.(?:png|jpe?g|gif|webp|svg))\s*\)/gi)) refs.add(m[1]);
  // A logo named in projects.ts (repo-relative), for READMEs that don't show one.
  if (p.logo) refs.add(p.logo);

  let n = 0;
  for (const src of refs) {
    // Configured logos are relative to the repository root, not the README directory.
    const target = resolveImage(src === p.logo ? `/${src}` : src, p.repo, readmeSource);
    if (!target) continue;
    const buf = await download(target.url);
    if (!buf) continue;
    const ext = (target.url.split(/[?#]/)[0].match(/\.(png|jpe?g|gif|webp|svg)$/i)?.[1] ?? 'png').toLowerCase();
    const file = `img-${String(++n).padStart(2, '0')}.${ext}`;
    await writeFile(join(dir, 'images', file), buf);
    images[src] = { file, repoPath: target.repoPath };
  }

  const meta = {
    slug: p.slug,
    repo: p.repo,
    fetchedAt,
    htmlUrl: repo.html_url,
    homepage: await liveHomepage(repo.homepage || null, p.repo),
    description: repo.description,
    topics: repo.topics ?? [],
    language: repo.language,
    license: repo.license && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    updatedAt,
    privateReporting: Boolean(pvr?.enabled),
    hasIssues: repo.has_issues,
    hasDiscussions: Boolean(repo.has_discussions),
    // The repo's own file, else the account-wide default from hideouts-io/.github.
    ...communityFiles(community),
    licenseUrl: community?.files?.license?.html_url ?? null,
    archived: Boolean(repo.archived),
    createdAt: repo.created_at,
    defaultBranch: branch,
    readmeSource,
    release:
      release && releaseReadme
        ? {
            tag: release.tag_name,
            name: release.name,
            url: release.html_url,
            publishedAt: release.published_at,
            prerelease: release.prerelease,
            commitSha: releaseReadme.source.commitSha,
            readmeSource: releaseReadme.source,
            assets: (release.assets ?? []).map((a: any) => ({
              name: a.name,
              size: a.size,
              url: a.browser_download_url,
              sha256: typeof a.digest === 'string' && a.digest.startsWith('sha256:') ? a.digest.slice(7) : null,
            })),
          }
        : null,
    readmeHistory: Array.isArray(history) ? revisions(history) : [],
    images,
  };
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  await writeFile(join(dir, 'README.md'), snapshot.bytes);
  // Swap in the complete download.
  await rm(finalDir, { recursive: true, force: true });
  await rename(dir, finalDir);
  return `${Object.keys(images).length} images, release ${meta.release?.tag ?? 'none'}`;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
const stale: string[] = [];
for (const p of PROJECTS) {
  process.stdout.write(`→ ${p.repo}\n`);
  try {
    console.log(`  ✓ ${await fetchProject(p)}`);
  } catch (err) {
    await rm(join(CACHE, `.${p.slug}.partial`), { recursive: true, force: true });
    if (err instanceof FatalError) {
      console.error(`✗ ${err.message}`);
      process.exit(1);
    }
    if (!(err instanceof Error)) throw err;
    if (await exists(join(CACHE, p.slug, 'meta.json'))) {
      console.warn(`  ! ${p.repo}: fetch failed: ${err.message}; checking cached snapshot metadata`);
      const cached: JsonValue = JSON.parse(await readFile(join(CACHE, p.slug, 'meta.json'), 'utf8'));
      const meta = jsonObject(cached, `${p.repo} cached metadata`);
      validateReadmeSource(meta.readmeSource, `${p.repo} cached readmeSource`);
      if (meta.release !== null) {
        const release = jsonObject(meta.release, `${p.repo} cached release`);
        const source = validateReadmeSource(release.readmeSource, `${p.repo} cached release readmeSource`);
        if (validateCommitSha(release.commitSha, `${p.repo} cached release commitSha`) !== source.commitSha)
          throw new FatalError(`${p.repo}: cached release snapshot is inconsistent; run npm run content`);
      }
      console.warn(`  ! ${err.message}; keeping the last good copy`);
      stale.push(p.repo);
    } else {
      console.error(`✗ ${err.message}, and there is no cached copy to fall back on.`);
      process.exit(1);
    }
  }
}

console.log(
  stale.length
    ? `✓ Fetched ${PROJECTS.length - stale.length}/${PROJECTS.length} repositories; used cached data for: ${stale.join(', ')}`
    : `✓ Fetched ${PROJECTS.length} allowlisted repositories`,
);
