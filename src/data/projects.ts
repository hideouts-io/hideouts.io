/**
 * The allowlist. These are the ONLY repositories the site may fetch or render.
 * A repository that is not listed here never appears on hideouts.io, including
 * repositories created later. `scripts/check-allowlist.mjs` enforces this on
 * every build.
 *
 * Each entry doubles as the curation overlay: name, tagline, summary, and
 * highlights are written by hand; everything else (description, stars, license,
 * release, README) is pulled from GitHub at build time.
 */

export const GITHUB_OWNER = 'hideouts-io';

export type Kind = 'app' | 'research';
export type Platform = 'macOS' | 'iOS';

export interface Project {
  slug: string;
  repo: string;
  kind: Kind;
  platforms: Platform[];
  name: string;
  tagline: string;
  summary: string;
  highlights?: string[];
  /** Short trust signals shown as badges. Only claims the README states. */
  traits?: string[];
  featured?: boolean;
  order: number;
  /** README sections (heading text) to leave off the site. The README itself is untouched. */
  stripSections?: string[];
}

export const PROJECTS: Project[] = [
  // ─── Applications · iOS ────────────────────────────────────────────────
  {
    slug: 'ios-developer-toolkit',
    repo: 'iOS-Developer-Toolkit',
    kind: 'app',
    platforms: ['iOS', 'macOS'],
    name: 'iOS Developer Toolkit',
    tagline: 'The all-in-one iPhone and iPad workbench for your Mac.',
    summary:
      'Mount Developer Disk Images, run guided pymobiledevice3 and DVT diagnostics, stream Unified Logs, capture packets, simulate locations, inspect IPAs, make encrypted backups, and build hashed evidence cases from one trusted connection.',
    highlights: [
      '12 focused workspaces, from Device & DDI to Evidence Capture',
      '49 guided commands with risk labels and exact argument previews',
      'Typed confirmation before any change to the device',
      'Evidence cases with coverage states and SHA-256 manifests',
    ],
    traits: ['Authorized use only', 'No shell passthrough', 'Signed release builds'],
    featured: true,
    order: 1,
  },
  {
    slug: 'rvi-sentinel',
    repo: 'RVI-Sentinel',
    kind: 'app',
    platforms: ['iOS', 'macOS'],
    name: 'RVI-Sentinel',
    tagline: 'iPhone packet capture with a memory for what changed.',
    summary:
      'Capture iPhone and iPad traffic through Apple’s Remote Virtual Interface on macOS (or rvi_capture on Linux and Windows), then compare every session against a persistent network baseline with DNS entropy inspection.',
    highlights: [
      'Native rvictl workflow on macOS',
      'Works with any authorized .pcap or .pcapng file',
      'Persistent baseline shows new endpoints across sessions',
      'DNS entropy scoring for unusual domains',
    ],
    traits: ['Defensive', 'Cross-platform'],
    order: 2,
  },

  // ─── Applications · macOS ──────────────────────────────────────────────
  {
    slug: 'macscope',
    repo: 'MacScope',
    kind: 'app',
    platforms: ['macOS'],
    name: 'MacScope',
    tagline: 'Security posture and vulnerability scanning that changes nothing.',
    summary:
      'A read-only scanner for Apple Silicon Macs that correlates native macOS state, Apple security-release data, compliance checks, software inventory, and package vulnerabilities into evidence-preserving, SHA-256-verified reports.',
    highlights: [
      'SOFA, osquery, mSCP, Syft, and Grype in one scan',
      'XProtect and macOS patch-level assessment',
      'Offline HTML report with a findings library',
      'Separates direct observations from inference',
    ],
    traits: ['Read-only', 'No system changes'],
    order: 3,
  },
  {
    slug: 'entitlementlens',
    repo: 'EntitlementLens',
    kind: 'app',
    platforms: ['macOS'],
    name: 'EntitlementLens',
    tagline: 'See what every binary on your Mac is signed to do.',
    summary:
      'A native SwiftUI workbench for code-signature entitlements, per-architecture Mach-O evidence, embedded plists and strings, and build-scoped RunningBoard policy.',
    highlights: [
      'Per-architecture entitlements and CDHashes',
      'Optional deep carving of embedded plists and strings',
      'RunningBoard policy decoding',
      'Coverage view shows exactly what was and wasn’t scanned',
    ],
    traits: ['Static inspection', 'No third-party dependencies'],
    order: 4,
  },
  {
    slug: 'interface-sentinel',
    repo: 'Interface-Sentinel',
    kind: 'app',
    platforms: ['macOS'],
    name: 'Interface Sentinel',
    tagline: 'Only the network interfaces you allow stay up.',
    summary:
      'A menu-bar app with a root LaunchDaemon that continuously enforces a network-interface allowlist, taking down any unexpected interface in real time.',
    highlights: [
      'Menu-bar control with a live status indicator',
      'Configurable enforcement interval',
      'Documented recovery and full uninstall',
      'Sends no telemetry',
    ],
    traits: ['Requires admin', 'No telemetry'],
    order: 5,
  },
  {
    slug: 'system-profiler-explorer',
    repo: 'SystemProfilerExplorer',
    kind: 'app',
    platforms: ['macOS'],
    name: 'System Profiler Explorer',
    tagline: 'Understand what your Mac reports about itself.',
    summary:
      'Turns Apple’s system_profiler output into organized, searchable findings with plain-language explanations, source provenance, and filters for privacy-sensitive values.',
    highlights: [
      'All 50 system_profiler data types',
      'Eight subject tabs from Hardware to Security',
      'Flags values that may identify you',
      'Snapshots, comparison, and export',
    ],
    traits: ['Local-only', 'No account or analytics'],
    order: 6,
  },
  {
    slug: 'volume-mount-troubleshooter',
    repo: 'VolumeMountTroubleshooter',
    kind: 'app',
    platforms: ['macOS'],
    name: 'Volume Mount Troubleshooter',
    tagline: 'Diagnose and mount external drives without risking them.',
    summary:
      'A native utility for identifying external storage and explicitly inspecting, mounting read-only, or safely ejecting a volume, with APFS and FileVault detection and every command shown in a built-in console.',
    highlights: [
      'Read-only mounting for sensitive media',
      'APFS container and FileVault detection',
      'Disk Arbitration monitoring, SMART and USB evidence',
      'Redacted reports for sharing',
    ],
    traits: ['Non-destructive', 'No network access'],
    order: 7,
  },
  {
    slug: 'man-pages-catalog',
    repo: 'ManPagesCatalog',
    kind: 'app',
    platforms: ['macOS'],
    name: 'Man Page Catalog',
    tagline: 'Every man page on your Mac, searchable and readable.',
    summary:
      'Renders every system man page to PDF and lets you browse them in a clean three-column interface, filtered by section and searchable by name or description.',
    highlights: [
      'Section filters 1–9',
      'Search across names and descriptions',
      'Inline PDF viewing with source paths',
      'Incremental re-rendering',
    ],
    order: 8,
  },

  // ─── Research ──────────────────────────────────────────────────────────
  {
    slug: 'suramdisk',
    repo: 'StarSecurity-SURamDisk',
    kind: 'research',
    platforms: ['macOS'],
    name: 'Inside Apple’s Software Update RAMDisk',
    tagline: 'T2 DFU restore, the ramrod pipeline, SSV sealing, and firmware Option ROMs.',
    summary:
      'Forensic and architectural study of the StarSecurityRome21G115 RAMDisk from macOS Monterey 12.6 (x86_64): boot and init, the ramrod restore engine, APFS Sealed System Volume Merkle sealing, Image4 and FDR trust, and controller firmware.',
    order: 1,
  },
  {
    slug: 'ios-system-research',
    repo: 'iOS-System-Research',
    kind: 'research',
    platforms: ['iOS'],
    name: 'iOS System Research',
    tagline: 'Carrier profiles, OTAUpload, sysdiagnose, and unexplained MDM records.',
    summary:
      'Evidence-first investigations of iOS artifacts: T-Mobile and AT&T Passpoint profiles and evil-twin exposure, OTAUpload, LambdaTest references in a sysdiagnose, and Bushel / Jamf Now managed-configuration records on a personal phone.',
    order: 2,
  },
  {
    slug: 'apple-infrastructure',
    repo: 'Apple-Infrastructure-Research',
    kind: 'research',
    platforms: ['macOS'],
    name: 'Apple Networking & Cloud Infrastructure',
    tagline: 'What four minutes of Unified Logs reveal about Apple’s network.',
    summary:
      'Apple CDN and Akamai edges, iCloud Private Relay topology, QUIC and HTTP/3, Daiquiri backend metadata, and the hybrid cloud behind Apple services, reconstructed from a macOS log snapshot.',
    order: 3,
  },
  {
    slug: 'skywalkctl-guide',
    repo: 'skywalkctl-guide',
    kind: 'research',
    platforms: ['macOS'],
    name: 'The Unofficial skywalkctl Field Guide',
    tagline: 'Apple’s kernel networking subsystem, one command at a time.',
    summary:
      'A hands-on guide to macOS skywalkctl built from 175 sanitized, read-only invocations on macOS 26.4, with a safety map, full command reference, and expanded man page.',
    order: 4,
  },
  {
    slug: 'optical-airgap-lab',
    repo: 'optical-airgap-lab',
    kind: 'research',
    platforms: ['macOS', 'iOS'],
    name: 'Optical Air-Gap Lab',
    tagline: 'Recovering near-invisible QR codes from an iPhone photo of a screen.',
    summary:
      'A closed-loop, offline reproduction of low-contrast optical signaling through an LCD, with a verified decode of a synthetic identifier from a real iPhone photograph.',
    order: 5,
  },
];

export const ALLOWED_REPOS = new Set(PROJECTS.map((p) => p.repo));

export const apps = () =>
  PROJECTS.filter((p) => p.kind === 'app').sort((a, b) => a.order - b.order);
export const research = () =>
  PROJECTS.filter((p) => p.kind === 'research').sort((a, b) => a.order - b.order);
export const bySlug = (slug: string) => PROJECTS.find((p) => p.slug === slug);
export const byRepo = (repo: string) =>
  PROJECTS.find((p) => p.repo.toLowerCase() === repo.toLowerCase());
