// comix.to module (comics/manga) for kanzen / Luna / Anymex / Dartotsu (mangas)
//
// Some host builds omit the console bridge; keep logging a no-op there.
if (typeof console === 'undefined' || !console) { var console = { log: function() {}, print: function() {} }; }
//
// The comix.to API (api/v1) requires a per-request signature `_` and encrypts
// some responses ({"e": "..."} + x-enc header). The scheme (reversed from the
// site's apicore-*.js SDK chunk, build 35595e3de3c99889c1aa70):
//
//   token   = kid + "." + b64url( SHA256'( mat[32:64], SHA256'( mat[0:32], utf8(canonical) ) ) )[0:16]
//   decrypt = per-response XOR stream keyed by a 1088-byte static "material"
//             table; kid ("bm6") and the table are shipped INSIDE the
//             obfuscated apicore chunk, whose string-pool rotates per build.
//
// Because the site redeploys frequently (chunk prefix tof4ou -> tof80u -> ...,
// same-day), the constants are NOT hardcoded: at session start this module
// fetches the current build's apicore chunk and re-extracts kid + material
// from it (generic obfuscator.io string-pool parsing, no eval). The extracted
// session is cached in memory and refreshed once if the API answers
// invalid_token (i.e. the site rotated mid-session).
//
// Resilience (kept from v1.1.4): multi-host fallback (comix.to -> comix.ws),
// full browser-grade headers, failure classification in logs.

const BASE_URL = 'https://comix.to';

const API_HOSTS = [
    'https://comix.to',
    'https://comix.ws',
];

// SHA-256 round constants — exactly the table shipped in the apicore chunk
// (byte-identical to the standard FIPS table).
const SHA_K = new Uint32Array([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]);

// Session state (material + kid), extracted once and reused across calls.
let _SESSION = null;

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

