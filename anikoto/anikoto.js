// ══════════════════════════════════════════════════════════════════════
// Anikoto — anikototv.to
//
// 2026-10-22 rewrite: the upstream left animepahetv.to and its viewApi /
// get-servers endpoints behind. The live site is anikototv.to with an
// ajax API (episode list / server list / server resolve), and its only
// embed family is megaplay.buzz (+ vidwish.live / vidtube.site variants).
//
// megaplay getSources (player v2.8+) answers an `enc` blob instead of a
// plaintext sources.file: base64url, AES-256-CBC, key/IV fixed in the
// site's newclient.min.js. The decrypted master.m3u8 is additionally
// gated by a signed token: payload = "<unix_expiry>|<hash1>/<hash2>"
// (the two 32-hex path segments), HMAC-SHA256 with the player's key,
// TTL ~90s. Only the master playlist is tokenized; variants and
// segments are fetched untokenized. The CDN (megap.shiora.top /
// fetch.nexabloom.top) also 403s requests without a browser-ish
// User-Agent + Referer: https://megaplay.buzz/ — those headers ride on
// every stream/subtitle object we emit.
//
// Verified live 2026-10-22 against One Piece ep 1: all six server lanes
// (sub/dub × HD-1/Vidstream-1/Vidstream-2) decrypt, sign and serve the
// master playlist with 200.
// ══════════════════════════════════════════════════════════════════════

const ANIKOTO_BASE = "https://anikototv.to";
const MEGAPLAY = "https://megaplay.buzz";
const VIDWISH = "https://vidwish.live";
const VIDTUBE = "https://vidtube.site";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const _MP_AES_KEY = "i?LMTAx0Q6,:}50U";
const _MP_AES_IV = "W0;27ToaUpl_P%'c";
const _MP_HMAC_KEY = "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
const _MP_TOKEN_TTL = 90;

// ─── byte / string helpers (JavaScriptCore-safe: no TextEncoder, no atob) ───
function _utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
        else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const c2 = str.charCodeAt(i + 1);
            c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++;
            out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    }
    return out;
}

