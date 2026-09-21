/* patch-recuts.js — remove the junk "Use External Player" / "Use «all»..."
 * placeholder entries from the recut modules' searchResults. These were
 * pushed FIRST, so any consumer picking results[0] got an empty href and the
 * whole chain died. The real pixeldrain content follows.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname + '/..';
const MODULES = ['narucannon', 'onepace', 'onePieceFilmRedAmaLeeScore',
  'onePieceTreasureEdition', 'rebuildOfNaruto', 'yuYuHakushoPace'];

const PLACEHOLDER = /results\.push\(\{([\s\S]*?)\}\);/g;

for (const name of MODULES) {
  const fp = path.join(ROOT, name, name + '.js');
  const src = fs.readFileSync(fp, 'utf8');
  const blocks = [...src.matchAll(PLACEHOLDER)];
  const removeIdx = blocks.findIndex(b =>
    b[1].includes('title: "Use ') && b[1].includes('href: ""'));
  if (removeIdx < 0) { console.log(`SKIP ${name}: no placeholder block`); continue; }
  const block = blocks[removeIdx][0];
  const idx = src.indexOf(block);
  const after = src.slice(idx + block.length).replace(/^\r?\n/, '');
  const removed = src.slice(0, idx) + after;
  if (removed === src) { console.log(`WARN ${name}: block not actually removed`); continue; }
  fs.writeFileSync(fp, removed);
  console.log(`PATCHED ${name}: removed placeholder block`);
}
console.log('done');