// The chunk's own double-SHA-256: standard compression with the first 32
// bytes of the material table as the initial state, and the bit-length field
// counting the virtual 64-byte IV block (mirror of Kj/Lj in the chunk).
function sha256Custom(ivWords, msg) {
    let O = msg.length + 1;
    while (O % 64 !== 56) O++;
    const D = new Uint8Array(O + 8);
    D.set(msg);
    D[msg.length] = 128;
    const bits = (64 + msg.length) * 8;
    const hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
    const r = D.length - 8;
    D[r] = hi >>> 24 & 255; D[r + 1] = hi >>> 16 & 255; D[r + 2] = hi >>> 8 & 255; D[r + 3] = 255 & hi;
    D[r + 4] = lo >>> 24 & 255; D[r + 5] = lo >>> 16 & 255; D[r + 6] = lo >>> 8 & 255; D[r + 7] = 255 & lo;
    const rotr = (x, n) => (x >>> n | x << (32 - n)) >>> 0;
    const H = Uint32Array.from(ivWords);
    const Wd = new Uint32Array(64);
    for (let off = 0; off < D.length; off += 64) {
        for (let i = 0; i < 16; i++) { const y = off + 4 * i; Wd[i] = (D[y] << 24 | D[y + 1] << 16 | D[y + 2] << 8 | D[y + 3]) >>> 0; }
        for (let n = 16; n < 64; n++) {
            const s0 = rotr(Wd[n - 15], 7) ^ rotr(Wd[n - 15], 18) ^ (Wd[n - 15] >>> 3);
            const s1 = rotr(Wd[n - 2], 17) ^ rotr(Wd[n - 2], 19) ^ (Wd[n - 2] >>> 10);
            Wd[n] = (Wd[n - 16] + s0 + Wd[n - 7] + s1) | 0;
        }
        let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (let i = 0; i < 64; i++) {
            const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
            const ch = (((e & f) ^ (~e & g)) >>> 0);
            const t1 = (h + S1 + ch + SHA_K[i] + Wd[i]) | 0;
            const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
            const mj = (((a & b) ^ (a & c) ^ (b & c)) >>> 0);
            const t2 = (S0 + mj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] = H[0] + a | 0; H[1] = H[1] + b | 0; H[2] = H[2] + c | 0; H[3] = H[3] + d | 0;
        H[4] = H[4] + e | 0; H[5] = H[5] + f | 0; H[6] = H[6] + g | 0; H[7] = H[7] + h | 0;
    }
    const Q = new Uint8Array(32);
    for (let Y = 0; Y < 8; Y++) {
        Q[4 * Y] = H[Y] >>> 24 & 255; Q[4 * Y + 1] = H[Y] >>> 16 & 255;
        Q[4 * Y + 2] = H[Y] >>> 8 & 255; Q[4 * Y + 3] = 255 & H[Y];
    }
    return Q;
}

function ivFrom(mat, off) {
    const S = new Uint32Array(8);
    for (let P = 0; P < 8; P++) { const h = off + 4 * P; S[P] = (mat[h] << 24 | mat[h + 1] << 16 | mat[h + 2] << 8 | mat[h + 3]) >>> 0; }
    return S;
}

// URL-safe base64 over the chunk's custom alphabet (mirror of the chunk's b64).
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64Custom(bytes) {
    let U = '';
    for (let S = 0; S < bytes.length; S += 3) {
        const P = bytes[S], h = bytes[S + 1], X = bytes[S + 2];
        U += B64_ALPHABET[P >> 2] + B64_ALPHABET[(3 & P) << 4 | h >> 4];
        if (S + 1 < bytes.length) U += B64_ALPHABET[(15 & h) << 2 | X >> 6];
        if (S + 2 < bytes.length) U += B64_ALPHABET[63 & X];
    }
    return U;
}

function signCanonical(mat, canonical) {
    const p1 = sha256Custom(ivFrom(mat, 0), utf8Encode(canonical));
    return b64Custom(sha256Custom(ivFrom(mat, 32), p1)).slice(0, 16);
}

// ---------------------------------------------------------------------------
// Runtime extraction of kid + material from the current apicore-* chunk.
// ---------------------------------------------------------------------------

// Decode one obfuscator pool string: custom-alphabet base64 then percent-decode.

function decodePoolString(s, alphabet) {
    let C = '', E = '';
    for (let r, Q, x = 0, K = 0; Q = s.charAt(K++); ~Q && (r = x % 4 ? 64 * r + Q : Q, x++ % 4) ? C += String.fromCharCode(255 & r >> (-2 * x & 6)) : 0)
        Q = alphabet.indexOf(Q);
    for (let F = 0, Y = C.length; F < Y; F++) E += '%' + ('00' + C.charCodeAt(F).toString(16)).slice(-2);
    try { return decodeURIComponent(E); } catch (e) { return C; }
}

// Split a JS array-of-strings literal without eval.
function parseStringArray(text) {
    const out = [];
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(text))) {
        let s = m[1];
        s = s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[0-3][0-7]{0,2}|[4-7][0-7]|[\\'"bfnrtv0])/g, function (_, esc) {
            if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
            if (esc[0] === 'u') return String.fromCharCode(parseInt(esc.slice(1), 16));
            const map = { '\\': '\\', "'": "'", '"': '"', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', 0: '\0' };
            if (map[esc] !== undefined) return map[esc];
            return String.fromCharCode(parseInt(esc, 8));
        });
        out.push(s);
    }
    return out;
}

function matchBrace(text, openIdx) {
    let depth = 0;
    for (let k = openIdx; k < text.length; k++) {
        if (text[k] === '{') depth++;
        else if (text[k] === '}') { depth--; if (!depth) return k; }
    }
    return -1;
}

