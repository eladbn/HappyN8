// Generates the HappyN8 logo set (static and animated SVG): the expression-grin mark and its wordmark.
// Run: node scripts/brand/logos.mjs   → writes docs/brand/logos, web/public/brand and the loading screen in web/index.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = [path.join(root, 'docs/brand/logos'), path.join(root, 'web/public/brand')];

export const C = {
  teal: '#008060', // Jungle teal: action, the tile, the grin on light
  harbor: '#18393E', // Harbor: navigation, dark ground
  marigold: '#FFC530', // Marigold: the finished step (right eye); brand moments only
  graphite: '#353535', // text, eyes on light
  white: '#FFFFFF',
};

/* ---------- The mark: the expression grin (designed on a 256 grid) ----------
 * n8n's { } expression brace, turned on its side, is the grin; two step nodes are the eyes.
 * Content box: x 24–232, y 68–188. The right eye is the "finished step" and lights up marigold. */
const BRACE = 'M36 112C36 146 58 158 88 158H108C120 158 128 164 128 176C128 164 136 158 148 158H168C198 158 220 146 220 112';
const EYE_L = [86, 86];
const EYE_R = [170, 86];
const ease = 'cubic-bezier(.34,1.56,.64,1)';

function glyph({ wire = C.white, start = C.white, end = C.marigold, animated = false, stroke = 24, eye = 18 } = {}) {
  const a = animated;
  return `<path class="wire" d="${BRACE}" fill="none" stroke="${wire}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"${a ? ' pathLength="1"' : ''}/>`
    + (a ? `<circle class="packet" r="13" fill="${C.marigold}" opacity="0"><animateMotion path="${BRACE}" begin="0.35s" dur="0.55s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".65 0 .35 1"/></circle>` : '')
    + `<circle class="n1" cx="${EYE_L[0]}" cy="${EYE_L[1]}" r="${eye}" fill="${start}"/>`
    + `<circle class="n2" cx="${EYE_R[0]}" cy="${EYE_R[1]}" r="${eye}" fill="${end}"/>`;
}
// Inside the 64-unit tile the grin spans about two thirds of the width, optically centred.
const IN_TILE = 'translate(6.14 6.64) scale(.202)';
const tile = (fill = C.teal) => `<rect class="tile" width="64" height="64" rx="16" fill="${fill}"/>`;
const tileMark = (o = {}) => `${tile(o.tile)}<g transform="${IN_TILE}">${glyph(o)}</g>`;

/* ---------- The wordmark: cap height 40, x-height 28, stroke 9 (= the grin's stroke at lockup size) ----------
 * The H's crossbar carries the brace point; bowls are circles like the eyes; all ends are round.
 * Each glyph is a list of strokes so every stroke can be "written" in the animated version. */
const GLYPHS = [
  { part: 'happy', d: ['M0 0V40', 'M28 0V40', 'M0 18H7C11 18 14 20 14 25C14 20 17 18 21 18H28'] }, // H
  { part: 'happy', d: ['M72 26a14 14 0 1 0 -28 0a14 14 0 1 0 28 0', 'M72 12V40'] }, // a
  { part: 'happy', d: ['M88 12V56', 'M88 26a14 14 0 1 1 28 0a14 14 0 1 1 -28 0'] }, // p
  { part: 'happy', d: ['M132 12V56', 'M132 26a14 14 0 1 1 28 0a14 14 0 1 1 -28 0'] }, // p
  { part: 'happy', d: ['M176 12V25a13 13 0 0 0 26 0', 'M202 12V44a14 14 0 0 1 -14 14'] }, // y
  { part: 'n8', d: ['M218 40V0L244 40V0'] }, // N
  { part: 'n8', d: ['M271 18a9 9 0 1 1 0 -18a9 9 0 1 1 0 18a11 11 0 1 0 0 22a11 11 0 1 0 0 -22'] }, // 8
];
const WM = { x: -4.5, y: -4.5, w: 291, h: 67 };

