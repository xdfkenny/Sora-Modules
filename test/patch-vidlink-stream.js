/* patch-vidlink-stream.js — port vidlink's proven extractStreamUrl into the
 * RgShows-family modules whose stream endpoints died (api.rgshows.me,
 * api.vidlink.me served HTML challenges, vidapi.xyz embeds rot).
 * Replaces the old extractStreamUrl body with a normalized vidlink.pro
 * implementation that parses all 4 href shapes:
 *   movie/550 | /movie/550 | tv/1396/1/1 | /tv/1396/1/1
 *   https://vidapi.xyz/embed/movie/550
 *   https://vidapi.xyz/embed/tv/1396&s=1&e=1
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname + '/..';
const MODULES = ['rgshows', '111movies', 'vidrock', 'vidapi'];

const NEW_FN = `async function extractStreamUrl(url) {
    try {
        const u = String(url);
        const m = u.match(/\\/?(?:embed\\/)?(movie|tv)\\/([^\\/\\s&?]+)/);
        if (!m) return JSON.stringify({ streams: [], subtitles: null });
        const type = m[1];
        const tmdbID = m[2];
        let seasonNumber = null, episodeNumber = null;
        if (type === 'tv') {
            const se = u.match(/(?:&|\\?|\\/|^)s=(\\d+)[^\\d]*e=(\\d+)/);
            if (se) { seasonNumber = se[1]; episodeNumber = se[2]; }
            else {
                const seg = u.split('/');
                const nums = seg.filter(p => /^\\d+$/.test(p));
                if (nums.length >= 3) { seasonNumber = nums[1]; episodeNumber = nums[2]; }
            }
        }
        if (type === 'tv' && (seasonNumber == null || episodeNumber == null)) {
            return JSON.stringify({ streams: [], subtitles: null });
        }

        const encRes = await fetchv2("https://enc-dec.app/api/enc-vidlink?text=" + tmdbID);
        const encData = await encRes.json();

        const vidlinkHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "Origin": "https://vidlink.pro",
            "Referer": "https://vidlink.pro/"
        };
        const apiUrl = type === 'movie'
            ? \`https://vidlink.pro/api/b/movie/\${encData.result}?multiLang=0\`
            : \`https://vidlink.pro/api/b/tv/\${encData.result}/\${seasonNumber}/\${episodeNumber}?multiLang=0\`;

        const resp = await fetchv2(apiUrl, vidlinkHeaders, "GET", null);
        if (!resp) return JSON.stringify({ streams: [], subtitles: null });
        const text = await resp.text();
        if (!text || String(text).trim() === "") return JSON.stringify({ streams: [], subtitles: null });

        const data = JSON.parse(text);
        const streamObjects = [];
        if (data.stream && data.stream.playlist) {
            streamObjects.push({
                title: "Primary",
                streamUrl: data.stream.playlist,
                headers: { "Origin": "https://vidlink.pro", "Referer": "https://vidlink.pro/" }
            });
        }
        if (data.stream && data.stream.qualities) {
            for (const q of Object.keys(data.stream.qualities)) {
                if (data.stream.qualities[q] && data.stream.qualities[q].url) {
                    streamObjects.push({
                        title: q + "p",
                        streamUrl: data.stream.qualities[q].url,
                        headers: { "Origin": "https://vidlink.pro", "Referer": "https://vidlink.pro/" }
                    });
                }
            }
        }
        let englishSubtitle = null;
        if (data.stream && data.stream.captions) {
            const en = data.stream.captions.find(s => String(s.language || '').toLowerCase().includes('english'));
            englishSubtitle = en && en.url ? en.url : null;
        }
        return JSON.stringify({ streams: streamObjects, subtitles: englishSubtitle });
    } catch (e) {
        console.log('Stream error:', e);
        return JSON.stringify({ streams: [], subtitles: null });
    }
}
`;

function findFunctionEnd(src, startIdx) {
  // startIdx points at 'async function extractStreamUrl'
  const open = src.indexOf('{', startIdx);
  if (open < 0) return src.length;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

for (const name of MODULES) {
  const fp = path.join(ROOT, name, name + '.js');
  let src = fs.readFileSync(fp, 'utf8');
  const marker = 'async function extractStreamUrl';
  const idx = src.indexOf(marker);
  if (idx < 0) { console.log(`SKIP ${name}: no extractStreamUrl`); continue; }
  const end = findFunctionEnd(src, idx);
  const before = src.slice(0, idx);
  const after = src.slice(end);
  src = before + NEW_FN + (after.startsWith('\n\n') ? after : '\n' + after);
  fs.writeFileSync(fp, src);
  console.log(`PATCHED ${name} (replaced ${end - idx} bytes)`);
}
console.log('done');