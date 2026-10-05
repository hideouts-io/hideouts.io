/** Preserve a pinned production Pages artifact and append only the selected BN7 package. */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { PACKAGE_FILES, readReviewPackage, sha256 } from './playbook-package.ts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { readonly [key: string]: Json };
type BaselineRun = Readonly<{ id: number; headSha: string }>;
type BaselineArtifact = Readonly<{ id: number; digest: string; size: number; expiresAt: string }>;
type FileFingerprint = Readonly<{ path: string; bytes: number; sha256: string }>;
type TreeSnapshot = Readonly<{ files: readonly FileFingerprint[]; directories: readonly string[] }>;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPOSITORY = 'hideouts-io/hideouts.io';
const API = `https://api.github.com/repos/${REPOSITORY}`;

function positiveId(value: string, label: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
    throw new TypeError(`${label}: expected a positive safe integer, received ${value}`);
  }
  return id;
}

function object(value: Json | undefined, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label}: expected a JSON object`);
  }
  return value;
}

function string(record: JsonObject, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== 'string' || !value.length) {
    throw new TypeError(`${label}: ${field} must be a nonempty string`);
  }
  return value;
}

function integer(record: JsonObject, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label}: ${field} must be a positive safe integer`);
  }
  return value;
}

async function request(url: string, token: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'hideouts.io-playbook-publication',
        },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        throw new Error(
          `GitHub GET ${url} failed: HTTP ${response.status} ${response.statusText}; ${await response.text()}`,
        );
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (!(error instanceof Error) || attempt === 3) throw error;
      console.warn(JSON.stringify({ event: 'github_request_retry', url, attempt, error: error.message }));
      await setTimeout(attempt * 1000);
    }
  }
  throw new Error(`GitHub GET ${url}: retry loop ended without a response`);
}

async function jsonResponse(url: string, token: string): Promise<JsonObject> {
  const data = await request(url, token);
  const parsed: Json = JSON.parse(data.toString('utf8'));
  return object(parsed, url);
}

function baselineRun(record: JsonObject, id: number, label: string): BaselineRun {
  const repository = object(record.repository, `${label}: repository`);
  if (
    integer(record, 'id', label) !== id ||
    string(repository, 'full_name', label) !== REPOSITORY ||
    record.head_branch !== 'main' ||
    record.status !== 'completed' ||
    record.conclusion !== 'success'
  ) {
    throw new Error(`${label}: expected successful completed main run ${id} in ${REPOSITORY}`);
  }
  return { id, headSha: string(record, 'head_sha', label) };
}

function baselineArtifact(
  record: JsonObject,
  id: number,
  run: BaselineRun,
  expectedSha256: string,
  label: string,
): BaselineArtifact {
  const workflow = object(record.workflow_run, `${label}: workflow_run`);
  const digest = string(record, 'digest', label);
  const expiresAt = string(record, 'expires_at', label);
  if (
    integer(record, 'id', label) !== id ||
    record.name !== 'github-pages' ||
    record.expired !== false ||
    integer(workflow, 'id', label) !== run.id ||
    workflow.head_branch !== 'main' ||
    workflow.head_sha !== run.headSha ||
    digest !== `sha256:${expectedSha256}` ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    throw new Error(
      `${label}: expected unexpired github-pages artifact ${id} bound to main run ${run.id} and SHA-256 ${expectedSha256}`,
    );
  }
  return { id, digest, size: integer(record, 'size_in_bytes', label), expiresAt };
}

