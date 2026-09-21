async function searchResults(keyword) {
    const response = await soraFetch(`https://spacepowerfans.com/search/?s_keyword=${keyword}`);
    const html = await response.text();

    const blockRegex = /<div class="w-full bg-gradient-to-t[\s\S]*?<\/div>\s*<\/div>/g;
    const blocks = html.match(blockRegex) || [];

    const results = [];

    for (const block of blocks) {
        const imageMatch = block.match(/<img[^>]+src=['"]([^'"]+)['"]/);
        const titleMatch = block.match(/<span\s+data-en-title>(.*?)<\/span>/);
        const linkMatch = block.match(/<a\s+href="(https:\/\/spacepowerfans\.com\/anime\/[^"]+)"/);

        if (linkMatch && titleMatch) {
            results.push({
                href: linkMatch[1],
                title: titleMatch[1],
                image: imageMatch ? imageMatch[1] : null,
            });
        }
    }

    console.log(results);
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const results = [];
    const response = await soraFetch(url);
    const html = await response.text();

    const descriptionMatch = html.match(/<div[^>]*>\s*<span[^>]*>نظرة عامة:<\/span>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
    const description = descriptionMatch ? descriptionMatch[1].trim() : 'N/A';

    const seasonMatch = html.match(/موسم:\s*<\/span>\s*<span[^>]*>([^<]+)/);
    const season = seasonMatch ? seasonMatch[1].trim() : 'N/A';

    const originalTitleMatch = html.match(/أصلي:\s*<\/span>\s*<span[^>]*>([^<]+)/);
    const originalTitle = originalTitleMatch ? originalTitleMatch[1].trim() : 'N/A';

    const englishTitleMatch = html.match(/English:\s*<\/span>\s*<span[^>]*>([^<]+)/);
    const englishTitle = englishTitleMatch ? englishTitleMatch[1].trim() : 'N/A';

    const durationMatch = html.match(/المدة الزمنية:\s*<\/span>\s*<span[^>]*>([^<]+)/);
    const duration = durationMatch ? durationMatch[1].trim() : 'N/A';

    const episodesMatch = html.match(/الحلقات:\s*<\/span>\s*<span[^>]*>([^<]+)/);
    const episodes = episodesMatch ? episodesMatch[1].trim() : 'N/A';

    const ratingMatch = html.match(/التقييم:\s*<\/span>\s*<span[^>]*>([^<]+)/);
    const rating = ratingMatch ? ratingMatch[1].trim() : 'N/A';

    const statusMatch = html.match(/الحالة:\s*<\/span>\s*<a[^>]*>([^<]+)/);
    const status = statusMatch ? statusMatch[1].trim() : 'N/A';

    const genresBlockMatch = html.match(/النوع:\s*<\/span>([\s\S]*?)<\/li>/);
    let genres = 'N/A';
    if (genresBlockMatch) {
        const genreLinks = [...genresBlockMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
        const genreNames = genreLinks.map(m => m[1].trim());
        if (genreNames.length) genres = genreNames.join(', ');
    }

    const aliasesString = 
`Season: ${season}
Original title: ${originalTitle}
English title: ${englishTitle}
Duration: ${duration}
Episodes: ${episodes}
Rating: ${rating}
Status: ${status}
Genres: ${genres}`;

    results.push({
        description,
        aliases: aliasesString,
        airdate: ''
    });

    console.log(JSON.stringify(results));
    return JSON.stringify(results);
}

async function extractEpisodes(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const episodes = [];

        // --- 1️⃣ Normal episodes: titles containing "الحلقة 123"
        const normalRegex = /<a\s+href="([^"]+)"[^>]*title="[^"]*الحلقة\s*(\d+)[^"]*"[^>]*>/g;
        let match;
        while ((match = normalRegex.exec(html)) !== null) {
            const href = match[1].trim();
            const number = Number(match[2]);
            episodes.push({ number, href });
        }

        // --- 2️⃣ Movie/special layout: with "الفيلم" instead of numbered episode
        const movieRegex = /<a\s+href="([^"]+)"[^>]*title="([^"]*فيلم[^"]*)"[^>]*>[\s\S]*?<img[^>]+src=['"]([^'"]+)['"]/g;
        let movieMatch;
        while ((movieMatch = movieRegex.exec(html)) !== null) {
            const href = movieMatch[1].trim();
            episodes.push({
                number: 1,
                href,
            });
        }

        episodes.sort((a, b) => {
            if (typeof a.number === "number" && typeof b.number === "number") return a.number - b.number;
            return 0;
        });

        console.log(JSON.stringify(episodes));
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Fetch error in extractEpisodes: " + error);
        return "";
    }
}