// Parse "+ - * / ( )" integer expressions without eval (rotation checksums).
function evalArith(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        const ch = expr[i];
        if (ch === ' ') { i++; continue; }
        if ('+-*/()'.indexOf(ch) >= 0) { tokens.push(ch); i++; continue; }
        let n = '';
        while (i < expr.length && expr[i] >= '0' && expr[i] <= '9') { n += expr[i]; i++; }
        if (n !== '') tokens.push(parseFloat(n));
        else i++;
    }
    let pos = 0;
    function peek() { return tokens[pos]; }
    function parseExpr() {
        let v = parseTerm();
        while (peek() === '+' || peek() === '-') { const op = tokens[pos++]; const rhs = parseTerm(); v = op === '+' ? v + rhs : v - rhs; }
        return v;
    }
    function parseTerm() {
        let v = parseFactor();
        while (peek() === '*' || peek() === '/') { const op = tokens[pos++]; const rhs = parseFactor(); v = op === '*' ? v * rhs : v / rhs; }
        return v;
    }
    function parseFactor() {
        const t = tokens[pos];
        if (t === '(') { pos++; const v = parseExpr(); if (peek() === ')') pos++; return v; }
        if (t === '-') { pos++; return -parseFactor(); }
        if (t === '+') { pos++; return parseFactor(); }
        pos++;
        return t;
    }
    const v = parseExpr();
    return typeof v === 'number' && !isNaN(v) ? v : NaN;
}

