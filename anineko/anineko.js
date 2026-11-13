// AniNeko module v2.0.0 — rebuilt for anineko.cc (upstream moved off anineko.to, now 522)
// Flow: anineko.cc/browse?keyword= -> watch/<slug> series page -> watch/<slug>/ep-N
// Stream: episode page server list has data-link-id (base64) -> megaplay.buzz page
// -> settings.cid -> megaplay.buzz/stream/getSources?id=<cid> (needs X-Requested-With)
// -> AES-256-CBC decrypt of `enc` -> master.m3u8 (needs Referer + UA headers)

var ANINEKO_BASE = "https://anineko.cc";
var ANINEKO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function soraFetch(url, headers) {
    var h = headers || {};
    if (!h["User-Agent"]) h["User-Agent"] = ANINEKO_UA;
    return fetchv2(url, h, "GET", null);
}

// ---- base64 decode (pure JS, no atob dependency) ----
function aninekoB64Decode(input) {
    try {
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var str = String(input).replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "");
        var out = "";
        var bits = 0, acc = 0;
        for (var i = 0; i < str.length; i++) {
            var c = chars.indexOf(str.charAt(i));
            if (c === -1) continue;
            acc = (acc << 6) | c;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out += String.fromCharCode((acc >> bits) & 0xff);
            }
        }
        return decodeURIComponent(escape(out));
    } catch (e) {
        return "";
    }
}

// ---- AES-256-CBC decrypt (pure JS) ----
function aninekoAesSbox() {
    return [0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
        0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
        0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
        0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
        0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
        0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
        0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
        0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
        0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
        0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
        0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
        0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
        0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
        0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
        0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
        0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];
}

function aninekoAesInvSboxByte(b) {
    var sbox = aninekoAesSbox();
    for (var i = 0; i < 256; i++) {
        if (sbox[i] === b) return i;
    }
    return 0;
}

function aninekoAesSboxByte(b) {
    return aninekoAesSbox()[b & 0xff];
}

function aninekoXtime(a) {
    a <<= 1;
    if (a & 0x100) a = (a ^ 0x1b) & 0xff;
    return a & 0xff;
}

function aninekoMul(a, b) {
    var r = 0;
    while (b) {
        if (b & 1) r ^= a;
        a = aninekoXtime(a);
        b >>= 1;
    }
    return r & 0xff;
}

function aninekoAesKeyExpansion(keyBytes) {
    var nk = 8, nr = 14;
    var w = [];
    var i;
    for (i = 0; i < nk; i++) {
        w.push([keyBytes[4*i], keyBytes[4*i+1], keyBytes[4*i+2], keyBytes[4*i+3]]);
    }
    var rcon = 1;
    for (i = nk; i < 4 * (nr + 1); i++) {
        var t = w[i-1].slice();
        if (i % nk === 0) {
            var rot = [t[1], t[2], t[3], t[0]];
            for (var k4 = 0; k4 < 4; k4++) rot[k4] = aninekoAesSboxByte(rot[k4]);
            rot[0] ^= rcon;
            t = rot;
            rcon = aninekoXtime(rcon);
        } else if (i % nk === 4) {
            for (var k5 = 0; k5 < 4; k5++) t[k5] = aninekoAesSboxByte(t[k5]);
        }
        var prev = w[i-nk];
        w.push([prev[0]^t[0], prev[1]^t[1], prev[2]^t[2], prev[3]^t[3]]);
    }
    return w;
}