function command(executable: string, args: readonly string[], directory: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { cwd: directory, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(`${executable} ${args.join(' ')} failed (${error.code}): ${stderr || error.message}`, {
              cause: error,
            }),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function validateTar(archive: string): Promise<void> {
  const names = (await command('tar', ['-tf', archive], ROOT)).trimEnd().split('\n');
  for (const name of names) {
    if (name.startsWith('/') || name.split('/').includes('..') || name.includes('\\')) {
      throw new Error(`${archive}: unsafe archive member ${name}`);
    }
  }
  const listing = (await command('tar', ['-tvf', archive], ROOT)).trimEnd().split('\n');
  if (listing.some((entry) => !['-', 'd'].includes(entry[0]))) {
    throw new Error(
      `${archive}: only regular files and directories are permitted; archive links or special entries found`,
    );
  }
}

async function snapshot(root: string, directory: string): Promise<TreeSnapshot> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(
    entries.map(async (entry): Promise<TreeSnapshot> => {
      const path = join(directory, entry.name);
      const name = relative(root, path).split(sep).join('/');
      if (entry.isDirectory()) {
        const nested = await snapshot(root, path);
        return { files: nested.files, directories: [name, ...nested.directories] };
      }
      if (!entry.isFile()) throw new Error(`${path}: unexpected non-regular filesystem entry`);
      const data = await readFile(path);
      return { files: [{ path: name, bytes: data.length, sha256: sha256(data) }], directories: [] };
    }),
  );
  return {
    files: children.flatMap((child) => child.files).sort((a, b) => a.path.localeCompare(b.path)),
    directories: children.flatMap((child) => child.directories).sort(),
  };
}

function verifyOverlay(before: TreeSnapshot, after: TreeSnapshot): void {
  const originalFiles = new Map(before.files.map((file) => [file.path, file]));
  const actualFiles = new Map(after.files.map((file) => [file.path, file]));
  for (const original of before.files) {
    const actual = actualFiles.get(original.path);
    if (!actual || actual.bytes !== original.bytes || actual.sha256 !== original.sha256) {
      throw new Error(`Production file ${original.path} changed or disappeared during BN7 preparation`);
    }
  }
  const expectedFiles = new Set([...PACKAGE_FILES, 'manifest.json'].map((name) => `bridgenode7/${name}`));
  const addedFiles = after.files.filter((file) => !originalFiles.has(file.path));
  if (addedFiles.length !== expectedFiles.size || addedFiles.some((file) => !expectedFiles.has(file.path))) {
    throw new Error(`Expected only four added BN7 files; found ${addedFiles.map((file) => file.path).join(', ')}`);
  }
  const originalDirectories = new Set(before.directories);
  const actualDirectories = new Set(after.directories);
  if (
    before.directories.some((name) => !actualDirectories.has(name)) ||
    after.directories.some((name) => !originalDirectories.has(name) && name !== 'bridgenode7')
  ) {
    throw new Error('Production directory names changed beyond the new bridgenode7 directory');
  }
}

const [runArgument, artifactArgument, expectedSha256] = process.argv.slice(2);
if (process.argv.length !== 5 || !runArgument || !artifactArgument || !expectedSha256) {
  throw new TypeError(
    'Pass baseline run ID, artifact ID, and original artifact ZIP SHA-256: node scripts/prepare-playbook-deployment.ts RUN_ID ARTIFACT_ID SHA256',
  );
}
const runId = positiveId(runArgument, 'baseline_run_id');
const artifactId = positiveId(artifactArgument, 'baseline_artifact_id');
if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new TypeError('baseline_sha256 must be a lowercase SHA-256 hash');
const token = process.env.GITHUB_TOKEN;
if (!token) throw new TypeError('GITHUB_TOKEN is required to read the pinned Pages workflow artifact');
if ((await readdir(ROOT)).some((entry) => entry.toLowerCase() === 'dist')) {
  throw new Error('dist must be absent before preparation; preserve any existing build and use a fresh checkout');
}

const runUrl = `${API}/actions/runs/${runId}`;
const run = baselineRun(await jsonResponse(runUrl, token), runId, runUrl);
const artifactUrl = `${API}/actions/artifacts/${artifactId}`;
const artifact = baselineArtifact(await jsonResponse(artifactUrl, token), artifactId, run, expectedSha256, artifactUrl);
const archive = await request(`${artifactUrl}/zip`, token);
const archiveSha256 = sha256(archive);
if (archive.length !== artifact.size || archiveSha256 !== expectedSha256) {
  throw new Error(
    `Artifact ZIP ${artifactId}: expected ${artifact.size} bytes / ${expectedSha256}, got ${archive.length} / ${archiveSha256}`,
  );
}

const cacheRoot = join(ROOT, '.cache/BN7');
await mkdir(cacheRoot, { recursive: true });
const evidence = await mkdtemp(join(cacheRoot, 'deployment-'));
const zip = join(evidence, 'baseline.zip');
await writeFile(zip, archive, { flag: 'wx' });
const zipEntries = (await command('unzip', ['-Z', '-1', zip], ROOT)).trimEnd().split('\n');
if (zipEntries.length !== 1 || zipEntries[0] !== 'artifact.tar') {
  throw new Error(`${zip}: expected exactly the GitHub Pages artifact.tar member`);
}
await command('unzip', ['-q', zip, '-d', evidence], ROOT);
const tar = join(evidence, 'artifact.tar');
await validateTar(tar);
const dist = join(ROOT, 'dist');
await mkdir(dist);
await command('tar', ['-xf', tar, '-C', dist], ROOT);
const before = await snapshot(dist, dist);
const publisher = await command(process.execPath, ['scripts/publish-playbook.ts'], ROOT);
const after = await snapshot(dist, dist);
verifyOverlay(before, after);
const playbook = await readReviewPackage(join(dist, 'bridgenode7'));
await writeFile(join(evidence, 'baseline-manifest.json'), JSON.stringify(before, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(evidence, 'deployment-manifest.json'), JSON.stringify(after, null, 2) + '\n', { flag: 'wx' });
const report = {
  repository: REPOSITORY,
  baseline_run_id: runId,
  baseline_head_sha: run.headSha,
  baseline_artifact_id: artifactId,
  baseline_sha256: archiveSha256,
  baseline_artifact_expires_at: artifact.expiresAt,
  baseline_files: before.files.length,
  preserved_files: before.files.length,
  added_files: after.files.filter((file) => file.path.startsWith('bridgenode7/')).map((file) => file.path),
  baseline_manifest_sha256: sha256(Buffer.from(JSON.stringify(before))),
  selected_revision: playbook.revision,
  selected_manifest_sha256: playbook.manifestSha256,
  production_files_unchanged: true,
  production_directories_unchanged: true,
  publisher_output: publisher.trim(),
};
await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...report, evidence_directory: evidence }));
