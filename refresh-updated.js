#!/usr/bin/env node
/* Regenerates the `updated` field on every entry in modules.json.
 *
 * For a module that has a local directory in this repo, `updated` is the
 * date of the last commit that touched that directory. If the working tree
 * still has uncommitted changes in the directory, today's date is used
 * instead — the commit you're about to land is what makes the module
 * freshly updated. Modules whose manifest lives in another repo
 * (JayGxnzalez, cranci1, ...) get no date (null).
 *
 * Run from the repo root before pushing a module change:
 *   node refresh-updated.js
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');

function git(args) {
  try {
    return execSync('git ' + args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return (e && e.stdout ? String(e.stdout) : '').trim();
  }
}

const file = process.argv[2] || 'modules.json';
const idx = JSON.parse(fs.readFileSync(file, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
let changed = 0;

for (const m of idx.modules) {
  const pending = (git('status --porcelain -- "' + m.id + '"') || '').length > 0;
  const d = pending ? today : (git('log -1 --format=%cs -- "' + m.id + '"') || null);
  const next = d || null;
  if ((m.updated || null) !== next) {
    m.updated = next;
    changed++;
  }
}

fs.writeFileSync(file, JSON.stringify(idx, null, 2) + '\n');
console.log('refresh-updated: ' + idx.modules.length + ' entries, ' + changed + ' updated field(s) changed');
