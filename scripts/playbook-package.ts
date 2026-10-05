/** Validate the immutable BN7 review package without changing its public bytes. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { readonly [key: string]: Json };
type ManifestFile = Readonly<{ file: string; bytes: number; sha256: string }>;
export type PackageFile = Readonly<{ name: string; data: Buffer }>;
export type ReviewPackage = Readonly<{
  revision: string;
  sourceSha256: string;
  manifestSha256: string;
  rendererVersion: string;
  files: readonly PackageFile[];
}>;
export type Selection = Readonly<{ revision: string; manifest_sha256: string }>;

export const PACKAGE_FILES = ['PUBLIC_PLAYBOOK.md', 'index.html', 'Bridge-Node-7-Public-Playbook-Short.pdf'] as const;

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function object(value: Json, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label}: expected a JSON object`);
  }
  return value;
}

function string(record: JsonObject, field: string, label: string): string {
  const value: Json | undefined = record[field];
  if (typeof value !== 'string' || !value.length) throw new TypeError(`${label}: ${field} must be a nonempty string`);
  return value;
}

function hash(record: JsonObject, field: string, label: string): string {
  const value = string(record, field, label);
  if (!/^[a-f0-9]{64}$/.test(value)) throw new TypeError(`${label}: ${field} must be a lowercase SHA-256 hash`);
  return value;
}

function manifestFile(value: Json, label: string): ManifestFile {
  const record = object(value, label);
  const bytes: Json | undefined = record.bytes;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1) {
    throw new TypeError(`${label}: bytes must be a positive integer`);
  }
  return { file: string(record, 'file', label), bytes, sha256: hash(record, 'sha256', label) };
}

export async function readJsonObject(path: string): Promise<JsonObject> {
  const parsed: Json = JSON.parse(await readFile(path, 'utf8'));
  return object(parsed, path);
}

export async function readSelection(path: string): Promise<Selection> {
  const record = await readJsonObject(path);
  const revision = string(record, 'revision', path);
  if (!/^[a-f0-9]{12}-[a-f0-9]{12}$/.test(revision))
    throw new TypeError(`${path}: invalid review revision ${revision}`);
  return { revision, manifest_sha256: hash(record, 'manifest_sha256', path) };
}

/** Only the three manifest-bound public members and their exact manifest may be copied. */
export async function readReviewPackage(directory: string): Promise<ReviewPackage> {
  const path = join(directory, 'manifest.json');
  const manifestBytes = await readFile(path);
  const parsed: Json = JSON.parse(manifestBytes.toString('utf8'));
  const manifest = object(parsed, path);
  if (string(manifest, 'title', path) !== 'Bridge Node 7 short public playbook')
    throw new TypeError(`${path}: wrong title`);
  if (string(manifest, 'status', path) !== 'Editorial review draft')
    throw new TypeError(`${path}: review-draft status required`);
  if (string(manifest, 'source_manuscript', path) !== 'PUBLIC_PLAYBOOK.md')
    throw new TypeError(`${path}: wrong manuscript`);
  const renderer = object(manifest.pdf_renderer, `${path}: pdf_renderer`);
  if (
    string(renderer, 'engine', path) !== 'Chromium' ||
    !/^\d+(?:\.\d+){1,3}$/.test(string(renderer, 'version', path))
  ) {
    throw new TypeError(`${path}: expected the identified Chromium PDF renderer`);
  }
  if (!Array.isArray(manifest.files)) throw new TypeError(`${path}: files must be an array`);
  const members = manifest.files.map((value, index) => manifestFile(value, `${path}: files[${index}]`));
  if (
    members.length !== PACKAGE_FILES.length ||
    PACKAGE_FILES.some((name) => members.filter((m) => m.file === name).length !== 1)
  ) {
    throw new TypeError(`${path}: expected exactly ${PACKAGE_FILES.join(', ')}`);
  }
  const files = await Promise.all(
    members.map(async (member): Promise<PackageFile> => {
      const data = await readFile(join(directory, member.file));
      const actual = sha256(data);
      if (data.length !== member.bytes || actual !== member.sha256) {
        throw new Error(
          `${directory}/${member.file}: expected ${member.bytes} bytes / ${member.sha256}, got ${data.length} / ${actual}`,
        );
      }
      return { name: member.file, data };
    }),
  );
  const sourceSha256 = hash(manifest, 'source_sha256', path);
  const source = members.find((member) => member.file === 'PUBLIC_PLAYBOOK.md')!;
  const pdf = members.find((member) => member.file === 'Bridge-Node-7-Public-Playbook-Short.pdf')!;
  if (source.sha256 !== sourceSha256) throw new Error(`${path}: manuscript and source_sha256 disagree`);
  return {
    revision: `${sourceSha256.slice(0, 12)}-${pdf.sha256.slice(0, 12)}`,
    sourceSha256,
    manifestSha256: sha256(manifestBytes),
    rendererVersion: string(renderer, 'version', path),
    files: [...files, { name: 'manifest.json', data: manifestBytes }],
  };
}
