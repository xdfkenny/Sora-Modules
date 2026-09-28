// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for mangafire.
//
// Eclipse runs reader modules in a bare JSContext. What it provides:
//   manga env: fetch(url, options) -> Promise<{status, headers, text(), json(), data}>
//   novel env: fetch(url, headers) -> Promise<text>
//              fetchv2(url, hdrs, method, body) -> Promise<{status, headers, body, text(), json()}>
//   shared:    console.log, Promise, setTimeout, btoa/atob (novel env only)
//   missing:   URL constructor, atob/btoa (manga env), console.error/warn/info/debug
//
// This prelude fills those gaps so the module below runs unchanged in
// BOTH the original app and Eclipse. Every shim is guarded — it only
// installs itself when the host has not already provided the global.
// ============================================================
(function () {
    var g = (typeof globalThis !== "undefined") ? globalThis
          : (typeof self !== "undefined") ? self
          : this;

    // atob / btoa — absent from Kanzen's manga JSContext; the novel env
    // provides its own, so the guards leave those untouched.
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

    // URL — JSC has no WHATWG URL constructor. Covers what the modules
    // need: absolute passthrough, protocol-relative, and same-base
    // relative resolution against the second argument.
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

async function searchResults(input, page = 0) { 
    function parseSearchResults(html) {
        const results = [];
        const regex = /<div class="unit item-\d+">[\s\S]*?<a href="\/manga\/([\w\-\.]+)"[^>]*class="poster"[\s\S]*?<img src="([^"]*)"[^>]*alt="([^"]*)"/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: "/manga/" + match[1].trim()
            });
        }

        return results;
    }

    try {
        const vrf = generate_vrf(input);
        const response = await soraFetch("https://mangafire.to/filter?keyword=" + encodeURIComponent(input) + "&vrf=" + vrf);
        if (!response) return [];
        const data = await response.text();
        return parseSearchResults(data);
    } catch (e) {
        return [];
    }
}

async function extractDetails(url) {
    function parseHtmlData(htmlContent) {
        const genreRegex = /<a href="\/genre\/[^"]*">([^<]+)<\/a>/g;
        const tags = [];
        let match;

        while ((match = genreRegex.exec(htmlContent)) !== null) {
            if (match[1].trim()) tags.push(match[1].trim());
        }

        const ogDescriptionRegex = /<meta property="og:description" content=['"]([^'"]*)['"]/i;
        const ogMatch = htmlContent.match(ogDescriptionRegex);
        let description = ogMatch ? ogMatch[1] : "";

        description = description
            .replace(/(&quot;)/g, '"')
            .replace(/(&amp;)/g, '&')
            .replace(/(&lt;)/g, '<')
            .replace(/(&gt;)/g, '>')
            .replace(/\s+/g, ' ')
            .trim();

        return [{
            description: description || "No description available",
            aliases: "N/A",
            airdate: "N/A"
        }];
    }

    try {
        const fullUrl = url.startsWith('http') ? url : `https://mangafire.to${url}`;
        const response = await soraFetch(fullUrl);
        if (!response) return [{ description: "N/A", aliases: "N/A", airdate: "N/A" }];
        const data = await response.text();
        return parseHtmlData(data);
    } catch (e) {
        return [{ description: "Error", aliases: "Error", airdate: "Error" }];
    }
}

async function extractChapters(url) {
    const mangaIdMatch = url.match(/\.([a-z0-9]+)$/);
    const mangaId = mangaIdMatch ? mangaIdMatch[1] : null;

    if (!mangaId) return [];

    const vrf = generate_vrf(`${mangaId}@chapter@en`);

    function parseChapters(htmlContent) {
        const chapters = [];
        const chapterRegex = /<a href="\/read\/[^"]+\/([^/]+)\/chapter-[^"]*" data-number="([^"]+)" data-id="([^"]+)"[^>]*>(.*?)<\/a>/gs;
        let match;
        const seen = new Set();
        while ((match = chapterRegex.exec(htmlContent)) !== null) {
            const chapterNumber = parseFloat(match[2]) || chapters.length + 1;
            const chapterId = match[3];
            const title = match[4].replace(/<[^>]*>/g, '').trim();

            if (!seen.has(chapterId)) {
                seen.add(chapterId);
                chapters.push({
                    href: chapterId,
                    number: chapterNumber,
                    title: title || `Chapter ${chapterNumber}`
                });
            }
        }

        return chapters.reverse();
    }

    try {
        const response = await soraFetch(`https://mangafire.to/ajax/read/${mangaId}/chapter/en?vrf=${vrf}`);
        if (!response) return [];
        const data = await response.json();

        if (data.status === 200 && data.result && data.result.html) {
            return parseChapters(data.result.html);
        }
        return [];
    } catch (error) {
        return [];
    }
}