async function extractStreamUrl(url) {
    const response = await soraFetch(url);
    const html = await response.text();

    const allMatches = [...html.matchAll(/<div class="player-selection player-(dub|sub)[^>]*">([\s\S]*?)<\/div>/g)];
    const streams = [];

    for (const [, type, sectionHtml] of allMatches) {
        const embedRegex = /<span[^>]*data-embed-id="([^"]+)"[^>]*>([^<]+)<\/span>/g;

        let match;
        while ((match = embedRegex.exec(sectionHtml)) !== null) {
            const fullValue = match[1];
            const label = match[2].trim();

            const afterColon = fullValue.split(":")[1];
            if (!afterColon) continue;

            let decodedUrl;
            try {
                decodedUrl = atob(afterColon);
            } catch {
                continue;
            }

            // iframe containing mp4
            if (decodedUrl.startsWith("<iframe")) {
                const mp4Match = decodedUrl.match(/video_url=([^&#"]+\.mp4)/);
                if (mp4Match) {
                    const decodedMp4 = decodeURIComponent(mp4Match[1]);
                    if (decodedMp4.startsWith("http")) {
                        streams.push({
                            title: label,
                            streamUrl: decodedMp4,
                            headers: {}
                        });
                    }
                }
            }

            // 4shared embed
            else if (decodedUrl.includes("4shared.com")) {
                try {
                const embedRes = await soraFetch(decodedUrl);
                const embedHtml = await embedRes.text();
                if (/This file is not available/.test(embedHtml)) continue;

                const srcMatch = embedHtml.match(/<source[^>]+src="([^"]+\.mp4)"/i);
                if (srcMatch && srcMatch[1].startsWith("http")) {
                    streams.push({
                        title: label,
                        streamUrl: srcMatch[1],
                        headers: {
                            "Referer": "https://4shared.com/"
                        }
                    });
                }
                } catch {
                    continue;
                }
            }
        }
    }

    const results = {
        streams,
        subtitles: ""
    };

    console.log(results);
    return JSON.stringify(results);
}

// searchResults("المحقق");
// extractDetails("https://spacepowerfans.com/anime/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d8%a7%d9%84%d9%85%d8%ad%d9%82%d9%82-%d9%83%d9%88%d9%86%d8%a7%d9%86-%d8%a7%d9%84%d8%ac%d8%b2%d8%a1-%d8%a7%d9%84%d8%ad%d8%a7%d8%af%d9%8a-%d8%b9%d8%b4%d8%b1-%d9%85/");
// extractEpisodes("https://spacepowerfans.com/anime/%d9%81%d9%8a%d9%84%d9%85-%d8%a7%d9%84%d9%85%d8%ad%d9%82%d9%82-%d9%83%d9%88%d9%86%d8%a7%d9%86-26-%d8%a7%d9%84%d8%ba%d9%88%d8%a7%d8%b5%d8%a9-%d8%a7%d9%84%d8%ad%d8%af%d9%8a%d8%af%d9%8a%d8%a9-%d8%a7/");
// extractStreamUrl("https://spacepowerfans.com/watch/%d8%a7%d9%84%d9%85%d8%ad%d9%82%d9%82-%d9%83%d9%88%d9%86%d8%a7%d9%86-%d8%a7%d9%84%d8%ac%d8%b2%d8%a1-%d8%a7%d9%84%d8%ad%d8%a7%d8%af%d9%8a-%d8%b9%d8%b4%d8%b1-%d9%85%d8%af%d8%a8%d9%84%d8%ac-%d8%a7%d9%84/");
// extractStreamUrl("https://spacepowerfans.com/watch/%d8%a7%d9%84%d9%85%d8%ad%d9%82%d9%82-%d9%83%d9%88%d9%86%d8%a7%d9%86-%d8%a7%d9%84%d8%ac%d8%b2%d8%a1-%d8%a7%d9%84%d8%ae%d8%a7%d9%85%d8%b3-%d9%88%d8%a7%d9%84%d8%b9%d8%b4%d8%b1%d9%88%d9%86-%d9%85%d8%af-62/");

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
