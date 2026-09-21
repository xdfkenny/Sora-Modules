async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2(`https://dorama.land/search?q=${encodeURIComponent(keyword)}`);
        const html = await response.text();

        const regex = /<a href="([^"]+)" class="search-item-wrap">[\s\S]*?<img class="lazy"\s+data-src="([^"]+)"[^>]*alt="([^"]+)"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[3].trim(),
                image: match[2].trim().startsWith('/') ? "https://dorama.land" + match[2].trim() : match[2].trim(),
                href: match[1].trim().startsWith('/') ? "https://dorama.land" + match[1].trim() : match[1].trim()
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

        const descRegex = /itemprop="description"[^>]*>([\s\S]*?)<\/div>/;
        const descMatch = descRegex.exec(html);
        let description = "No description available";
        if (descMatch) {
            description = descMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        const originalTitleRegex = /<li><span class="font-light-16">Оригинальное:\s*<\/span><span class="font-light-18">([\s\S]*?)<\/span><\/li>/;
        const originalTitleMatch = originalTitleRegex.exec(html);
        const aliases = originalTitleMatch ? originalTitleMatch[1].trim() : "N/A";

        let airdate = "N/A";
        const airdateRegex = /class="font-light-18"[^>]*itemprop="dateCreated"[^>]*>([^<]+)/;
        const airdateMatch = airdateRegex.exec(html);
        if (airdateMatch) {
            airdate = airdateMatch[1].trim();
        } else {
            const contentRegex = /itemprop="dateCreated"\s+content="([^"]+)"/;
            const contentMatch = contentRegex.exec(html);
            if (contentMatch) {
                airdate = contentMatch[1].trim();
            }
        }

        return JSON.stringify([{
            description: description,
            aliases: aliases,
            airdate: airdate
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

        const regex = /<div class="short-cinematic short-cinematic--episode short-cinematic--without-name">\s*<a href="([^"]+)"[^>]*>[\s\S]*?<span class="short-cinematic__episode-number">([^<]+)<\/span>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].trim();
            const spanText = match[2].trim();

            let season = 1;
            let number = 1;

            const seasonMatch = /(\d+)\s*сезон/i.exec(spanText);
            if (seasonMatch) {
                season = parseInt(seasonMatch[1], 10);
            }

            const episodeMatch = /(\d+)\s*серия/i.exec(spanText);
            if (episodeMatch) {
                number = parseInt(episodeMatch[1], 10);
            } else {
                const fallbackMatch = /(\d+)/.exec(spanText);
                if (fallbackMatch) {
                    number = parseInt(fallbackMatch[1], 10);
                }
            }

            results.push({
                href: href.startsWith('/') ? "https://dorama.land" + href : href,
                number: number,
                season: season
            });
        }

        results.sort((a, b) => {
            if (a.season !== b.season) return a.season - b.season;
            return a.number - b.number;
        });

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: "Error",
            number: "Error",
            season: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const tabsRegex = /data-url-player="([^"]+)"[^>]*data-label=([^ >]+|"[^"]+")/g;
        let match;
        const tabUrls = [];
        while ((match = tabsRegex.exec(html)) !== null) {
            let label = match[2].trim();
            if (label.startsWith('"') && label.endsWith('"')) {
                label = label.substring(1, label.length - 1);
            }
            tabUrls.push({
                url: match[1].startsWith('http') ? match[1] : 'https:' + match[1],
                label: label
            });
        }

        const streams = [];

        const promises = tabUrls.map(async (tab) => {
            try {
                const embedResponse = await fetchv2(tab.url, {
                    "Referer": "https://dorama.land/"
                });
                const embedHtml = await embedResponse.text();

                const configMatch = embedHtml.match(/data-config='([^']+)'/);
                if (!configMatch) return;
                const config = JSON.parse(configMatch[1]);
                const hlsUrl = config.hls;
                if (!hlsUrl) return;

                const altMatch = embedHtml.match(/data-alt="([^"]+)"/);
                const altUrl = altMatch ? altMatch[1].trim() : null;

                streams.push({
                    title: `${tab.label} - Server 1`,
                    streamUrl: hlsUrl,
                    headers: { "Referer": "https://a.jaswish.com/" }
                });

                if (altUrl) {
                    const cleanAlt = altUrl.replace(/\/$/, "");
                    const urlMatch = hlsUrl.match(/^(https?:)?\/\/([^\/]+)(.*)$/);
                    if (urlMatch) {
                        const path = urlMatch[3];
                        const streamUrl2 = cleanAlt + path;
                        streams.push({
                            title: `${tab.label} - Server 2`,
                            streamUrl: streamUrl2,
                            headers: { "Referer": "https://a.jaswish.com/" }
                        });
                    }
                }
            } catch (err) {
                console.log(`Error resolving embed for ${tab.label}: ` + err.message);
            }
        });

        await Promise.all(promises);

        return JSON.stringify({
            streams: streams,
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({
            streams: [],
            subtitle: ""
        });
    }
}