function aninekoAesDecryptBlock(w, block) {
    var nr = 14;
    var s = [[block[0],block[4],block[8],block[12]],
             [block[1],block[5],block[9],block[13]],
             [block[2],block[6],block[10],block[14]],
             [block[3],block[7],block[11],block[15]]];
    function addRoundKey(rnd) {
        for (var c = 0; c < 4; c++)
            for (var r = 0; r < 4; r++)
                s[r][c] ^= w[rnd*4+c][r];
    }
    function invShiftRows() {
        for (var r = 1; r < 4; r++) {
            var row = s[r].slice();
            for (var c = 0; c < 4; c++) s[r][(c + r) % 4] = row[c];
        }
    }
    function invSubBytes() {
        for (var r = 0; r < 4; r++)
            for (var c = 0; c < 4; c++)
                s[r][c] = aninekoAesInvSboxByte(s[r][c]);
    }
    function invMixColumns() {
        for (var c = 0; c < 4; c++) {
            var a0=s[0][c], a1=s[1][c], a2=s[2][c], a3=s[3][c];
            s[0][c] = aninekoMul(a0,14)^aninekoMul(a1,11)^aninekoMul(a2,13)^aninekoMul(a3,9);
            s[1][c] = aninekoMul(a0,9)^aninekoMul(a1,14)^aninekoMul(a2,11)^aninekoMul(a3,13);
            s[2][c] = aninekoMul(a0,13)^aninekoMul(a1,9)^aninekoMul(a2,14)^aninekoMul(a3,11);
            s[3][c] = aninekoMul(a0,11)^aninekoMul(a1,13)^aninekoMul(a2,9)^aninekoMul(a3,14);
        }
    }
    addRoundKey(nr);
    for (var rnd = nr - 1; rnd >= 1; rnd--) {
        invShiftRows();
        invSubBytes();
        addRoundKey(rnd);
        invMixColumns();
    }
    invShiftRows();
    invSubBytes();
    addRoundKey(0);
    var out = [];
    for (var c = 0; c < 4; c++)
        for (var r = 0; r < 4; r++)
            out.push(s[r][c]);
    return out;
}

function aninekoAesCbcDecrypt(keyStr, ivStr, dataBytes) {
    var key = [];
    for (var i = 0; i < 32; i++) key.push(i < keyStr.length ? (keyStr.charCodeAt(i) & 0xff) : 0);
    var iv = [];
    for (var j = 0; j < 16; j++) iv.push(j < ivStr.length ? (ivStr.charCodeAt(j) & 0xff) : 0);
    var w = aninekoAesKeyExpansion(key);
    var out = "";
    var prev = iv.slice();
    for (var off = 0; off + 16 <= dataBytes.length; off += 16) {
        var blk = dataBytes.slice(off, off + 16);
        var dec = aninekoAesDecryptBlock(w, blk);
        for (var k = 0; k < 16; k++) out += String.fromCharCode(dec[k] ^ prev[k]);
        prev = blk;
    }
    return out;
}

function aninekoB64ToBytes(input) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var str = String(input).replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/=]/g, "");
    while (str.length % 4 !== 0) str += "=";
    var out = [];
    var bits = 0, acc = 0;
    for (var i = 0; i < str.length; i++) {
        var c = chars.indexOf(str.charAt(i));
        if (c === -1) continue;
        acc = (acc << 6) | c;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((acc >> bits) & 0xff);
        }
    }
    return out;
}

var MP_ENC_KEY = "i?LMTAx0Q6,:}50U";
var MP_ENC_IV = "W0;27ToaUpl_P%'c";

function aninekoDecryptSources(encStr) {
    try {
        var bytes = aninekoB64ToBytes(encStr);
        var plain = aninekoAesCbcDecrypt(MP_ENC_KEY, MP_ENC_IV, bytes);
        // strip PKCS7 padding
        if (plain.length > 0) {
            var pad = plain.charCodeAt(plain.length - 1);
            if (pad >= 1 && pad <= 16) plain = plain.substring(0, plain.length - pad);
        }
        var start = plain.indexOf("{");
        var end = plain.lastIndexOf("}");
        if (start === -1 || end === -1) return null;
        return JSON.parse(plain.substring(start, end + 1));
    } catch (e) {
        return null;
    }
}