function wordmark({ happy = C.graphite, n8 = C.teal, animated = false, delay = 0.75 } = {}) {
  // Letters start 50 ms apart; strokes inside a letter follow 50 ms after each other.
  const strokes = GLYPHS.map((g, gi) => g.d.map((d, si) => {
    const style = animated ? ` style="animation-delay:${(delay + gi * 0.05 + si * 0.05).toFixed(2)}s" pathLength="1"` : '';
    return `<path class="w" d="${d}" stroke="${g.part === 'happy' ? happy : n8}"${style}/>`;
  }).join('')).join('');
  return `<g fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${strokes}</g>`;
}

/* ---------- Motion ----------
 * Left eye pops in, the grin draws left to right with a marigold dot leading, the right eye pops in
 * as the run finishes, then the wire writes the name. About 1.45 s in all.
 * The dash gap is 2 (not 1) so a round cap never shows as a dot at the end of an undrawn stroke. */
const INTRO_RULES = `.tile{transform-box:fill-box;transform-origin:center;animation:hn-tile .4s ${ease} both}
.n1{transform-box:fill-box;transform-origin:center;animation:hn-pop .3s .15s ${ease} both}
.wire{stroke-dasharray:1 2;animation:hn-draw .55s .35s cubic-bezier(.65,0,.35,1) both}
.n2{transform-box:fill-box;transform-origin:center;animation:hn-pop .4s .88s ${ease} both}
.w{stroke-dasharray:1 2;animation:hn-write .35s cubic-bezier(.65,0,.35,1) both}
.packet{animation:hn-show .55s .35s}
@keyframes hn-show{from,to{opacity:1}}
@keyframes hn-tile{from{transform:scale(.6);opacity:0}}
@keyframes hn-pop{from{transform:scale(0)}}
@keyframes hn-draw{from{stroke-dashoffset:1}}
@keyframes hn-write{from{stroke-dashoffset:1;opacity:0}1%{opacity:1}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.packet{display:none}}`;
const INTRO_CSS = `<style>${INTRO_RULES}</style>`;

// Loader: the grin draws and un-draws while the right eye lights up on each pass.
const LOOP_CSS = `<style>
.wire{stroke-dasharray:1 2;animation:hn-loop 1.6s cubic-bezier(.65,0,.35,1) infinite}
.n2{transform-box:fill-box;transform-origin:center;animation:hn-arrive 1.6s infinite}
@keyframes hn-loop{0%{stroke-dashoffset:1}45%,70%{stroke-dashoffset:0}100%{stroke-dashoffset:-1}}
@keyframes hn-arrive{0%,40%{transform:scale(.7);fill:#FFFFFF}50%{transform:scale(1.2);fill:${C.marigold}}60%,85%{transform:scale(1);fill:${C.marigold}}100%{transform:scale(.7);fill:#FFFFFF}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.packet{display:none}}
</style>`;
const loopPacket = `<circle class="packet" r="13" fill="${C.marigold}"><animateMotion path="${BRACE}" dur="1.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;.45;1" keyPoints="0;1;1" keySplines=".65 0 .35 1;0 0 1 1"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.44;.46;1" dur="1.6s" repeatCount="indefinite"/></circle>`;

