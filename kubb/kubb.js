const BASE_URL = "https://m.kubb.tv";

async function searchResults(keyword) {
    try {
        const searchUrl = `${BASE_URL}/vodsearch/-------------.html?wd=${encodeURIComponent(keyword)}`;
        const response = await fetchv2(searchUrl);
        const html = await response.text();
        const results = [];

        const itemRegex = /<div class="module-search-item"[\s\S]*?<a class="video-serial" href="([^"]+)"[\s\S]*?data-src="([^"]+)"[\s\S]*?alt="([^"]+)"/g;
        let match;
        while ((match = itemRegex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].startsWith("http") ? match[2] : BASE_URL + match[2],
                href: BASE_URL + match[1]
            });
        }
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        
        const descMatch = html.match(/<div class="video-info-content[^"]*">([\s\S]*?)<\/div>/);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "暂无简介";

        return JSON.stringify([{
            description: description,
            aliases: "",
            airdate: ""
        }]);
    } catch (error) {
        return JSON.stringify([{ description: "加载失败", aliases: "", airdate: "" }]);
    }
}

async function extractEpisodes(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        const episodes = [];

        const listMatch = html.match(/<div class="module-blocklist[\s\S]*?<\/div>/);
        const targetHtml = listMatch ? listMatch[0] : html;
        const epRegex = /<a href="(\/vodplay\/[^"]+)"[^>]*><span>([^<]+)<\/span><\/a>/g;
        
        let match;
        let index = 1;
        while ((match = epRegex.exec(targetHtml)) !== null) {
            episodes.push({
                href: BASE_URL + match[1],
                number: index++
            });
        }
        return JSON.stringify(episodes);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        
        const playerMatch = html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})<\/script>/);
        if (playerMatch) {
            const playerData = JSON.parse(playerMatch[1]);
            let streamUrl = playerData.url;
            if (playerData.encrypt == 1) {
                streamUrl = unescape(streamUrl);
            } else if (playerData.encrypt == 2) {
                streamUrl = unescape(atob(streamUrl));
            }
            return streamUrl;
        }
        return null;
    } catch (error) {
        return null;
    }
}
