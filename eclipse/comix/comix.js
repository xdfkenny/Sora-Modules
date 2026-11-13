// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for comix.
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

// comix.to module (comics/manga) for kanzen / Luna / Eclipse (mangas)
//
// 2026-11-12 rebuild: comix.to rotated its anti-scrape SDK again. The old
// chained S-box ciphers (S1/D1/SEED1-3) are gone from the live secure chunk
// (secure-tof80u-CTFbyz_B.js + apicore-tof80u-DYM-rV8E.js, both VM-obfuscated
// string-array builds). The new scheme, extracted by running the live chunks
// in a sandbox (.tmp-audit/wf-vmrun/) and verified byte-exact against the
// live API:
//
//   token `_` = "bm6." + base64( SHA256customIV(key[32:64],
//                 SHA256customIV(key[0:64], utf8(canonical)) ) ).slice(0, 16)
//
// where SHA256customIV is the standard SHA-256 compression (Kj in the chunk
// is textbook FIPS 180-4) but seeded from 8 big-endian words read out of the
// static 1088-byte key table instead of the standard IV, and the length field
// counts blockSize(64) + message length. canonical = normalized path (origin
// and /api/v1 stripped, no query) + '?' + sorted bracket-notation params (the
// '_' param itself excluded, values unencoded).
//
// Responses of detail/chapter/image endpoints come back encrypted as
// {"e": base64}. Decryption mirrors the chunk's Yj(): base64 bytes decode
// into a buffer at offset 2, a 1024-byte table = key[64:1088] rotated by
// (b[2]<<8|b[3]) % 1024 XORs every 32-bit word from word 1 onward (plus a
// byte tail past the last full word), and the plaintext JSON starts at byte
// 4. The rotation-header bytes (word 0) stay intact.
//
// The signing whitelist on the server also rejects chapter-list requests
// with limit > 20, so chapters are paginated at 20.
//
// Multi-host fallback (comix.to -> comix.ws) and full browser-grade headers
// kept from the previous build.

const BASE_URL = 'https://comix.to';

// Hosts tried in order by apiGet() — first valid JSON response wins.
const API_HOSTS = [
    'https://comix.to',
    'https://comix.ws',
];

