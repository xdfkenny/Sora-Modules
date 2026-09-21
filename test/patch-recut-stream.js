/* patch-recut-stream.js — wrap the recuts' bare-URL extractStreamUrl in the
 * contract envelope {streams:[{title,streamUrl}]} so both the test harness
 * and the app's normalizeStreams can parse it. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname + '/..';
const MODULES = ['narucannon', 'onepace', 'onePieceFilmRedAmaLeeScore',
  'rebuildOfNaruto', 'yuYuHakushoPace'];

for (const name of MODULES) {
  const fp = path.join(ROOT, name, name + '.js');
  let src = fs.readFileSync(fp, 'utf8');
  const m = src.match(/async function extractStreamUrl\(url\) \{\r?\n\s*return `(https:\/\/pixeldrain\.net\/api\/file\/\$\{url\}[^`]*)`;[\s\S]*?\r?\n\}/);
  if (!m) { console.log(`SKIP ${name}: unexpected extractStreamUrl shape`); continue; }
  const tpl = m[1];
  const replacement = `async function extractStreamUrl(url) {
    return JSON.stringify({
        streams: [{ title: "Pixeldrain", streamUrl: \`${tpl}\`, headers: {} }]
    });
}`;
  src = src.replace(m[0], replacement);
  fs.writeFileSync(fp, src);
  console.log(`PATCHED ${name}`);
}
console.log('done');