/* Bridge page — send every visitor to the new home.
 *
 * The new site is the same SPA (hash router: #/ + #/library), so we forward
 * the incoming hash fragment. A plain visit (no hash) lands on the new home;
 * a library request (index.html#/library) lands on the new library view.
 */
(function () {
  'use strict';
  var BASE = 'https://sora-modules.xdfke.me/';
  var hash = window.location.hash || '';
  var target = BASE + hash;

  var status = document.getElementById('status');
  var link = document.getElementById('fallback');
  if (status) status.textContent = 'Redirecting to sora-modules.xdfke.me' + (hash ? ' (' + hash + ')' : '') + '\u2026';
  if (link) link.setAttribute('href', target);

  // Leave immediately. replace() drops the bridge page from history so the
  // back button skips it instead of bouncing here.
  window.location.replace(target);

  // Safety net: if replace() is blocked (sandboxed about:blank, an extension),
  // the page is still here after a beat — fall back to a hard assign.
  setTimeout(function () {
    if (window.location.href.indexOf(BASE) !== 0) {
      window.location.assign(target);
    }
  }, 1200);
})();
