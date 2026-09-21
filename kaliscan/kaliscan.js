async function searchResults(keyword) {
    const results = [];
    try {
        const response = await fetchv2("https://kaliscan.io/service/backend/search/?q=" + encodeURIComponent(keyword));
        const html = await response.text();

        const regex = /href="([^"]*manga[^"]*)"[^>]*>[\s\S]*?<img src="([^"]*)"[\s\S]*?<h3><a[^>]*>([\s\S]*?)<\/a><\/h3>/gi;
        
        let match;
        const seen = new Set();
        while ((match = regex.exec(html)) !== null) {
            const href = match[1].startsWith("http") ? match[1].trim() : "https://kaliscan.io" + match[1].trim();
            if (!seen.has(href)) {
                seen.add(href);
                results.push({
                    href: href,
                    image: match[2].trim(),
                    title: match[3].replace(/<[^>]+>/g, '').trim()
                });
            }
        }

        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const descRegex = /<meta name="description" content="([^"]+)"/i;
        const descMatch = descRegex.exec(html);
        const description = descMatch ? descMatch[1].trim() : "N/A";
        return [{
            description: description,
            aliases: "N/A",
            airdate: "N/A"
        }];
    } catch (err) {
        return [{
            description: "Error",
            aliases: "Error",
            airdate: "Error"
        }];
    }
}

async function extractChapters(url) {
    const results = [];
    try {
        const idRegex = /\/manga\/(\d+)-/;
        const idMatch = url.match(idRegex);
        if (!idMatch) return [];
        const manga_id = idMatch[1];

        const chapUrl = `https://kaliscan.io/service/backend/chaplist/?manga_id=${manga_id}`;
        const response = await fetchv2(chapUrl);
        const html = await response.text();

        const regex = /<a href="([^"]*)"[^>]*>[\s\S]*?Chapter\s*(\d+)/gi;
        let match;
        const seen = new Set();
        
        while ((match = regex.exec(html)) !== null) {
            const chapterUrl = match[1].startsWith("http") ? match[1].trim() : "https://kaliscan.io" + match[1].trim();
            if (!seen.has(chapterUrl)) {
                seen.add(chapterUrl);
                const chapterNum = parseInt(match[2], 10);
                results.push({
                    href: chapterUrl,
                    number: chapterNum,
                    title: `Chapter ${chapterNum}`
                });
            }
        }

        return results.reverse();
    } catch (err) {
        return [];
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        const regex = /var chapImages = "([^"]*)"/;
        const match = regex.exec(html);
        if (match) {
            const imagesString = match[1];
            const images = imagesString.split(',');
            results.push(...images);
        }

        return results;
    } catch (err) {
        return [];
    }
}