// normalize a watch/<slug>/ep-N url to the series page
function aninekoSeriesUrl(url) {
    return String(url).replace(/\/ep-\d+\s*$/, "").replace(/\/ep-\d+([?#].*)$/, "$1");
}

async function searchResults(keyword) {
    try {
        var url = ANINEKO_BASE + "/browse?keyword=" + encodeURIComponent(keyword);
        var response = await soraFetch(url);
        var html = await response.text();

        var results = [];
        var regex = /<a class="ak-card" href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/g;
        var match;
        while ((match = regex.exec(html)) !== null) {
            var href = match[1].trim();
            var img = match[2].trim().replace(/&amp;/g, "&");
            var title = match[3].trim();
            // card links point at the latest episode; normalize to series page
            var seriesHref = aninekoSeriesUrl(href);
            if (!/^https?:/.test(seriesHref)) seriesHref = ANINEKO_BASE + seriesHref;
            if (results.length === 0 || results[results.length-1].href !== seriesHref) {
                results.push({ title: title, image: img, href: seriesHref });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ title: "Error", image: "Error", href: "Error" }]);
    }
}

async function extractDetails(url) {
    try {
        var response = await soraFetch(url);
        var html = await response.text();

        var description = "N/A";
        var descMatch = html.match(/<meta name="description" content="([^"]+)"/);
        if (descMatch) description = descMatch[1].trim();

        var aliases = "N/A";
        var jpMatch = html.match(/data-jp="([^"]+)"/);
        if (jpMatch) aliases = jpMatch[1].trim();

        var airdate = "N/A";
        var dateMatch = html.match(/(Aired|Released|Release Date)[\s\S]{0,80}?(\w{3,9}\s+\d{1,2},?\s+\d{4})/i);
        if (dateMatch) airdate = dateMatch[2].trim();

        return JSON.stringify([{ description: description, aliases: aliases, airdate: airdate }]);
    } catch (err) {
        return JSON.stringify([{ description: "Error", aliases: "Error", airdate: "Error" }]);
    }
}

async function extractEpisodes(url) {
    var results = [];
    try {
        var response = await soraFetch(url);
        var html = await response.text();

        // <li class="ak-ep-li" data-num="1" ...><a href="https://anineko.cc/watch/<slug>/ep-1" ...
        var regex = /<li class="ak-ep-li" data-num="(\d+)"[^>]*>\s*<a href="([^"]+)"/g;
        var match;
        while ((match = regex.exec(html)) !== null) {
            var num = parseInt(match[1], 10);
            var href = match[2].trim();
            if (!/^https?:/.test(href)) href = ANINEKO_BASE + href;
            if (!isNaN(num) && num > 0) {
                results.push({ href: href, number: num });
            }
        }

        // dedupe by number
        var seen = {};
        var uniq = [];
        for (var i = 0; i < results.length; i++) {
            if (!seen[results[i].number]) {
                seen[results[i].number] = true;
                uniq.push(results[i]);
            }
        }

        return JSON.stringify(uniq);
    } catch (err) {
        return JSON.stringify([{ href: "Error", number: "Error" }]);
    }
}

