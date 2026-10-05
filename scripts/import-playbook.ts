/** Import an explicitly selected BN7 candidate; preserve all older revisions. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonObject, readReviewPackage, sha256 } from './playbook-package.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [canonicalArgument, packageArgument] = process.argv.slice(2);
if (process.argv.length !== 4 || !canonicalArgument || !packageArgument) {
  throw new TypeError(
    'Pass canonical BN7 root and extracted revision directory: npm run playbook:import -- /path/to/BN7 /path/to/revision',
  );
}
const canonicalRoot = resolve(canonicalArgument);
const selected = await readReviewPackage(resolve(packageArgument));
const canonicalSource = await readFile(join(canonicalRoot, 'PUBLIC_PLAYBOOK.md'));
const stylesheet = await readFile(join(canonicalRoot, 'assets/playbook.css'));
const web = await readJsonObject(join(canonicalRoot, 'output/web/source.json'));
const pdf = await readJsonObject(join(canonicalRoot, 'output/pdf/source.json'));
const browser = pdf.browser;
if (!browser || typeof browser !== 'object' || Array.isArray(browser) || browser.version !== selected.rendererVersion) {
  throw new Error('Selected manifest renderer version does not match the canonical PDF sidecar');
}
if (sha256(canonicalSource) !== selected.sourceSha256)
  throw new Error(
    'Selected package differs from canonical PUBLIC_PLAYBOOK.md; render/package the current manuscript first',
  );
for (const sidecar of [web, pdf]) {
  if (sidecar.sha256 !== selected.sourceSha256 || sidecar.stylesheet_sha256 !== sha256(stylesheet)) {
    throw new Error(
      'Canonical manuscript/stylesheet differs from the HTML/PDF sidecars; rebuild and validate a new BN7 candidate',
    );
  }
}
const htmlFile = selected.files.find((file) => file.name === 'index.html')!;
const pdfFile = selected.files.find((file) => file.name === 'Bridge-Node-7-Public-Playbook-Short.pdf')!;
if (
  web.html_sha256 !== sha256(htmlFile.data) ||
  pdf.html_sha256 !== sha256(htmlFile.data) ||
  pdf.pdf_sha256 !== sha256(pdfFile.data)
) {
  throw new Error(
    'Selected HTML/PDF does not match the canonical rendering sidecars; select the validated matching revision',
  );
}

const publication = join(ROOT, 'publication/bridgenode7');
const revisionDirectory = join(publication, 'revisions', selected.revision);
await mkdir(revisionDirectory, { recursive: true });
for (const file of selected.files) {
  const destination = join(revisionDirectory, file.name);
  try {
    await writeFile(destination, file.data, { flag: 'wx' });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    if (!(await readFile(destination)).equals(file.data))
      throw new Error(`${destination}: existing candidate differs; previous revisions must not be overwritten`, {
        cause: error,
      });
  }
}
const selection = { revision: selected.revision, manifest_sha256: selected.manifestSha256 };
await writeFile(join(publication, 'selected.json'), JSON.stringify(selection, null, 2) + '\n');
console.log(
  JSON.stringify({
    imported: selected.revision,
    manifest_sha256: selected.manifestSha256,
    files: selected.files.map((file) => file.name),
  }),
);
