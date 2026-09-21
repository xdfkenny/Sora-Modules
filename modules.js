/* Legacy /modules/ entry — redirects to the unified SPA library view.
 * Kept so old links (Sora "Add All", bookmarks, ?embed=true) keep working. */
(function () {
  'use strict';
  var hash = '#/library' + (location.search || '');
  var target = new URL('../' + hash, location.href).href;
  location.replace(target);
})();
