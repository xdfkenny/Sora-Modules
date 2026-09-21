const BASE_URL = "https://rezka.ag";
const BACKUP_URL = "https://hdrezka-home.tv";

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0",
  "Cookie": "hdmbbs=1"
};

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&#58;/g, ":")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, function (_, n) {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function stripTags(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function getAttr(tag, name) {
  const s = String(tag || "");
  const quoted = new RegExp(name + "\\s*=\\s*(['\"])(.*?)\\1", "i").exec(s);
  if (quoted && quoted[2]) return decodeHtmlEntities(quoted[2]);

  const plain = new RegExp(name + "\\s*=\\s*([^\\s>]+)", "i").exec(s);
  return plain && plain[1] ? decodeHtmlEntities(plain[1]) : "";
}

function normalizeUrl(url, base) {
  const raw = decodeHtmlEntities(String(url || "").trim());
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("//")) return "https:" + raw;

  const root = String(base || BASE_URL).replace(/\/+$/, "");
  return root + "/" + raw.replace(/^\/+/, "");
}

function backupUrl(url) {
  const raw = normalizeUrl(url, BASE_URL);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const backup = new URL(BACKUP_URL);
    parsed.protocol = backup.protocol;
    parsed.host = backup.host;
    return parsed.toString();
  } catch (_) {
    return raw;
  }
}

function getOrigin(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol + "//" + parsed.host;
  } catch (_) {
    return BASE_URL;
  }
}

function getQueryParam(url, name) {
  try {
    return new URL(String(url || "")).searchParams.get(name);
  } catch (_) {
    const re = new RegExp("[?&]" + name + "=([^&#]*)");
    const m = re.exec(String(url || ""));
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  }
}

function appendQueryParams(url, params) {
  const base = String(url || "").split("?")[0];
  const query = Object.entries(params)
    .filter(function (pair) {
      return pair[1] !== null && pair[1] !== undefined && String(pair[1]) !== "";
    })
    .map(function (pair) {
      return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(String(pair[1]));
    })
    .join("&");

  return query ? base + "?" + query : base;
}

async function fetchTextBackup(url, headers) {
  const primary = normalizeUrl(url, BASE_URL);
  const backup = backupUrl(primary);
  const tries = primary === backup ? [primary] : [primary, backup];

  for (const u of tries) {
    try {
      const res = await fetchv2(u, headers || defaultHeaders);
      const text = await res.text();

      if (text && String(text).length > 0) {
        return {
          url: u,
          text: String(text)
        };
      }
    } catch (_) {}
  }

  return {
    url: primary,
    text: ""
  };
}

async function fetchJsonBackup(url, headers, method, body) {
  const primary = normalizeUrl(url, BASE_URL);
  const backup = backupUrl(primary);
  const tries = primary === backup ? [primary] : [primary, backup];

  for (const u of tries) {
    try {
      const res = await fetchv2(u, headers || defaultHeaders, method || "GET", body);
      const data = await res.json();

      if (data) return data;
    } catch (_) {}
  }

  return null;
}

function ajaxHeaders(referer) {
  return {
    "User-Agent": defaultHeaders["User-Agent"],
    "Cookie": defaultHeaders["Cookie"],
    "Accept": "application/json,text/javascript,*/*;q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": referer || BASE_URL + "/",
    "Origin": getOrigin(referer || BASE_URL + "/")
  };
}

