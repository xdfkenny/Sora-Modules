/**
 * filmpalast.js
 * A module for Sora that provides watch functionality for filmpalast.to.
 * @module filmpalast
 * @author JMcrafte26
 * @license MIT
 * @version 1.2.3
 */

/**
 * Searches for films on filmpalast.to based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await fetch(`https://filmo.to/search?q=${encodedKeyword}`);
        const html = await response.text();

        // Match each movie card (popular-spotlight-card) – works with extra classes
        const cardRegex = /<article class="[^"]*popular-spotlight-card[^"]*"[\s\S]*?<\/article>/g;
        const items = html.match(cardRegex) || [];

        const results = [];

        for (const itemHtml of items) {
            // 1. Extract the anchor element that has the link class
            const anchorMatch = itemHtml.match(
                /<a[^>]*class="[^"]*popular-spotlight-card__link[^"]*"[^>]*>/
            );
            if (!anchorMatch) continue;
            const anchorTag = anchorMatch[0];

            // 2. Extract href from that anchor (regardless of attribute order)
            const hrefMatch = anchorTag.match(/href="([^"]+)"/);
            if (!hrefMatch) continue;
            let href = hrefMatch[1];
            if (href && !href.startsWith('https://')) {
                href = `https://filmo.to${href}`;
            }

            // 3. Extract title from <h4> (your pattern already handles extra classes)
            const titleMatch = itemHtml.match(
                /<h4 class="[^"]*popular-spotlight-card__title[^"]*"[^>]*>([^<]+)<\/h4>/
            );
            if (!titleMatch) continue;
            const title = titleMatch[1].trim();

            // 4. Extract image – prefer <source> with avif/webp, fallback to <img>
            let image = '';
            // Try <source> with srcset (avif or webp)
            const sourceMatch = itemHtml.match(
                /<source[^>]*srcset="([^"]+)"[^>]*>/
            );
            if (sourceMatch) {
                const srcset = sourceMatch[1].split(',')[0].trim().split(' ')[0];
                image = srcset;
            } else {
                // Fallback to <img>
                const imgMatch = itemHtml.match(
                    /<img[^>]+src="([^"]+)"[^>]*>/
                );
                if (imgMatch) {
                    image = imgMatch[1];
                }
            }
            if (image && !image.startsWith('https://')) {
                image = `https://filmo.to${image}`;
            }

            results.push({ title, image, href });
        }

        // Remove duplicates by href
        const seen = new Set();
        const uniqueResults = results.filter(result => {
            const key = result.href;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        return JSON.stringify(uniqueResults);
    } catch (error) {
        console.log("Search error: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

/**
 * Cleans the title by replacing HTML entities with their corresponding characters.
 * @param {string} title - The title to clean.
 * @returns {string} - The cleaned title.
 */
function cleanTitle(title) {
  return title
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Extracts details from a film's page.
 * @param {string} url - The URL of the film's page.
 * @returns {Promise<string>} - A JSON string of the film's details.
 */
async function extractDetails(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();

    // 1. Description
    let description = 'Error loading description';
    const descMatch = html.match(
      /<p class="[^"]*movie-detail-synopsis[^"]*"[^>]*>([\s\S]*?)<\/p>/
    );
    if (descMatch) {
      description = descMatch[1].trim();
    }

    // 2. Duration & Year – extract from all spans with class "ft-meta-label"
    let duration = 'Unknown';
    let year = 'Unknown';

    const metaSpanRegex = /<span class="[^"]*ft-meta-label[^"]*"[^>]*>([^<]+)<\/span>/g;
    let match;
    while ((match = metaSpanRegex.exec(html)) !== null) {
      const text = match[1].trim();
      // Duration: e.g. "1 h 46 min", "46 min", "1 h"
      if (/\d+\s*h\s*\d+\s*min/.test(text) || /\d+\s*min/.test(text) || /\d+\s*h/.test(text)) {
        duration = text;
      }
      // Year: exactly four digits
      if (/^\d{4}$/.test(text)) {
        year = text;
      }
    }

    // Build the result exactly as your original format
    const transformedResults = [{
      description,
      aliases: `Duration: ${duration}`,
      airdate: `Aired: ${year}`,
    }];

    return JSON.stringify(transformedResults);
  } catch (error) {
    console.log('Details error: ' + error);
    return JSON.stringify([{
      description: 'Error loading description',
      aliases: 'Duration: Unknown',
      airdate: 'Aired: Unknown',
    }]);
  }
}

/**
 * Extracts episodes from a film's page.
 * @param {string} url - The URL of the film's page.
 * @returns {Promise<string>} - A JSON string of the episodes.
 */
async function extractEpisodes(url) {

    console.log("No seasons found - Probably a movie");
    return JSON.stringify([{ number: "0", href: url }]);
}