// Static signing key extracted from the live apicore chunk (2026-11-12).
// key[0:64]    = first SHA-256 custom IV, key[32:64] = second IV,
// key[64:1088] = 1024-byte rotation table for response decryption.
const TOKEN_PREFIX = 'bm6';
const KEY_B64 = 'Y+n6YcUT2XaTWxfXtgLXt9MUDrClZpw3wKiF3TMGJQODHMKLe+y4c79BmCjEpWwUkCifNTpFLdRzYoAn2yffag7b/ZG/4a30hSs3CiYNwmcZIjyyCe+IWBXah6cUUaqvn008EFQUqrgSf9hv0hO+IONJHimmDDR3W1deLQjZTZDqXNF9o3PBs/mNN0lEg3ZPd1uhfxRDLeYTjfHwL0hNz2stkh9vlWv9Qnnd5YqnY4tSbISMBRGBXFzEzKUlmb6kmfhZ8AEBWmOka6OlM/Ocytn/pwnhBPY9n4NTihxWMwBxG/14DHZ5YcCDLCheciIMnPvvzhPPaEJarBnw9d5wKi3MtGLhqoVUGV54ZJnLWMvlIGp3mhsmjadp42FR8zz/HwLUgw6qSiymtKVU5ULgsJO6tNhtRNkMprdkuBWTiFCe7JlXm1Z13Yi6ExFZczEsl0y8HYQULauRHT7iO9ZcAjnER8EdJFp3Ni//Sx0LOmw6ucpp/jxjIAos0FkJq++DYcYMmZ37knD5TRAhkKiBxYes2BNSncWlfir428ZnKH/kPN7pTTx/U9D9vn5/RmKuE7CDQlf7iJDauLs8B+DPDTpxlTbweLXpXeDsrB/MZJ8B2tO+wNDd+pEZVQ1qY50Nhzm8BwH7Rxw0AdxoqA4lVokdYRhMvSsjjMFT8/OF3jkirMHGyx/YwnTLIuetA1ObRNKFjnpM+b0SqBOVqVWfw8XFFqMun29c96q2gJk22co4yd23ILNzBX930BXaNDOw8fgi4Gy6Mj/pprRaCbLsmUWbdhbs/j9u3ddupIPUCiDBWuLJUXmLbafzOLUKwb4zhEnnn89fK9/GSK9YbkdypuM0BA1vanUqh/4ak7kEbHCeGsaZKu+++8/M+T8vuVyL5LXlyBDcRx2/8mja1C8b84702qLG+Kxhr+6zKaFwX6xQYeHGzpH+ELlxIznUmZC+7ua3uR9J+WEh8FOSFj5NpHSq0lV8FhDMO6cEQPFoRP+03UpBxuargfwjZpzA2zG+ds77pAGEHek7UPYGkPB5CwIzI9xMZaXgHPesfgj9/kR0eZwCaP32RsY7/4laYY3QkBXgoF3d9VXauhv4gL+qWxre4hBsmPyLMdU27N06sVXu+WtFgApTGjwfQZ5NJEIhJ4Gvjw0N0t6Ia649KhMepTBHbPLB/9XxDMA0wtdcETznRo4aCFgEOw79S8g+DHS9614s002wQVkUO6mtciMzlJ4ka6ADOIYScBgYfq49N2N8vOHVrORdV5ZqJ5e1MIo+Q8Thfd1sY7AOTqUR3oI14u77r+01VmBTFVPUJvKqyBviBS6yN0zM1+9CC/uv3T5Kejz6TnrrxuhmRw6BwgQbrs4Qhqbnng2DiiUq1fRwyDjZXF47NjTTtThQOVboo+LFX7wTPi0V8ZnQK5IJdyiRCLQL5COUhocbVec81ItLt1w=';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(b64) {
    const s = String(b64).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
    const out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
        const v = B64_CHARS.indexOf(s[i]);
        if (v < 0) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buf >>> bits) & 0xff);
            buf = buf & ((1 << bits) - 1);
        }
    }
    return new Uint8Array(out);
}

function utf8Encode(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const c2 = str.charCodeAt(i + 1);
            if (c2 >= 0xdc00 && c2 <= 0xdfff) {
                const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
                out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
                i++;
            } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
}

// ---- SHA-256 with a custom 8-word IV (the chunk's Lj/Mj/Kj) ----------------

const SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

