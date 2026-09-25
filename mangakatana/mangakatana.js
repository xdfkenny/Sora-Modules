async function searchResults(keyword, page = 0) {
    let results = [];
    try {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        };
        const postData = `s=${encodeURIComponent(keyword)}&search_by=book_name`;
        
        const response = await fetchv2("https://mangakatana.com/", headers, "POST", postData);
        
        const html = await response.text();
        
        const regex = /<div\s+class=["']item["'][^>]*data-id=["'](\d+)["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*class=["']title["'][^>]*>([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                id: match[3].trim(),
                imageURL: match[2].trim(),
                title: match[4].trim()
            });
        }
        
        console.log(`Found ${results.length} results for "${keyword}"`);
        return results;
    } catch (err) {
        console.error('Search error:', err);
        return [];
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        
        const descRegex = /<meta\s+name=["']description["'][^>]*content=["']([^"']*)["']/;
        const descMatch = html.match(descRegex);
        let description = "";
        
        if (descMatch && descMatch[1]) {
            description = descMatch[1]
                .replace(/^Summary:\s*/i, '')
                .trim();
        }
        
        const tags = [];
        const genresRegex = /<div\s+class=["']genres["'][^>]*>([\s\S]*?)<\/div>/;
        const genresMatch = html.match(genresRegex);
        
        if (genresMatch && genresMatch[1]) {
            const tagRegex = /<a[^>]*>([^<]+)<\/a>/g;
            let tagMatch;
            while ((tagMatch = tagRegex.exec(genresMatch[1])) !== null) {
                tags.push(tagMatch[1].trim());
            }
        }
        
        return {
            description: description,
            tags: tags
        };
    } catch (err) {
        console.error('Error fetching content data:', err);
        return {
            description: "Error",
            tags: []
        };
    }
}

async function extractChapters(url) {
    const results = [];
    try {
        const response = await fetch(url);
        const html = await response.text();
        const regex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a><\/div><\/td><td><div\s+class=["']update_time["']/g;
        let match;
        const matches = [];
        while ((match = regex.exec(html)) !== null) {
            matches.push({
                id: match[1].trim(),
                title: match[2].trim()
            });
        }
        matches.reverse();
        for (let i = 0; i < matches.length; i++) {
            results.push([
                String(i),
                [{
                    id: matches[i].id,
                    title: matches[i].title,
                    chapter: i,
                    scanlation_group: ""
                }]
            ]);
        }
        return {
            en: results
        };
    } catch (err) {
        return {
            en: []
        };
    }
}

async function extractImages(url) {
    const results = [];
    try {
        const response = await fetch(url);
        const html = await response.text();
        const regex = /var\s+thzq\s*=\s*\[([\s\S]*?)\];/;
        const match = html.match(regex);
        
        if (match && match[1]) {
            const urlsString = match[1];
            const urlRegex = /'([^']+)'/g;
            let urlMatch;
            while ((urlMatch = urlRegex.exec(urlsString)) !== null) {
                results.push(urlMatch[1].trim());
            }
        }
        
        return results;
    } catch (err) {
        return [];
    }
}