// --------------------------------------------
// extractVideoUrlFromProviderPage(html, providerLink)
// --------------------------------------------
function extractVideoUrlFromProviderPage(html, providerLink) {
    // 1. Try to find window.location.href = '...' in scripts
    const scriptRegex = /window\.location\.href\s*=\s*['"]([^'"]+)['"]/;
    const scriptMatch = scriptRegex.exec(html);
    if (scriptMatch) {
        return scriptMatch[1];
    }

    // 2. Try to find an <a> with class "open" (common on filemoon etc.)
    const anchorRegex = /<a[^>]*class="[^"]*open[^"]*"[^>]*href="([^"]+)"[^>]*>/i;
    const anchorMatch = anchorRegex.exec(html);
    if (anchorMatch) {
        return anchorMatch[1];
    }

    // 3. Try to find any link that looks like a video provider URL
    //    e.g., <a href="https://byse..."> or similar
    const genericLinkRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i;
    const genericMatch = genericLinkRegex.exec(html);
    if (genericMatch) {
        return genericMatch[1];
    }

    // 4. If the page itself is the video (e.g., returns a video file), return the providerLink
    //    but we can't know that without checking content-type; for now, return null
    return null;
}

/**
 * Extracts the stream URL from a film's page.
 * @param {string} url - The URL of the film's page.
 * @returns {Promise<string|null>} - The stream URL or null if not found.
 *
 */
async function extractStreamUrl(url) {
    try {
        const cookieInfo = await getAllCookies(url);

        const response = await soraFetch(url, {
            method: "GET",
            headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
                "cookie": cookieInfo.Cookie
            }
        });
        if (!response) {
            console.log("Response not found");
            return null;
        }
        const html = response.text ? await response.text() : response;

        if (!html) {
            console.log("HTML not found");
            return null;
        }

        // Select the hoster
        let providerArray = await selectHoster(html, url, cookieInfo);
        console.log("Provider Array: " + JSON.stringify(providerArray));
        let newProviderArray = {};

        for (const [key, value] of Object.entries(providerArray)) {
            const providerLink = value;
            const providerName = key;
            console.log(`Fetching provider link: ${providerLink} for provider: ${providerName}`);

            const csrfTokenMatch = html.match(/<meta name="csrf-token" content="([^"]+)"/);
            const csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null;

            const headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "referer": url,
                "origin": "https://filmo.to",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
                "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
                "x-requested-with": "XMLHttpRequest",
                "cookie": cookieInfo.Cookie || "",
                "x-xsrf-token": cookieInfo["x-xsrf-token"] || "",
                "x-csrf-token": csrfToken,
            };

            // Fetch the provider page directly
            const providerResponse = await soraFetch(providerLink, {
                headers,
                method: "GET",
            });
            if (!providerResponse.ok) {
                console.log(`Provider page fetch failed: ${providerResponse.status}`);
                continue;
            }
            const providerHtml = await providerResponse.text();

            // Extract the final video URL locally
            const videoUrl = extractVideoUrlFromProviderPage(providerHtml, providerLink);
            if (videoUrl) {
                newProviderArray[videoUrl] = providerName;
                console.log(`✅ Extracted video URL for ${providerName}: ${videoUrl}`);
            } else {
                console.log(`❌ No video URL found for ${providerName}`);
            }
        }

        sendLog("Provider List: " + JSON.stringify(newProviderArray));

        try {
            let streams = await multiExtractor(newProviderArray);
            let returnedStreams = { streams: streams };
            sendLog("Returned Streams: " + JSON.stringify(returnedStreams));
            return JSON.stringify(returnedStreams);
        } catch (error) {
            console.log("Error extracting stream URL: " + error);
            return null;
        }
    } catch (error) {
        console.log("Fetch error: " + error);
        return null;
    }
}



// --------------------------------------------
// getAllCookies(url) – fetches cookies from given URL
// --------------------------------------------
async function getAllCookies(url) {
  try {
    const site = await soraFetch(url);

    function headerValue(headers, name) {
      if (!headers) return null;
      const target = String(name).toLowerCase();
      try {
        if (typeof headers.get === 'function') {
          const value = headers.get(target);
          if (value) return value;
        }
      } catch (_) { }
      try {
        if (typeof headers.raw === 'function') {
          const raw = headers.raw();
          if (raw && raw[target]) return raw[target];
        }
      } catch (_) { }
      if (typeof headers === 'object' && !Array.isArray(headers)) {
        for (const k in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, k) && String(k).toLowerCase() === target) {
            return headers[k];
          }
        }
      }
      try {
        if (typeof headers[Symbol.iterator] === 'function') {
          for (const pair of headers) {
            if (!pair) continue;
            if (Array.isArray(pair) && pair.length >= 2) {
              if (String(pair[0]).toLowerCase() === target) return pair[1];
            }
            if (pair.name && pair.value && String(pair.name).toLowerCase() === target) return pair.value;
          }
        }
      } catch (_) { }
      try {
        if (headers[target]) return headers[target];
      } catch (_) { }
      return null;
    }

    const setCookieRaw = headerValue(site && site.headers ? site.headers : null, 'set-cookie') || '';

    let cookieArray = [];
    if (Array.isArray(setCookieRaw)) {
      cookieArray = setCookieRaw.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof setCookieRaw === 'string' && setCookieRaw.length > 0) {
      cookieArray = String(setCookieRaw).split(/,(?=\s*[A-Za-z0-9_\-]+=)/).map(s => s.trim()).filter(Boolean);
    }

    // Keep all cookies (no filtering)
    const baseCookies = cookieArray.map(c => c.split(';')[0].trim()).filter(Boolean);
    const cookieObj = {};
    baseCookies.forEach(cookie => {
      const eqIdx = cookie.indexOf('=');
      if (eqIdx > -1) {
        const key = cookie.slice(0, eqIdx).trim();
        const val = cookie.slice(eqIdx + 1).trim();
        cookieObj[key] = val;
      }
    });

    const cookieString = Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; ');
    const xsrfToken = cookieObj['XSRF-TOKEN'] ? decodeURIComponent(cookieObj['XSRF-TOKEN']) : '';

    return {
      Cookie: cookieString,
      "x-xsrf-token": xsrfToken
    };

  } catch (error) {
    console.error('Error fetching cookies:', error);
    return { Cookie: '', 'x-xsrf-token': '' };
  }
}

