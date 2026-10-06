/** Build a pinned public application after the immutable BN7 playbook is copied. */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, lstat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { readJsonObject } from './playbook-package.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPOSITORY = 'https://github.com/hideouts-io/BN7-decision-continuity.git';
const ROUTE = '/bridgenode7/decision-continuity/';
const selection = await readJsonObject(join(ROOT, 'publication/decision-continuity.json'));
const revision = selection.revision;
if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision)) {
  throw new TypeError('publication/decision-continuity.json: revision must be a full Git commit SHA');
}
const parent = join(ROOT, 'dist/bridgenode7');
if (!(await lstat(parent)).isDirectory() || !(await lstat(join(parent, 'index.html'))).isFile()) {
  throw new Error('The built BN7 playbook is missing; run the complete site build before adding the app');
}
const destination = join(parent, 'decision-continuity');
try {
  await lstat(destination);
  throw new Error(`Application output already exists at ${destination}; rebuild the site instead of overwriting it`);
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
}
const cache = join(ROOT, '.cache');
await mkdir(cache, { recursive: true });
const source = await mkdtemp(join(cache, 'decision-continuity-'));
execFileSync('git', ['init', '--quiet', source], { stdio: 'inherit' });
execFileSync('git', ['remote', 'add', 'origin', REPOSITORY], { cwd: source, stdio: 'inherit' });
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    execFileSync('git', ['fetch', '--depth=1', 'origin', revision], { cwd: source, stdio: 'inherit' });
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    console.warn(JSON.stringify({ operation: 'fetch_decision_continuity', revision, attempt, retryInMs: 1000 }));
    await setTimeout(1000);
  }
}
const fetched = execFileSync('git', ['rev-parse', 'FETCH_HEAD'], { cwd: source, encoding: 'utf8' }).trim();
if (fetched !== revision) throw new Error(`Expected app revision ${revision}, fetched ${fetched}`);
execFileSync('git', ['checkout', '--quiet', '--detach', revision], { cwd: source, stdio: 'inherit' });
execFileSync('npm', ['ci'], { cwd: source, stdio: 'inherit' });
execFileSync('npm', ['run', 'build', '--', '--base', ROUTE, '--outDir', destination], {
  cwd: source,
  stdio: 'inherit',
});
for (const page of ['index.html', 'decisions.html', 'impact.html']) {
  if (!(await lstat(join(destination, page))).isFile()) throw new Error(`Built application entry ${page} is missing`);
}
await writeFile(
  join(destination, 'release.json'),
  `${JSON.stringify({ repository: REPOSITORY, revision, route: ROUTE, data: 'Synthetic; stored in the visitor browser only' }, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(JSON.stringify({ application: 'Decision Continuity', revision, route: ROUTE }));
