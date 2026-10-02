async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://aniweek.com/bbs/search.php?srows=240&gr_id=&sfl=wr_subject&stx=" + encodeURIComponent(keyword));
        const html = await response.text();
        const m = html.match(/<script data-page="app" type="application\/json">(\{[\s\S]*?\})\s*<\/script>/);
        if (m) {
            const page = JSON.parse(m[1]);
            const comics = page.props && page.props.comics;
            if (comics && comics.data) {
                for (const it of comics.data) {
                    results.push({
                        title: (it.title || "Error").trim(),
                        image: "https://aniweek.com/storage/" + it.thumbnail,
                        href: "https://aniweek.com/c/" + encodeURIComponent(it.slug)
                    });
                }
            }
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
        const m = html.match(/<script data-page="app" type="application\/json">(\{[\s\S]*?\})\s*<\/script>/);

        let description = "N/A";
        let airdate = "N/A";
        let aliases = "N/A";

        if (m) {
            const page = JSON.parse(m[1]);
            const comic = page.props && page.props.comic;
            if (comic) {
                if (comic.description) {
                    description = String(comic.description)
                        .replace(/<br\s*\/?>/gi, "\n")
                        .replace(/&nbsp;/g, " ")
                        .replace(/<[^>]*>/g, "")
                        .replace(/\n\s*\n+/g, "\n")
                        .trim();
                }
                if (comic.original_title) aliases = comic.original_title;
                if (comic.published_at) airdate = comic.published_at.slice(0, 10);
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
        let last_page = 1;
        let page = 1;
        let total = 0;

        while (page <= 20 && page <= last_page) {
            const response = await fetchv2(url + "?page=" + page);
            const html = await response.text();
            const m = html.match(/<script data-page="app" type="application\/json">(\{[\s\S]*?\})\s*<\/script>/);
            if (!m) break;
            const pageJson = JSON.parse(m[1]);
            const episodes = pageJson.props && pageJson.props.episodes;
            if (!episodes || !episodes.data) break;
            last_page = parseInt(episodes.last_page, 10) || last_page;
            total = parseInt(episodes.total, 10) || 0;

            for (const ep of episodes.data) {
                const numM = String(ep.title || "").match(/(\d+)/);
                results.push({
                    href: "https://aniweek.com/e/" + encodeURIComponent(ep.slug),
                    number: numM ? parseInt(numM[1], 10) : 0,
                    sort: ep.sort || 0
                });
            }
            page++;
            // stop early once every episode has been gathered
            if (total && results.length >= total) break;
        }

        // pages arrive newest-first; keep ascending order and drop the sort key
        results.sort((a, b) => a.sort - b.sort || a.number - b.number);
        for (const r of results) delete r.sort;
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
        const m = html.match(/<script data-page="app" type="application\/json">(\{[\s\S]*?\})\s*<\/script>/);
        if (!m) return JSON.stringify({ streams: [], subtitle: "" });

        const page = JSON.parse(m[1]);
        const playing = page.props && page.props.playing;
        if (!playing || !playing.body || !playing.body.url) {
            return JSON.stringify({ streams: [], subtitle: "" });
        }

        const hashM = String(playing.body.url).match(/\/video\/([0-9a-fA-F]+)/);
        if (!hashM) return JSON.stringify({ streams: [], subtitle: "" });
        const hash = hashM[1];

        const apiUrl = "https://michealcdn.com/player/index.php?data=" + hash + "&do=getVideo";
        const postData = "hash=" + encodeURIComponent(hash) + "&r=" + encodeURIComponent("https://aniweek.com/");
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest"
        };

        const apiResponse = await fetchv2(apiUrl, headers, "POST", postData);
        const apiJson = await apiResponse.json();
        if (!apiJson) return JSON.stringify({ streams: [], subtitle: "" });

        const streamUrl = (apiJson.securedLink || apiJson.videoSource || "").replace(/\\\//g, "/");
        if (!streamUrl) return JSON.stringify({ streams: [], subtitle: "" });

        return JSON.stringify({
            streams: [{
                title: "AnimeWeek",
                streamUrl: streamUrl,
                headers: { "Referer": "https://aniweek.com/" }
            }],
            subtitle: ""
        });
    } catch (err) {
        return JSON.stringify({ streams: [], subtitle: "" });
    }
}