// --------------------------------------------
// getHosters(html, pageUrl, cookieInfo)
// --------------------------------------------
async function getHosters(html, pageUrl, cookieInfo) {

  const targetLanguage = 'english';    // your preferred language
const fallbackLanguage = 'deutsch';  // set to null to fall back to ALL languages


const grouped = {};

const rowRegex = /<div class="provider-row">([\s\S]*?)(?=<div class="provider-row">|$)/g;
const chipRegex = /<div[^>]*class="[^"]*provider-chip[^"]*"[^>]*data-p="([^"]+)"[^>]*aria-label="([^"]+)"[^>]*>/g;

for (const rowMatch of html.matchAll(rowRegex)) {
  const rowHtml = rowMatch[1];

  const langMatch = rowHtml.match(/<span class="provider-row__lang">([^<]+)<\/span>/);
  if (!langMatch) continue;

  const language = langMatch[1].trim();

  const chips = [...rowHtml.matchAll(chipRegex)].map(m => ({
    provider: m[2], // aria-label
    dataP: m[1],
  }));

  if (!grouped[language]) grouped[language] = [];
  grouped[language].push(...chips);
}

// Case-insensitive lookup
const normalize = s => s.trim().toLowerCase();
const originalKeys = new Map(Object.keys(grouped).map(key => [normalize(key), key]));

const selectedKey =
  (targetLanguage && originalKeys.get(normalize(targetLanguage))) ||
  (fallbackLanguage && originalKeys.get(normalize(fallbackLanguage)));

const finalChips = selectedKey
  ? grouped[selectedKey]
  : Object.values(grouped).flat(); // use [] if you want no chips instead

console.log('Languages found:', Object.keys(grouped));
console.log('Selected language:', selectedKey);
console.log('Chips:', finalChips);

  // 2. Extract CSRF token from HTML
  const csrfMeta = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMeta ? csrfMeta[1] : null;
  if (!csrfToken) throw new Error('CSRF token not found');
  console.log("CSRF Token extracted: ", csrfToken);

  // 3. Get cookies (if not provided, fetch from homepage)
  let cookies = cookieInfo;
  if (!cookies) {
    console.warn('No cookieInfo provided - fetching fresh cookies from homepage');
    cookies = await getAllCookies('https://filmo.to/');
  }

  console.log("Using cookies:", cookies.Cookie.slice(0, 80) + '...');

  // 4. Send POST requests for each chip
  const results = {};
  const concurrency = 5;
  const chunks = [];
  for (let i = 0; i < finalChips.length; i += concurrency) {
    chunks.push(finalChips.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (chip) => {
      try {
        const headers = {
          "accept": "application/json",
          "content-type": "application/json",
          "referer": pageUrl,
          "origin": "https://filmo.to",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
          "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
          "x-requested-with": "XMLHttpRequest",
          "cookie": cookies.Cookie || "",
          "x-xsrf-token": cookies["x-xsrf-token"] || "",
          "x-csrf-token": csrfToken,
        };
        const resp = await soraFetch("https://filmo.to/n", {
          method: "POST",
          headers,
          body: JSON.stringify({ p: chip.dataP }),
          credentials: "include"
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} | ${resp.statusText}`);
        const json = await resp.json();
        if (json && json.x) {
          const streamUrl = `https://filmo.to/n/${encodeURIComponent(json.x)}`;
          let providerName = chip.provider.toLowerCase();
          if (providerName.toLowerCase() === 'byse') providerName = 'filemoon';
          console.log(`✅ ${providerName} → ${streamUrl}`);
          return { provider: providerName, url: streamUrl };
        } else {
          console.warn(`No token for ${providerName}`);
          return null;
        }
      } catch (err) {
        console.error(`Error for ${providerName}:`, err.message);
        return null;
      }
    });
    const chunkResults = await Promise.all(promises);
    for (const r of chunkResults) {
      if (r) results[r.provider] = r.url;
    }
  }

  return results;
}

// --------------------------------------------
// selectHoster(html, pageUrl, preferredProviders)
// --------------------------------------------
async function selectHoster(html, pageUrl, cookieInfo) {
  // First get all hosters
  // const cookieInfo = await getAllCookies('https://filmo.to/');

  // Fetch movie page with those cookies to get HTML with chips (if not already provided)
  // If html is already the movie page content, we can skip this step.
  // For simplicity, we assume 'html' is the movie page HTML.
  // If not, we fetch it.
  let movieHtml = html;
  if (!movieHtml || !movieHtml.includes('provider-chip')) {
    const movieResp = await soraFetch(pageUrl, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
        "cookie": cookieInfo.Cookie
      }
    });
    if (!movieResp.ok) throw new Error(`Movie page fetch failed: ${movieResp.status}`);
    movieHtml = await movieResp.text();
  }

  const hosters = await getHosters(movieHtml, pageUrl, cookieInfo);


  console.log("All hosters:", JSON.stringify(hosters));

  // If none selected, return all
  return hosters;
}