async function extractImages(ID) {
    const vrf = generate_vrf(`chapter@${ID}`);
    try {
        const response = await soraFetch(`https://mangafire.to/ajax/read/chapter/${ID}?vrf=${vrf}`);
        if (!response) return [];
        const data = await response.json();

        if (data.status === 200 && data.result && data.result.images) {
            return data.result.images.map(img => img[0]);
        }
        return [];
    } catch (error) {
        return [];
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            const res = await fetch(url, options);
            return { text: () => res.text(), json: () => res.json() };
        } catch (error) {
            return null;
        }
    }
}

function b64encode(data) {
    const keystr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    function atobLookup(chr) {
      const index = keystr.indexOf(chr);
      return index < 0 ? undefined : index;
    }
    data = `${data}`;
    data = data.replace(/[ \t\n\f\r]/g, "");
    if (data.length % 4 === 0) {
      data = data.replace(/==?$/, "");
    }
    if (data.length % 4 === 1 || /[^+/0-9A-Za-z]/.test(data)) {
      return null;
    }
    let output = "";
    let buffer = 0;
    let accumulatedBits = 0;
    for (let i = 0; i < data.length; i++) {
      buffer <<= 6;
      buffer |= atobLookup(data[i]);
      accumulatedBits += 6;
      if (accumulatedBits === 24) {
        output += String.fromCharCode((buffer & 0xff0000) >> 16);
        output += String.fromCharCode((buffer & 0xff00) >> 8);
        output += String.fromCharCode(buffer & 0xff);
        buffer = accumulatedBits = 0;
      }
    }
    if (accumulatedBits === 12) {
      buffer >>= 4;
      output += String.fromCharCode(buffer);
    } else if (accumulatedBits === 18) {
      buffer >>= 2;
      output += String.fromCharCode((buffer & 0xff00) >> 8);
      output += String.fromCharCode(buffer & 0xff);
    }
    return output;
  }

function b64decode(s) {
    const keystr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    function btoaLookup(index) {
      if (index >= 0 && index < 64) {
        return keystr[index];
      }
      return undefined;
    }
    let i;
    s = `${s}`;
    for (i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) > 255) {
        return null;
      }
    }
    let out = "";
    for (i = 0; i < s.length; i += 3) {
      const groupsOfSix = [undefined, undefined, undefined, undefined];
      groupsOfSix[0] = s.charCodeAt(i) >> 2;
      groupsOfSix[1] = (s.charCodeAt(i) & 0x03) << 4;
      if (s.length > i + 1) {
        groupsOfSix[1] |= s.charCodeAt(i + 1) >> 4;
        groupsOfSix[2] = (s.charCodeAt(i + 1) & 0x0f) << 2;
      }
      if (s.length > i + 2) {
        groupsOfSix[2] |= s.charCodeAt(i + 2) >> 6;
        groupsOfSix[3] = s.charCodeAt(i + 2) & 0x3f;
      }
      for (let j = 0; j < groupsOfSix.length; j++) {
        if (typeof groupsOfSix[j] === "undefined") {
          out += "=";
        } else {
          out += btoaLookup(groupsOfSix[j]);
        }
      }
    }
    return out;
  }

const toBytes = (str) => Array.from(str, (c) => c.charCodeAt(0) & 0xff);
const fromBytes = (bytes) => bytes.map((b) => String.fromCharCode(b & 0xff)).join("");

function rc4Bytes(key, input) {
    const s = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key.charCodeAt(i % key.length)) & 0xff;
      [s[i], s[j]] = [s[j], s[i]];
    }
    const out = new Array(input.length);
    let i = 0;
    j = 0;
    for (let y = 0; y < input.length; y++) {
      i = (i + 1) & 0xff;
      j = (j + s[i]) & 0xff;
      [s[i], s[j]] = [s[j], s[i]];
      const k = s[(s[i] + s[j]) & 0xff];
      out[y] = (input[y] ^ k) & 0xff;
    }
    return out;
  }

function transform(input, initSeedBytes, prefixKeyBytes, prefixLen, schedule) {
    const out = [];
    for (let i = 0; i < input.length; i++) {
      if (i < prefixLen) out.push(prefixKeyBytes[i]);
      out.push(
        schedule[i % 10]((input[i] ^ initSeedBytes[i % 32]) & 0xff) & 0xff
      );
    }
    return out;
  }