function sha256CustomIV(ivWords, msg) {
    const H = new Uint32Array(ivWords);
    const len = msg.length;
    let padded = len + 1;
    while (padded % 64 !== 56) padded++;
    const buf = new Uint8Array(padded + 8);
    buf.set(msg);
    buf[len] = 128;
    // NOTE: the site's length field counts blockSize(64) + message length.
    const bits = 8 * (64 + len);
    const hi = Math.floor(bits / 4294967296);
    const lo = bits >>> 0;
    const o = buf.length - 8;
    buf[o] = (hi >>> 24) & 255; buf[o + 1] = (hi >>> 16) & 255; buf[o + 2] = (hi >>> 8) & 255; buf[o + 3] = hi & 255;
    buf[o + 4] = (lo >>> 24) & 255; buf[o + 5] = (lo >>> 16) & 255; buf[o + 6] = (lo >>> 8) & 255; buf[o + 7] = lo & 255;
    const W = new Uint32Array(64);
    for (let b = 0; b < buf.length; b += 64) {
        for (let c = 0; c < 16; c++) {
            const t = b + 4 * c;
            W[c] = ((buf[t] << 24) | (buf[t + 1] << 16) | (buf[t + 2] << 8) | buf[t + 3]) >>> 0;
        }
        for (let a = 16; a < 64; a++) {
            const q = W[a - 15], F = rotr32(q, 7) ^ rotr32(q, 18) ^ (q >>> 3);
            const p = W[a - 2], G = rotr32(p, 17) ^ rotr32(p, 19) ^ (p >>> 10);
            W[a] = (W[a - 16] + F + W[a - 7] + G) | 0;
        }
        let a = H[0], b2 = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (let i = 0; i < 64; i++) {
            const t1 = (h + (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + W[i]) | 0;
            const t2 = ((rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b2) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    const out = new Uint8Array(32);
    for (let t = 0; t < 8; t++) {
        out[4 * t] = (H[t] >>> 24) & 255; out[4 * t + 1] = (H[t] >>> 16) & 255;
        out[4 * t + 2] = (H[t] >>> 8) & 255; out[4 * t + 3] = H[t] & 255;
    }
    return out;
}

// Mj: read 8 big-endian words out of the key bytes at offset.
function keyIV(offset) {
    const k = b64ToBytes(KEY_B64);
    const w = new Uint32Array(8);
    for (let x = 0; x < 8; x++) {
        const d = offset + 4 * x;
        w[x] = ((k[d] << 24) | (k[d + 1] << 16) | (k[d + 2] << 8) | k[d + 3]) >>> 0;
    }
    return w;
}

function b64Chars(bytes) {
    let out = '';
    const len = bytes.length;
    for (let i = 0; i + 3 <= len; i += 3) {
        const t = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += B64_CHARS[(t >> 18) & 63] + B64_CHARS[(t >> 12) & 63] + B64_CHARS[(t >> 6) & 63] + B64_CHARS[t & 63];
    }
    const rem = len % 3;
    if (rem === 1) {
        out += B64_CHARS[(bytes[len - 1] >> 2) & 63] + B64_CHARS[(bytes[len - 1] << 4) & 63] + '==';
    } else if (rem === 2) {
        const t = (bytes[len - 2] << 8) | bytes[len - 1];
        out += B64_CHARS[(t >> 10) & 63] + B64_CHARS[(t >> 4) & 63] + B64_CHARS[(t << 2) & 63] + '=';
    }
    return out;
}

// Xj: token = PREFIX + "." + base64(H2(H1(msg))).slice(0, 16)
function generateToken(url, params) {
    const canonical = (() => {
        const q = buildQuery(params);
        return q ? normalizeUrl(url) + '?' + q : normalizeUrl(url);
    })();
    const inner = sha256CustomIV(keyIV(0), utf8Encode(canonical));
    const outer = sha256CustomIV(keyIV(32), inner);
    // The site URL-safes the signature alphabet (+ -> -, / -> _).
    return TOKEN_PREFIX + '.' + b64Chars(outer).slice(0, 16).replace(/\+/g, '-').replace(/\//g, '_');
}

// ---- response decryption (the chunk's Yj) -----------------------------------

// base64-decodes into a buffer starting at byte offset 2 (the site's decoder
// leaves bytes 0-1 as zero; word indices therefore shift by half a word).
function b64DecodeOff2(str) {
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const quads = [];
    for (let i = 0; i < s.length; i++) {
        const v = B64_CHARS.indexOf(s[i]);
        if (v >= 0) quads.push(v);
    }
    const size = 9 + (3 * quads.length >> 2) & -4;
    const data = new Uint8Array(size);
    let idx = 2, buf = 0, bits = 0;
    for (let n = 0; n < quads.length; n++) {
        buf = (buf << 6) | quads[n];
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            data[idx++] = (buf >>> bits) & 255;
        }
    }
    return { data: data, length: idx };
}

function decryptBody(e) {
    const dec = b64DecodeOff2(e);
    const bytes = dec.data;
    const len = dec.length;
    if (len < 4) throw new Error('encrypted body too short');
    const rot = ((((bytes[2] << 8) | bytes[3]) % 1024) + 1024) % 1024;
    const table = b64ToBytes(KEY_B64).slice(64, 1088);
    const rotated = new Uint8Array(1024);
    rotated.set(table.slice(rot), 0);
    rotated.set(table.slice(0, rot), 1024 - rot);
    const words = new Uint32Array(bytes.buffer, 0, bytes.buffer.byteLength >> 2);
    const tableWords = new Uint32Array(rotated.buffer, 0, 256);
    const q = len >> 2;
    for (let o = 1; o < q; o++) words[o] = (words[o] ^ tableWords[(o - 1) % 256]) >>> 0;
    for (let c = (q << 2); c < len; c++) bytes[c] = (bytes[c] ^ rotated[(c - 4) % 1024]) & 255;
    let txt = '';
    for (let i = 4; i < len; i++) txt += String.fromCharCode(bytes[i]);
    return JSON.parse(txt);
}

// ---- request plumbing --------------------------------------------------------

// mirror of the site's url normalizer (ml): strip origin, query and /api/v1
function normalizeUrl(url) {
    return url
        .replace(/^https?:\/\/[^/]+/, '')
        .split('?')[0]
        .replace(/^\/api\/v1/, '');
}

// mirror of the site's params serializer: sorted keys, bracket notation,
// values NOT url-encoded (the server signs the decoded form).
function buildQuery(params) {
    const parts = [];
    function rec(prefix, value) {
        if (value == null) return;
        if (Array.isArray(value)) {
            value.forEach(function (item, i) { rec(prefix + '[' + i + ']', item); });
        } else if (typeof value !== 'object') {
            parts.push(prefix + '=' + String(value));
        } else {
            Object.keys(value).sort().forEach(function (k) { rec(prefix ? prefix + '[' + k + ']' : k, value[k]); });
        }
    }
    Object.keys(params).sort().forEach(function (k) { if (k !== '_') rec(k, params[k]); });
    return parts.join('&');
}

// Full browser-grade header set.
const API_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Referer': BASE_URL + '/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

async function soraFetch(url, options) {
    options = options || { headers: {}, method: 'GET', body: null };
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}

function classifyFailure(text) {
    const t = String(text || '');
    if (/Just a moment/i.test(t) || /_cf_chl|cf-browser-verification|challenges\.cloudflare\.com/.test(t)) {
        return 'cloudflare challenge (IP/TLS flagged; app network stack usually passes)';
    }
    if (/Bad gateway/i.test(t)) return 'origin down (502)';
    if (/Service unavailable/i.test(t)) return 'origin unavailable (503)';
    if (/^\s*</.test(t)) return 'html response';
    return 'non-json response';
}

async function apiGet(path, params) {
    params = params || {};
    const q = buildQuery(params);
    const suffix = q ? '?' + q + '&_=' : '?_=';
    let lastError = 'no hosts attempted';
    for (let i = 0; i < API_HOSTS.length; i++) {
        const host = API_HOSTS[i];
        let url;
        try {
            url = host + '/api/v1' + path + suffix + generateToken(path, params);
        } catch (tokErr) {
            lastError = 'token generation failed: ' + tokErr;
            console.log('comix apiGet token error: ' + tokErr);
            continue;
        }
        let resp = null;
        try {
            resp = await soraFetch(url, { headers: API_HEADERS });
        } catch (e) {
            lastError = host + ' threw: ' + e;
            console.log('comix apiGet ' + host + ' threw: ' + e);
            continue;
        }
        if (!resp) {
            lastError = host + ': no response';
            console.log('comix apiGet ' + host + ': no response');
            continue;
        }
        const text = await resp.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            lastError = host + ': ' + classifyFailure(text);
            console.log('comix apiGet ' + host + ' failed: ' + lastError + ' | status=' + (resp.status || '?') + ' body=' + String(text).replace(/\s+/g, ' ').slice(0, 80));
            continue;
        }
        if (data && typeof data === 'object' && typeof data.e === 'string') {
            data = decryptBody(data.e);
        }
        if (!data || data.status !== 'ok') throw new Error('api error: ' + JSON.stringify(data).slice(0, 200));
        return data.result;
    }
    throw new Error(lastError);
}

function cleanText(s) {
    if (!s) return 'N/A';
    return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hidFromInput(idOrUrl) {
    const s = String(idOrUrl || '');
    const m = s.match(/comix\.(?:to|ws)\/title\/([^/?#]+)/);
    if (m && m[1]) return m[1].split('-')[0];
    const bare = s.match(/^([A-Za-z0-9]+)$/);
    return bare ? bare[1] : null;
}

async function searchResults(keyword, page) {
    try {
        const result = await apiGet('/manga', {
            order: { chapter_updated_at: 'desc' },
            page: 1, limit: 28,
            content_rating: ['safe', 'suggestive'],
            keyword: keyword,
        });
        return (result.items || []).map(function (it) {
            return {
                id: 'https://comix.to' + (it.url || ('/title/' + it.hid)),
                title: it.title || '',
                imageURL: (it.poster && (it.poster.large || it.poster.medium)) || '',
            };
        });
    } catch (e) {
        console.log('comix searchResults error: ' + (e && e.message));
        return [];
    }
}

async function extractDetails(idOrUrl) {
    try {
        const hid = hidFromInput(idOrUrl);
        if (!hid) return { description: 'N/A', tags: [] };
        const m = await apiGet('/manga/' + hid, {});
        let tags = (m.genres || []).map(function (g) { return cleanText(typeof g === 'string' ? g : (g.name || g.title || '')); }).filter(Boolean);
        if (!tags.length && Array.isArray(m.altTitles)) {
            tags = m.altTitles.slice(0, 8).map(function (t) { return cleanText(typeof t === 'string' ? t : (t.name || t.title || '')); }).filter(Boolean);
        }
        return {
            description: cleanText(m.synopsis || m.synopsisHtml) || 'N/A',
            tags: tags,
        };
    } catch (e) {
        console.log('comix extractDetails error: ' + (e && e.message));
        return { description: 'Error extracting details', tags: [] };
    }
}

async function extractChapters(idOrUrl) {
    try {
        const hid = hidFromInput(idOrUrl);
        if (!hid) throw new Error('no hid in ' + idOrUrl);
        const chapters = [];
        // The server rejects chapter-list signatures with limit > 20.
        for (let page = 1; page <= 100; page++) {
            const result = await apiGet('/manga/' + hid + '/chapters', {
                page: page, limit: 20, order: { number: 'desc' },
            });
            const items = result.items || [];
            items.forEach(function (it) {
                const lang = (it.language || 'en').toUpperCase();
                chapters.push({
                    id: 'https://comix.to' + it.url,
                    title: 'Ch.' + it.number + (it.name ? ' - ' + it.name : '') + ' [' + lang + ']' + (it.group ? ' @' + it.group.name : ''),
                    chapter: it.number,
                    scanlation_group: (it.group && it.group.name) || '',
                });
            });
            if (!result.meta || !result.meta.hasNext) break;
        }
        chapters.sort(function (a, b) { return a.chapter - b.chapter; });
        return { en: chapters.map(function (ch) { return [String(ch.chapter), [ch]]; }) };
    } catch (e) {
        console.log('comix extractChapters error: ' + (e && e.message));
        return { en: [] };
    }
}

async function extractImages(chapterId) {
    try {
        const id = (String(chapterId).match(/\/title\/[^/]+\/(\d+)-chapter/) || [])[1];
        if (!id) throw new Error('no chapter id in ' + chapterId);
        const m = await apiGet('/chapters/' + id, {});
        const pages = (m.pages && m.pages.items) || [];
        return pages.map(function (p) { return p.url; }).filter(Boolean);
    } catch (e) {
        console.log('comix extractImages error: ' + (e && e.message));
        return [];
    }
}

// Compatibility aliases: Luna builds before the 2026-06-28 "Renamed function"
// commit (88e1a8da) call the old names (searchContent/getContentData/
// getChapters/getChapterImages); current builds call the names above.
async function searchContent(input, page) { return searchResults(input, page); }
async function getContentData(input) { return extractDetails(input); }
async function getChapters(input) { return extractChapters(input); }
async function getChapterImages(input) { return extractImages(input); }