function sendLog(message) {
  // Check if the message is a string
  if (typeof message !== "string") {
    console.error("Message is not a string:", message);
    return;
  }
  // Send the log message to the console
  console.log(message);
}

/**
 * Decodes a base64 encoded string.
 * @param {string} str - The base64 encoded string.
 * @returns {string} - The decoded string.
 */
function base64Decode(str) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";

  str = String(str).replace(/=+$/, "");

  if (str.length % 4 === 1) {
    throw new Error(
      "'atob' failed: The string to be decoded is not correctly encoded."
    );
  }

  for (
    let bc = 0, bs, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }

  return output;
}


// if is node
if (typeof module !== "undefined" && module.exports) {
  console.log("Running in Node.js");
  // console.log(extractStreamUrl("https://filmo.to/movies/spider-man-brand-new-day"));
  searchResults("cars").then((results) => {
    console.log("Search Results:", results);
  });

  extractDetails("https://filmo.to/movies/spider-man-brand-new-day").then((details) => {
    console.log("Details:", details);
  });

  extractEpisodes("https://filmo.to/movies/spider-man-brand-new-day").then((episodes) => {
    console.log("Episodes:", episodes);
  });

  extractStreamUrl("https://filmo.to/movies/spider-man-brand-new-day").then((streamUrl) => {
    console.log("Stream URL:", streamUrl);
  });
}


// ⚠️ DO NOT EDIT BELOW THIS LINE ⚠️
// EDITING THIS FILE COULD BREAK THE UPDATER AND CAUSE ISSUES WITH THE EXTRACTOR
/* {GE START} */
/* {VERSION: 1.2.3} */

/**
 * @name global_extractor.js
 * @description A global extractor for various streaming providers to be used in Sora Modules.
 * @author Cufiy
 * @url https://github.com/JMcrafter26/sora-global-extractor
 * @license CUSTOM LICENSE - see https://github.com/JMcrafter26/sora-global-extractor/blob/main/LICENSE
 * @date 2026-06-18 04:12:29
 * @version 1.2.3
 * @note This file was generated automatically.
 * The global extractor comes with an auto-updating feature, so you can always get the latest version. https://github.com/JMcrafter26/sora-global-extractor#-auto-updater
 */


function globalExtractor(providers) {
  for (const [url, provider] of Object.entries(providers)) {
    try {
      const streamUrl = extractStreamUrlByProvider(url, provider);
      // check if streamUrl is an object with streamUrl property
      if (streamUrl && typeof streamUrl === "object" && !Array.isArray(streamUrl) && streamUrl.streamUrl) {
        return streamUrl.streamUrl;
      }
      // check if streamUrl is not null, a string, and starts with http or https
      if (
        streamUrl &&
        typeof streamUrl === "string" &&
        streamUrl.startsWith("http")
      ) {
        return streamUrl;
        // if its an array, get the value that starts with http
      } else if (Array.isArray(streamUrl)) {
        const httpStream = streamUrl.find((url) => url.startsWith("http"));
        if (httpStream) {
          return httpStream;
        }
      } else if (streamUrl || typeof streamUrl !== "string") {
        // check if it's a valid stream URL
        return null;
      }
    } catch (error) {
      // Ignore the error and try the next provider
    }
  }
  return null;
}