async function aninekoResolveMegaplay(playerUrl, serverName, label) {
    try {
        // embedz.net wraps a 1anime.site iframe that serves a direct MP4
        if (playerUrl.indexOf("embedz.net") !== -1) {
            var embResp = await soraFetch(playerUrl, { "Referer": ANINEKO_BASE + "/" });
            var embHtml = await embResp.text();
            var iframeMatch = embHtml.match(/<iframe[^>]+src="(https:\/\/[^"]+1anime[^"]+\/play\/[^"]+)"/);
            if (!iframeMatch) return null;
            var playResp = await soraFetch(iframeMatch[1], { "Referer": playerUrl });
            var playHtml = await playResp.text();
            var srcMatch = playHtml.match(/<source[^>]+src="(https:\/\/[^"]+)"/);
            if (!srcMatch) return null;
            return {
                serverName: serverName,
                label: label,
                streamUrl: srcMatch[1],
                headers: {
                    "Referer": "https://my.1anime.site/",
                    "User-Agent": ANINEKO_UA
                },
                subtitles: ""
            };
        }

        var pageResp = await soraFetch(playerUrl, { "Referer": ANINEKO_BASE + "/" });
        var pageHtml = await pageResp.text();

        var cidMatch = pageHtml.match(/cid\s*:\s*'([^']+)'/);
        if (!cidMatch) return null;
        var cid = cidMatch[1];

        var typeMatch = playerUrl.match(/\/(sub|dub)(?:[?#].*)?$/);
        var type = typeMatch ? typeMatch[1] : "sub";

        var api = "https://megaplay.buzz/stream/getSources?id=" + encodeURIComponent(cid) +
            "&platform=other&st=other";
        var apiResp = await soraFetch(api, {
            "Referer": playerUrl,
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01"
        });
        var apiText = await apiResp.text();
        var data = null;
        try { data = JSON.parse(apiText); } catch (e) { return null; }
        if (!data || data.error) return null;

        var file = null;
        if (data.enc) {
            var payload = aninekoDecryptSources(data.enc);
            if (payload && typeof payload.file === "string") file = payload.file;
        } else if (data.sources && data.sources.length > 0 && data.sources[0].file) {
            file = data.sources[0].file;
        }
        if (!file) return null;

        var subtitles = "";
        if (data.tracks) {
            for (var i = 0; i < data.tracks.length; i++) {
                if (data.tracks[i] && data.tracks[i].kind === "captions" && data.tracks[i].file) {
                    subtitles = data.tracks[i].file;
                    break;
                }
            }
        }

        return {
            serverName: serverName,
            label: label,
            streamUrl: file,
            subtitles: subtitles
        };
    } catch (e) {
        return null;
    }
}

async function extractStreamUrl(url) {
    try {
        var response = await soraFetch(url);
        var html = await response.text();

        // server items: data-server-name="HD-1" ... data-link-id="<base64 of megaplay url>"
        var regex = /data-server-name="([^"]+)"[^>]*data-link-id="([^"]+)"/g;
        var match;
        var seen = {};
        var tasks = [];
        var priorityMap = {};
        var prio = 1;
        var firstSubtitles = "";

        while ((match = regex.exec(html)) !== null) {
            var serverName = match[1].trim();
            var playerUrl = aninekoB64Decode(match[2]).trim();
            if (!playerUrl || !/^https?:\/\//.test(playerUrl)) continue;
            if (seen[playerUrl]) continue;
            seen[playerUrl] = true;
            priorityMap[playerUrl] = prio++;

            if (tasks.length >= 4) continue; // cap network fan-out

            var label = /dub/i.test(playerUrl) ? "Dub" : "Sub";
            tasks.push(aninekoResolveMegaplay(playerUrl, serverName, label));
        }

        var resolved = await Promise.all(tasks);
        var streams = [];
        var streamCounts = {};

        for (var i = 0; i < resolved.length; i++) {
            var r = resolved[i];
            if (!r || !r.streamUrl) continue;

            var baseTitle = r.serverName + " " + r.label;
            var finalTitle = baseTitle;
            if (streamCounts[baseTitle]) {
                streamCounts[baseTitle]++;
                finalTitle = baseTitle + " " + streamCounts[baseTitle];
            } else {
                streamCounts[baseTitle] = 1;
            }

            if (!firstSubtitles && r.subtitles) firstSubtitles = r.subtitles;

            var hdrs = r.headers || {
                "Referer": "https://megaplay.buzz/",
                "User-Agent": ANINEKO_UA
            };
            if (!hdrs["User-Agent"]) hdrs["User-Agent"] = ANINEKO_UA;
            streams.push({
                title: finalTitle,
                streamUrl: r.streamUrl,
                headers: hdrs
            });
        }

        return JSON.stringify({
            streams: streams,
            subtitles: firstSubtitles
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
            subtitles: ""
        });
    }
}
