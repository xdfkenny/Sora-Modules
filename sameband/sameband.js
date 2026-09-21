const BASE_URL = "https://sameband.studio";
const SEARCH_URL = BASE_URL + "/";

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

function _htmlDecode(value) {
	const s = String(value || "");
	if (!s) return "";

	const named = {
		"&amp;": "&",
		"&lt;": "<",
		"&gt;": ">",
		"&quot;": '"',
		"&#39;": "'",
		"&apos;": "'",
		"&nbsp;": " ",
		"&laquo;": "<<",
		"&raquo;": ">>"
	};

	const withNamed = s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp|laquo|raquo);/g, m => named[m] || m);
	const withDec = withNamed.replace(/&#(\d+);/g, (_, d) => {
		const code = parseInt(d, 10);
		return Number.isFinite(code) ? String.fromCharCode(code) : "";
	});

	return withDec.replace(/&#x([0-9a-f]+);/gi, (_, h) => {
		const code = parseInt(h, 16);
		return Number.isFinite(code) ? String.fromCharCode(code) : "";
	});
}

function _stripTags(value) {
	return _htmlDecode(String(value || "")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim());
}

function _absUrl(url, base) {
	const raw = String(url || "").trim();
	if (!raw) return "";
	if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
	if (raw.startsWith("//")) return "https:" + raw;

	const root = String(base || BASE_URL).replace(/\/+$/, "");
	return root + "/" + raw.replace(/^\/+/, "");
}

function _attr(tag, name) {
	const block = String(tag || "");
	if (!block) return "";

	const quoted = new RegExp(name + "\\s*=\\s*(['\"])(.*?)\\1", "i").exec(block);
	if (quoted && quoted[2]) return quoted[2];

	const plain = new RegExp(name + "\\s*=\\s*([^\\s>]+)", "i").exec(block);
	return plain && plain[1] ? plain[1] : "";
}

function _extractMeta(html, attrName, attrValue) {
	const src = String(html || "");
	const re = new RegExp(
		"<meta[^>]*" + attrName + "=['\"]" + attrValue + "['\"][^>]*content=['\"]([^'\"]+)['\"][^>]*>",
		"i"
	);
	const m = src.match(re);
	return m && m[1] ? _htmlDecode(m[1]).trim() : "";
}

function _packEpisode(payload) {
	return "sameband:" + encodeURIComponent(JSON.stringify(payload || {}));
}

function _unpackEpisode(href) {
	const raw = String(href || "");
	if (!raw.startsWith("sameband:")) return null;
	return _safeJsonParse(decodeURIComponent(raw.slice("sameband:".length)), null);
}

function _searchHeaders() {
	return {
		"User-Agent": _ua(),
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
		"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
		"Origin": BASE_URL,
		"Referer": SEARCH_URL
	};
}

function _htmlHeaders(referer) {
	return {
		"User-Agent": _ua(),
		"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
		"Referer": referer || SEARCH_URL,
		"Origin": BASE_URL
	};
}

async function _postSearch(query) {
	const body =
		"story=" + encodeURIComponent(String(query || "")) +
		"&do=search&subaction=search";

	try {
		const r = await fetchv2(SEARCH_URL, _searchHeaders(), "POST", body);
		const txt = await r.text();
		if (txt && txt.includes("class=\"poster\"")) return txt;
	} catch (_) {}

	const fallback = await fetchv2(BASE_URL + "/index.php?do=search", _searchHeaders(), "POST", body);
	return fallback.text();
}

