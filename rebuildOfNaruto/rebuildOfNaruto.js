async function searchResults(keyword) {
    const results = [];

    
    results.push({
        title: "Rebuild of Naruto (2019) - Season 1 - Naruto",
        image: "https://pixeldrain.net/api/file/tseMo66v",
        href: "https://pixeldrain.net/l/SmsFwCAT"
    });

    results.push({
        title: "Rebuild of Naruto (2019) - Season 2 - Naruto Gaiden",
        image: "https://pixeldrain.net/api/file/PqkviitQ",
        href: "https://pixeldrain.net/l/1YKx5EWn"
    });

    results.push({
        title: "Rebuild of Naruto (2019) - Season 3 - Kakashi Gaiden",
        image: "https://pixeldrain.net/api/file/WWbQ5efe",
        href: "https://pixeldrain.net/l/bc226sF1"
    });

    results.push({
        title: "Rebuild of Naruto (2019) - Season 4 - Naruto Shippuden",
        image: "https://pixeldrain.net/api/file/jjW3hhCL",
        href: "https://pixeldrain.net/l/E1EuRcLU"
    });

    results.push({
        title: "Rebuild of Naruto (2019) - Season 5 - Naruto Senjou",
        image: "https://pixeldrain.net/api/file/eZUREmqQ",
        href: "https://pixeldrain.net/l/vKm6yFu4"
    });

    results.push({
        title: "Rebuild of Naruto (2019) - Season 6 - Itachi Shinden",
        image: "https://pixeldrain.net/api/file/xZ4qFLcz",
        href: "https://pixeldrain.net/l/6HKj825x"
    });

    results.push({
        title: "Rebuild of Naruto (2019) - Season 7 - Naruto Hiden",
        image: "https://pixeldrain.net/api/file/YeBS7udw",
        href: "https://pixeldrain.net/l/hif36HTr"
    });

    results.push({
        title: "Rebuild of Naruto (2019) - Season 8 - Next Generations",
        image: "",
        href: "https://pixeldrain.net/l/mTCVETnp"
    });
    
    console.log(`Results: ${JSON.stringify(results)}`);
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const match = url.match(/https:\/\/pixeldrain\.net\/l\/([^\/]+)/);
    if (!match) throw new Error("Invalid URL format");
            
    const arcId = match[1];

    const response = await soraFetch(`https://pixeldrain.net/api/list/${arcId}`);
    const data = await response.json();

    const hasImage = data.files.some(file => file.mime_type.startsWith("image/"));
    const fileCount = hasImage ? data.file_count - 1 : data.file_count;

    const transformedResults = [{
        description: `Title: ${data.title}\nFile Count: ${fileCount}`,
        aliases: `Title: ${data.title}\nFile Count: ${fileCount}`,
        airdate: ''
    }];

    console.log(`Details: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

async function extractEpisodes(url) {
    const match = url.match(/https:\/\/pixeldrain\.net\/l\/([^\/]+)/);
    if (!match) throw new Error("Invalid URL format");
            
    const arcId = match[1];

    const response = await soraFetch(`https://pixeldrain.net/api/list/${arcId}`);
    const data = await response.json();

    const transformedResults = data.files
        .filter(result => !result.mime_type.startsWith("image/"))
        .map((result, index) => {
            return {
                href: `${result.id}`,
                number: index + 1,
            };
        });

    console.log(`Episodes: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

// searchResults("all");
// extractDetails("https://pixeldrain.net/l/dX3cF5Q3");
// extractEpisodes("https://pixeldrain.net/l/dX3cF5Q3");
// extractStreamUrl(`EDg7Q9Uu`);

async function extractStreamUrl(url) {
    return JSON.stringify({
        streams: [{ title: "Pixeldrain", streamUrl: `https://pixeldrain.net/api/file/${url}?download`, headers: {} }]
    });
}

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