const _B64C = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToB64url(b) {
    let s = "";
    for (let i = 0; i < b.length; i += 3) {
        const b0 = b[i], b1 = b[i + 1], b2 = b[i + 2];
        s += _B64C.charAt(b0 >> 2);
        s += _B64C.charAt(((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4));
        s += (b1 === undefined) ? "" : _B64C.charAt(((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6));
        s += (b2 === undefined) ? "" : _B64C.charAt(b2 & 63);
    }
    return s.replace(/\+/g, "-").replace(/\//g, "_");
}

// ─── SHA-256 / HMAC-SHA-256 (pure JS, for the megaplay CDN token) ───
const _K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function _sha256Bytes(msg) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = msg.length, bitLenHi = Math.floor(l / 536870912), bitLenLo = (l * 8) >>> 0;
    const padded = msg.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    padded.push((bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255, (bitLenHi >>> 8) & 255, bitLenHi & 255);
    padded.push((bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255, (bitLenLo >>> 8) & 255, bitLenLo & 255);

    const w = new Array(64);
    for (let off = 0; off < padded.length; off += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = ((padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16) |
                    (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15], b = w[i - 2];
            const s0 = (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) >>> 0;
            const s1 = (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)) >>> 0;
            w[i] = (((w[i - 16] + s0) >>> 0) + ((w[i - 7] + s1) >>> 0)) >>> 0;
        }
        let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (let i = 0; i < 64; i++) {
            const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const t1 = (((((h + S1) >>> 0) + ch) >>> 0) + ((_K256[i] + w[i]) >>> 0)) >>> 0;
            const S0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
            const mj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const t2 = ((S0 + mj) >>> 0);
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = [];
    for (let i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
    return out;
}

function _hmacSha256(keyBytes, msgBytes) {
    let k = keyBytes.slice();
    if (k.length > 64) k = _sha256Bytes(k);
    while (k.length < 64) k.push(0);
    const ipad = new Array(64), opad = new Array(64);
    for (let i = 0; i < 64; i++) { ipad[i] = k[i] ^ 0x36; opad[i] = k[i] ^ 0x5c; }
    const inner = _sha256Bytes(ipad.concat(msgBytes));
    return _sha256Bytes(opad.concat(inner));
}

// Append the signed CDN token. A URL that already carries one, or that has
// no 32-hex pair to sign, is returned untouched — same as the player.
function _mpSignUrl(url) {
    try {
        if (!url || /[?&]token=/.test(url)) return url;
        const m = String(url).match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i);
        if (!m) return url;
        const expiry = Math.floor(Date.now() / 1000) + _MP_TOKEN_TTL;
        const payload = expiry + "|" + m[1].toLowerCase() + "/" + m[2].toLowerCase();
        const pb = _utf8Bytes(payload);
        const token = bytesToB64url(pb) + "." + bytesToB64url(_hmacSha256(_utf8Bytes(_MP_HMAC_KEY), pb));
        return url + (url.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(token);
    } catch (e) {
        console.log("[Anikoto] token mint failed: " + e);
        return url;
    }
}

// ─── AES-256-CBC decryptor (same implementation the 123anime megaplay
// chain uses — verified byte-exact against live megaplay payloads) ───
const _A256 = (function () {
    const sbox = [], invSbox = [], rcon = [0x01];
    (function init() {
        const log = new Uint8Array(256), alog = new Uint8Array(256);
        let a = 1;
        for (let i = 0; i < 255; i++) {
            alog[i] = a; log[a] = i;
            a ^= (a << 1) ^ ((a & 0x80) ? 0x11b : 0); a &= 0xff;
        }
        for (let i = 0; i < 256; i++) {
            let s = i === 0 ? 0 : alog[(255 - log[i]) % 255], xf = s;
            for (let k = 0; k < 4; k++) { xf = ((xf << 1) | (xf >> 7)) & 0xff; s ^= xf; }
            s ^= 0x63;
            sbox[i] = s; invSbox[s] = i;
        }
        for (let i = 1; i < 14; i++) {
            rcon[i] = (rcon[i - 1] << 1) ^ ((rcon[i - 1] & 0x80) ? 0x11b : 0);
            rcon[i] &= 0xff;
        }
    })();

    function expandKey(key) { // key: 32 bytes -> 60 words
        const w = new Array(60);
        for (let i = 0; i < 8; i++)
            w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
        for (let i = 8; i < 60; i++) {
            let t = w[i - 1].slice();
            if (i % 8 === 0) {
                t = [t[1], t[2], t[3], t[0]].map(b => sbox[b]);
                t[0] ^= rcon[i / 8 - 1];
            } else if (i % 8 === 4) {
                t = t.map(b => sbox[b]);
            }
            w[i] = w[i - 8].map((b, j) => b ^ t[j]);
        }
        return w;
    }

    function mul(a, b) {
        let r = 0;
        for (let i = 0; i < 8; i++) {
            if (b & 1) r ^= a;
            const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b;
            b >>= 1;
        }
        return r & 0xff;
    }

    function decryptBlock(inp, w) {
        const s = [[], [], [], []];
        for (let i = 0; i < 16; i++) s[i % 4][(i / 4) | 0] = inp[i];
        const addRound = (rnd) => {
            for (let c = 0; c < 4; c++)
                for (let r = 0; r < 4; r++)
                    s[r][c] ^= w[rnd * 4 + c][r];
        };
        const invSub = () => {
            for (let r = 0; r < 4; r++)
                for (let c = 0; c < 4; c++) s[r][c] = invSbox[s[r][c]];
        };
        const invShift = () => {
            for (let r = 1; r < 4; r++) {
                const row = s[r].slice();
                for (let c = 0; c < 4; c++) s[r][c] = row[(c - r + 4) % 4];
            }
        };
        const invMix = () => {
            for (let c = 0; c < 4; c++) {
                const a0 = s[0][c], a1 = s[1][c], a2 = s[2][c], a3 = s[3][c];
                s[0][c] = mul(a0,14)^mul(a1,11)^mul(a2,13)^mul(a3,9);
                s[1][c] = mul(a0,9)^mul(a1,14)^mul(a2,11)^mul(a3,13);
                s[2][c] = mul(a0,13)^mul(a1,9)^mul(a2,14)^mul(a3,11);
                s[3][c] = mul(a0,11)^mul(a1,13)^mul(a2,9)^mul(a3,14);
            }
        };
        addRound(14);
        for (let rnd = 13; rnd >= 1; rnd--) {
            invShift(); invSub(); addRound(rnd); invMix();
        }
        invShift(); invSub(); addRound(0);
        const out = new Array(16);
        for (let i = 0; i < 16; i++) out[i] = s[i % 4][(i / 4) | 0];
        return out;
    }

    function cbcDecrypt(cipher, key, iv) {
        const w = expandKey(key);
        const out = new Array(cipher.length);
        let prev = iv;
        for (let off = 0; off + 16 <= cipher.length; off += 16) {
            const block = cipher.slice(off, off + 16);
            const dec = decryptBlock(block, w);
            for (let i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
            prev = block;
        }
        const pad = out[out.length - 1];
        if (pad > 0 && pad <= 16) {
            let ok = true;
            for (let i = out.length - pad; i < out.length; i++) if (out[i] !== pad) ok = false;
            return ok ? out.slice(0, out.length - pad) : out;
        }
        return out;
    }

    return { cbcDecrypt };
})();

function _b64ToBytes(s) {
    // base64url → std alphabet; strip stray chars. Blobs are sometimes not a
    // multiple of 4, so strict atob may throw — fall back to the lenient path.
    const std = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
    try {
        if (typeof atob === 'function') {
            const bin = atob(std);
            const out = new Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
            return out;
        }
    } catch (e) { /* strict atob rejected the length; use the lenient decoder */ }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = std.replace(/=+$/, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 4) {
        const n = [chars.indexOf(clean[i]), chars.indexOf(clean[i + 1]), chars.indexOf(clean[i + 2]), chars.indexOf(clean[i + 3])];
        bytes.push((n[0] << 2) | (n[1] >> 4));
        if (n[2] >= 0) bytes.push(((n[1] & 15) << 4) | (n[2] >> 2));
        if (n[3] >= 0) bytes.push(((n[2] & 3) << 6) | n[3]);
    }
    return bytes;
}

// Decrypt an `enc` blob into {"file": "<master.m3u8>", ...}. Returns null
// on any failure so the caller can fall back rather than throw.
function _mpDecryptEnc(enc) {
    try {
        const key = new Array(32);
        for (let i = 0; i < 32; i++) key[i] = i < _MP_AES_KEY.length ? (_MP_AES_KEY.charCodeAt(i) & 0xff) : 0;
        const iv = new Array(16);
        for (let i = 0; i < 16; i++) iv[i] = _MP_AES_IV.charCodeAt(i) & 0xff;
        const cipher = _b64ToBytes(enc);
        if (!cipher.length || cipher.length % 16 !== 0) return null;
        const plain = _A256.cbcDecrypt(cipher, key, iv);
        let txt = '';
        for (let i = 0; i < plain.length; i++) txt += String.fromCharCode(plain[i]);
        const obj = JSON.parse(txt);
        return (obj && typeof obj.file === "string") ? obj.file : null;
    } catch (e) {
        console.log("[Anikoto] enc decrypt failed: " + e);
        return null;
    }
}

// Shared subtitle/stream shaping for a getSources payload. Hardsub (hsub)
// embeds return no tracks[]; softsub ones do — that's where subtitles
// come from. v2.8+ responses carry only `enc`; older ones sources.file.
function buildStreamResult(data, referer) {
    const tracks = data.tracks || [];
    let englishSub = "";
    const engTrack = tracks.find(t => t.kind === "captions" && t.label && t.label.toLowerCase().includes("english"));
    if (engTrack && engTrack.file) englishSub = engTrack.file;
    else {
        const firstCaption = tracks.find(t => t.kind === "captions" && t.file);
        if (firstCaption) englishSub = firstCaption.file;
    }
    const allSubtitles = tracks.filter(t => t.file).map(t => ({
        url: t.file, label: t.label || t.kind, kind: t.kind, headers: { Referer: referer }
    }));
    let streamUrl = (data.sources && data.sources.file) || data.file || "";
    if (!streamUrl && data.enc) {
        const decrypted = _mpDecryptEnc(data.enc);
        if (decrypted) streamUrl = _mpSignUrl(decrypted);
    }
    if (!streamUrl) return null;

    return {
        streamUrl,
        subtitles: englishSub,
        subtitlesHeaders: { Referer: referer },
        allSubtitles,
        headers: { Referer: referer }
    };
}

// ══════════════════════════════════════════════════════════════════
// anikototv.to scrape — search / details / episodes / servers.
// ══════════════════════════════════════════════════════════════════
class Anikoto {

    // The results grid (#list-items) is scoped strictly: the page also
    // carries a "Top rated anime" sidebar with the identical <a class="item">
    // markup. Each card carries its numeric show id via data-tip.
    static async search(keyword) {
        const url = ANIKOTO_BASE + "/filter?keyword=" + encodeURIComponent(keyword);
        console.log("[Anikoto] Searching: " + url);

        const resp = await soraFetch(url, { headers: { "User-Agent": UA, "Referer": ANIKOTO_BASE + "/" } });
        if (!resp || resp.status !== 200) {
            console.error("[Anikoto] Search fetch failed, status: " + (resp ? resp.status : "null"));
            return [];
        }
        const html = await resp.text();

        const gridStart = html.indexOf('id="list-items"');
        if (gridStart === -1) {
            console.warn("[Anikoto] No results grid found for: " + keyword);
            return [];
        }
        const gridEndMarker = html.indexOf("pre-pagination", gridStart);
        const gridHtml = gridEndMarker === -1 ? html.slice(gridStart) : html.slice(gridStart, gridEndMarker);

        const results = [];
        for (const block of gridHtml.split('<div class="item ">').slice(1)) {
            const slugMatch = block.match(/href="https:\/\/anikototv\.to\/watch\/([^"\/]+)\/ep-\d+"/);
            const tipMatch = block.match(/data-tip="(\d+)"/);
            // Visible anchor text (English title), not data-jp — that
            // attribute holds the Japanese/romaji title.
            const titleMatch = block.match(/<a class="name d-title"[^>]*>([^<]*)<\/a>/);
            const posterMatch = block.match(/<img\s+src="([^"]+)"/);
            if (!slugMatch || !tipMatch) continue;
            results.push({
                slug: slugMatch[1],
                showId: tipMatch[1],
                title: titleMatch ? titleMatch[1].trim() : "Untitled",
                poster: posterMatch ? posterMatch[1] : ""
            });
        }

        console.log("[Anikoto] Search returned " + results.length + " item(s)");
        return results;
    }

    // Best-effort watch-page info block scrape; single fields coming back
    // empty is expected (markup varies by content type).
    static async getDetails(slug) {
        const url = ANIKOTO_BASE + "/watch/" + slug;
        const resp = await soraFetch(url, { headers: { "User-Agent": UA, "Referer": ANIKOTO_BASE + "/" } });
        if (!resp || resp.status !== 200) return null;
        const html = await resp.text();

        const synMatch = html.match(/<div class="synopsis[^"]*">[\s\S]*?<div class="content">([\s\S]*?)<\/div>/);
        const synopsis = synMatch
            ? synMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[^>]+(>|$)/g, "").trim()
            : "";

        const getField = (label) => {
            const re = new RegExp(label + ":\\s*<span>\\s*(?:<a[^>]*>)?\\s*([^<]*?)\\s*(?:<\\/a>)?\\s*<\\/span>", "i");
            const m = html.match(re);
            return m ? m[1].trim() : "";
        };

        const genres = [...html.matchAll(/<a href="https:\/\/anikototv\.to\/genre\/[^"]*">\s*([^<]+?)\s*<\/a>/g)]
            .slice(0, 6)
            .map(m => m[1].trim())
            .join(", ");

        return {
            synopsis,
            aired: getField("Aired"),
            status: getField("Status"),
            duration: getField("Duration"),
            genres
        };
    }

    // Live: anchors with data-num / data-sub / data-dub / data-ids; the
    // ids token feeds /ajax/server/list. 1000+ episodes arrive paginated
    // by the site itself inside one response.
    static async getEpisodes(showId) {
        const url = ANIKOTO_BASE + "/ajax/episode/list/" + showId;
        const resp = await soraFetch(url, {
            headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": ANIKOTO_BASE + "/" }
        });
        if (!resp || resp.status !== 200) {
            console.warn("[Anikoto] Episode list fetch failed for showId " + showId);
            return [];
        }
        let json;
        try {
            json = typeof resp.json === "function" ? await resp.json() : JSON.parse(await resp.text());
        } catch (e) {
            console.warn("[Anikoto] Episode list JSON parse failed for showId " + showId);
            return [];
        }
        const html = (json && json.result) || "";

        const episodes = [];
        const re = /<a\s[^>]*data-id="[^"]*"[^>]*>/g;
        let m;
        while ((m = re.exec(html)) !== null) {
            const tag = m[0];
            const attr = (name) => {
                const am = tag.match(new RegExp("data-" + name + '="([^"]*)"'));
                return am ? am[1] : "";
            };
            const num = attr("num"), ids = attr("ids");
            if (!num || !ids) continue;
            episodes.push({ num: parseInt(num, 10), hasSub: attr("sub") === "1", hasDub: attr("dub") === "1", ids });
        }

        console.log("[Anikoto] Parsed " + episodes.length + " episodes for showId " + showId);
        return episodes;
    }

    // Live: HTML with <div class="type" data-type="sub|hsub|dub"> blocks,
    // each server <li> carrying a data-link-id token.
    static async getServerList(idsToken, audioTypes) {
        const url = ANIKOTO_BASE + "/ajax/server/list?servers=" + encodeURIComponent(idsToken);
        const resp = await soraFetch(url, {
            headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": ANIKOTO_BASE + "/" }
        });
        if (!resp || resp.status !== 200) {
            console.warn("[Anikoto] Server list fetch failed, status: " + (resp ? resp.status : "null"));
            return [];
        }
        let json;
        try {
            json = typeof resp.json === "function" ? await resp.json() : JSON.parse(await resp.text());
        } catch (e) {
            console.warn("[Anikoto] Server list JSON parse failed");
            return [];
        }
        const html = (json && json.result) || "";

        const items = [];
        const typeRe = /<div class="type" data-type="(sub|hsub|dub)">([\s\S]*?)<\/ul>\s*<\/div>/g;
        let typeM;
        while ((typeM = typeRe.exec(html)) !== null) {
            const type = typeM[1];
            if (!audioTypes.includes(type)) continue;
            for (const li of typeM[2].matchAll(/<li\s+([^>]*data-link-id[^>]*)>([\s\S]*?)<\/li>/g)) {
                const linkId = li[1].match(/data-link-id="([^"]+)"/);
                const name = li[2].replace(/<[^>]+>/g, "").trim();
                if (linkId) items.push({ linkId: linkId[1], name, type });
            }
        }
        console.log("[Anikoto] Found " + items.length + " server(s) across [" + audioTypes.join(", ") + "]");
        return items;
    }

    // Live: returns {result: {url: "<embed>"}, skip_data: {...}}.
    static async resolveServer(linkId) {
        const url = ANIKOTO_BASE + "/ajax/server?get=" + encodeURIComponent(linkId);
        const resp = await soraFetch(url, {
            headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", "Referer": ANIKOTO_BASE + "/" }
        });
        if (!resp || resp.status !== 200) return null;
        let json;
        try {
            json = typeof resp.json === "function" ? await resp.json() : JSON.parse(await resp.text());
        } catch (e) { return null; }
        return (json && json.result && json.result.url) || null;
    }

    // megaplay.buzz and vidwish.live share the embed template (data-id +
    // /stream/getSources?id=). vidtube.site looks like the same template
    // but its API is /stream/getSourcesNew and needs an explicit type
    // param (the last path segment of its embed URL); hsub embeds
    // occasionally serve under the plain "sub" type, tried as fallback.
    // The embed URL's `s` param selects the CDN (HD-1 = tcdn →
    // megap.shiora.top; dropped → fetch.nexabloom.top, often the broken
    // lane) and must be forwarded onto getSources.
    static async extractFromEmbed(embedUrl) {
        const host = [MEGAPLAY, VIDWISH, VIDTUBE].find(h => embedUrl.indexOf(h.replace("https://", "")) !== -1);
        if (!host) {
            console.warn("[Anikoto] No extractor for embed host: " + embedUrl);
            return null;
        }
        const fileId = await extractFileId(embedUrl, host + "/");
        if (!fileId) return null;

        const sMatch = String(embedUrl).match(/[?&]s=([A-Za-z0-9_-]+)/);
        const sSuffix = sMatch ? "&s=" + encodeURIComponent(sMatch[1]) : "";

        if (host === VIDTUBE) {
            const variant = ((embedUrl.split("?")[0].match(/\/(hsub|sub|dub)$/i) || [])[1] || "sub").toLowerCase();
            let data = await fetchVidtubeSources(fileId, variant, sSuffix);
            if (variant === "hsub" && (!data || (!(data.sources && data.sources.file) && !data.enc))) {
                data = await fetchVidtubeSources(fileId, "sub", sSuffix);
            }
            if (!data || (!(data.sources && data.sources.file) && !data.enc)) return null;
            return buildStreamResult(data, host + "/");
        }

        const sourcesUrl = host + "/stream/getSources?id=" + fileId + "&id=" + fileId + sSuffix;
        const resp = await soraFetch(sourcesUrl, {
            headers: { "Referer": host + "/", "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" }
        });
        if (!resp || resp.status !== 200) return null;
        let data;
        try {
            data = typeof resp.json === "function" ? await resp.json() : JSON.parse(await resp.text());
        } catch (e) { return null; }
        if (!(data && ((data.sources && data.sources.file) || data.enc))) {
            console.warn("[Anikoto] getSources returned neither sources.file nor enc for " + host);
            return null;
        }
        const built = buildStreamResult(data, host + "/");
        if (built) console.log("[Anikoto] " + host + (sMatch ? " (s=" + sMatch[1] + ")" : "") + " stream: " + built.streamUrl.substring(0, 110));
        return built;
    }
}

async function fetchVidtubeSources(fileId, type, sSuffix) {
    const url = VIDTUBE + "/stream/getSourcesNew?id=" + fileId + "&type=" + type + "&id=" + fileId + "&type=" + type + (sSuffix || "");
    const resp = await soraFetch(url, {
        headers: { "Referer": VIDTUBE + "/", "User-Agent": UA, "X-Requested-With": "XMLHttpRequest" }
    });
    if (!resp || resp.status !== 200) return null;
    try {
        return typeof resp.json === "function" ? await resp.json() : JSON.parse(await resp.text());
    } catch (e) { return null; }
}

async function extractFileId(embedUrl, referer) {
    const resp = await soraFetch(embedUrl, { headers: { "Referer": referer, "User-Agent": UA } });
    if (!resp || resp.status !== 200) return null;
    const html = await resp.text();
    const m = html.match(/data-id="([^"]*)"/);
    return m ? m[1] : null;
}

// ══════════════════════════════════════════════════════════════════
// Sora entry points
// ══════════════════════════════════════════════════════════════════

async function searchResults(keyword) {
    try {
        console.log("[searchResults] Keyword: " + keyword);
        const items = await Anikoto.search(keyword);
        if (!items) return JSON.stringify([{ title: "Error", image: "", href: "" }]);

        const transformed = items.map(item => ({
            title: item.title,
            image: item.poster,
            href: "anime/" + item.slug + "?showId=" + item.showId
        }));

        console.log("[searchResults] " + transformed.length + " result(s)");
        return JSON.stringify(transformed);
    } catch (error) {
        console.log("[searchResults] Fetch error: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

async function extractDetails(url) {
    try {
        const match = url.match(/anime\/([^\/\?]+)/);
        if (!match) throw new Error("Invalid URL format");
        const details = await Anikoto.getDetails(match[1]);
        if (!details) throw new Error("Could not fetch details");

        return JSON.stringify([{
            description: details.synopsis || "No description available",
            aliases: details.genres || ("Duration: " + (details.duration || "Unknown")),
            airdate: details.aired ? "Aired: " + details.aired : (details.status ? "Status: " + details.status : "Aired: Unknown")
        }]);
    } catch (error) {
        console.log("Details error: " + error);
        return JSON.stringify([{
            description: "Error loading description",
            aliases: "Duration: Unknown",
            airdate: "Aired: Unknown"
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        const match = url.match(/anime\/([^\/\?]+)\?showId=(\d+)/);
        if (!match) throw new Error("Invalid URL format");
        const [, slug, showId] = match;

        const episodesData = await Anikoto.getEpisodes(showId);
        if (!episodesData) return JSON.stringify([]);

        // Keep an episode when either audio track exists — this module
        // serves sub and dub lanes. The ids token in the href is what
        // /ajax/server/list needs later.
        const usable = episodesData
            .filter(ep => ep.hasSub || ep.hasDub)
            .sort((a, b) => a.num - b.num);
        console.log("[extractEpisodes] " + usable.length + " usable of " + episodesData.length + " episode(s)");

        const episodesArray = usable.map(ep => ({
            href: "anime/" + slug + "/" + ep.num + "?ids=" + encodeURIComponent(ep.ids),
            number: ep.num,
            title: "Episode " + ep.num
        }));

        return JSON.stringify(episodesArray);
    } catch (error) {
        console.log("Fetch error in extractEpisodes: " + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const match = url.match(/anime\/([^\/]+)\/(\d+)\?ids=(.+)/);
        if (!match) throw new Error("Invalid URL format");
        const [, slug, epNumStr, idsEncoded] = match;
        const idsToken = decodeURIComponent(idsEncoded);

        console.log("[extractStreamUrl] Slug: " + slug + ", Episode: " + epNumStr);

        const servers = await Anikoto.getServerList(idsToken, ["sub", "hsub", "dub"]);
        if (servers.length === 0) {
            console.warn("[extractStreamUrl] No servers available for this episode");
            return JSON.stringify({ streams: [], subtitles: "", subtitlesHeaders: {}, allSubtitles: [] });
        }

        // Resolve every server in parallel, then extract its embed.
        const resolved = await Promise.allSettled(servers.map(async (server) => {
            const embedUrl = await Anikoto.resolveServer(server.linkId);
            if (!embedUrl) return null;
            const streamData = await Anikoto.extractFromEmbed(embedUrl);
            if (!streamData) return null;
            return { type: server.type, name: server.name, ...streamData };
        }));

        const hsub = [], sub = [], dub = [];
        for (const r of resolved) {
            if (r.status !== "fulfilled" || !r.value) continue;
            if (r.value.type === "hsub") hsub.push(r.value);
            else if (r.value.type === "dub") dub.push(r.value);
            else sub.push(r.value);
        }

        const streams = [];
        let subtitles = "", subtitlesHeaders = {}, allSubtitles = [];

        // Dedupe on the URL with any signed token stripped: tokens embed a
        // per-call expiry, so two servers resolving to the identical file
        // produce different URLs and would otherwise both be listed.
        const seenStream = {};
        const pushStream = (title, s) => {
            if (!s.streamUrl) return;
            const key = String(s.streamUrl).replace(/([?&])token=[^&]*/i, "$1").replace(/[?&]$/, "");
            if (seenStream[key]) return;
            seenStream[key] = true;
            streams.push({ title, streamUrl: s.streamUrl, headers: s.headers });
        };

        // Hardsub first (burned-in subs, so it carries no subtitle tracks),
        // then every softsub lane, then dub.
        hsub.forEach((s, i) => pushStream(hsub.length > 1 ? "HSUB - " + s.name : "HSUB", s));
        for (const s of sub) {
            pushStream("SUB - " + s.name, s);
            if (!subtitles && s.subtitles) { subtitles = s.subtitles; subtitlesHeaders = s.subtitlesHeaders; }
            if (s.allSubtitles && s.allSubtitles.length) allSubtitles.push(...s.allSubtitles);
        }
        for (const s of dub) pushStream("DUB - " + s.name, s);

        if (streams.length === 0) {
            console.warn("[extractStreamUrl] Servers found but none resolved to a working stream");
            return JSON.stringify({ streams: [], subtitles: "", subtitlesHeaders: {}, allSubtitles: [] });
        }

        // De-duplicate subtitle tracks across providers
        const seenSub = {};
        allSubtitles = allSubtitles.filter(t => {
            if (!t.url || seenSub[t.url]) return false;
            seenSub[t.url] = true;
            return true;
        });

        const out = JSON.stringify({ streams, subtitles, subtitlesHeaders, allSubtitles });
        console.log("[extractStreamUrl] " + streams.length + " stream(s): " + streams.map(s => s.title).join(", "));
        return out;
    } catch (error) {
        console.log("[extractStreamUrl] Fetch error: " + error);
        return JSON.stringify({ streams: [], subtitles: "", subtitlesHeaders: {}, allSubtitles: [] });
    }
}

// ─── soraFetch wrapper ───
async function soraFetch(url, options = { headers: {}, method: "GET", body: null, encoding: "utf-8" }) {
    try {
        return await fetchv2(
            url,
            options.headers ?? {},
            options.method ?? "GET",
            options.body ?? null,
            true,
            options.encoding ?? "utf-8"
        );
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