// Extract { kid, mat } from the apicore chunk source.
function extractCrypto(chunk) {
    // 1. decoder function: function NAME(arg,other){arg-=BASE;const pool=POOLFN();
    const dm = chunk.match(/function (\w+)\((\w),(\w+)\)\{\2-=(\d+);const (\w+)=((\w+)\(\));?/);
    if (!dm) throw new Error('decoder fn not found');
    const decName = dm[1];
    const poolFn = dm[7];
    // 2. pool array literal inside `function POOLFN(){const X=[...]`
    const pfnIdx = chunk.indexOf('function ' + poolFn + '()');
    const arrStart = chunk.indexOf('[', pfnIdx);
    let d = 0, arrEnd = -1;
    for (let k = arrStart; k < chunk.length; k++) { if (chunk[k] === '[') d++; else if (chunk[k] === ']') { d--; if (!d) { arrEnd = k; break; } } }
    const pool = parseStringArray(chunk.slice(arrStart, arrEnd + 1));
    // 3. decoder alphabet (65-char lookup string inside the decoder body)
    const alM = chunk.slice(decSrcSafe(chunk, decName), arrStart).match(/"([A-Za-z0-9+/=]{64,65})"\.indexOf/);
    const alphabet = alM ? alM[1] : 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';
    const base = +dm[4];
    function dec(idx) { return decodePoolString(pool[idx - base], alphabet); }
    // 4. rotation: brute-force the shift until the checksum expression holds
    const rotM = chunk.match(/!function\(\)\{const (\w+)=(\w+),(\w+)=(\w+)\(\);for\(\;\;\)/);
    if (!rotM) throw new Error('rotation iife not found');
    const alias = rotM[1];
    const rotHead = chunk.slice(rotM.index);
    const exprSrc = rotHead.slice(rotHead.indexOf('try{') + 4, rotHead.indexOf(')break;') + 1);
    const target = +(rotHead.match(/if\((\d+)===/)[1]);
    const idxNums = [];
    const idxRe = new RegExp(alias + '\\((\\d+)\\)', 'g');
    let im;
    while ((im = idxRe.exec(exprSrc))) idxNums.push(+im[1]);
    // tokenize expression once; decode indices per candidate rotation
    let rotation = -1;
    for (let r = 0; r < pool.length; r++) {
        let ok = true;
        const parts = [];
        for (let k = 0; k < idxNums.length; k++) {
            let s; try { s = dec(idxNums[k]); } catch (e) { ok = false; break; }
            const n = parseInt(s);
            if (isNaN(n)) { ok = false; break; }
            parts.push([idxNums[k], n]);
        }
        if (!ok) { rotatePool(pool); continue; }
        let expr = exprSrc.split(alias + '(').join('(').replace(/^\s*if\(/, '').replace(/\)\s*$/, '');
        const numMap = {};
        for (const [idx, n] of parts) numMap[idx] = n;
        expr = expr.replace(/\((\d+)\)/g, function (m, n) { return numMap[n] !== undefined ? '(' + numMap[n] + ')' : m; });
        expr = expr.replace(/parseInt\(\((\d+)\)\)/g, '($1)');
        // rebuild: original form `NUM===<arith>` inside if( ... )
        const mm = expr.match(/^(\d+)===([\s\S]*)$/);
        let val;
        try { val = mm ? evalArith(mm[2]) : NaN; } catch (e) { val = NaN; }
        if (val === target) { rotation = r; break; }
        rotatePool(pool);
    }
    if (rotation < 0) throw new Error('rotation not solved');
    // 5. locate the material object block: OBJ[kidIdx]=DEC(v), OBJ[...] = function
    const blockM = chunk.match(/const (\w+)=\{\};\1\[\w+\((\d+)\)\]=\w+\((\d+)\),\1\[\w+\((\d+)\)\]=function/);
    if (!blockM) throw new Error('material block not found');
    if (dec(+blockM[2]) !== 'kid') throw new Error('kid prop mismatch');
    const kid = dec(+blockM[3]);
    // 6. wj-like table + xj-like entries
    const tableM = chunk.match(/(\w+)\[\w+\((\d+)\)\]=\[\d+,\d+,\d+/);
    if (!tableM) throw new Error('key table not found');
    const tableVar = tableM[1];
    const segStart = chunk.indexOf(tableVar + '[');
    // entries list: `var NAME=[a,b,...];` after the table
    const reList = /var (\w+)=\[((?:\w+,)+\w+)\];/g;
    let lm, listStart = -1, entryNames = null, listName = null;
    while ((lm = reList.exec(chunk))) { if (lm.index > segStart) { listName = lm[1]; entryNames = lm[2].split(','); listStart = lm.index; break; } }
    if (!entryNames) throw new Error('entry list not found');
    const segEnd = chunk.indexOf('];', listStart) + 2;
    const seg = chunk.slice(segStart, segEnd);
    // table assignments: TABLE[DEC(k)]=<array literal> or =DEC(n)
    const table = {};
    const reAssign = new RegExp(tableVar + '\\[\\w+\\((\\d+)\\)\\]=(\\[[^\\]]*\\]|\\w+\\(\\d+\\))', 'g');
    let am;
    while ((am = reAssign.exec(seg))) {
        const key = dec(+am[1]);
        const valSrc = am[2];
        if (valSrc[0] === '[') table[key] = valSrc.slice(1, -1).split(',').map(function (x) { return parseInt(x, 10); });
        else table[key] = dec(+valSrc.match(/\((\d+)\)/)[1]);
    }
    // entries: NAME.id=DEC(i); NAME[DEC(s)]=start; NAME[DEC(m)]=mask; NAME[DEC(e)]=enc;
    const list = [];
    for (const name of entryNames) {
        const props = {};
        const idm = seg.match(new RegExp(name + '\\.id=(\\w+)\\((\\d+)\\)'));
        if (idm) props.id = dec(+idm[2]);
        const reProp = new RegExp(name + '\\[\\w+\\((\\d+)\\)\\]=(\\d+)', 'g');
        let pm;
        while ((pm = reProp.exec(seg))) props[dec(+pm[1])] = +pm[2];
        list.push(props);
    }
    // 7. assemble the 1088-byte material
    const mat = new Uint8Array(1088);
    for (const W of list) {
        const P = table[W.id];
        if (P === undefined) continue;
        let h;
        if (W.enc === 1) { h = []; for (let O = 0; O < P.length; O++) h.push(P.charCodeAt(O) - 33); }
        else h = W.enc === 2 ? P.slice(1) : P;
        const X = new Uint8Array(h.length);
        for (let D = 0; D < h.length; D++) X[D] = h[D] ^ W.mask;
        mat.set(X, W.start);
    }
    let zeros = 0;
    for (let i = 0; i < mat.length; i++) if (mat[i] === 0) zeros++;
    if (zeros > 40) throw new Error('material assembly suspect (zeros=' + zeros + ')');
    return { kid: kid, mat: mat };
}

function decSrcSafe(chunk, decName) {
    const i = chunk.indexOf('function ' + decName + '(');
    return i >= 0 ? i : 0;
}

function rotatePool(pool) { pool.push(pool.shift()); }

// Decrypt an encrypted response body {"e": "..."} (mirror of the chunk's Yj).
function decryptBody(mat, e) {
    // 1. base64-decode with the URL-safe alphabet into a buffer offset by 2
    const T = new Int8Array(256).fill(-1);
    for (let i = 0; i < B64_ALPHABET.length; i++) T[B64_ALPHABET.charCodeAt(i)] = i;
    T[43] = 62; T[47] = 63; // also accept standard +/
    const src = utf8Encode(e);
    if (e.length < 4) throw new Error('encrypted body too short');
    const outLen = 2 + Math.floor(src.length / 4) * 3 + 8;
    const buf = new Uint8Array(Math.ceil(outLen / 4) * 4);
    let o = 2, i2 = 0;
    const full = src.length - (src.length % 4);
    for (; i2 < full; i2 += 4) {
        const a = T[src[i2]], b = T[src[i2 + 1]], cc = T[src[i2 + 2]], d2 = T[src[i2 + 3]];
        const q = a << 18 | b << 12 | cc << 6 | d2;
        if (q < 0) break;
        buf[o] = q >> 16; buf[o + 1] = q >> 8; buf[o + 2] = q; o += 3;
    }
    let acc = 0, bits = 0;
    for (; i2 < src.length; i2++) {
        const v = T[src[i2]];
        if (v < 0) continue;
        acc = 65535 & (acc << 6 | v); bits += 6;
        if (bits >= 8) { bits -= 8; buf[o++] = acc >> bits; }
    }
    const len = o;
    // 2. rotation offset from header bytes, rotate key window mat[64:1088]
    const rot = ((buf[2] << 8 | buf[3]) % 1024 + 1024) % 1024;
    const key = new Uint8Array(1024);
    // rotate LEFT by rot: key = mat[64+rot : 1088] ++ mat[64 : 64+rot]
    key.set(mat.subarray(64 + rot, 1088), 0);
    key.set(mat.subarray(64, 64 + rot), 1024 - rot);
    // 3. XOR 32-bit words (mirror of the chunk's word loop) then tail bytes
    const words = new Uint32Array(buf.buffer, 0, len >> 2);
    const kw = new Uint32Array(key.buffer, 0, 256);
    for (let x = 1; x < (len >> 2); x++) words[x] = words[x] ^ kw[(x - 1) % 256];
    for (let t = (len >> 2) << 2; t < len; t++) buf[t] = buf[t] ^ key[(t - 4) % 1024];
    // 4. JSON from byte 4 (mirror: parser starts at index 4); text is UTF-8
    let s = '';
    for (let t = 4; t < len; t++) {
        const b = buf[t];
        if (b < 0x80) s += String.fromCharCode(b);
        else if (b < 0xe0) { s += String.fromCharCode(((b & 31) << 6) | (buf[++t] & 63)); }
        else if (b < 0xf0) { s += String.fromCharCode(((b & 15) << 12) | ((buf[++t] & 63) << 6) | (buf[++t] & 63)); }
        else {
            const cp = ((b & 7) << 18) | ((buf[++t] & 63) << 12) | ((buf[++t] & 63) << 6) | (buf[++t] & 63);
            s += String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 1023));
        }
    }
    return s;
}

// Full browser-grade header set — Cloudflare managed challenges weigh these
// alongside IP reputation; omitting them makes borderline clients fail.
const API_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Referer': BASE_URL + '/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
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

// Classify a failed response body so logs say WHY (challenge vs outage vs junk).
function classifyFailure(text) {
    const t = String(text || '');
    if (/Just a moment/i.test(t) || /_cf_chl|cf-browser-verification|challenges\.cloudflare\.com/.test(t)) {
        return 'cloudflare challenge (IP/TLS flagged; app network stack usually passes)';
    }
    if (/invalid_token|missing_token|key_retired/.test(t)) return 'signature rejected (' + t.slice(0, 80) + ')';
    if (/Bad gateway/i.test(t)) return 'origin down (502)';
    if (/Service unavailable/i.test(t)) return 'origin unavailable (503)';
    if (/^\s*</.test(t)) return 'html response';
    return 'non-json response';
}

async function ensureSession(force) {
    if (_SESSION && !force) return _SESSION;
    // 1. homepage -> current build dir + main chunk name
    const home = await soraFetch(BASE_URL + '/', { headers: { 'User-Agent': API_HEADERS['User-Agent'], 'Accept': 'text/html' } });
    if (!home) throw new Error('homepage unreachable');
    const homeText = await home.text();
    const mainM = homeText.match(/assets\/build\/[a-f0-9]+\/dist\/main-[A-Za-z0-9_.-]+\.js/);
    if (!mainM) throw new Error('main chunk ref not found on homepage');
    // 2. main chunk -> apicore chunk name
    const main = await soraFetch(BASE_URL + '/' + mainM[0], { headers: { 'User-Agent': API_HEADERS['User-Agent'] } });
    if (!main) throw new Error('main chunk unreachable');
    const mainText = await main.text();
    const apiM = mainText.match(/apicore-[A-Za-z0-9_.-]+\.js/);
    if (!apiM) throw new Error('apicore chunk ref not found in main chunk');
    const apiPath = mainM[0].replace(/main-[A-Za-z0-9_.-]+\.js/, apiM[0]);
    // 3. apicore chunk -> extract
    const api = await soraFetch(BASE_URL + '/' + apiPath, { headers: { 'User-Agent': API_HEADERS['User-Agent'] } });
    if (!api) throw new Error('apicore chunk unreachable');
    const apiText = await api.text();
    _SESSION = extractCrypto(apiText);
    console.log('[Comix] session ready: kid=' + _SESSION.kid + ' (from ' + apiM[0] + ')');
    return _SESSION;
}

// mirror of the site's url normalizer: strip origin, query and /api/v1
function normalizeUrl(url) {
    return url
        .replace(/^https?:\/\/[^/]+/, '')
        .split('?')[0]
        .replace(/^\/api\/v1/, '');
}

// mirror of the site's params serializer: sorted keys, bracket notation
function buildQuery(params) {
    const parts = [];
    function rec(prefix, value) {
        if (value == null) return;
        if (Array.isArray(value)) {
            value.forEach((item, i) => rec(`${prefix}[${i}]`, item));
        } else if (typeof value !== 'object') {
            parts.push(`${prefix}=${value}`);
        } else {
            Object.keys(value).sort().forEach(k => rec(prefix ? `${prefix}[${k}]` : k, value[k]));
        }
    }
    Object.keys(params).sort().forEach(k => { if (k !== '_') rec(k, params[k]); });
    return parts.join('&');
}

async function apiGet(path, params = {}) {
    let session;
    try { session = await ensureSession(false); }
    catch (e) {
        console.log('[Comix] session init failed: ' + e.message);
        throw new Error('session init failed: ' + e.message);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
        // chapter-list / chapter-page endpoints get the env version params the
        // site's interceptor injects on those routes (v/w, healthy client = 0)
        const needVW = /^\/manga\/[^/]+\/chapters/.test(path) || /^\/chapters\/\d+/.test(path);
        const allParams = Object.assign({}, params, needVW ? { v: 0, w: 0 } : {});
        const q = buildQuery(allParams);
        const canonical = q ? path + '?' + q : path;
        const token = session.kid + '.' + signCanonical(session.mat, canonical);
        const url = API_HOSTS[0] + '/api/v1' + canonical + (q ? '&' : '?') + '_=' + token;
        let resp = null;
        try { resp = await soraFetch(url, { headers: API_HEADERS }); } catch (e) { resp = null; }
        if (!resp) { console.log('[Comix] apiGet no response for ' + path); break; }
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); }
        catch (e) {
            console.log('[Comix] apiGet failed: ' + classifyFailure(text) + ' | status=' + (resp.status || '?'));
            break;
        }
        if (data && typeof data === 'object' && typeof data.e === 'string') {
            try { data = JSON.parse(decryptBody(session.mat, data.e)); }
            catch (e) { console.log('[Comix] decrypt failed: ' + e.message); break; }
        }
        if (data.status !== 'ok') {
            const blob = JSON.stringify(data).slice(0, 120);
            // signature rejected -> the site likely rotated keys; refresh once
            if (/invalid_token|key_retired/.test(blob) && attempt === 0) {
                console.log('[Comix] token rejected, re-extracting session');
                try { session = await ensureSession(true); continue; } catch (e) { console.log('[Comix] re-extract failed: ' + e.message); }
            }
            throw new Error('api error: ' + blob);
        }
        return data.result;
    }
    throw new Error('apiGet exhausted for ' + path);
}

