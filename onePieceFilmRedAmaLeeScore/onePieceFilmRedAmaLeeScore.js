// v2.0.0 — rebuilt on Google Drive mirror: "One Piece Film: Pink - Deluxe AmaLee
// Edition" by TheFerg714 (AmaLee English covers replacing the original score).
// Old Pixeldrain file 5doVw29C is dead (404 not_found, verified 2026-11-12).
// Direct stream URL is the drive.usercontent.google.com download endpoint with
// confirm=t (verified: HTTP 200 application/octet-stream, Content-Disposition
// attachment, Range 0-99 -> 206). No network calls needed at runtime.

var ONE_PIECE_PINK_AMALEE = {
    title: "One Piece Film Red - AmaLee Score (Pink Deluxe AmaLee Edition)",
    image: "https://git.luna-app.eu/ibro/services/raw/branch/main/onePieceFilmRedAmaLeeScore/icon.png",
    filePage: "https://drive.google.com/file/d/1gmhWlN5hy0zFUJtJSPKHM-9qxqkKdgkk/view",
    fileId: "1gmhWlN5hy0zFUJtJSPKHM-9qxqkKdgkk"
};

function onePiecePinkDirectUrl() {
    return "https://drive.usercontent.google.com/download?id=" + ONE_PIECE_PINK_AMALEE.fileId + "&export=download&confirm=t";
}

async function searchResults(keyword) {
    const results = [];
    try {
        results.push({
            title: ONE_PIECE_PINK_AMALEE.title,
            image: ONE_PIECE_PINK_AMALEE.image,
            href: ONE_PIECE_PINK_AMALEE.filePage
        });
    } catch (e) {
        console.log("searchResults error: " + e);
    }
    console.log(`Results: ${JSON.stringify(results)}`);
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const transformedResults = [{
        description: "One Piece Film: Red fan edit replacing the original score with AmaLee's English covers (Pink - Deluxe AmaLee Edition by TheFerg714).",
        aliases: 'One Piece Film Red, One Piece Film Pink, AmaLee Score',
        airdate: '2022'
    }];
    console.log(`Details: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

async function extractEpisodes(url) {
    const match = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/) || url.match(/([A-Za-z0-9_-]{20,})/);
    if (!match) throw new Error("Invalid URL format");

    const id = match[1];

    const transformedResults = [];
    transformedResults.push({
        href: `${id}`,
        number: 1,
    });

    console.log(`Episodes: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

async function extractStreamUrl(url) {
    try {
        return JSON.stringify({
            streams: [{ title: "Google Drive (AmaLee Edition MKV)", streamUrl: onePiecePinkDirectUrl(), headers: {} }]
        });
    } catch (e) {
        console.log("extractStreamUrl error: " + e);
        return JSON.stringify({ streams: [], subtitles: [] });
    }
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