async function multiExtractor(providers) {
  /* this scheme should be returned as a JSON object
  {
  "streams": [
  {
    "title": "FileMoon",
    "streamUrl": "https://filemoon.example/stream1.m3u8",
  },
  {
    "title": "StreamWish",
    "streamUrl": "https://streamwish.example/stream2.m3u8",
  },
  {
    "title": "Okru",
    "streamUrl": "https://okru.example/stream3.m3u8",
    "headers": { // Optional headers for the stream
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Referer": "https://okru.example/",
    },
  },
  {
    "title": "MP4",
    "streamUrl": "https://mp4upload.example/stream4.mp4",
  },
  {
    "title": "Default",
    "streamUrl": "https://default.example/stream5.m3u8"
  }
  ]
}
  */

  const streams = [];
  const providersCount = {};
  for (let [url, provider] of Object.entries(providers)) {
    try {
      // if provider starts with "direct-", then add the url to the streams array directly
      if (provider.startsWith("direct-")) {
        const directName = provider.slice(7); // remove "direct-" prefix
        const title = (directName && directName.length > 0) ? directName : "Direct";
        streams.push({
          title: title,
          streamUrl: url
        });
        continue; // skip to the next provider
      }
      if (provider.startsWith("direct")) {
        provider = provider.slice(7); // remove "direct-" prefix
        const title = (provider && provider.length > 0) ? provider : "Direct";
        streams.push({
          title: title,
          streamUrl: url
        });
        continue; // skip to the next provider
      }

      let customName = null; // to store the custom name if provided

      // if the provider has - then split it and use the first part as the provider name
      if (provider.includes("-")) {
        const parts = provider.split("-");
        provider = parts[0]; // use the first part as the provider name
        customName = parts.slice(1).join("-"); // use the rest as the custom name
      }

      // check if providercount is not bigger than 3
      if (providersCount[provider] && providersCount[provider] >= 3) {
        console.log(`Skipping ${provider} as it has already 3 streams`);
        continue;
      }
      let result = await extractStreamUrlByProvider(url, provider);
      let streamUrl = null;
      let headers = null;

      // Check if result is an object with streamUrl and optional headers
      if (result && typeof result === "object" && !Array.isArray(result) && result.streamUrl) {
        streamUrl = result.streamUrl;
        headers = result.headers || null;
      } else if (result && Array.isArray(result)) {
        const httpStream = result.find((url) => url.startsWith("http"));
        if (httpStream) {
          streamUrl = httpStream;
        }
      } else if (result && typeof result === "string") {
        streamUrl = result;
      }

      // check if streamUrl is valid
      if (
        !streamUrl ||
        typeof streamUrl !== "string" ||
        !streamUrl.startsWith("http")
      ) {
        continue; // skip if streamUrl is not valid
      }

      // if customName is defined, use it as the name
      if (customName && customName.length > 0) {
        provider = customName;
      }

      let title;
      if (providersCount[provider]) {
        providersCount[provider]++;
        title = provider.charAt(0).toUpperCase() +
          provider.slice(1) +
          "-" +
          (providersCount[provider] - 1); // add a number to the provider name
      } else {
        providersCount[provider] = 1;
        title = provider.charAt(0).toUpperCase() + provider.slice(1);
      }

      const streamObject = {
        title: title,
        streamUrl: streamUrl
      };

      // Add headers if they exist
      if (headers && typeof headers === "object" && Object.keys(headers).length > 0) {
        streamObject.headers = headers;
      }

      streams.push(streamObject);
    } catch (error) {
      // Ignore the error and try the next provider
    }
  }
  return streams;
}