/* ---------- Composition ---------- */
const svg = (w, h, body, title, vb = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

const wmBox = `${WM.x} ${WM.y} ${WM.w} ${WM.h}`;
// Horizontal lockup (wordmark units): the bare grin scaled 0.383 so its stroke equals the letters' 9,
// its point sitting just under the baseline; the name starts 22 units after it.
const GK = 0.383;
const H = { w: 400, h: 70, vb: '-6 -6 400 70' };
const horizontal = (o) => `<g transform="translate(${(-24 * GK).toFixed(2)} ${(44 - 188 * GK).toFixed(2)}) scale(${GK})">${glyph({ ...o.g, animated: o.animated })}</g>`
  + `<g transform="translate(102 0)">${wordmark({ ...o.wm, animated: o.animated })}</g>`;
// Stacked lockup: the app tile (96) above the wordmark at 0.6. Used for the loading screen.
const S = { w: 200, h: 158 };
const stacked = (o) => `<g transform="translate(52 0) scale(1.5)">${tileMark({ ...o.g, tile: o.tile, animated: o.animated })}</g>`
  + `<g transform="translate(15.4 116.7) scale(.6)">${wordmark({ ...o.wm, animated: o.animated, delay: 0.78 })}</g>`;

const light = { g: { wire: C.teal, start: C.graphite, end: C.graphite } };
const dark = { g: { wire: C.white, start: C.white, end: C.marigold }, wm: { happy: C.white, n8: C.marigold } };
const mono = (c) => ({ g: { wire: c, start: c, end: c }, wm: { happy: c, n8: c } });
const monoTile = (c) => ({ tile: c, g: { wire: C.white, start: C.white, end: C.white }, wm: { happy: c, n8: c } });
const hz = (o, css = '') => svg(H.w, H.h, css + horizontal(o), 'HappyN8', H.vb);
const GLYPH_BOX = '16 60 224 136';

export const FILES = {
  // Static
  'happyn8-mark.svg': svg(64, 64, tileMark(), 'HappyN8'),
  'happyn8-mark-harbor.svg': svg(64, 64, tileMark({ tile: C.harbor }), 'HappyN8'),
  'happyn8-mark-mono.svg': svg(64, 64, tileMark({ tile: C.graphite, end: C.white }), 'HappyN8'),
  'happyn8-glyph.svg': svg(224, 136, glyph(light.g), 'HappyN8', GLYPH_BOX),
  'happyn8-glyph-reversed.svg': svg(224, 136, glyph(dark.g), 'HappyN8', GLYPH_BOX),
  'happyn8-glyph-mono.svg': svg(224, 136, glyph(mono(C.graphite).g), 'HappyN8', GLYPH_BOX),
  'happyn8-wordmark.svg': svg(WM.w, WM.h, wordmark(), 'HappyN8', wmBox),
  'happyn8-wordmark-reversed.svg': svg(WM.w, WM.h, wordmark(dark.wm), 'HappyN8', wmBox),
  'happyn8-wordmark-mono.svg': svg(WM.w, WM.h, wordmark({ happy: C.graphite, n8: C.graphite }), 'HappyN8', wmBox),
  'happyn8-lockup.svg': hz(light),
  'happyn8-lockup-reversed.svg': hz(dark),
  'happyn8-lockup-mono.svg': hz(mono(C.graphite)),
  'happyn8-lockup-stacked.svg': svg(S.w, S.h, stacked({}), 'HappyN8'),
  'happyn8-lockup-stacked-reversed.svg': svg(S.w, S.h, stacked({ wm: dark.wm }), 'HappyN8'),
  'happyn8-lockup-stacked-mono.svg': svg(S.w, S.h, stacked(monoTile(C.graphite)), 'HappyN8'),
  'happyn8-app-icon.svg': svg(512, 512, `<rect width="512" height="512" fill="${C.teal}"/><g transform="translate(16 12) scale(7.5)"><g transform="${IN_TILE}">${glyph()}</g></g>`, 'HappyN8'),
  // Small-size cut: a heavier grin and bigger eyes so it holds at 16 px.
  'favicon.svg': svg(32, 32, `<rect width="32" height="32" rx="8" fill="${C.teal}"/><g transform="translate(1.6 1.2) scale(.112)">${glyph({ stroke: 34, eye: 24 })}</g>`, 'HappyN8'),
  // Animated
  'happyn8-mark-animated.svg': svg(64, 64, INTRO_CSS + tileMark({ animated: true }), 'HappyN8'),
  'happyn8-lockup-animated.svg': hz({ ...light, animated: true }, INTRO_CSS),
  'happyn8-lockup-animated-reversed.svg': hz({ ...dark, animated: true }, INTRO_CSS),
  'happyn8-lockup-stacked-animated.svg': svg(S.w, S.h, INTRO_CSS + stacked({ animated: true }), 'HappyN8'),
  'happyn8-loader.svg': svg(64, 64, LOOP_CSS + tile() + `<g transform="${IN_TILE}">${glyph().replace('<circle class="n1"', loopPacket + '<circle class="n1"').replace('<path class="wire"', '<path class="wire" pathLength="1"')}</g>`, 'Loading'),
  // Installable app (PNG icons are rendered from happyn8-app-icon.svg by scripts/brand/icons.mjs)
  'manifest.webmanifest': `${JSON.stringify({
    name: 'HappyN8', short_name: 'HappyN8', start_url: '/', display: 'standalone', background_color: '#f2f3f3', theme_color: C.harbor,
    icons: [
      { src: '/brand/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }, null, 2)}\n`,
};

/** The app's loading screen: the stacked lockup playing once (about 1.5 s), scoped to #splash. */
const scoped = INTRO_RULES.replace(/(^|\n|\})\.(tile|n1|wire|n2|w|packet)\{/g, '$1#splash .$2{').replace('{*{animation', '{#splash *{animation');
export const SPLASH = `<div id="splash" role="status" aria-label="Loading HappyN8"><style>${scoped}</style>`
  + `<svg viewBox="0 0 ${S.w} ${S.h}" width="${S.w}" height="${S.h}" aria-hidden="true">${stacked({ animated: true })}</svg></div>`;

/**
 * A short hash of every logo file. Logo URLs carry it as ?v=…, so browsers fetch new artwork
 * as soon as the logo changes instead of showing a cached copy.
 */
export const BRAND_VERSION = createHash('sha256').update(Object.values(FILES).join('')).digest('hex').slice(0, 8);

function writeVersion() {
  write(path.join(root, 'web/src/lib/brandVersion.ts'),
    `// Generated by scripts/brand/logos.mjs: changes whenever the logo files change.\nexport const BRAND_VERSION = '${BRAND_VERSION}';\nexport const brandUrl = (file: string) => \`/brand/\${file}?v=\${BRAND_VERSION}\`;\n`);
}

function writeSplash() {
  const file = path.join(root, 'web/index.html');
  const html = fs.readFileSync(file, 'utf8')
    .replace(/(href="\/brand\/[^"?]+)(\?v=[0-9a-f]+)?"/g, `$1?v=${BRAND_VERSION}"`);
  const next = html.replace(/<!-- splash:start -->[\s\S]*<!-- splash:end -->/, `<!-- splash:start -->${SPLASH}<!-- splash:end -->`);
  if (next === html && !html.includes(SPLASH)) throw new Error('web/index.html has no splash markers');
  write(file, next);
}

/**
 * Writes only changed files. On Windows a previewer can hold a file open so it can't be overwritten,
 * but it can still be renamed: move it aside, write a fresh copy, then remove the old one.
 */
function write(file, body) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === body) return false;
  try {
    fs.writeFileSync(file, body);
  } catch (e) {
    const aside = `${file}.${Date.now()}.old`;
    try { fs.renameSync(file, aside); } catch { throw new Error(`Couldn't write ${file}: ${e.message}. Close any app previewing it and run again.`); }
    fs.writeFileSync(file, body);
    try { fs.rmSync(aside); } catch { /* removed on a later run */ }
  }
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let changed = 0;
  for (const dir of OUT) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(FILES)) changed += write(path.join(dir, name), body) ? 1 : 0;
  }
  writeSplash();
  writeVersion();
  console.log(`${Object.keys(FILES).length} logo files (${changed} changed) in:\n  ${OUT.join('\n  ')}\nand the loading screen in web/index.html`);
}
