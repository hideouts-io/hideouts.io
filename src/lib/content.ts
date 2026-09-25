import { PROJECTS, type Project } from '../data/projects';

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
  sha256: string | null;
}

export interface Generated {
  slug: string;
  repo: string;
  fetchedAt: string;
  htmlUrl: string;
  homepage: string | null;
  description: string | null;
  topics: string[];
  language: string | null;
  license: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  privateReporting: boolean;
  hasIssues: boolean;
  createdAt: string;
  defaultBranch: string;
  release: {
    tag: string;
    name: string | null;
    url: string;
    publishedAt: string;
    assets: ReleaseAsset[];
  } | null;
  logo: string | null;
  scope: string | null;
  html: string;
  toc: { depth: number; id: string; text: string }[];
  gallery: { src: string; alt: string; width?: number; height?: number }[];
  readingMinutes: number;
}

export type Entry = Project & { gh: Generated; href: string };

const files = import.meta.glob<Generated>('../generated/*.json', { eager: true, import: 'default' });

function load(p: Project): Entry {
  const gh = files[`../generated/${p.slug}.json`];
  if (!gh) throw new Error(`Missing generated content for ${p.slug}. Run \`npm run content\` first.`);
  return { ...p, gh, href: `/${p.kind === 'app' ? 'apps' : 'research'}/${p.slug}/` };
}

export const entries = (): Entry[] => PROJECTS.map(load);
export const appEntries = () => entries().filter((e) => e.kind === 'app').sort((a, b) => a.order - b.order);
export const researchEntries = () =>
  entries()
    .filter((e) => e.kind === 'research')
    .sort((a, b) => a.order - b.order);

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const fmtBytes = (n: number) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`;
