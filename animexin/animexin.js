async function searchResults(keyword) {

    try {    const results = [];
    const response = await fetchv2(`https://animexin.dev/?s=${keyword}`);
    const html = await response.text();

    const regex = /<article class="bs"[^>]*>.*?<a href="([^"]+)"[^>]*>.*?<img src="([^"]+)"[^>]*>.*?<h2[^>]*>(.*?)<\/h2>/gs;

    let match;
    while ((match = regex.exec(html)) !== null) {
        results.push({
            title: match[3].trim(),
            image: match[2].trim(),
            href: match[1].trim()
        });
    }

    return JSON.stringify(results);
    } catch (e) {
        console.log("[searchResults] error: " + e);
        return JSON.stringify([]);
    }
}


async function extractDetails(url) {

    try {    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();

    const match = html.match(/<div class="entry-content"[^>]*>([\s\S]*?)<\/div>/);

    let description = "N/A";
    if (match) {
        description = match[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, "&")
            .trim();
    }

    results.push({
        description: description,
        aliases: 'N/A',
        airdate: 'N/A'
    });

    return JSON.stringify(results);
    } catch (e) {
        console.log("[extractDetails] error: " + e);
        return JSON.stringify([{ description: "N/A", aliases: "N/A", airdate: "N/A" }]);
    }
}


async function extractEpisodes(url) {

    try {    const results = [];
    const response = await fetchv2(url);
    const html = await response.text();

    // epl-num can be a number ("25") or a label ("Movie" on film pages)
    const regex = /<a href="([^"]+)">\s*<div class="epl-num">([^<]+)<\/div>/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
        const num = parseInt(match[2], 10);
        const title = match[2].trim();
        results.push({
            href: match[1].trim(),
            number: isNaN(num) ? results.length + 1 : num,
            title: isNaN(num) ? title : `Episode ${title}`
        });
    }
    results.reverse();
    return JSON.stringify(results);
    } catch (e) {
        console.log("[extractEpisodes] error: " + e);
        return JSON.stringify([]);
    }
}


async function extractStreamUrl(url) {

    try {    const response = await fetchv2(url);
    const html = await response.text();
    console.log("1")
    const optionRegex = /<option value="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/option>/g;
    // The live option labels carry an engine suffix ("... Dailymotion AX",
    // "All Sub Player Dailymotion AX"); match on the "Dailymotion" substring
    // instead of a fixed exact list, which silently dropped every option.
    const videoOptions = [];
    console.log("2")
    let match;
    while ((match = optionRegex.exec(html)) !== null) {
        const base64 = match[1];
        const label = match[2].trim();
        if (!base64 || !label.includes("Dailymotion")) continue;

        const decodedValue = atob(base64);
        if (!decodedValue) continue;

        const idMatch = decodedValue.match(/video=([a-zA-Z0-9]+)/) || decodedValue.match(/video\/([a-zA-Z0-9]+)/);
        const videoId = idMatch ? idMatch[1] : null;
        if (!videoId) continue;

        let title = "Dailymotion";
        if (label.includes("English")) title = "HardSub English";
        else if (label.includes("Indonesia") || label.includes("Indo")) title = "HardSub Indonesian";
        videoOptions.push({ videoId, label: title });
    }
    console.log("3")
    async function getBestHls(hlsUrl) {
        try {
            const res = await fetchv2(hlsUrl);
            const text = await res.text();

            const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+).*?\n(https?:\/\/[^\n]+)/g;
            let match;
            const streams = [];

            while ((match = regex.exec(text)) !== null) {
                const width = parseInt(match[1]);
                const height = parseInt(match[2]);
                const url = match[3];
                streams.push({ width, height, url });
            }

            if (streams.length === 0) return hlsUrl;
            streams.sort((a, b) => b.height - a.height);
            return streams[0].url;
        } catch (err) {
            return hlsUrl;
        }
    }
    console.log("4")
    const streams = [];
    for (const option of videoOptions) {
        try {
            const metaRes = await fetchv2(`https://www.dailymotion.com/player/metadata/video/${option.videoId}`);
            const metaJson = await metaRes.json();
            const hlsLink = metaJson.qualities?.auto?.[0]?.url;
            if (!hlsLink) continue;

            const bestHls = await getBestHls(hlsLink);
            streams.push({
                title: option.label,
                streamUrl: bestHls,
                headers: { "Referer": "https://www.dailymotion.com/" }
            });
        } catch (err) {
            continue;
        }
    }
    console.log("5")
    return JSON.stringify({
        streams: streams,
        subtitles: ""
    });
    } catch (e) {
        console.log("[extractStreamUrl] error: " + e);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

const atob = (input) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';

    for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }

    return output;
};