const add8 = (n) => (c) => (c + n) & 0xff;
const sub8 = (n) => (c) => (c - n + 256) & 0xff;
const xor8 = (n) => (c) => (c ^ n) & 0xff;
const rotl8 = (n) => (c) => ((c << n) | (c >>> (8 - n))) & 0xff;
function base64UrlEncodeBytes(bytes) {
  const std = b64decode(fromBytes(bytes));
  return std.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytesFromBase64(b64) {
  return toBytes(b64encode(b64));
}
const rotr8 = (n) => (c) => ((c >>> n) | (c << (8 - n))) & 0xff;

function generate_vrf(input) {
  const schedule0 = [ sub8(223), rotr8(4), rotr8(4), add8(234), rotr8(7), rotr8(2), rotr8(7), sub8(223), rotr8(7), rotr8(6) ];
  const schedule1 = [ add8(19), rotr8(7), add8(19), rotr8(6), add8(19), rotr8(1), add8(19), rotr8(6), rotr8(7), rotr8(4) ];
  const schedule2 = [ sub8(223), rotr8(1), add8(19), sub8(223), rotl8(2), sub8(223), add8(19), rotl8(1), rotl8(2), rotl8(1) ];
  const schedule3 = [ add8(19), rotl8(1), rotl8(1), rotr8(1), add8(234), rotl8(1), sub8(223), rotl8(6), rotl8(4), rotl8(1) ];
  const schedule4 = [ rotr8(1), rotl8(1), rotl8(6), rotr8(1), rotl8(2), rotr8(4), rotl8(1), rotl8(1), sub8(223), rotl8(2) ];
  const CONST = {
    "rc4Keys": [
      "FgxyJUQDPUGSzwbAq/ToWn4/e8jYzvabE+dLMb1XU1o=",
      "CQx3CLwswJAnM1VxOqX+y+f3eUns03ulxv8Z+0gUyik=",
      "fAS+otFLkKsKAJzu3yU+rGOlbbFVq+u+LaS6+s1eCJs=",
      "Oy45fQVK9kq9019+VysXVlz1F9S1YwYKgXyzGlZrijo=",
      "aoDIdXezm2l3HrcnQdkPJTDT8+W6mcl2/02ewBHfPzg=",
    ],
    "seeds32": [
      "yH6MXnMEcDVWO/9a6P9W92BAh1eRLVFxFlWTHUqQ474=",
      "RK7y4dZ0azs9Uqz+bbFB46Bx2K9EHg74ndxknY9uknA=",
      "rqr9HeTQOg8TlFiIGZpJaxcvAaKHwMwrkqojJCpcvoc=",
      "/4GPpmZXYpn5RpkP7FC/dt8SXz7W30nUZTe8wb+3xmU=",
      "wsSGSBXKWA9q1oDJpjtJddVxH+evCfL5SO9HZnUDFU8=",
    ],
    "prefixKeys": [
      "l9PavRg=",
      "Ml2v7ag1Jg==",
      "i/Va0UxrbMo=",
      "WFjKAHGEkQM=",
      "5Rr27rWd",
    ],
  };

  let bytes = toBytes(encodeURIComponent(input));
  bytes = rc4Bytes(b64encode(CONST.rc4Keys[0]), bytes);
  const prefixKey0 = bytesFromBase64(CONST.prefixKeys[0]);
  bytes = transform(bytes, bytesFromBase64(CONST.seeds32[0]), prefixKey0, prefixKey0.length, schedule0);
  bytes = rc4Bytes(b64encode(CONST.rc4Keys[1]), bytes);
  const prefixKey1 = bytesFromBase64(CONST.prefixKeys[1]);
  bytes = transform(bytes, bytesFromBase64(CONST.seeds32[1]), prefixKey1, prefixKey1.length, schedule1);
  bytes = rc4Bytes(b64encode(CONST.rc4Keys[2]), bytes);
  const prefixKey2 = bytesFromBase64(CONST.prefixKeys[2]);
  bytes = transform(bytes, bytesFromBase64(CONST.seeds32[2]), prefixKey2, prefixKey2.length, schedule2);
  bytes = rc4Bytes(b64encode(CONST.rc4Keys[3]), bytes);
  const prefixKey3 = bytesFromBase64(CONST.prefixKeys[3]);
  bytes = transform(bytes, bytesFromBase64(CONST.seeds32[3]), prefixKey3, prefixKey3.length, schedule3);
  bytes = rc4Bytes(b64encode(CONST.rc4Keys[4]), bytes);
  const prefixKey4 = bytesFromBase64(CONST.prefixKeys[4]);
  bytes = transform(bytes, bytesFromBase64(CONST.seeds32[4]), prefixKey4, prefixKey4.length, schedule4);

  return base64UrlEncodeBytes(bytes);
}