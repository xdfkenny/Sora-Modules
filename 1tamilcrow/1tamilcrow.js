async function searchResults(keyword) {
    const results = [];

    const articleRegex = /<article[^>]*class="post-item[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    const imageRegex = /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/;
    const linkRegex = /<a[^>]*class="post-listing-title"[^>]*href="([^"]+)"[^>]*title="[^"]*">([^<]+)<\/a>/;

    try {
        const response = await fetchv2("https://www.1tamilcrow.net/?s=" + keyword);
        const html = await response.text();

        let match;
        while ((match = articleRegex.exec(html)) !== null) {
            const articleContent = match[1];


            const imageMatch = imageRegex.exec(articleContent);
            const image = imageMatch ? imageMatch[1].trim() : "No Image";


            const linkMatch = linkRegex.exec(articleContent);
            if (linkMatch) {
                results.push({
                    href: linkMatch[1].trim(),
                    title: decodeHtml(linkMatch[2].trim()).replace(/^Watch\s+/i, ""),
                    image: image
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{ title: "Error", image: "Error", href: "Error" }]);
    }
}

function decodeHtml(str) {
    return str
        .replace(/&amp;/g, "&")
        .replace(/&#8217;/g, "’")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}


async function extractDetails(url) {
    try {
        return JSON.stringify([{
            description: "No description on the website",
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

        const regex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
        let match;
        let foundUrl = null;

        while ((match = regex.exec(html)) !== null) {
            const iframeUrl = match[1].trim();
            if (!iframeUrl.includes('voe.sx')) {
                foundUrl = iframeUrl;
                break;
            }
        }

        if (foundUrl) {
            results.push({
                href: foundUrl,
                number: 1
            });
        } else {
            results.push({
                href: url,
                number: 1
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

async function extractStreamUrl(url) {
    try {
        if (url.startsWith('//')) {
            url = 'https:' + url;
        }

        let videoId = "";
        const idMatch = url.match(/dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/);
        if (idMatch) {
            videoId = idMatch[1];
        } else {
            return JSON.stringify({ streams: [], subtitles: "" });
        }

        const metaRes = await fetchv2(`https://www.dailymotion.com/player/metadata/video/${videoId}`);
        const metaJson = await metaRes.json();
        const hlsLink = metaJson.qualities?.auto?.[0]?.url;

        if (!hlsLink) {
            return JSON.stringify({ streams: [], subtitles: "" });
        }

        async function getBestHls(hlsUrl) {
            try {
                const res = await fetchv2(hlsUrl);
                const text = await res.text();
                const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
                const streamsList = [];
                let match;
                while ((match = regex.exec(text)) !== null) {
                    streamsList.push({ width: parseInt(match[1]), height: parseInt(match[2]), url: match[3] });
                }
                if (streamsList.length === 0) return hlsUrl;
                streamsList.sort((a, b) => b.height - a.height);
                return streamsList[0].url;
            } catch {
                return hlsUrl;
            }
        }

        const bestHls = await getBestHls(hlsLink);

        const streams = [{
            title: "Auto",
            streamUrl: bestHls
        }];

        return JSON.stringify({ streams: streams });
    } catch (err) {
        console.log(err);
        return JSON.stringify({ streams: [] });
    }
}

