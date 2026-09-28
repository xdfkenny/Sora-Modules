/* test-redirect.js — run the real redirect.js in a sandbox and assert the
 * location.replace() target for every access shape, so the redirect is
 * guaranteed to land on the new home regardless of the incoming hash.
 *
 * Usage:  node redirect-site/test-redirect.js
 * Exit 0 if every case passes, 1 otherwise.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'redirect.js'), 'utf8');
const BASE = 'https://sora-modules.xdfke.me/';

function runWith(hash) {
  const calls = { replace: [], assign: [] };
  const domStub = () => ({ textContent: '', setAttribute() {} });
  const doc = { getElementById: domStub };
  const loc = {
    hash: hash,
    href: 'http://old-site.example/index.html' + (hash || ''),
    replace(u) { calls.replace.push(u); },
    assign(u) { calls.assign.push(u); },
  };
  const win = { location: loc };
  const sandbox = { window: win, document: doc, location: loc, setTimeout() { return 0; } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox); // executes the IIFE synchronously
  return calls;
}

const cases = [
  // [label, incoming hash, expected replace target]
  ['plain visit, no hash',        '',             BASE],
  ['plain visit with home hash',  '#/',           BASE + '#/'],
  ['library request',             '#/library',    BASE + '#/library'],
  ['library + extra fragment',    '#/library?p=2',BASE + '#/library?p=2'],
  ['arbitrary fragment',          '#whatever',    BASE + '#whatever'],
];

let failed = 0;
for (const [label, hash, expected] of cases) {
  const got = runWith(hash).replace[0];
  const ok = got === expected;
  if (!ok) failed++;
  console.log(
    (ok ? 'PASS' : 'FAIL') + '  ' + label.padEnd(28) +
    '  "' + (hash || '(none)') + '"  ->  ' + got +
    (ok ? '' : '   (expected ' + expected + ')')
  );
}
console.log(failed === 0
  ? '\nAll ' + cases.length + ' redirect targets land on ' + BASE
  : '\n' + failed + ' case(s) FAILED');
process.exit(failed === 0 ? 0 : 1);