function cleanText(s) {
    if (!s) return 'N/A';
    return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchResults(keyword, page = 0) {
    try {
        const result = await apiGet('/manga', {
            order: { chapter_updated_at: 'desc' },
            page: 1, limit: 28,
            content_rating: ['safe', 'suggestive'],
            keyword,
        });
        return (result.items || []).map(it => ({
            id: 'https://comix.to' + (it.url || `/title/${it.hid}`),
            title: it.title || '',
            imageURL: (it.poster && (it.poster.large || it.poster.medium)) || '',
        }));
    } catch (e) {
        console.log('comix searchResults error: ' + e.message);
        return [];
    }
}

async function extractDetails(idOrUrl) {
    try {
        const hid = (idOrUrl.match(/comix\.(?:to|ws)\/title\/([^/?#]+)/) || [])[1]?.split('-')[0];
        if (!hid) return { description: 'N/A', tags: [] };
        const m = await apiGet('/manga/' + hid, {});
        let tags = (m.genres || []).map(g => cleanText(typeof g === 'string' ? g : (g.name || g.title || ''))).filter(Boolean);
        if (!tags.length && Array.isArray(m.altTitles)) {
            tags = m.altTitles.slice(0, 8).map(t => cleanText(typeof t === 'string' ? t : (t.name || t.title || ''))).filter(Boolean);
        }
        return {
            description: cleanText(m.synopsis || m.synopsisHtml) || 'N/A',
            tags,
        };
    } catch (e) {
        console.log('comix extractDetails error: ' + e.message);
        return { description: 'Error extracting details', tags: [] };
    }
}

async function extractChapters(idOrUrl) {
    try {
        const hid = (idOrUrl.match(/comix\.(?:to|ws)\/title\/([^/?#]+)/) || [])[1]?.split('-')[0];
        if (!hid) throw new Error('no hid in ' + idOrUrl);
        const chapters = [];
        for (let page = 1; page <= 20; page++) {
            const result = await apiGet(`/manga/${hid}/chapters`, {
                page, limit: 100, order: { number: 'desc' },
            });
            const items = result.items || [];
            items.forEach(it => {
                const lang = (it.language || 'en').toUpperCase();
                chapters.push({
                    id: 'https://comix.to' + it.url,
                    title: `Ch.${it.number}${it.name ? ' - ' + it.name : ''} [${lang}]${it.group ? ' @' + it.group.name : ''}`,
                    chapter: it.number,
                    scanlation_group: (it.group && it.group.name) || '',
                });
            });
            if (!result.meta || !result.meta.hasNext) break;
        }
        chapters.sort((a, b) => a.chapter - b.chapter);
        return { en: chapters.map(ch => [String(ch.chapter), [ch]]) };
    } catch (e) {
        console.log('comix extractChapters error: ' + e.message);
        return { en: [] };
    }
}

async function extractImages(chapterId) {
    try {
        const id = (chapterId.match(/\/title\/[^/]+\/(\d+)-chapter/) || [])[1];
        if (!id) throw new Error('no chapter id in ' + chapterId);
        const m = await apiGet('/chapters/' + id, {});
        const pages = (m.pages && m.pages.items) || [];
        return pages.map(p => p.url).filter(Boolean);
    } catch (e) {
        console.log('comix extractImages error: ' + e.message);
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
