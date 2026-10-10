import { GITHUB_OWNER } from '../data/projects.ts';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** The branch or tag captured at sync time, its commit, and the README blob within that commit. */
export interface ReadmeSource {
  ref: string;
  commitSha: string;
  path: string;
  blobSha: string;
}

export function jsonObject(value: JsonValue | undefined, context: string): Record<string, JsonValue> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context}: expected a JSON object. Run npm run content to regenerate the snapshot.`);
  }
  return value;
}

export function validateCommitSha(value: JsonValue | undefined, context: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${context}: expected a full Git SHA. Run npm run content to regenerate the snapshot.`);
  }
  return value;
}

/** Reject old caches rather than infer a source revision from a sync timestamp. */
export function validateReadmeSource(value: JsonValue | ReadmeSource | undefined, context: string): ReadmeSource {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context}: missing README source metadata. Run npm run content to regenerate the snapshot.`);
  }
  if (!('ref' in value) || typeof value.ref !== 'string' || !value.ref.trim() || /[\s\p{Cc}]/u.test(value.ref)) {
    throw new Error(`${context}: invalid README source ref. Run npm run content to regenerate the snapshot.`);
  }
  if (
    !('path' in value) ||
    typeof value.path !== 'string' ||
    !value.path ||
    /[\\\p{Cc}]/u.test(value.path) ||
    value.path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(
      `${context}: invalid repository-relative README path. Run npm run content to regenerate the snapshot.`,
    );
  }
  const commitSha = validateCommitSha('commitSha' in value ? value.commitSha : undefined, `${context} commitSha`);
  const blobSha = validateCommitSha('blobSha' in value ? value.blobSha : undefined, `${context} blobSha`);
  return { ref: value.ref, commitSha, path: value.path, blobSha };
}

export function readmeSourceUrl(repo: string, source: ReadmeSource): string {
  const path = source.path.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${GITHUB_OWNER}/${repo}/blob/${source.commitSha}/${path}`;
}

/** Resolve README-relative paths within the repository, keeping query strings and fragments. */
export function resolveDocumentationLink(repo: string, source: ReadmeSource, href: string): string {
  const root = `https://github.com/${GITHUB_OWNER}/${repo}/blob/${source.commitSha}/`;
  const base = href.startsWith('/') ? root : readmeSourceUrl(repo, source);
  const resolved = new URL(href.replace(/^\/+/, ''), base);
  if (!resolved.href.startsWith(root)) {
    throw new Error(
      `${repo}: documentation link "${href}" escapes the captured repository. Fix the README and run npm run content.`,
    );
  }
  if (resolved.pathname === new URL(root).pathname) {
    return resolved.href.replace(`/blob/${source.commitSha}/`, `/tree/${source.commitSha}/`);
  }
  return resolved.href;
}