function getPostId(html, url) {
  const src = String(html || "");

  const match1 =
    src.match(/id="post_id"\s+value="(\d+)"/) ||
    src.match(/value="(\d+)"\s+id="post_id"/);

  if (match1) return match1[1];

  const input =
    src.match(/<input\b[^>]*(?:id|name)=["']post_id["'][^>]*>/i) ||
    src.match(/<input\b[^>]*value=["']\d+["'][^>]*(?:id|name)=["']post_id["'][^>]*>/i);

  if (input) {
    const id = parseInt(getAttr(input[0], "value"), 10);
    if (Number.isFinite(id)) return String(id);
  }

  const init = src.match(/sof\.tv\.initCDN(?:Series|Movies)Events\(\s*(\d+)/);
  if (init) return init[1];

  const issue = src.match(/<[^>]+id=["']send-video-issue["'][^>]*>/i);
  if (issue) {
    const id = parseInt(getAttr(issue[0], "data-id"), 10);
    if (Number.isFinite(id)) return String(id);
  }

  const fav = src.match(/<[^>]+id=["']user-favorites-holder["'][^>]*>/i);
  if (fav) {
    const id = parseInt(getAttr(fav[0], "data-post_id"), 10);
    if (Number.isFinite(id)) return String(id);
  }

  const last = String(url || "").split("/").pop() || "";
  const slug = last.match(/^(\d+)/);
  if (slug) return slug[1];

  return null;
}

function getDefaultTranslatorId(html) {
  const src = String(html || "");

  const init = src.match(/sof\.tv\.initCDN(?:Series|Movies)Events\(\s*\d+\s*,\s*(\d+)/);
  if (init) {
    const id = parseInt(init[1], 10);
    if (Number.isFinite(id)) return id;
  }

  const links = src.match(/<a\b[^>]*\bb-translator__item\b[^>]*>/gi) || [];
  for (const tag of links) {
    const cls = getAttr(tag, "class").toLowerCase();
    if (!cls.includes("active")) continue;

    const id = parseInt(getAttr(tag, "data-translator_id"), 10);
    if (Number.isFinite(id)) return id;
  }

  return null;
}

function isPremiumTranslatorTag(tag) {
  const cls = getAttr(tag, "class").toLowerCase();
  return cls.includes("b-prem_translator") || cls.includes("prem_translator");
}

function addTranslatorUnique(list, id, name, href) {
  const cleanId = parseInt(id, 10);
  if (!Number.isFinite(cleanId)) return;

  if (list.some(function (t) {
    return parseInt(t.id, 10) === cleanId;
  })) {
    return;
  }

  list.push({
    id: cleanId,
    name: stripTags(name || "") || ("Voiceover " + cleanId),
    href: href || ""
  });
}

function parseTranslators(html, pageUrl) {
  const src = String(html || "");
  const translators = [];
  let match;

  const listMatch = src.match(/<ul\b[^>]*id=["']translators-list["'][^>]*>([\s\S]*?)<\/ul>/i);
  const scope = listMatch ? listMatch[1] : src;

  const linkRegex = /<a\b[^>]*\bb-translator__item\b[^>]*>[\s\S]*?<\/a>/gi;

  while ((match = linkRegex.exec(scope)) !== null) {
    const block = match[0];
    const tag = (block.match(/<a\b[^>]*>/i) || [""])[0];

    if (isPremiumTranslatorTag(tag)) continue;

    const id = getAttr(tag, "data-translator_id");
    const name = getAttr(tag, "title") || stripTags(block);
    const href = normalizeUrl(getAttr(tag, "href"), pageUrl || BASE_URL);

    addTranslatorUnique(translators, id, name, href || pageUrl);
  }

  if (!translators.length) {
    const anyTranslatorRegex = /data-translator_id\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]{0,200}?)<\//gi;

    while ((match = anyTranslatorRegex.exec(src)) !== null) {
      const tagStart = src.lastIndexOf("<", match.index);
      const tagEnd = src.indexOf(">", match.index);
      const tag = tagStart >= 0 && tagEnd >= 0 ? src.slice(tagStart, tagEnd + 1) : "";

      if (isPremiumTranslatorTag(tag)) continue;

      addTranslatorUnique(translators, match[1], match[2], pageUrl);
    }
  }

  return normalizeTranslators(translators, null);
}

function normalizeTranslators(translators, preferredId) {
  const result = [];
  const seen = new Set();

  for (const t of Array.isArray(translators) ? translators : []) {
    const id = parseInt(t && t.id, 10);
    if (!Number.isFinite(id)) continue;
    if (seen.has(id)) continue;

    seen.add(id);

    result.push({
      id: id,
      name: stripTags(t && t.name ? t.name : "") || ("Voiceover " + id),
      href: t && t.href ? t.href : ""
    });
  }

  if (Number.isFinite(preferredId)) {
    result.sort(function (a, b) {
      if (a.id === preferredId) return -1;
      if (b.id === preferredId) return 1;
      return 0;
    });
  }

  return result;
}

function parseEpisodesHtml(episodesHtml, pageUrl, postId, translatorId) {
  const src = String(episodesHtml || "");
  const results = [];
  const seen = new Set();

  const itemRegex = /<li\b([^>]*\bb-simple_episode__item\b[^>]*)>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = itemRegex.exec(src)) !== null) {
    const attrs = match[1] || "";

    const season = parseInt(getAttr(attrs, "data-season_id"), 10);
    const episode = parseInt(getAttr(attrs, "data-episode_id"), 10);

    if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;

    const key = season + ":" + episode;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      href: appendQueryParams(pageUrl, {
        post_id: postId,
        translator_id: translatorId,
        season: season,
        episode: episode
      }),
      number: episode,
      episode: episode,
      season: season,
      description: `S${season}E${episode}`,
      title: `S${season}E${episode}`
    });
  }

  results.sort(function (a, b) {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });

  return results;
}

function getEpisodeStats(episodes) {
  const seasons = {};
  let count = 0;

  for (const ep of Array.isArray(episodes) ? episodes : []) {
    const season = parseInt(ep.season, 10);
    if (Number.isFinite(season)) seasons[season] = true;
    count++;
  }

  const seasonNumbers = Object.keys(seasons)
    .map(function (x) { return parseInt(x, 10); })
    .filter(function (x) { return Number.isFinite(x); });

  return {
    count: count,
    seasonCount: seasonNumbers.length,
    hasSeason1: seasonNumbers.includes(1),
    maxSeason: seasonNumbers.length ? Math.max.apply(null, seasonNumbers) : 0
  };
}

function scoreEpisodes(episodes) {
  const stats = getEpisodeStats(episodes);

  return (
    stats.count +
    stats.seasonCount * 100 +
    (stats.hasSeason1 ? 1000 : 0) +
    stats.maxSeason
  );
}

async function findBestEpisodesResponse(postId, pageUrl, translators) {
  const origin = getOrigin(pageUrl);
  const headers = ajaxHeaders(pageUrl);

  let best = {
    translator: null,
    episodes: [],
    score: -1
  };

  const list = Array.isArray(translators) ? translators : [];
  const maxChecks = Math.min(list.length, 8);

  for (let i = 0; i < maxChecks; i++) {
    const tr = list[i];

    try {
      const translatorId = parseInt(tr.id, 10);
      if (!Number.isFinite(translatorId)) continue;

      const body =
        "id=" + encodeURIComponent(postId) +
        "&translator_id=" + encodeURIComponent(translatorId) +
        "&action=get_episodes";

      const trHeaders = {
        ...headers,
        "Referer": tr.href || pageUrl
      };

      const data = await fetchJsonBackup(origin + "/ajax/get_cdn_series/", trHeaders, "POST", body);

      if (!data || !data.success || !data.episodes) continue;

      const episodes = parseEpisodesHtml(data.episodes, pageUrl, postId, translatorId);
      const score = scoreEpisodes(episodes);
      const stats = getEpisodeStats(episodes);

      if (score > best.score) {
        best = {
          translator: tr,
          episodes: episodes,
          score: score
        };
      }

      if (stats.hasSeason1 && stats.seasonCount >= 3 && stats.count >= 40) {
        break;
      }
    } catch (_) {}
  }

  return best;
}

function getCombinations(arr, length) {
  if (length === 1) return arr.map(function (x) { return [x]; });

  const results = [];
  const sub = getCombinations(arr, length - 1);

  for (const val of arr) {
    for (const s of sub) {
      results.push([val].concat(s));
    }
  }

  return results;
}

function btoaLocal(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let str = "";

  for (let i = 0; i < input.length; i += 3) {
    const c1 = input.charCodeAt(i);
    const c2 = i + 1 < input.length ? input.charCodeAt(i + 1) : NaN;
    const c3 = i + 2 < input.length ? input.charCodeAt(i + 2) : NaN;

    str +=
      chars.charAt(c1 >> 2) +
      chars.charAt(((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4)) +
      chars.charAt(isNaN(c2) ? 64 : ((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6)) +
      chars.charAt(isNaN(c3) ? 64 : c3 & 63);
  }

  return str;
}

function atobLocal(input) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const raw = String(input || "");
  let str = "";
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charAt(i);
    if (ch === "=") break;

    const idx = chars.indexOf(ch);
    if (idx === -1) continue;

    buffer = (buffer << 6) | idx;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      str += String.fromCharCode((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }

  return str;
}

function decodeUtf8(str) {
  try {
    return decodeURIComponent(escape(str));
  } catch (_) {
    return str;
  }
}

function clearTrash(data) {
  const trashList = ["@", "#", "!", "^", "$"];
  const trashCodes = [];

  for (let i = 2; i <= 3; i++) {
    const combos = getCombinations(trashList, i);

    for (const combo of combos) {
      trashCodes.push(btoaLocal(combo.join("")));
    }
  }

  let text = String(data || "").replace("#h", "").split("//_//").join("");

  for (const code of trashCodes) {
    text = text.split(code).join("");
  }

  try {
    return decodeUtf8(atobLocal(text + "=="));
  } catch (_) {
    return text;
  }
}

function isPremiumQualityLabel(label) {
  const s = String(label || "").toLowerCase();

  return (
    s.includes("ultra") ||
    s.includes("4k") ||
    s.includes("2k") ||
    s.includes("2160") ||
    s.includes("1440") ||
    s.includes("premium") ||
    s.includes("vip") ||
    s.includes("премиум")
  );
}

function qualityKeyFromLabel(label) {
  const s = String(label || "").toLowerCase();

  if (isPremiumQualityLabel(s)) return null;

  const m = s.match(/(1080|720|480|360|240|144)\s*p?/);
  const value = m ? parseInt(m[1], 10) : 0;

  if (value >= 1080 || s.includes("fullhd") || s.includes("full hd")) return "url1080";
  if (value >= 720 || s.includes("hd")) return "url720";
  if (value >= 480) return "url480";
  if (value >= 360) return "url360";
  if (value >= 240) return "url240";
  if (value >= 144) return "url144";

  return null;
}

function emptyQualityUrls() {
  return {
    url1080: null,
    url720: null,
    url480: null,
    url360: null,
    url240: null,
    url144: null,
    hlsUrl: null,
    dashUrl: null
  };
}

function parseRezkaStreams(rawUrl, voiceName, referer) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return [];

  let decoded = raw;

  if (!decoded.startsWith("[") && !decoded.startsWith("http")) {
    decoded = clearTrash(decoded);
  }

  decoded = decodeHtmlEntities(decoded);

  const qualityUrls = emptyQualityUrls();

  if (!decoded.includes("[") && (decoded.includes(".mp4") || decoded.includes(".m3u8") || decoded.includes(".mpd"))) {
    if (decoded.includes(".m3u8")) qualityUrls.hlsUrl = decoded;
    else if (decoded.includes(".mpd")) qualityUrls.dashUrl = decoded;
    else qualityUrls.url720 = decoded;

    const stream = makeQualityStream(voiceName, qualityUrls, referer);
    return stream ? [stream] : [];
  }

  const partRegex = /\[([^\]]+)\]\s*([^\[]+)/g;
  let match;

  while ((match = partRegex.exec(decoded)) !== null) {
    const quality = stripTags(match[1]).trim();
    if (!quality || quality.includes("<")) continue;

    const key = qualityKeyFromLabel(quality);
    if (!key) continue;

    const links = String(match[2] || "")
      .split(/\s+or\s+/i)
      .map(function (x) {
        return x.replace(/^,+|,+$/g, "").trim();
      })
      .filter(Boolean)
      .filter(function (x) {
        return x.includes(".mp4") || x.includes(".m3u8") || x.includes(".mpd");
      });

    if (!links.length) continue;

    const mp4 = links.find(function (x) { return x.includes(".mp4"); });
    const hls = links.find(function (x) { return x.includes(".m3u8"); });
    const dash = links.find(function (x) { return x.includes(".mpd"); });

    if (mp4 && !qualityUrls[key]) qualityUrls[key] = mp4;
    if (hls && !qualityUrls.hlsUrl) qualityUrls.hlsUrl = hls;
    if (dash && !qualityUrls.dashUrl) qualityUrls.dashUrl = dash;
  }

  const stream = makeQualityStream(voiceName, qualityUrls, referer);
  return stream ? [stream] : [];
}

function makeQualityStream(voiceName, qualityUrls, referer) {
  const streamUrl =
    qualityUrls.url1080 ||
    qualityUrls.url720 ||
    qualityUrls.url480 ||
    qualityUrls.url360 ||
    qualityUrls.url240 ||
    qualityUrls.url144 ||
    qualityUrls.hlsUrl ||
    qualityUrls.dashUrl ||
    null;

  if (!streamUrl) return null;

  return {
    title: stripTags(voiceName || "HDRezka"),
    streamUrl: streamUrl,
    url: streamUrl,
    url1080: qualityUrls.url1080,
    url720: qualityUrls.url720,
    url480: qualityUrls.url480,
    url360: qualityUrls.url360,
    url240: qualityUrls.url240,
    url144: qualityUrls.url144,
    hlsUrl: qualityUrls.hlsUrl,
    dashUrl: qualityUrls.dashUrl,
    headers: {
      "User-Agent": defaultHeaders["User-Agent"],
      "Cookie": defaultHeaders["Cookie"],
      "Referer": referer || BASE_URL + "/"
    }
  };
}

function parseSubtitles(data) {
  const result = {
    subtitle: "",
    subtitles: []
  };

  if (!data || !data.success || !data.subtitle) {
    return result;
  }

  const raw = String(data.subtitle || "");
  const lns = data.subtitle_lns || {};
  const def = String(data.subtitle_def || "").toLowerCase();

  const re = /\[([^\]]+)\]\s*([^,\s]+)/g;
  let match;

  while ((match = re.exec(raw)) !== null) {
    const label = stripTags(match[1]);
    const url = String(match[2] || "").trim();

    if (!label || !url) continue;

    const mapped = lns && lns[label] ? String(lns[label]) : "";
    const lang = mapped || label.toLowerCase();

    if (!lang || lang === "откл.") continue;

    result.subtitles.push({
      lang: lang,
      label: label,
      url: url,
      default: def ? lang.toLowerCase() === def : false
    });
  }

  const defaultSub = result.subtitles.find(function (s) {
    return s.default;
  });

  const englishSub = result.subtitles.find(function (s) {
    const lang = String(s.lang || "").toLowerCase();
    const label = String(s.label || "").toLowerCase();
    return lang === "en" || label.includes("english") || label.includes("eng");
  });

  const firstSub = result.subtitles[0];

  result.subtitle = (defaultSub || englishSub || firstSub || {}).url || "";

  return result;
}

function parseSubtitleUrl(data) {
  return parseSubtitles(data).subtitle;
}

async function searchResults(keyword) {
  try {
    const query = String(keyword || "").trim();
    if (!query) return JSON.stringify([]);

    const url = BASE_URL + "/search/?do=search&subaction=search&q=" + encodeURIComponent(query);
    const page = await fetchTextBackup(url, defaultHeaders);
    const html = page.text;

    const results = [];
    const seen = new Set();
    const parts = html.split('class="b-content__inline_item"');

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];

      const imgMatch = part.match(/<img\b[^>]*src=["']([^"']+)["']/i);
      const linkMatch = part.match(/<div\b[^>]*class=["']b-content__inline_item-link["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);

      if (!imgMatch || !linkMatch) continue;

      const href = normalizeUrl(linkMatch[1], page.url || BASE_URL);
      if (!href || seen.has(href)) continue;

      seen.add(href);

      results.push({
        title: stripTags(linkMatch[2]) || "HDRezka",
        image: normalizeUrl(imgMatch[1], page.url || BASE_URL),
        href: href
      });
    }

    return JSON.stringify(results);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const page = await fetchTextBackup(url, defaultHeaders);
    const html = page.text;

    const descMatch = html.match(/class=["'][^"']*b-post__description_text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const origMatch = html.match(/<div[^>]*class=["'][^"']*b-post__origtitle[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const yearMatch = html.match(/href=["'][^"']*\/year\/[^"']*["'][^>]*>([^<]+)<\/a>/i);

    return JSON.stringify([
      {
        description: descMatch ? stripTags(descMatch[1]) : "N/A",
        aliases: origMatch ? stripTags(origMatch[1]) : "N/A",
        airdate: yearMatch ? stripTags(yearMatch[1]) : "N/A"
      }
    ]);
  } catch (_) {
    return JSON.stringify([
      {
        description: "Error",
        aliases: "Error",
        airdate: "Error"
      }
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const page = await fetchTextBackup(url, defaultHeaders);
    const pageUrl = page.url;
    const html = page.text;

    const isTV = /<meta\b[^>]*property=["']og:type["'][^>]*content=["']video\.tv_series["']/i.test(html);
    const postId = getPostId(html, pageUrl);
    const defaultTranslatorId = getDefaultTranslatorId(html);
    const translators = normalizeTranslators(parseTranslators(html, pageUrl), defaultTranslatorId);

    if (!postId) return JSON.stringify([]);

    const selectedTranslator = translators[0] || {
      id: Number.isFinite(defaultTranslatorId) ? defaultTranslatorId : 0,
      name: "Default",
      href: pageUrl
    };

    if (!isTV) {
      return JSON.stringify([
        {
          href: appendQueryParams(pageUrl, {
            post_id: postId,
            translator_id: selectedTranslator.id
          }),
          number: 1,
          episode: 1,
          season: 1,
          title: "Фильм"
        }
      ]);
    }

    const best = await findBestEpisodesResponse(postId, pageUrl, translators);

    if (!best || !best.episodes || !best.episodes.length) {
      return JSON.stringify([]);
    }

    return JSON.stringify(best.episodes);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractStreamUrl(url) {
  try {
    const rawUrl = String(url || "");
    const basePageUrl = rawUrl.split("?")[0];

    let postId = parseInt(getQueryParam(rawUrl, "post_id"), 10);
    let selectedTranslatorId = parseInt(getQueryParam(rawUrl, "translator_id"), 10);
    let season = parseInt(getQueryParam(rawUrl, "season"), 10);
    let episode = parseInt(getQueryParam(rawUrl, "episode"), 10);

    const page = await fetchTextBackup(basePageUrl, defaultHeaders);
    const pageUrl = page.url || basePageUrl;
    const html = page.text || "";

    if (!postId) postId = parseInt(getPostId(html, pageUrl), 10);

    const pageTranslators = parseTranslators(html, pageUrl);
    const preferredId = Number.isFinite(selectedTranslatorId)
      ? selectedTranslatorId
      : getDefaultTranslatorId(html);

    const translators = normalizeTranslators(pageTranslators, preferredId);

    if (!postId) {
      return JSON.stringify({
        streams: [],
        subtitle: "",
        subtitles: []
      });
    }

    if (!Number.isFinite(season)) season = 1;
    if (!Number.isFinite(episode)) episode = 1;

    const isTV = rawUrl.includes("season=") && rawUrl.includes("episode=");
    const ajaxUrl = getOrigin(pageUrl) + "/ajax/get_cdn_series/";

    const streams = [];
    const seenStreams = new Set();

    const subtitles = [];
    const seenSubtitleKeys = new Set();
    let finalSubtitle = "";

    for (const tr of translators) {
      try {
        const translatorId = parseInt(tr.id, 10);
        if (!Number.isFinite(translatorId)) continue;

        const body = isTV
          ? "id=" + encodeURIComponent(postId) +
            "&translator_id=" + encodeURIComponent(translatorId) +
            "&season=" + encodeURIComponent(season) +
            "&episode=" + encodeURIComponent(episode) +
            "&action=get_stream"
          : "id=" + encodeURIComponent(postId) +
            "&translator_id=" + encodeURIComponent(translatorId) +
            "&action=get_movie";

        const headers = ajaxHeaders(tr.href || pageUrl);
        const data = await fetchJsonBackup(ajaxUrl, headers, "POST", body);

        if (!data || !data.success || !data.url) {
          continue;
        }

        const parsedSubs = parseSubtitles(data);

        if (!finalSubtitle && parsedSubs.subtitle) {
          finalSubtitle = parsedSubs.subtitle;
        }

        for (const sub of parsedSubs.subtitles) {
          const subKey = sub.lang + ":" + sub.url;
          if (seenSubtitleKeys.has(subKey)) continue;

          seenSubtitleKeys.add(subKey);
          subtitles.push(sub);
        }

        const voiceName =
          tr.name ||
          stripTags(data.translation || data.translator || data.title || "") ||
          ("Voiceover " + translatorId);

        const translatorStreams = parseRezkaStreams(data.url, voiceName, tr.href || pageUrl);

        for (const stream of translatorStreams) {
          const key = translatorId + ":" + stream.streamUrl;
          if (seenStreams.has(key)) continue;

          seenStreams.add(key);
          streams.push(stream);
        }
      } catch (_) {}
    }

    return JSON.stringify({
      streams: streams,
      subtitle: finalSubtitle,
      subtitles: subtitles
    });
  } catch (_) {
    return JSON.stringify({
      streams: [],
      subtitle: "",
      subtitles: []
    });
  }
}

function _defaultExport() {
  return {
    searchResults: searchResults,
    extractDetails: extractDetails,
    extractEpisodes: extractEpisodes,
    extractStreamUrl: extractStreamUrl
  };
}

try {
  globalThis.default = _defaultExport;
} catch (_) {}

try {
  this.default = _defaultExport;
} catch (_) {}

try {
  globalThis.module = globalThis.module || {};
  globalThis.module.exports = {
    default: _defaultExport
  };
} catch (_) {}