async function extractStreamUrlByProvider(url, provider) {
  if (eval(`typeof ${provider}Extractor`) !== "function") {
    // skip if the extractor is not defined
    console.log(
      `Extractor for provider ${provider} is not defined, skipping...`
    );
    return null;
  }
  let uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
  ];
  let headers = {
    "User-Agent": uas[(url.length + provider.length) % uas.length], // use a different user agent based on the url and provider
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": url,
    "Connection": "keep-alive",
    "x-Requested-With": "XMLHttpRequest",
  };

  switch (provider) {
    case "bigwarp":
      delete headers["User-Agent"];
      break;
    case "vk":
    case "sibnet":
      headers["encoding"] = "windows-1251"; // required
      break;
    case "supervideo":
    case "savefiles":
      headers = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "User-Agent": "EchoapiRuntime/1.1.0",
        "Connection": "keep-alive",
        "Cache-Control": "no-cache",
        "Host": url.match(/https?:\/\/([^\/]+)/)[1],
      };
      break;
    case "streamtape":
      headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };
      break;
  }
  // console.log("Using headers: " + JSON.stringify(headers));

  // fetch the url
  // and pass the response to the extractor function
  console.log("Fetching URL: " + url);
  const response = await soraFetch(url, {
    headers,
  });

  console.log("Response: " + response.status);
  let html = response.text ? await response.text() : response;
  // if title contains redirect, then get the redirect url
  const title = html.match(/<title>(.*?)<\/title>/);
  if (title && title[1].toLowerCase().includes("redirect")) {
    const matches = [
      /<meta http-equiv="refresh" content="0;url=(.*?)"/,
      /window\.location\.href\s*=\s*["'](.*?)["']/,
      /window\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/,
      /window\.location\s*=\s*["'](.*?)["']/,
      /window\.location\.assign\s*\(\s*["'](.*?)["']\s*\)/,
      /top\.location\s*=\s*["'](.*?)["']/,
      /top\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/,
    ];
    for (const match of matches) {
      const redirectUrl = html.match(match);
      if (redirectUrl && redirectUrl[1] && typeof redirectUrl[1] === "string" && redirectUrl[1].startsWith("http")) {
        console.log("Redirect URL found: " + redirectUrl[1]);
        url = redirectUrl[1];
        headers['Referer'] = url;
        headers['Host'] = url.match(/https?:\/\/([^\/]+)/)[1];
        html = await soraFetch(url, {
          headers,
        }).then((res) => res.text());
        break;
      }
    }
  }

  // console.log("HTML: " + html);
  switch (provider) {
    case "doodstream":
      try {
        return await doodstreamExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from doodstream:", error);
        return null;
      }
    case "earnvids":
      try {
        return await earnvidsExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from earnvids:", error);
        return null;
      }
    case "mp4upload":
      try {
        return await mp4uploadExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from mp4upload:", error);
        return null;
      }
    case "packer":
      try {
        return await packerExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from packer:", error);
        return null;
      }
    case "sendvid":
      try {
        return await sendvidExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from sendvid:", error);
        return null;
      }
    case "sibnet":
      try {
        return await sibnetExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from sibnet:", error);
        return null;
      }
    case "streamtape":
      try {
        return await streamtapeExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from streamtape:", error);
        return null;
      }
    case "uqload":
      try {
        return await uqloadExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from uqload:", error);
        return null;
      }
    case "videospk":
      try {
        return await videospkExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from videospk:", error);
        return null;
      }
    case "vidmoly":
      try {
        return await vidmolyExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from vidmoly:", error);
        return null;
      }
    case "vidoza":
      try {
        return await vidozaExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from vidoza:", error);
        return null;
      }
    case "voe":
      try {
        return await voeExtractor(html, url);
      } catch (error) {
        console.log("Error extracting stream URL from voe:", error);
        return null;
      }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

////////////////////////////////////////////////
//                 EXTRACTORS                 //
////////////////////////////////////////////////

// DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING //
/* --- doodstream --- */

/**
 * @name doodstreamExtractor
 * @author Cufiy
 */
async function doodstreamExtractor(html, url = null) {
  console.log("DoodStream extractor called");
  console.log("DoodStream extractor URL: " + url);
  const match = html.match(/\/pass_md5\/([a-fA-F0-9\-]+)\/([a-zA-Z0-9]+)/);
  if (!match) {
    console.log('Could not find hash/token in the page.');
    return;
  }
  const hash = match[1];
  const token = match[2];
  console.log('🔑 Hash:', hash, 'Token:', token);
  const hostUrl = url.match(/https?:\/\/[^\/]+/)[0];
  // 2. Request the base video URL
  const request = await soraFetch(`${hostUrl}/pass_md5/${hash}/${token}`);
  if (!request) {
    console.error('Failed to fetch the base video URL.');
    return;
  }
  const data = await request.text();

  if (!data) {
    console.error('Failed to fetch the base video URL.');
    return;
  }
  if (data.trim() === 'RELOAD') {
    console.error('Token expired or invalid. Received RELOAD response.');
    return;
  }
  let baseUrl = data.trim();
  // If the server returns a relative path, make it absolute
  if (!baseUrl.startsWith('http')) {
    baseUrl = hostUrl + baseUrl;
  }
  console.log('🎬 Base video URL:', baseUrl);
  // 3. Replicate makePlay() – random 10 chars + token + expiry
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomStr = '';
  for (let i = 0; i < 10; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const suffix = randomStr + '?token=' + token + '&expiry=' + Date.now();
  const finalUrl = baseUrl + suffix;
  console.log('Final video URL:', finalUrl);
  return finalUrl;
}
/* --- earnvids --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name earnvidsExtractor
 * @author 50/50
 */
async function earnvidsExtractor(html, url = null) {
  try {
    const obfuscatedScript = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    const unpackedScript = unpack(obfuscatedScript[1]);
    const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
    const hlsLink = streamMatch ? streamMatch[1] : null;
    const baseUrl = url.match(/^(https?:\/\/[^/]+)/)[1];
    console.log("HLS Link:" + baseUrl + hlsLink);
    return baseUrl + hlsLink;
  } catch (err) {
    console.log(err);
    return "https://files.catbox.moe/avolvc.mp4";
  }
}

/* --- mp4upload --- */

/**
 * @name mp4uploadExtractor
 * @author Cufiy
 */
async function mp4uploadExtractor(html, url = null) {
  const regex = /src:\s*"([^"]+)"/;
  const match = html.match(regex);
  if (match) {
    return match[1];
  } else {
    console.log("No match found for mp4upload extractor");
    return null;
  }
}
/* --- packer --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name packerExtractor
 * @author 50/50
 */
async function packerExtractor(data, url = null) {
  const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
  const unpackedScript = unpack(obfuscatedScript[1]);
  const m3u8Match = unpackedScript.match(/"hls2"\s*:\s*"([^"]+)"/);
  const m3u8Url = m3u8Match[1];
  return m3u8Url;
}

/* --- sendvid --- */

/**
 * @name sendvidExtractor
 * @author 50/50
 */
async function sendvidExtractor(data, url = null) {
  const match = data.match(/var\s+video_source\s*=\s*"([^"]+)"/);
  const videoUrl = match ? match[1] : null;
  return videoUrl;
}
/* --- sibnet --- */

/**
 * @name sibnetExtractor
 * @author scigward
 */
async function sibnetExtractor(html, embedUrl) {
  try {
    const videoMatch = html.match(
      /player\.src\s*\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/i
    );
    if (!videoMatch || !videoMatch[1]) {
      throw new Error("Sibnet video source not found");
    }
    const videoPath = videoMatch[1];
    const videoUrl = videoPath.startsWith("http")
      ? videoPath
      : `https://video.sibnet.ru${videoPath}`;
    return videoUrl;
  } catch (error) {
    console.log("SibNet extractor error: " + error.message);
    return null;
  }
}
/* --- streamtape --- */

/**
 * 
 * @name streamTapeExtractor
 * @author ShadeOfChaos
 */
async function streamtapeExtractor(html, url) {
  let promises = [];
  const LINK_REGEX = /link['"]{1}\).innerHTML *= *['"]{1}([\s\S]*?)["'][\s\S]*?\(["']([\s\S]*?)["']([\s\S]*?);/g;
  const CHANGES_REGEX = /([0-9]+)/g;
  if (html == null) {
    if (url == null) {
      throw new Error('Provided incorrect parameters.');
    }
    const response = await soraFetch(url);
    html = await response.text();
  }
  const matches = html.matchAll(LINK_REGEX);
  for (const match of matches) {
    let base = match?.[1];
    let params = match?.[2];
    const changeStr = match?.[3];
    if (changeStr == null || changeStr == '') continue;
    const changes = changeStr.match(CHANGES_REGEX);
    for (let n of changes) {
      params = params.substring(n);
    }
    while (base[0] == '/') {
      base = base.substring(1);
    }
    const url = 'https://' + base + params;
    promises.push(testUrl(url));
  }
  // Race for first success
  return Promise.any(promises).then((value) => {
    return value;
  }).catch((error) => {
    return null;
  });
  async function testUrl(url) {
    return new Promise(async (resolve, reject) => {
      try {
        // Timeout version prefered, but Sora does not support it currently
        // var response = await soraFetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
        var response = await soraFetch(url);
        if (response == null) throw new Error('Connection timed out.');
      } catch (e) {
        console.error('Rejected due to:', e.message);
        return reject(null);
      }
      if (response?.ok && response?.status === 200) {
        return resolve(url);
      }
      console.warn('Reject because of response:', response?.ok, response?.status);
      return reject(null);
    });
  }
}
/* --- uqload --- */

/**
 * @name uqloadExtractor
 * @author scigward
 */
async function uqloadExtractor(html, embedUrl) {
  try {
    const match = html.match(/sources:\s*\[\s*"([^"]+\.mp4)"\s*\]/);
    const videoSrc = match ? match[1] : "";
    return videoSrc;
  } catch (error) {
    console.log("uqloadExtractor error:", error.message);
    return null;
  }
}
/* --- videospk --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name videospkExtractor
 * @author 50/50
 */
async function videospkExtractor(data, url = null) {
  const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
  const unpackedScript = unpack(obfuscatedScript[1]);
  const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
  const hlsLink = streamMatch ? streamMatch[1] : null;
  return "https://videospk.xyz" + hlsLink;
}

/* --- vidmoly --- */

/**
 * @name vidmolyExtractor
 * @author Ibro
 */
async function vidmolyExtractor(html, url = null) {
  const regexSub = /<option value="([^"]+)"[^>]*>\s*SUB - Omega\s*<\/option>/;
  const regexFallback = /<option value="([^"]+)"[^>]*>\s*Omega\s*<\/option>/;
  const fallback =
    /<option value="([^"]+)"[^>]*>\s*SUB v2 - Omega\s*<\/option>/;
  let match =
    html.match(regexSub) || html.match(regexFallback) || html.match(fallback);
  if (match) {
    const decodedHtml = atob(match[1]); // Decode base64
    const iframeMatch = decodedHtml.match(/<iframe\s+src="([^"]+)"/);
    if (!iframeMatch) {
      console.log("Vidmoly extractor: No iframe match found");
      return null;
    }
    const streamUrl = iframeMatch[1].startsWith("//")
      ? "https:" + iframeMatch[1]
      : iframeMatch[1];
    let uas = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
    ];
    let headers = {
      "User-Agent": uas[(url.length) % uas.length], // use a different user agent based on the url and provider
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": url,
      "Connection": "keep-alive",
      "x-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
    };
    const response = await soraFetch(url, { headers });
    html = await response.text();
  }
  console.log("Vidmoly extractor: No match found, using fallback");
  //  regex the sources: [{file:"this_is_the_link"}]
  const sourcesRegex = /sources:\s*\[\s*\{\s*file:\s*['"](https?:\/\/[^'"]+)['"]\s*\}/;
  const sourcesMatch = html.match(sourcesRegex);
  let sourcesString = sourcesMatch
    ? sourcesMatch[1].replace(/'/g, '"')
    : null;
  return sourcesString;

}
/* --- vidoza --- */

/**
 * @name vidozaExtractor
 * @author Cufiy
 */
async function vidozaExtractor(html, url = null) {
  const regex = /<source src="([^"]+)" type='video\/mp4'>/;
  const match = html.match(regex);
  if (match) {
    return match[1];
  } else {
    console.log("No match found for vidoza extractor");
    return null;
  }
}
/* --- voe --- */

