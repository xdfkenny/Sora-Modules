// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for rumanhua1.
//
// Rebuilt 2026-11-12 on the successor site rumanhua2.com
// (rumanhua1.com hangs on TCP with no HTTP reply since ~2026-10).
// The new site is a different codebase:
//   search:   POST /s  body "k=<keyword>"  -> JSON {code,data:[{id,name,imgurl,remarks}]}
//   detail:   GET  /<id>/                  -> og:* meta + first 20 chapters in .chaplist-box
//   chapters: POST /morechapter body "id=<id>" -> JSON [{chapterid,chaptername}]
//   images:   GET  /<id>/<chapterid>.html  -> <img data-src="https://p6.ecombdimg.com/...">
//
// Eclipse runs reader modules in a bare JSContext. What it provides:
//   manga env: fetch(url, options) -> Promise<{status, headers, text(), json(), data}>
//   novel env: fetch(url, headers) -> Promise<text>
//              fetchv2(url, hdrs, method, body) -> Promise<{status, headers, body, text(), json()}>
//   shared:    console.log, Promise
//   missing:   URL constructor, atob/btoa, console.error/warn/info/debug
//
// This prelude fills those gaps so the module below runs unchanged in
// BOTH the original app and Eclipse. Every shim is guarded — it only
// installs itself when the host has not already provided the global.
// ============================================================
(function () {
    var g = (typeof globalThis !== "undefined") ? globalThis
          : (typeof self !== "undefined") ? self
          : this;

    var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if (typeof g.atob !== "function") {
        g.atob = function (input) {
            var b64 = String(input).replace(/[^A-Za-z0-9+/=]/g, "");
            var out = [];
            for (var i = 0; i < b64.length; i += 4) {
                var n1 = B64.indexOf(b64.charAt(i));
                var n2 = B64.indexOf(b64.charAt(i + 1));
                if (n1 < 0 || n2 < 0) break;
                var c2c = b64.charAt(i + 2);
                var c3c = b64.charAt(i + 3);
                var n3 = (c2c === "=" || c2c === "") ? -1 : B64.indexOf(c2c);
                var n4 = (c3c === "=" || c3c === "") ? -1 : B64.indexOf(c3c);
                out.push(String.fromCharCode((n1 << 2) | (n2 >> 4)));
                if (n3 >= 0) out.push(String.fromCharCode(((n2 & 15) << 4) | (n3 >> 2)));
                if (n4 >= 0) out.push(String.fromCharCode(((n3 & 3) << 6) | n4));
            }
            return out.join("");
        };
    }
    if (typeof g.btoa !== "function") {
        g.btoa = function (s) {
            s = String(s);
            var out = "";
            var i = 0;
            while (i < s.length) {
                var c1 = s.charCodeAt(i++) & 0xFF;
                var c2 = i < s.length ? (s.charCodeAt(i++) & 0xFF) : -1;
                var c3 = i < s.length ? (s.charCodeAt(i++) & 0xFF) : -1;
                out += B64.charAt(c1 >> 2);
                out += B64.charAt(((c1 & 3) << 4) | ((c2 >= 0) ? (c2 >> 4) : 0));
                out += c2 >= 0 ? B64.charAt((((c2 & 15) << 2)) | ((c3 >= 0) ? (c3 >> 6) : 0)) : "=";
                out += c3 >= 0 ? B64.charAt(c3 & 63) : "=";
            }
            return out;
        };
    }

    // URL — JSC has no WHATWG URL constructor.
    if (typeof g.URL !== "function") {
        function makeURL(full) {
            var url = {};
            url.href = full;
            var noHash = full.split("#");
            var main = noHash[0].split("?");
            var pathQ = main[0];
            var pm = pathQ.match(/^([a-z][a-z0-9+.-]*:)?\/\/([^\/?#]*)/i);
            var proto = pm && pm[1] ? pm[1] : "";
            var host = pm ? pm[2].toLowerCase() : "";
            url.origin = host ? (proto || "https:") + "//" + host : "";
            url.protocol = (proto || "about:").toLowerCase();
            url.host = host;
            var hp = host.split(":");
            url.hostname = hp[0];
            url.port = hp.length > 1 ? hp[1] : "";
            var originLen = pm ? pm[0].length : 0;
            url.pathname = host ? pathQ.slice(originLen) || "/" : (pm ? "" : pathQ);
            url.search = main[1] ? "?" + main[1] : "";
            url.hash = noHash[1] ? "#" + noHash[1] : "";
            url.searchParams = {
                get: function (k) {
                    if (!url.search) return null;
                    var pairs = url.search.replace(/^\?/, "").split("&");
                    for (var i = 0; i < pairs.length; i++) {
                        var kv = pairs[i].split("=");
                        if (decodeURIComponent(kv[0]) === k) return decodeURIComponent(kv[1] || "");
                    }
                    return null;
                },
                toString: function () { return url.search.replace(/^\?/, ""); }
            };
            url.toString = function () { return full; };
            url.toJSON = function () { return full; };
            return url;
        }
        g.URL = function (input, base) {
            var src = String(input == null ? "" : input);
            if (src.indexOf("//") === 0) src = "https:" + src;
            if (src.match(/^[a-z][a-z0-9+.-]*:\/\/[^\/?#]*/i)) return makeURL(src);
            if (base) {
                var bm = String(base).match(/^([a-z][a-z0-9+.-]*:)?\/\/([^\/?#]*)(\/[^?#]*)?/i);
                if (bm) {
                    var origin = (bm[1] || "https:") + "//" + bm[2];
                    if (src.charAt(0) === "/") {
                        return makeURL(origin + src);
                    }
                    var pathPart = bm[3] || "/";
                    var dir = pathPart.charAt(pathPart.length - 1) === "/"
                        ? pathPart
                        : pathPart.substring(0, pathPart.lastIndexOf("/") + 1);
                    return makeURL(origin + dir + src);
                }
            }
            return makeURL(src);
        };
    }

    // console.error/warn/info/debug — Eclipse's console exposes only .log
    if (g.console && typeof g.console.log === "function") {
        var c = g.console;
        var forward = function () {
            var a = Array.prototype.slice.call(arguments);
            c.log.apply(c, a.length ? a : [""]);
        };
        if (typeof c.error !== "function") c.error = forward;
        if (typeof c.warn !== "function") c.warn = forward;
        if (typeof c.info !== "function") c.info = forward;
        if (typeof c.debug !== "function") c.debug = forward;
    }
})();

// NOTE: plain http on purpose — the CDN's TLS cert only covers rumanhua.com
// (mismatch on rumanhua2.com breaks strict-TLS clients), and http serves the
// same backend directly with no redirect (rumanhua.com https 301s here and
// drops the POST body).
var RUMANHUA_BASE = "http://rumanhua2.com";

// soraFetch wrapper: prefer fetchv2 (Sora runtime), fall back to fetch
// (Eclipse manga env). Normalizes the response to {status, text(), json()}.
async function soraFetch(url, options) {
    options = options || {};
    var doFetch = (typeof fetchv2 === "function") ? fetchv2 : fetch;
    var res = await doFetch(url, options.headers || {}, options.method || "GET", options.body || undefined);
    if (res && typeof res.text !== "function") {
        // Sora fetchv2 returns {status, headers, body} — wrap it.
        var body = (res.body !== undefined) ? res.body : res;
        var status = res.status || 200;
        return {
            status: status,
            text: async function () { return (typeof body === "string") ? body : JSON.stringify(body); },
            json: async function () {
                var t = (typeof body === "string") ? body : JSON.stringify(body);
                try { return JSON.parse(t); } catch (e) { return null; }
            }
        };
    }
    return res;
}

function tryParseJson(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
}

async function searchResults(keyword) {
  try {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": RUMANHUA_BASE + "/"
    };
    const postData = "k=" + encodeURIComponent(keyword);

    const response = await soraFetch(RUMANHUA_BASE + "/s", {
      method: "POST",
      headers: headers,
      body: postData
    });
    const text = await response.text();
    const json = tryParseJson(text);
    const results = [];
    if (json && json.code === "200" && Array.isArray(json.data)) {
      for (let i = 0; i < json.data.length; i++) {
        const it = json.data[i];
        if (!it || !it.id) continue;
        results.push({
          id: RUMANHUA_BASE + "/" + it.id + "/",
          imageURL: it.imgurl || "",
          title: it.name || ""
        });
      }
    }
    console.log(JSON.stringify(results));
    return results;
  } catch (e) {
    console.error("searchResults error: " + e);
    return [];
  }
}

async function extractDetails(url) {
  try {
    const response = await soraFetch(url);
    const html = await response.text();
    let description = "";
    let title = "";
    let cover = "";
    let tags = [];

    const ogDesc = html.match(/property="og:description"\s+content="([^"]*)"/) ||
                   html.match(/<meta name="description" content="([^"]*)"/);
    if (ogDesc) description = ogDesc[1].trim();
    const ogTitle = html.match(/property="og:title"\s+content="([^"]*)"/);
    if (ogTitle) title = ogTitle[1].trim();
    const ogImage = html.match(/property="og:image"\s+content="([^"]*)"/);
    if (ogImage) cover = ogImage[1].trim();
    const kw = html.match(/<meta name="keywords" content="([^"]*)"/);
    if (kw && kw[1].trim()) {
      kw[1].split(/[,，、]/).forEach(function (t) {
        const v = t.replace(/《|》|全部|章节|漫画|手机|免费|看|阅读|最新|手机/g, "").trim();
        if (v && tags.indexOf(v) === -1) tags.push(v);
      });
    }

    console.log(JSON.stringify({ description: description, title: title, cover: cover, tags: tags }));
    return { description: description, title: title, cover: cover, tags: tags };
  } catch (e) {
    console.error("extractDetails error: " + e);
    return { description: "", title: "", cover: "", tags: [] };
  }
}

function chapterNumber(title) {
  const m = String(title).match(/(\d+)\s*话/) || String(title).match(/第\s*(\d+)/) || String(title).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

async function extractChapters(url) {
  try {
    const seen = {};
    const chapters = [];

    // Detail page embeds the newest ~20 chapters in .chaplist-box
    const detailRes = await soraFetch(url);
    const html = await detailRes.text();
    const liRe = /<li><a href="(\/[^"\/]+\/[^"\/]+\.html)">([^<]+)<\/a><\/li>/g;
    let m;
    while ((m = liRe.exec(html)) !== null) {
      const href = m[1];
      if (seen[href]) continue;
      seen[href] = true;
      chapters.push({ href: href, title: m[2].trim() });
    }

    // Older chapters come from POST /morechapter?id=<mangaId>
    const idM = String(url).match(/\/([^\/]+)\/?$/) || String(url).match(/\/([^\/]+)\/\??/);
    const mangaId = idM ? idM[1] : null;
    if (mangaId) {
      const moreRes = await soraFetch(RUMANHUA_BASE + "/morechapter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": url
        },
        body: "id=" + encodeURIComponent(mangaId)
      });
      const moreText = await moreRes.text();
      const moreJson = tryParseJson(moreText);
      if (moreJson && moreJson.code === "200" && Array.isArray(moreJson.data)) {
        for (let i = 0; i < moreJson.data.length; i++) {
          const c = moreJson.data[i];
          if (!c || !c.chapterid) continue;
          const href = "/" + mangaId + "/" + c.chapterid + ".html";
          if (seen[href]) continue;
          seen[href] = true;
          chapters.push({ href: href, title: String(c.chaptername || "").trim() });
        }
      }
    }

    // Sort ascending by chapter number, then emit the Eclipse shape
    chapters.sort(function (a, b) { return chapterNumber(a.title) - chapterNumber(b.title); });

    const out = [];
    let index = 0;
    for (let i = 0; i < chapters.length; i++) {
      out.push([
        String(index),
        [
          {
            id: RUMANHUA_BASE + chapters[i].href,
            title: chapters[i].title,
            chapter: chapterNumber(chapters[i].title),
            scanlation_group: "Rumanhua"
          }
        ]
      ]);
      index++;
    }

    const result = { en: out };
    console.log(JSON.stringify({ chapterCount: out.length }));
    return result;
  } catch (e) {
    console.error("extractChapters error: " + e);
    return { en: [] };
  }
}

async function extractImages(url) {
  try {
    const response = await soraFetch(url);
    const html = await response.text();
    const images = [];
    // Reader pages embed every page as <img ... data-src="https://p6.ecombdimg.com/...">
    const imgRe = /data-src="(https?:\/\/[^"]+(?:jpe?g|png|webp|gif)[^"]*)"/g;
    let m;
    while ((m = imgRe.exec(html)) !== null) {
      const src = m[1];
      // Skip UI placeholders loaded through the same attribute
      if (src.indexOf("/static/images/") !== -1) continue;
      if (images.indexOf(src) === -1) images.push(src);
    }
    console.log(JSON.stringify({ imageCount: images.length }));
    return images;
  } catch (e) {
    console.error("extractImages error: " + e);
    return [];
  }
}