function _parseSearchResults(html) {
	const src = String(html || "");
	const out = [];
	const seen = new Set();

	const articleRegex = /<article[^>]*class=["'][^"']*shortstory[^"']*["'][^>]*>[\s\S]*?<\/article>/gi;
	const blocks = src.match(articleRegex) || [];

	for (const block of blocks) {
		const posterTag = (block.match(/<div[^>]*class=["'][^"']*poster[^"']*["'][^>]*>/i) || [""])[0];
		const imageLinkTag = (block.match(/<a[^>]*class=["'][^"']*image[^"']*["'][^>]*>/i) || [""])[0];
		const infoTitleMatch = block.match(/<div[^>]*class=["'][^"']*info-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
		const imgTag = (block.match(/<img[^>]*>/i) || [""])[0];

		const href = _absUrl(_attr(imageLinkTag, "href"), BASE_URL);
		const titleRaw = _attr(posterTag, "title") || (infoTitleMatch ? infoTitleMatch[1] : "");
		const title = _stripTags(titleRaw);
		const image = _absUrl(_attr(imgTag, "src") || _attr(imgTag, "data-src"), BASE_URL);

		if (!href || !title || seen.has(href)) continue;
		seen.add(href);

		out.push({
			title,
			image,
			href
		});
	}

	return out;
}

function _extractAnimeUrl(input) {
	const raw = String(input || "").trim();
	if (!raw) return "";

	const packed = _unpackEpisode(raw);
	if (packed && packed.animeUrl) return _absUrl(packed.animeUrl, BASE_URL);

	return _absUrl(raw, BASE_URL);
}

function _bestYearCandidate(html) {
	const src = String(html || "");
	const years = [];
	const regex = /\b(19\d{2}|20\d{2})\b/g;
	let m;

	while ((m = regex.exec(src)) !== null) {
		const year = parseInt(m[1], 10);
		if (year >= 1950 && year <= (new Date().getFullYear() + 1)) {
			years.push(year);
		}
	}

	if (!years.length) return "Unknown";
	return String(Math.min.apply(null, years));
}

function _extractIframeSrc(html) {
	const src = String(html || "");

	const inPlayer = src.match(
		/<div[^>]*class=["'][^"']*player-content[^"']*["'][^>]*>[\s\S]*?<iframe[^>]*src=["']([^"']+)["']/i
	);
	if (inPlayer && inPlayer[1]) return inPlayer[1];

	const anyIframe = src.match(/<iframe[^>]*src=["']([^"']+)["']/i);
	return anyIframe && anyIframe[1] ? anyIframe[1] : "";
}

async function _fetchIframeFileField(iframeSrc, referer) {
	const iframeAbs = _absUrl(iframeSrc, BASE_URL);
	if (!iframeAbs) return "";

	try {
		const r = await fetchv2(iframeAbs, _htmlHeaders(referer || SEARCH_URL));
		const txt = await r.text();
		const m = txt && txt.match(/file\s*:\s*["']([^"']+)["']/i);
		if (m && m[1]) return String(m[1]).trim();
	} catch (_) {}

	return "";
}

function _buildListCandidates(iframeSrc, fileField) {
	const iframeAbs = _absUrl(iframeSrc, BASE_URL);
	const candidates = [];

	const add = (u) => {
		const v = String(u || "").trim();
		if (!v) return;
		if (!candidates.includes(v)) candidates.push(v);
	};

	// Primary: Playerjs `file:` value from the iframe page (title-keyed list,
	// e.g. "/v/list/One Piece Heroines_list.txt").
	if (fileField) {
		add(_absUrl(fileField, BASE_URL));
		add(encodeURI(_absUrl(fileField, BASE_URL)));
	}

	const playMatch = iframeAbs.match(/\/v\/play\/([^/?#]+)\.html/i);
	if (playMatch && playMatch[1]) {
		const fileName = decodeURIComponent(playMatch[1]);
		const withUnderscores = `${BASE_URL}/v/list/${fileName}_list.txt`;
		const withSpaces = `${BASE_URL}/v/list/${fileName.replace(/_/g, " ")}_list.txt`;

		add(withUnderscores);
		add(encodeURI(withUnderscores));
		add(withSpaces);
		add(encodeURI(withSpaces));
	}

	return candidates;
}

async function _fetchPlaylistArray(candidates, referer) {
	for (const candidate of candidates) {
		try {
			const r = await fetchv2(candidate, _htmlHeaders(referer || SEARCH_URL));
			const txt = await r.text();
			const parsed = _safeJsonParse(txt, null);
			if (Array.isArray(parsed) && parsed.length) {
				return parsed;
			}
		} catch (_) {}
	}

	return [];
}

function _extractEpisodeTitle(titleHtml, fallbackNum) {
	const clean = _stripTags(titleHtml || "").replace(/\b\d{1,2}:\d{2}\b/g, "").trim();
	return clean || `Episode ${fallbackNum}`;
}

function _extractEpisodeNumber(label, fallbackNum) {
	const m = String(label || "").match(/(\d{1,4})/);
	if (!m || !m[1]) return fallbackNum;

	const n = parseInt(m[1], 10);
	return Number.isFinite(n) ? n : fallbackNum;
}

function _parseFileVariants(fileField) {
	const raw = String(fileField || "").trim();
	if (!raw) return [];

	const out = [];
	const parts = raw.split(",");

	for (const part of parts) {
		const item = String(part || "").trim();
		if (!item) continue;

		const m = item.match(/^\[([^\]]+)\](.+)$/);
		const qualityLabel = m && m[1] ? String(m[1]).trim() : "";
		const path = m && m[2] ? String(m[2]).trim() : item;

		const abs = _absUrl(path, BASE_URL);
		if (!abs) continue;

		const q = parseInt(qualityLabel.replace(/[^\d]/g, ""), 10) || 0;
		out.push({
			quality: q,
			label: qualityLabel,
			url: encodeURI(abs)
		});
	}

	out.sort((a, b) => b.quality - a.quality);
	return out;
}

async function searchResults(keyword) {
	try {
		const query = String(keyword || "").trim();
		if (!query) return JSON.stringify([]);

		const html = await _postSearch(query);
		const results = _parseSearchResults(html);
		return JSON.stringify(results);
	} catch (_) {
		return JSON.stringify([]);
	}
}

async function extractDetails(url) {
	try {
		const animeUrl = _extractAnimeUrl(url);
		if (!animeUrl) return JSON.stringify([]);

		const r = await fetchv2(animeUrl, _htmlHeaders(SEARCH_URL));
		const html = await r.text();

		const descMatch = html.match(
			/<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*limiter[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
		);

		const description = _stripTags(
			(descMatch && descMatch[1]) || _extractMeta(html, "name", "description") || "No description available"
		) || "No description available";

		let aliases = _extractMeta(html, "property", "og:title") || "";
		aliases = aliases.replace(/\s*(?:>|\u00BB)+\s*SameBand\s*$/i, "").trim();

		return JSON.stringify([
			{
				description,
				aliases: aliases || "SameBand",
				airdate: _bestYearCandidate(html)
			}
		]);
	} catch (_) {
		return JSON.stringify([]);
	}
}

async function extractEpisodes(url) {
	try {
		const animeUrl = _extractAnimeUrl(url);
		if (!animeUrl) return JSON.stringify([]);

		const page = await fetchv2(animeUrl, _htmlHeaders(SEARCH_URL));
		const html = await page.text();

		const iframeSrc = _extractIframeSrc(html);
		if (!iframeSrc) return JSON.stringify([]);

		const fileField = await _fetchIframeFileField(iframeSrc, animeUrl);
		const candidates = _buildListCandidates(iframeSrc, fileField);
		const playlist = await _fetchPlaylistArray(candidates, animeUrl);
		if (!playlist.length) return JSON.stringify([]);

		const episodes = playlist.map((item, index) => {
			const titleHtml = String(item?.title || "");
			const title = _extractEpisodeTitle(titleHtml, index + 1);
			const number = _extractEpisodeNumber(title, index + 1);

			const imgTag = (titleHtml.match(/<img[^>]*>/i) || [""])[0];
			const image = _absUrl(_attr(imgTag, "src"), BASE_URL);

			const payload = {
				animeUrl,
				file: String(item?.file || ""),
				thumbnails: String(item?.thumbnails || ""),
				title,
				image
			};

			const out = {
				href: _packEpisode(payload),
				number,
				title
			};

			if (image) out.image = image;
			return out;
		});

		episodes.sort((a, b) => Number(a.number) - Number(b.number));
		return JSON.stringify(episodes);
	} catch (_) {
		return JSON.stringify([]);
	}
}

async function extractStreamUrl(href) {
	try {
		const payload = _unpackEpisode(href);
		const fileField = payload?.file ? String(payload.file) : "";
		if (!fileField) {
			return JSON.stringify({ streams: [], subtitle: "https://none.com" });
		}

		const variants = _parseFileVariants(fileField);
		if (!variants.length) {
			return JSON.stringify({ streams: [], subtitle: "https://none.com" });
		}

		const byQuality = {
			1080: "",
			720: "",
			480: ""
		};

		for (const v of variants) {
			if ((v.quality === 1080 || v.quality === 720 || v.quality === 480) && !byQuality[v.quality]) {
				byQuality[v.quality] = v.url;
			}
		}

		const url1080 = byQuality[1080] || null;
		const url720 = byQuality[720] || null;
		const url480 = byQuality[480] || null;

		const headers = {
			"User-Agent": _ua(),
			"Referer": payload?.animeUrl ? String(payload.animeUrl) : (BASE_URL + "/"),
			"Origin": BASE_URL
		};

		const streams = [];

		if (url1080) {
			streams.push({
				title: "1080p",
				streamUrl: url1080,
				url1080,
				url720,
				url480,
				headers
			});
		}

		if (url720) {
			streams.push({
				title: "720p",
				streamUrl: url720,
				url1080,
				url720,
				url480,
				headers
			});
		}

		if (url480) {
			streams.push({
				title: "480p",
				streamUrl: url480,
				url1080,
				url720,
				url480,
				headers
			});
		}

		if (!streams.length) {
			const first = variants[0];
			if (first?.url) {
				streams.push({
					title: "1080p",
					streamUrl: first.url,
					url1080: first.url,
					url720: null,
					url480: null,
					headers
				});
			}
		}

		return JSON.stringify({
			streams,
			subtitle: "https://none.com"
		});
	} catch (_) {
		return JSON.stringify({ streams: [], subtitle: "https://none.com" });
	}
}