/**
 * @name voeExtractor
 * @author Cufiy
 */
function voeExtractor(html, url = null) {
  // Extract the first <script type="application/json">...</script>
  const jsonScriptMatch = html.match(
    /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!jsonScriptMatch) {
    console.log("No application/json script tag found");
    return null;
  }

  const obfuscatedJson = jsonScriptMatch[1].trim();
  let data;
  try {
    data = JSON.parse(obfuscatedJson);
  } catch (e) {
    throw new Error("Invalid JSON input.");
  }
  if (!Array.isArray(data) || typeof data[0] !== "string") {
    throw new Error("Input doesn't match expected format.");
  }
  let obfuscatedString = data[0];
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
  // console.log("Decoded JSON:", result);
  // check if direct_access_url is set, not null and starts with http
  if (result && typeof result === "object") {
    const streamUrl =
      result.direct_access_url ||
      result.source
        .map((source) => source.direct_access_url)
        .find((url) => url && url.startsWith("http"));
    if (streamUrl) {
      console.log("Voe Stream URL: " + streamUrl);
      return streamUrl;
    } else {
      console.log("No stream URL found in the decoded JSON");
    }
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
  // atob is available in browsers and Node >= 16
  if (typeof atob === "function") {
    return atob(str);
  }
  // Node.js fallback
  return Buffer.from(str, "base64").toString("utf-8");
}
function voeShiftChars(str, shift) {
  return str
    .split("")
    .map((c) => String.fromCharCode(c.charCodeAt(0) - shift))
    .join("");
}


////////////////////////////////////////////////
//                 PLUGINS                    //
////////////////////////////////////////////////

/**
 * Uses Sora's fetchv2 on ipad, fallbacks to regular fetch on Windows
 * @author ShadeOfChaos
 *
 * @param {string} url The URL to make the request to.
 * @param {object} [options] The options to use for the request.
 * @param {object} [options.headers] The headers to send with the request.
 * @param {string} [options.method='GET'] The method to use for the request.
 * @param {string} [options.body=null] The body of the request.
 *
 * @returns {Promise<Response|null>} The response from the server, or null if the
 * request failed.
 */
async function soraFetch(
  url,
  options = { headers: {}, method: "GET", body: null }
) {
  try {
    return await fetchv2(
      url,
      options.headers ?? {},
      options.method ?? "GET",
      options.body ?? null
    );
  } catch (e) {
    try {
      return await fetch(url, options);
    } catch (error) {
      await console.log("soraFetch error: " + error.message);
      return null;
    }
  }
}
/***********************************************************
 * UNPACKER MODULE
 * Credit to GitHub user "mnsrulz" for Unpacker Node library
 * https://github.com/mnsrulz/unpacker
 ***********************************************************/
class Unbaser {
  constructor(base) {
    this.ALPHABET = {
      62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
    };
    this.dictionary = {};
    this.base = base;
    if (36 < base && base < 62) {
      this.ALPHABET[base] = this.ALPHABET[base] ||
        this.ALPHABET[62].substr(0, base);
    }
    if (2 <= base && base <= 36) {
      this.unbase = (value) => parseInt(value, base);
    }
    else {
      try {
        [...this.ALPHABET[base]].forEach((cipher, index) => {
          this.dictionary[cipher] = index;
        });
      }
      catch (er) {
        throw Error("Unsupported base encoding.");
      }
      this.unbase = this._dictunbaser;
    }
  }
  _dictunbaser(value) {
    let ret = 0;
    [...value].reverse().forEach((cipher, index) => {
      ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
    });
    return ret;
  }
}

function detectUnbaser(source) {
  /* Detects whether `source` is P.A.C.K.E.R. coded. */
  return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
  let { payload, symtab, radix, count } = _filterargs(source);
  if (count != symtab.length) {
    throw Error("Malformed p.a.c.k.e.r. symtab.");
  }
  let unbase;
  try {
    unbase = new Unbaser(radix);
  }
  catch (e) {
    throw Error("Unknown p.a.c.k.e.r. encoding.");
  }
  function lookup(match) {
    const word = match;
    let word2;
    if (radix == 1) {
      word2 = symtab[parseInt(word)];
    }
    else {
      word2 = symtab[unbase.unbase(word)];
    }
    return word2 || word;
  }
  source = payload.replace(/\b\w+\b/g, lookup);
  return _replacestrings(source);
  function _filterargs(source) {
    const juicers = [
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
      /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
    ];
    for (const juicer of juicers) {
      const args = juicer.exec(source);
      if (args) {
        let a = args;
        if (a[2] == "[]") {
        }
        try {
          return {
            payload: a[1],
            symtab: a[4].split("|"),
            radix: parseInt(a[2]),
            count: parseInt(a[3]),
          };
        }
        catch (ValueError) {
          throw Error("Corrupted p.a.c.k.e.r. data.");
        }
      }
    }
    throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
  }
  function _replacestrings(source) {
    return source;
  }
}


/* {GE END} */