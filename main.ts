// token-radar-01: the radar's entry point.
//
// It reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json,
// writes the dashboard's dataset beside the page as /output/data.js, copies this repository's
// dashboard/ and screenshots/ into /output, and writes /output/dossier.json with buildDossier from
// vendor/makefun-board.ts.
//
// The program is deterministic: the snapshot is frozen, nothing in the model reads the clock, and two
// runs write the same bytes.
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
/** The most bytes a dossier may hold (the gate's row, not the library's own 4 MiB). */
const DOSSIER_MAX_BYTES = 1_572_864;
/** The most bytes board.json may hold. */
const BOARD_MAX_BYTES = 8_388_608;
/** The screenshot sizes the gate accepts: the long side at most this, the short side at least this. */
const SHOT_MAX_SIDE = 1440;
const SHOT_MIN_SIDE = 800;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** A PNG's width and height, read from its IHDR, or null when it is not a PNG. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const boardBytes = Buffer.byteLength(JSON.stringify({ rows: board }), 'utf8') + 1;
if (boardBytes > BOARD_MAX_BYTES) {
  process.stderr.write(`token radar: board.json would be ${boardBytes} bytes, over the ${BOARD_MAX_BYTES} the gate accepts\n`);
  process.exit(1);
}
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
// The gate's dashboard_files row: an index.html, at least one .css and at least one .js.
const dashboardFiles = existsSync(join(out, 'dashboard')) ? readdirSync(join(out, 'dashboard')).filter((n) => !n.startsWith('.')) : [];
for (const needed of ['index.html']) {
  if (!dashboardFiles.includes(needed)) {
    process.stderr.write(`token radar: dashboard/ holds no ${needed}: the page is what the judge reads\n`);
    process.exit(1);
  }
}
for (const ext of ['.css', '.js']) {
  if (!dashboardFiles.some((n) => n.endsWith(ext))) {
    process.stderr.write(`token radar: dashboard/ holds no ${ext} file: the gate wants the page's source in the dossier\n`);
    process.exit(1);
  }
}
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
  const size = pngSize(readFileSync(join(out, 'screenshots', name)));
  if (size === null) {
    process.stderr.write(`token radar: screenshots/${name} is not a PNG the gate can measure\n`);
    process.exit(1);
  }
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);
  if (long > SHOT_MAX_SIDE || short < SHOT_MIN_SIDE) {
    process.stderr.write(`token radar: screenshots/${name} is ${size.width}x${size.height}: the long side must be at most ${SHOT_MAX_SIDE} and the short side at least ${SHOT_MIN_SIDE}\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossier = buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: DASHBOARD_CAPS,
});
if (dossier.length > DOSSIER_MAX_BYTES) {
  process.stderr.write(`token radar: the dossier is ${dossier.length} bytes, over the ${DOSSIER_MAX_BYTES} the gate accepts: shrink the screenshots or the source\n`);
  process.exit(1);
}
writeFileSync(join(out, 'dossier.json'), dossier);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_total} already trading and set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')}, ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')} (${dossier.length} bytes)\n`,
);
