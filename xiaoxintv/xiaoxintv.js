async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://xiaoxintv.cc/index.php/vod/search.html?wd=" + encodeURIComponent(keyword) + "&submit=");
        const html = await response.text();

        const regex = /class="myui-vodlist__thumb[^"]*" href="([^"]*)"[^>]*title="([^"]*)"[^>]*data-original="([^"]*)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[2].trim(),
                image: "https://xiaoxintv.cc" + match[3].trim(),
                href: "https://xiaoxintv.cc" + match[1].trim()
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

        const regex = /<span class="data"[^>]*><p>(.*?)<\/p><\/span>/s;
        const match = regex.exec(html);
        const description = match ? match[1].trim() : "No description available";

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

        const ulRegex = /<ul class="myui-content__list scrollbar sort-list clearfix"[^>]*>(.*?)<\/ul>/s;
        const ulMatch = ulRegex.exec(html);
        
        if (!ulMatch) return JSON.stringify(results);
        
        const ulContent = ulMatch[1];
        const regex = /href="([^"]*\/vod\/play\/[^"]*nid\/(\d+)\.html)"/g;
        let match;
        
        while ((match = regex.exec(ulContent)) !== null) {
            results.push({
                href: "https://xiaoxintv.cc" + match[1].trim(),
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

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const regex = /var\s+player_aaaa\s*=\s*(\{[^}]+\})/;
        const match = regex.exec(html);
        
        if (!match) {
            return JSON.stringify({
                streams: [],
                subtitle: ""
            });
        }

        const playerData = JSON.parse(match[1]);
        const indexUrl = playerData.url;

        if (!indexUrl) {
            return JSON.stringify({
                streams: [],
                subtitle: ""
            });
        }

        const m3u8Response = await fetchv2(indexUrl);
        const m3u8Content = await m3u8Response.text();

        const streamPathMatch = /^(?!#)(.+\.m3u8)$/m.exec(m3u8Content);
        
        if (!streamPathMatch) {
            return JSON.stringify({
                streams: [],
                subtitle: ""
            });
        }

        const streamPath = streamPathMatch[1].trim();
        
        const baseUrl = indexUrl.substring(0, indexUrl.lastIndexOf('/'));
        const streamUrl = baseUrl + '/' + streamPath;
        console.log("Extracted Stream URL: " + streamUrl);
        return JSON.stringify({
            streams: [
                {
                    title: "Server 1",
                    streamUrl: streamUrl,
                    headers: {}
                }
            ],
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}
