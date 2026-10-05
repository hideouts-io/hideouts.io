/** Copy the selected exact review bytes after Astro sitemap and Pagefind generation. */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReviewPackage, readSelection } from './playbook-package.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const publication = join(ROOT, 'publication/bridgenode7');
const selection = await readSelection(join(publication, 'selected.json'));
const selected = await readReviewPackage(join(publication, 'revisions', selection.revision));
if (selected.revision !== selection.revision || selected.manifestSha256 !== selection.manifest_sha256) {
  throw new Error(
    'Selected BN7 revision or manifest fingerprint differs from selected.json; reimport the validated package',
  );
}
const dist = join(ROOT, 'dist');
const entries = await readdir(dist);
if (!entries.includes('pagefind'))
  throw new Error('dist/pagefind is missing; run the complete build before publishing the BN7 section');
if (entries.some((entry) => ['bridgenode7', 'bridgenode7.html'].includes(entry.toLowerCase()))) {
  throw new Error(
    'The /bridgenode7/ route conflicts with an existing built route or asset; resolve the collision without overwriting it',
  );
}
const destination = join(dist, 'bridgenode7');
await mkdir(destination);
for (const file of selected.files) await writeFile(join(destination, file.name), file.data, { flag: 'wx' });
const copied = await readReviewPackage(destination);
if (copied.manifestSha256 !== selection.manifest_sha256)
  throw new Error('Built BN7 manifest differs from the selected candidate');
console.log(
  JSON.stringify({
    route: '/bridgenode7/',
    revision: selected.revision,
    files: selected.files.map((file) => file.name),
    search: 'excluded',
    sitemap: 'excluded',
  }),
);
