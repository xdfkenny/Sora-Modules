const SITE_BASES = [
  "https://shizaproject.com",
  "https://shiza-project.com"
];

const SITE_BASE = SITE_BASES[0];
const DEFAULT_SUBTITLE = "https://none.com";

function _ua() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
}

function _safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function _cleanBase(base) {
  const raw = String(base || SITE_BASE).trim().replace(/\/+$/, "");
  return raw || SITE_BASE;
}

function _normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("//")) return "https:" + raw;
  return raw;
}

function _packRelease(payload) {
  return "shizaproject-release:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackRelease(href) {
  const raw = String(href || "");
  if (!raw.startsWith("shizaproject-release:")) return null;
  return _safeJsonParse(decodeURIComponent(raw.slice("shizaproject-release:".length)), null);
}

function _packEpisode(payload) {
  return "shizaproject:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackEpisode(href) {
  const raw = String(href || "");
  if (!raw.startsWith("shizaproject:")) return null;
  return _safeJsonParse(decodeURIComponent(raw.slice("shizaproject:".length)), null);
}

function _extractSlug(input) {
  const packed = _unpackRelease(input);
  if (packed?.slug) return String(packed.slug);

  const raw = String(input || "").trim();
  if (!raw) return "";

  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || raw;
  } catch (_) {}

  return raw;
}

function _extractPreferredBase(input) {
  const packed = _unpackRelease(input);
  if (packed?.siteBase) return _cleanBase(packed.siteBase);

  const raw = String(input || "").trim();
  if (!raw) return SITE_BASE;

  try {
    const u = new URL(raw);
    return _cleanBase(u.origin);
  } catch (_) {}

  return SITE_BASE;
}

function _orderedBases(preferredBase) {
  const out = [];

  const add = (base) => {
    const clean = _cleanBase(base);
    if (clean && !out.includes(clean)) out.push(clean);
  };

  if (preferredBase) add(preferredBase);
  for (const base of SITE_BASES) add(base);

  return out;
}

function _graphqlHeaders(base) {
  const site = _cleanBase(base);

  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": _ua(),
    "Origin": site,
    "Referer": site + "/"
  };
}

async function _graphqlOnBase(base, operationName, variables, query) {
  const site = _cleanBase(base);
  const body = JSON.stringify({ operationName, variables, query });

  const response = await fetchv2(site + "/graphql", _graphqlHeaders(site), "POST", body);
  const data = await response.json();

  if (data?.errors?.length) {
    throw new Error("GraphQL error");
  }

  return {
    data: data?.data || {},
    siteBase: site
  };
}

