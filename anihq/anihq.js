async function searchResults(keyword) {
    const results = [];
    const headers = {
        "Content-Type": "multipart/form-data; boundary=----geckoformboundary38c356867533a17de80e8c65d9125df5"
    };
    const postData = `------geckoformboundary38c356867533a17de80e8c65d9125df5
Content-Disposition: form-data; name="s_keyword"

${keyword}
------geckoformboundary38c356867533a17de80e8c65d9125df5
Content-Disposition: form-data; name="orderby"

popular
------geckoformboundary38c356867533a17de80e8c65d9125df5
Content-Disposition: form-data; name="order"

DESC
------geckoformboundary38c356867533a17de80e8c65d9125df5
Content-Disposition: form-data; name="action"

advanced_search
------geckoformboundary38c356867533a17de80e8c65d9125df5
Content-Disposition: form-data; name="page"

1
------geckoformboundary38c356867533a17de80e8c65d9125df5--`;

    try {
        const response = await fetchv2("https://anihq.cc/wp-admin/admin-ajax.php", headers, "POST", postData);
        const data = await response.json();
        const html = data.data.html;
        const articlePattern = /<article[^>]*class="anime-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
        let articleMatch;

        while ((articleMatch = articlePattern.exec(html)) !== null) {
            const articleHtml = articleMatch[1];

            const imgMatch = articleHtml.match(/<img[^>]+src=['"]([^'"]+)['"][^>]+alt=['"]([^'"]+)['"]/);


            const linkMatch = articleHtml.match(/<h3[^>]*>[\s\S]*?<a[^>]+href=['"]([^'"]+)['"][^>]*title=['"]([^'"]+)['"]/);

            if (imgMatch && linkMatch) {
                results.push({
                    title: linkMatch[2].trim(),
                    image: imgMatch[1].trim(),
                    href: linkMatch[1].trim()
                });
            }
        }

        return JSON.stringify(results);
    } catch (err) {
        console.log(err);
        return JSON.stringify([{
            title: "Error",
            image: "Error",
            href: "Error"
        }]);
    }
}


