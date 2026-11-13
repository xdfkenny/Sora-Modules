// MonosChinos2 — v2.0.0 (2026-11-12)
// Upstream moved to vww.monoschinos2.net: wwv 301s POSTs and drops the body,
// so ajax_pagination must be POSTed straight to vww. mp4upload is gone; the
// working embed is uqload (Dean-Edwards packed jwplayer setup -> m3u8).

var MONO_WWV = "wwv.monoschinos2";
var MONO_VWW = "vww.monoschinos2";

function monoVwwUrl(url) {
    return url.replace(MONO_WWV, MONO_VWW);
}

function cleanTitle(title) {
    return title
        .replace(/&#8217;/g, "'")
        .replace(/&#8211;/g, "-")
        .replace(/&#[0-9]+;/g, "");
}

function atob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charAt(i);
        if (char === '=') break;
        const index = chars.indexOf(char);
        if (index === -1) continue;
        buffer = (buffer << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            str += String.fromCharCode((buffer >> bits) & 0xFF);
            buffer &= (1 << bits) - 1;
        }
    }
    return str;
}

// Unpack a Dean-Edwards packed block: eval(function(p,a,c,k,e,d){...}('P',A,C,'K'.split('|'),0,{}))
function monoUnpackPacker(html) {
    try {
        const start = html.indexOf("eval(function(p,a,c,k,e,d)");
        if (start === -1) return null;
        const m = html.substring(start).match(/\}\('([\s\S]+?)',(\d+),(\d+),'([\s\S]+?)'\.split\('\|'\)/);
        if (!m) return null;
        const payload = m[1];
        const radix = parseInt(m[2], 10);
        const count = parseInt(m[3], 10);
        const keys = m[4].split('|');
        let p = payload;
        for (let i = count - 1; i >= 0; i--) {
            const key = keys[i];
            if (key) {
                p = p.replace(new RegExp('\\b' + i.toString(radix) + '\\b', 'g'), key);
            }
        }
        return p;
    } catch (err) {
        return null;
    }
}

async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://vww.monoschinos2.net/animes?buscar=" + encodeURIComponent(keyword));
        const html = await response.text();

        const regex = /<li class="col mb-5 ficha_efecto">.*?<a href="([^"]+)" title="([^"]+)">.*?<img[^>]+src="([^"]+)"/gs;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                href: match[1].trim().replace("./", "https://vww.monoschinos2.net/"),
                title: cleanTitle(match[2].trim().replace(" Online Gratis", "").replace("Ver Anime", "")),
                image: match[3].trim()
            });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            title: "Error",
            image: "Error",
            href: "Error"
        }]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const match = html.match(/<div class="mb-3">\s*<p>(.*?)<\/p>/s);
        const description = match ? match[1].trim() : "N/A";

        return JSON.stringify([{
            description: description,
            aliases: "N/A",
            airdate: "N/A"
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }]);
    }
}