async function _graphql(operationName, variables, query, preferredBase) {
  let lastError = null;

  for (const base of _orderedBases(preferredBase)) {
    try {
      return await _graphqlOnBase(base, operationName, variables, query);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("All ShizaProject domains failed");
}

const SEARCH_QUERY = `
query search($query: String!, $type: SearchType!) {
  search(query: $query, type: $type, first: 10) {
    edges {
      node {
        id
        __typename
        ... on Release {
          id
          slug
          name
          originalName
          airedOn
          releasedOn
          publishedAt
          announcement
          episodesCount
          episodesAired
          episodeDuration
          season
          seasonYear
          seasonNumber
          status
          activity
          type
          rating
          viewCount
          score
          posters {
            original {
              url
            }
            preview: resize(width: 360, height: 500) {
              url
            }
          }
          genres {
            id
            slug
            name
            __typename
          }
          __typename
        }
      }
    }
  }
}`;

const RELEASE_QUERY = `
query releaseAllSafe($slug: String!) {
  release(slug: $slug) {
    __typename
    id
    slug
    name
    originalName
    airedOn
    releasedOn
    publishedAt
    announcement
    episodesCount
    episodesAired
    episodeDuration
    season
    seasonYear
    seasonNumber
    status
    activity
    type
    rating
    viewCount
    score
    genres {
      id
      slug
      name
      __typename
    }
    episodes {
      __typename
      id
      number
      name
      duration
      videos {
        id
        embedUrl
        __typename
      }
    }
  }
}`;

async function _getRelease(slug, preferredBase) {
  const result = await _graphql(
    "releaseAllSafe",
    { slug: String(slug || "") },
    RELEASE_QUERY,
    preferredBase
  );

  return {
    release: result?.data?.release || null,
    siteBase: result?.siteBase || _cleanBase(preferredBase)
  };
}

function _pickPoster(release) {
  const posters = Array.isArray(release?.posters) ? release.posters : [];
  if (!posters.length) return "";

  const first = posters[0];

  return (
    _normalizeUrl(first?.original?.url || "") ||
    _normalizeUrl(first?.preview?.url || "") ||
    ""
  );
}

function _releaseAliases(release) {
  const parts = [];

  if (release?.originalName) parts.push(`Original: ${release.originalName}`);
  if (release?.type) parts.push(`Type: ${release.type}`);
  if (Number.isFinite(release?.episodesCount)) parts.push(`Episodes: ${release.episodesCount}`);
  if (Number.isFinite(release?.episodeDuration)) parts.push(`Duration: ${release.episodeDuration}m`);
  if (release?.announcement) parts.push(String(release.announcement));

  if (Array.isArray(release?.genres) && release.genres.length) {
    parts.push(`Genres: ${release.genres.map(g => g?.name).filter(Boolean).join(", ")}`);
  }

  return parts.join(" | ");
}

function _scoreTitle(title, keyword) {
  const t = String(title || "").toLowerCase().trim();
  const k = String(keyword || "").toLowerCase().trim();

  if (!t || !k) return 99;
  if (t === k) return 0;
  if (t.startsWith(k)) return 1;
  if (t.includes(k)) return 2;

  return 3;
}

async function searchResults(keyword) {
  try {
    const query = String(keyword || "").trim();
    if (!query) return JSON.stringify([]);

    const result = await _graphql("search", { query, type: "RELEASE" }, SEARCH_QUERY);
    const siteBase = result?.siteBase || SITE_BASE;
    const edges = Array.isArray(result?.data?.search?.edges) ? result.data.search.edges : [];

    const out = edges
      .map(edge => edge?.node)
      .filter(node => node?.__typename === "Release" && node?.slug)
      .map(release => {
        const title = release?.name || release?.originalName || "Unknown title";
        const image = _pickPoster(release);

        const item = {
          title,
          href: _packRelease({
            slug: release.slug,
            id: release.id,
            title,
            originalName: release?.originalName || "",
            airedOn: release?.airedOn || release?.releasedOn || "",
            image,
            siteBase
          }),
          _score: Math.min(
            _scoreTitle(release?.name || "", query),
            _scoreTitle(release?.originalName || "", query)
          )
        };

        if (image) {
          item.image = image;
        }

        return item;
      });

    out.sort((a, b) => a._score - b._score);

    return JSON.stringify(out.map(({ _score, ...rest }) => rest));
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractDetails(href) {
  try {
    const slug = _extractSlug(href);
    const preferredBase = _extractPreferredBase(href);

    if (!slug) return JSON.stringify([]);

    const result = await _getRelease(slug, preferredBase);
    const release = result?.release;

    if (!release) return JSON.stringify([]);

    const titleLine = release?.originalName && release?.originalName !== release?.name
      ? `${release.name} / ${release.originalName}`
      : (release?.name || release?.originalName || "ShizaProject");

    const statusLine = [release?.status, release?.activity]
      .filter(Boolean)
      .join(" / ");

    const description = [titleLine, statusLine]
      .filter(Boolean)
      .join("\n");

    return JSON.stringify([{
      description: description || "No description available.",
      aliases: _releaseAliases(release) || "ShizaProject",
      airdate: release?.airedOn || release?.releasedOn || "Unknown"
    }]);
  } catch (_) {
    return JSON.stringify([]);
  }
}

async function extractEpisodes(href) {
  try {
    const slug = _extractSlug(href);
    const preferredBase = _extractPreferredBase(href);

    if (!slug) return JSON.stringify([]);

    const result = await _getRelease(slug, preferredBase);
    const release = result?.release;
    const siteBase = result?.siteBase || preferredBase || SITE_BASE;

    if (!release) return JSON.stringify([]);

    const episodes = Array.isArray(release?.episodes) ? release.episodes : [];

    const out = episodes
      .map((ep, index) => {
        const videos = Array.isArray(ep?.videos) ? ep.videos : [];

        const embedUrls = videos
          .map(v => _normalizeUrl(v?.embedUrl || ""))
          .filter(Boolean);

        if (!embedUrls.length) return null;

        const number = Number.isFinite(ep?.number) ? ep.number : (index + 1);
        const title = ep?.name ? String(ep.name) : `Episode ${number}`;

        const entry = {
          href: _packEpisode({
            releaseSlug: release.slug,
            episodeId: ep?.id || "",
            number,
            title,
            embedUrls,
            fallbackEmbedUrl: embedUrls[0],
            siteBase
          }),
          number,
          title
        };

        if (Number.isFinite(ep?.duration)) {
          entry.duration = ep.duration * 60;
        }

        return entry;
      })
      .filter(Boolean)
      .sort((a, b) => Number(a.number) - Number(b.number));

    return JSON.stringify(out);
  } catch (_) {
    return JSON.stringify([]);
  }
}

function _qualityNumber(key) {
  const n = parseInt(String(key || "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function _pickQualityUrl(qualities, target) {
  for (const key in qualities || {}) {
    const q = _qualityNumber(key);
    const src = _normalizeUrl(qualities?.[key]?.src || "");
    if (q === target && src) return src;
  }

  return null;
}

function _streamHeaders(siteBase) {
  const site = _cleanBase(siteBase || SITE_BASE);

  return {
    "User-Agent": _ua(),
    "Referer": site + "/",
    "Origin": site
  };
}

function _buildStreamsFromQualities(qualities, siteBase) {
  const url720 = _pickQualityUrl(qualities, 720);
  const url480 = _pickQualityUrl(qualities, 480);
  const url360 = _pickQualityUrl(qualities, 360);

  const known = {
    720: url720,
    480: url480,
    360: url360
  };

  const headers = _streamHeaders(siteBase);
  const streams = [];

  for (const quality of [720, 480, 360]) {
    const streamUrl = known[quality];
    if (!streamUrl) continue;

    streams.push({
      title: `${quality}p`,
      streamUrl,
      url720,
      url480,
      url360,
      headers
    });
  }

  if (!streams.length) {
    let bestQuality = 0;
    let bestUrl = "";

    for (const key in qualities || {}) {
      const q = _qualityNumber(key);
      const src = _normalizeUrl(qualities?.[key]?.src || "");
      if (!src) continue;

      if (q > bestQuality) {
        bestQuality = q;
        bestUrl = src;
      }
    }

    if (bestUrl) {
      streams.push({
        title: bestQuality ? `${bestQuality}p` : "Kodik",
        streamUrl: bestUrl,
        url720: bestQuality >= 720 ? bestUrl : null,
        url480: bestQuality >= 480 && bestQuality < 720 ? bestUrl : null,
        url360: bestQuality >= 360 && bestQuality < 480 ? bestUrl : null,
        headers
      });
    }
  }

  return streams;
}

function _isKodikUrl(url) {
  const raw = String(url || "").toLowerCase();
  return raw.includes("kodikplayer.com") || raw.includes("kodik.info");
}

async function extractStreamUrl(href) {
  try {
    const payload = _unpackEpisode(href);

    if (!payload) {
      return JSON.stringify({
        streams: [],
        subtitle: DEFAULT_SUBTITLE
      });
    }

    const siteBase = _cleanBase(payload?.siteBase || SITE_BASE);

    const embedUrls = Array.isArray(payload?.embedUrls)
      ? payload.embedUrls.map(_normalizeUrl).filter(Boolean)
      : [_normalizeUrl(payload?.fallbackEmbedUrl)].filter(Boolean);

    const streams = [];

    for (const embedUrl of embedUrls) {
      if (!_isKodikUrl(embedUrl)) continue;

      try {
        const qualitiesJson = await kodikParser(embedUrl, siteBase);
        const qualities = _safeJsonParse(qualitiesJson, {});
        const parsedStreams = _buildStreamsFromQualities(qualities, siteBase);
        streams.push(...parsedStreams);
      } catch (_) {}
    }

    return JSON.stringify({
      streams,
      subtitle: DEFAULT_SUBTITLE
    });
  } catch (_) {
    return JSON.stringify({
      streams: [],
      subtitle: DEFAULT_SUBTITLE
    });
  }
}

async function kodikParser(url, siteBase) {
  try {
    const site = _cleanBase(siteBase || SITE_BASE);
    const embedUrl = _normalizeUrl(url);

    const headers = {
      "Referer": site + "/",
      "User-Agent": _ua()
    };

    const response = await fetchv2(embedUrl, headers);
    const htmlText = await response.text();

    const urlParamsMatch = htmlText.match(/var\s+urlParams\s*=\s*'([^']+)'/);
    const videoInfoTypeMatch = htmlText.match(/vInfo\.type\s*=\s*'([^']+)'/);
    const videoInfoHashMatch = htmlText.match(/vInfo\.hash\s*=\s*'([^']+)'/);
    const videoInfoIdMatch = htmlText.match(/vInfo\.id\s*=\s*'([^']+)'/);

    const urlParams = urlParamsMatch ? _safeJsonParse(urlParamsMatch[1], {}) : {};
    const videoInfoType = videoInfoTypeMatch ? videoInfoTypeMatch[1] : "";
    const videoInfoHash = videoInfoHashMatch ? videoInfoHashMatch[1] : "";
    const videoInfoId = videoInfoIdMatch ? videoInfoIdMatch[1] : "";

    const finalData =
      `d=${urlParams.d || ""}` +
      `&d_sign=${urlParams.d_sign || ""}` +
      `&pd=${urlParams.pd || ""}` +
      `&pd_sign=${urlParams.pd_sign || ""}` +
      `&ref=${urlParams.ref || ""}` +
      `&ref_sign=${urlParams.ref_sign || ""}` +
      `&bad_user=false&cdn_is_working=true` +
      `&type=${encodeURIComponent(videoInfoType)}` +
      `&hash=${encodeURIComponent(videoInfoHash)}` +
      `&id=${encodeURIComponent(videoInfoId)}` +
      `&info=%7B%7D`;

    const headers2 = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Referer": site + "/",
      "User-Agent": _ua(),
      "X-Requested-With": "XMLHttpRequest"
    };

    const apiResponse = await fetchv2(
      "https://kodikplayer.com/ftor",
      headers2,
      "POST",
      finalData
    );

    const apiJson = await apiResponse.json();

    const qualities = {};

    if (apiJson?.links) {
      for (const quality in apiJson.links) {
        const qualityArray = apiJson.links[quality];
        const first = Array.isArray(qualityArray) ? qualityArray[0] : null;

        if (!first?.src) continue;

        qualities[quality] = {
          src: decode(first.src),
          type: first.type || "application/x-mpegURL"
        };
      }
    }

    return JSON.stringify(qualities, null, 2);
  } catch (_) {
    return JSON.stringify({});
  }
}

function decode(input) {
  const map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let buffer = 0;
  let count = 0;

  const rotated = [];
  const source = String(input || "");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (/[a-zA-Z]/.test(ch)) {
      const code = ch.charCodeAt(0);
      const max = ch <= "Z" ? 90 : 122;
      const shifted = code + 18;

      rotated.push(String.fromCharCode(shifted <= max ? shifted : shifted - 26));
    } else {
      rotated.push(ch);
    }
  }

  const rot = rotated.join("");

  for (let j = 0; j < rot.length; j++) {
    const ch = rot[j];

    if (ch === "=") break;

    const val = map.indexOf(ch);
    if (val === -1) continue;

    buffer = (buffer << 6) | val;
    count += 6;

    if (count >= 8) {
      count -= 8;
      out += String.fromCharCode((buffer >> count) & 0xff);
    }
  }

  return out;
}

function _defaultExport() {
  return {
    searchResults,
    extractDetails,
    extractEpisodes,
    extractStreamUrl
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
  globalThis.module.exports = { default: _defaultExport };
} catch (_) {}