async function extractDetails(url) {
    try {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": "https://anihq.cc/"
        };
        const response = await fetchv2(url, headers);
        const html = await response.text();

        let descMatch = html.match(/<div\s+class=["']anime-synopsis["']>[\s\S]*?<div[^>]+class=["']prose[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

        if (!descMatch) {
            descMatch = html.match(/<section[^>]+aria-label=["']Anime Overview["'][^>]*>([\s\S]*?)<\/section>/i);
        }

        let description = "N/A";

        if (descMatch) {
            description = descMatch[1]
                .trim()
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        return JSON.stringify([{
            description: description,
            aliases: "N/A",
            airdate: "N/A"
        }]);
    } catch (err) {
        return JSON.stringify([{
            description: "Error: " + err.message,
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

        const watchUrlMatch = html.match(/<a\s+[^>]*href=["']((?:https?:\/\/anihq\.cc)?\/watch\/[a-zA-Z0-9\-_]+(?:\/|\.html)?)["']/i);

        if (!watchUrlMatch) {
            return JSON.stringify([{
                href: url,
                number: 1
            }]);
        }

        const watchUrl = watchUrlMatch[1];

        const watchResponse = await fetchv2(watchUrl);
        const watchHtml = await watchResponse.text();

        const episodeRegex = /<a href="([^"]+)"[^>]*class="[^"]*episode-list-item[^"]*"[^>]*data-episode-search-query="(\d+)"[\s\S]*?<span class="episode-list-item-number">\s*(\d+)\s*<\/span>/g;

        let match;
        while ((match = episodeRegex.exec(watchHtml)) !== null) {
            results.push({
                href: match[1].trim(),
                number: parseInt(match[2], 10)
            });
        }

        if (results.length === 0) {
            return JSON.stringify([{
                href: watchUrl,
                number: 1
            }]);
        }

        return JSON.stringify(results);
    } catch (err) {
        return JSON.stringify([{
            href: "Error: " + err.message,
            number: "Error"
        }]);
    }
}

async function extractStreamUrl(url) {
    try {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Referer": "https://anihq.cc/"
        };
        const response = await fetchv2(url, headers);
        const html = await response.text();

        const iframeMatch = html.match(/<iframe[^>]+src=['"]([^'"]+)['"]/i);
        if (!iframeMatch) {
            console.log("No iframe found on page");
            return null;
        }

        const iframeUrl = iframeMatch[1];
        console.log("Found iframe URL:", iframeUrl);

        const iframeResponse = await fetchv2(iframeUrl, headers);
        let iframeHtml = await iframeResponse.text();

        let finalUrl = iframeUrl;

        const redirectMatch = iframeHtml.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (redirectMatch) {
            const redirectUrl = redirectMatch[1];
            finalUrl = redirectUrl;
            console.log("Following JS redirect to:", redirectUrl);
            const redirectedResponse = await fetchv2(redirectUrl, headers);
            iframeHtml = await redirectedResponse.text();
        }

        let streamData = null;
        try {
            streamData = voeExtractor(iframeHtml);
        } catch (error) {
            console.log("VOE extraction error:", error.message || error);
            return null;
        }

        const streamUrlResult = typeof streamData === "string" ? streamData : getStreamUrl(streamData);

        if (streamUrlResult) {
            const originMatch = finalUrl.match(/^(https?:\/\/[^\/]+)/);
            const origin = originMatch ? originMatch[1] : "https://bryantenunder.com";
            console.log("Stream URL secured:", streamUrlResult);

            return JSON.stringify({
                streams: [
                    {
                        title: "Server 1",
                        streamUrl: streamUrlResult,
                        headers: {
                            "Origin": origin,
                            "Referer": origin + "/"
                        }
                    }
                ]
            });
        }

        console.log("No stream URL found");
        return null;
    } catch (error) {
        console.log("Fetch error:", error.message || error);
        return null;
    }
}

/* SCHEME START */

/**
 * @name voeExtractor
 * @author Cufiy
 */

function voeExtractor(html, url = null) {
    const regex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let obfuscatedString = null;
    while ((match = regex.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1].trim());
            if (Array.isArray(data) && typeof data[0] === "string") {
                obfuscatedString = data[0];
                break;
            }
        } catch (e) {
            // Ignore syntax/parse errors for other script tags
        }
    }

    if (!obfuscatedString) {
        console.log("No valid VOE application/json script tag found");
        return null;
    }

    // Step 1: ROT13
    let step1 = voeRot13(obfuscatedString);

    // Step 2: Remove patterns
    let step2 = voeRemovePatterns(step1);

    // Step 3: Base64 decode
    let step3 = voeBase64Decode(step2);

    // Step 4: Subtract 3 from each char code
    let step4 = voeShiftChars(step3, 3);

    // Step 5: Reverse string
    let step5 = step4.split("").reverse().join("");

    // Step 6: Base64 decode again
    let step6 = voeBase64Decode(step5);

    // Step 7: Parse as JSON
    let result;
    try {
        result = JSON.parse(step6);
    } catch (e) {
        throw new Error("Final JSON parse error: " + e.message);
    }

    // check if direct_access_url is set, not null and starts with http
    const streamUrl = getStreamUrl(result);
    if (streamUrl) {
        console.log("Voe Stream URL: " + streamUrl);
        return streamUrl;
    } else {
        console.log("No stream URL found in the decoded JSON");
    }
    return result;
}

function voeRot13(str) {
    return str.replace(/[a-zA-Z]/g, function (c) {
        return String.fromCharCode(
            (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13)
                ? c
                : c - 26
        );
    });
}

function voeRemovePatterns(str) {
    const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
    let result = str;
    for (const pat of patterns) {
        result = result.split(pat).join("");
    }
    return result;
}

function voeBase64Decode(str) {
    if (typeof atob === "function") {
        try {
            return atob(str);
        } catch (e) {
            // fallback if atob fails
        }
    }

    // Pure Javascript Base64 decoding fallback to avoid reliance on Buffer or atob
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let cleaned = str.replace(/=+$/, '').replace(/[^A-Za-z0-9+/]/g, '');
    let output = '';
    let buffer = 0;
    let bits = 0;

    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        const idx = chars.indexOf(char);
        if (idx === -1) continue;

        buffer = (buffer << 6) | idx;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            const byte = (buffer >> bits) & 0xFF;
            output += String.fromCharCode(byte);
        }
    }

    try {
        return decodeURIComponent(escape(output));
    } catch (e) {
        return output;
    }
}

function voeShiftChars(str, shift) {
    return str
        .split("")
        .map((c) => String.fromCharCode(c.charCodeAt(0) - shift))
        .join("");
}

function getStreamUrl(result) {
    if (!result) return null;
    if (typeof result === "string" && result.startsWith("http")) {
        return result;
    }
    if (typeof result === "object") {
        if (typeof result.source === "string" && result.source.startsWith("http")) {
            return result.source;
        }
        if (typeof result.direct_access_url === "string" && result.direct_access_url.startsWith("http")) {
            return result.direct_access_url;
        }
        if (Array.isArray(result.source)) {
            const url = result.source
                .map((source) => typeof source === "string" ? source : (source.direct_access_url || source.file || source.url))
                .find((url) => url && url.startsWith("http"));
            if (url) return url;
        }
    }
    return null;
}
/* SCHEME END */