
async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://aniweek.com/bbs/search.php?srows=240&gr_id=&sfl=wr_subject&stx=" + encodeURIComponent(keyword));
        const html = await response.text();
        const regex = /<div class="list-row">[\s\S]*?<a href="([^"]+)"[\s\S]*?<img src="([^"]+)" alt="([^"]+)"/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim().replace("..","https://aniweek.com"),
                href: "https://aniweek.com" + match[1].trim()
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
        const regex = /<div class="view-stocon"><div class="c"[^>]*>([\s\S]*?)<\/div>/;
        
        let description = "N/A";
        const match = regex.exec(html);
        if (match) {
            description = match[1]
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/&nbsp;/g, " ")
                .replace(/<[^>]*>/g, "")
                .replace(/\n\s*\n+/g, "\n")
                .trim();
        }

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
        const regex = /<li class="list-item">[\s\S]*?<div class="wr-num">(\d+)<\/div>[\s\S]*?<a href="([^"]+)"[\s\S]*?<\/li>/g;

        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                href: "https://aniweek.com" + match[2].trim(),
                number: parseInt(match[1], 10)
            });
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

        const vMatch = html.match(/<input type="hidden" name="v" value="([^"]+)"/);
        if (!vMatch) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const vValue = vMatch[1];
        const glamovUrl = `https://ani.glamov.com/tv-show.php?v=${vValue}`;

        const glamovResponse = await fetchv2(glamovUrl);
        const glamovHtml = await glamovResponse.text();

        const iframeMatch = glamovHtml.match(/<iframe src="([^"]+)"/);
        if (!iframeMatch) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        let iframeUrl = iframeMatch[1];
        if (iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl;

        const videoIdMatch = iframeUrl.match(/\/video\/([^/?#]+)/);
        if (!videoIdMatch) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }
        const videoId = videoIdMatch[1];
        
        let iframeOrigin = "";
        const originMatch = iframeUrl.match(/^(https?:\/\/[^/]+)/);
        if (originMatch) {
            iframeOrigin = originMatch[1];
        } else {
            return JSON.stringify({ streams: [], subtitle: "" });
        }
        
        const apiUrl = `${iframeOrigin}/player/index.php?data=${videoId}&do=getVideo`;
        
        const postData = `hash=${videoId}&r=https%3A%2F%2Fani.glamov.com%2F`;
        const headers = {
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        };

        const apiResponse = await fetchv2(apiUrl, headers, "POST", postData);
        const apiJson = await apiResponse.json();

        if (apiJson && apiJson.videoSource) {
            return JSON.stringify({
                streams: [{
                    title: "Stream 1",
                    streamUrl: apiJson.videoSource.replace(/\\\//g, "/"),
                    headers: {}
                }],
                subtitle: ""
            });
        }

        return JSON.stringify({ streams: [], subtitle: "" });

    } catch (err) {
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}

