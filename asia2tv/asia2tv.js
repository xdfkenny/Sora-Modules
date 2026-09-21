async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://ww1.asia2tv.pw/?s=" + encodeURIComponent(keyword));
        const html = await response.text();

        const regex = /<div class="box-item">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3><a[^>]*>(.*?)<\/a><\/h3>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim(),
                href: match[1].trim()
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

        const descRegex = /<div class="getcontent">\s*<p>([\s\S]*?)<\/p>/i;
        const descMatch = html.match(descRegex);

        const description = descMatch ? descMatch[1].trim() : "N/A";

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

        const regex = /<a href="([^"]+)"[^>]*\/>\s*<div class="titlepisode">[^0-9]*([0-9]+)<\/div>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                href: match[1].trim(),
                number: parseInt(match[2], 10)
            });
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error"
        }]);
    }
}

// Unpack a p.a.c.k.e.r-obfuscated JS string (the classic eval(function(p,a,c,k,e,d){...}'body',base,count,'dict'.split('|')...))
// Returns the decoded source as a string, or null when the block isn't a valid packer.
function unpackPacker(html) {
    const m = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
    if (!m) return null;
    const body = m[1];
    const base = parseInt(m[2], 10) || 36;
    const count = parseInt(m[3], 10) || 0;
    const dict = m[4].split("|");
    const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
    function toBase(n) {
        if (n === 0) return "0";
        let s = "";
        while (n > 0) { s = chars[n % base] + s; n = Math.floor(n / base); }
        return s;
    }
    let out = body;
    for (let c = count - 1; c >= 1; c--) {
        if (!dict[c]) continue;
        const key = toBase(c);
        out = out.replace(new RegExp("\\b" + key + "\\b", "g"), dict[c]);
    }
    return out;
}

// Find a playable m3u8 inside a hoster's embed page (handles p.a.c.k.e.r-packed jwplayer configs).
function extractEmbedM3u8(embedHtml) {
    let src = embedHtml;
    const packed = unpackPacker(embedHtml);
    if (packed) src = packed;

    // jwplayer/other player configs expose the stream as file:"https://...m3u8"
    let match = src.match(/file\s*:\s*["'](https?:)?(\/\/[^"']*?\.m3u8[^"']*)["']/);
    if (match) {
        return (match[1] || "https:") + match[2];
    }
    // fallback: any explicit m3u8 URL in the page
    match = src.match(/https?:\/\/[^"'<> ]+?\.m3u8[^"'<> ]*/);
    return match ? match[0] : null;
}

function cleanStreamUrl(hlsUrl) {
    if (!hlsUrl) return null;
    let u = hlsUrl
        .replace(/\\u0026/g, "&")
        .replace(/&amp;/g, "&")
        .replace(/\\\//g, "/")
        .replace(/\\u002F/g, "/");
    if (u.startsWith("//")) u = "https:" + u;
    return u;
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        const streams = [];
        const seen = {};

        function pushStream(title, hlsUrl, referer) {
            const clean = cleanStreamUrl(hlsUrl);
            if (!clean) return;
            if (seen[clean]) return;
            seen[clean] = true;
            streams.push({
                title: title,
                streamUrl: clean,
                headers: { "Referer": referer }
            });
        }

        // Collect every hoster embedded on the episode page (data-server="https://...")
        const servers = [];
        const seenServer = {};
        const serverRe = /class="serverslist[^"]*"[^>]*data-server="([^"]+)"/g;
        let sm;
        while ((sm = serverRe.exec(html)) !== null) {
            const u = sm[1].trim();
            if (!seenServer[u]) { seenServer[u] = true; servers.push(u); }
        }
        // fallback: bare ok.ru link (not wrapped in data-server)
        const okDirect = html.match(/https?:\/\/ok\.ru\/(?:videoembed|video)\/\d+/);
        if (okDirect) {
            const u = okDirect[0].replace("/video/", "/videoembed/");
            if (!seenServer[u]) { seenServer[u] = true; servers.push(u); }
        }

        // JS-walled hosters whose embed pages serve anti-bot prompts (no static playable URL)
        const BLOCKED_HOSTS = [
            "vidmoly.to", "streamvid.net", "vadbam.net", "youdbox.site",
            "doods.pro", "mixdroop.bz", "uptostream.com", "vk.com"
        ];
        const isBlocked = (u) => {
            for (let i = 0; i < BLOCKED_HOSTS.length; i++) {
                if (u.indexOf(BLOCKED_HOSTS[i]) !== -1) return true;
            }
            return false;
        };

        // Try only fast, statically-parsable hosters. Order matters: uqload/filelions
        // expose the m3u8 in static HTML; try them first and stop at the first success
        // so the whole step stays well under the app's request budget.
        const priority = [];
        for (let i = 0; i < servers.length; i++) {
            const u = servers[i];
            if (u.indexOf("uqload") !== -1) priority.push(u);
        }
        for (let i = 0; i < servers.length; i++) {
            const u = servers[i];
            if (u.indexOf("filelions") !== -1) priority.push(u);
        }
        for (let i = 0; i < servers.length; i++) {
            const u = servers[i];
            if (u.indexOf("ok.ru") !== -1) priority.push(u);
        }
        for (let i = 0; i < servers.length; i++) { // generic fallback, blocked hosts skipped
            const u = servers[i];
            if (isBlocked(u)) continue;
            if (priority.indexOf(u) === -1) priority.push(u);
        }

        let gotStream = false;

        for (let i = 0; i < priority.length; i++) {
            const serverUrl = priority[i];
            if (!/^https?:\/\//.test(serverUrl)) continue;
            try {
                const host = serverUrl.replace(/^https?:\/\//, "").split("/")[0];
                const sResp = await fetchv2(serverUrl);
                const sHtml = await sResp.text();

                if (serverUrl.indexOf("ok.ru") !== -1) {
                    // OK.ru: player metadata is in data-options on the videoembed page
                    const optionsMatch = sHtml.match(/data-options="([^"]+)"/);
                    let hlsUrl = null;
                    if (optionsMatch) {
                        try {
                            const optionsJson = optionsMatch[1].replace(/&quot;/g, '"');
                            const options = JSON.parse(optionsJson);
                            const metadata = JSON.parse(options.flashvars.metadata);
                            if (metadata) hlsUrl = metadata.hlsManifestUrl;
                        } catch (e) { hlsUrl = null; }
                    }
                    if (!hlsUrl) {
                        const m = sHtml.match(/hlsManifestUrl.*?(https.*?.m3u8.*?)(?:&quot;|"|\\")/);
                        if (m) hlsUrl = m[1];
                    }
                    if (hlsUrl) { pushStream("OK.ru", hlsUrl, "https://ok.ru/"); gotStream = true; }
                } else {
                    const hlsUrl = extractEmbedM3u8(sHtml);
                    if (hlsUrl) { pushStream(host, hlsUrl, "https://" + host + "/"); gotStream = true; }
                }
            } catch (e) {
                console.log("Embed failed: " + serverUrl + " — " + e.message);
            }
            if (gotStream) break;
        }

        return JSON.stringify({ streams: streams, subtitle: "" });
    } catch (err) {
        console.log("Error in extractStreamUrl: " + err.message);
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