async function extractEpisodes(url) {
    const results = [];
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const epRegex = /<a[^>]+href=["'](\.\/ver\/[^"']+)["']/gi;
        let epMatch;
        const seen = new Set();
        let epCount = 1;

        while ((epMatch = epRegex.exec(html)) !== null) {
            const href = epMatch[1].replace("./", "https://vww.monoschinos2.net/");
            if (!seen.has(href)) {
                seen.add(href);
                const numMatch = href.match(/episodio-(\d+)/i);
                const number = numMatch ? parseInt(numMatch[1], 10) : epCount;
                results.push({ href: href, number: number });
                epCount++;
            }
        }

        // Long series embed pagination metadata: inline list is only 1 ep,
        // the rest come from the ajax pager — always run it when present.
        const iMatch2 = html.match(/data-i="(\d+)"/);

        const parts = url.split('/');
        const u = parts[parts.length - 1] || parts[parts.length - 2];
        const i = iMatch2 ? iMatch2[1] : null;

        if (i) {
            const apiBase = monoVwwUrl(url.replace(/\/[^/]*$/, "")) ;
            const domain = apiBase.match(/https?:\/\/[^/]+/)[0];
            let page = 1;
            while (page <= 12) {
                const formData = `acc=episodes&i=${i}&u=${u}&p=${page}`;
                const headers = {
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": monoVwwUrl(url),
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                };
                const res = await fetchv2(domain + "/ajax_pagination", headers, "POST", formData);
                const pageHtml = await res.text();
                if (!pageHtml.trim()) break;

                const regex = /<a class="ko" href="([^"]+)"/g;
                let match;
                let added = 0;
                while ((match = regex.exec(pageHtml)) !== null) {
                    const href = match[1].trim();
                    if (!seen.has(href)) {
                        seen.add(href);
                        const numMatch = href.match(/episodio-(\d+)/i);
                        results.push({
                            href: href,
                            number: numMatch ? parseInt(numMatch[1], 10) : results.length + 1
                        });
                        added++;
                    }
                }
                if (added === 0) break;
                page++;
            }
        }

        return JSON.stringify(results.reverse());
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const streams = [];

        // 1) Get server list via ajax opt (must POST directly to vww; wwv 301s and drops the body)
        const encryptMatch = html.match(/data-encrypt="([^"]+)"/);
        if (encryptMatch) {
            const iValue = encryptMatch[1];
            const formData = `acc=opt&i=${iValue}`;
            const headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Referer": monoVwwUrl(url),
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            };
            const domain = monoVwwUrl(url).match(/https?:\/\/[^/]+/)[0];
            let optHtml = "";
            try {
                const optResp = await fetchv2(domain + "/ajax_pagination", headers, "POST", formData);
                optHtml = await optResp.text();
            } catch (e) {}

            // 2) Collect embeds: data-player="base64" with server name in button text
            const btnRegex = /<button[^>]*data-player="([^"]+)"[^>]*>([^<]+)<\/button>/gi;
            let btn;
            const embeds = [];
            const seenUrls = new Set();
            while ((btn = btnRegex.exec(optHtml)) !== null) {
                const playerUrl = atob(btn[1]);
                const name = btn[2].trim().toLowerCase();
                if (playerUrl && !seenUrls.has(playerUrl)) {
                    seenUrls.add(playerUrl);
                    embeds.push({ url: playerUrl, name: name });
                }
            }

            // 3) Prefer uqload embed: packed jwplayer setup contains the m3u8
            for (let e = 0; e < embeds.length; e++) {
                const emb = embeds[e];
                if (emb.name.indexOf("uqload") === -1) continue;
                try {
                    const embResp = await fetchv2(emb.url, {
                        "Referer": "https://vww.monoschinos2.net/",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
                    });
                    const embHtml = await embResp.text();
                    const unpacked = monoUnpackPacker(embHtml);
                    const src = unpacked || embHtml;
                    const fileMatch = src.match(/file:\s*"([^"]+\.m3u8[^"]*)"/);
                    if (fileMatch) {
                        streams.push({
                            title: "Uqload",
                            streamUrl: fileMatch[1],
                            headers: { "Referer": "https://uqload.vc/" }
                        });
                        break;
                    }
                    const mp4Match = src.match(/file:\s*"([^"]+\.mp4[^"]*)"/);
                    if (mp4Match) {
                        streams.push({
                            title: "Uqload",
                            streamUrl: mp4Match[1],
                            headers: { "Referer": "https://uqload.vc/" }
                        });
                        break;
                    }
                } catch (e2) {}
            }

            // 4) Legacy mp4upload fallback (kept in case upstream restores it)
            if (streams.length === 0) {
                const mp4uploadMatch = optHtml.match(/data-player="([^"]+)"[^>]*>mp4upload/i);
                if (mp4uploadMatch) {
                    try {
                        const playerUrl = atob(mp4uploadMatch[1]);
                        const playerResp = await fetchv2(playerUrl);
                        const playerHtml = await playerResp.text();
                        const mp4Match = playerHtml.match(/src:\s*"([^"]+\.mp4[^"]*)"/);
                        if (mp4Match) {
                            streams.push({
                                title: "Mp4Upload",
                                streamUrl: mp4Match[1],
                                headers: { "Referer": "https://mp4upload.com/" }
                            });
                        }
                    } catch (e3) {}
                }
            }
        }

        if (streams.length === 0) {
            streams.push({
                title: "MonosChinos Player",
                streamUrl: monoVwwUrl(url),
                headers: { "Referer": "https://vww.monoschinos2.net/" }
            });
        }

        return JSON.stringify({ streams, subtitle: "" });
    } catch (error) {
        return JSON.stringify({
            streams: [{
                title: "MonosChinos Player",
                streamUrl: monoVwwUrl(url),
                headers: { "Referer": "https://vww.monoschinos2.net/" }
            }],
            subtitle: ""
        });
    }
}
