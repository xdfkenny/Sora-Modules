/** Sora Module Template
 * This template is designed to help you create a module for Sora.
 * It includes functions for searching, extracting details, episodes, and stream URLs.
 * You can modify these functions to suit your needs.
 * 
 * For more information, visit the Sora documentation at https://sora.jm26.net/docs
 */


/** searchResults
 * Searches for anime/shows/movies based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */

let animeDetails = {};
let selectedEpisodes = [];
const langType = 'dub'; // 'dub', 'sub', 'engsub'
async function searchResults(keyword) {
    try {
        const cookiesObj = await getAllCookies();

        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
            'Cookie': cookiesObj["Cookie"],
            'x-xsrf-token': cookiesObj["x-xsrf-token"]
        };

        const options = {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query: keyword }),
        };

        const resp = await soraFetch(`https://anime-base.net/api/search`, options);
        // soraFetch may return a Response object or a plain string depending on environment; normalize to text
        if (!resp) throw new Error('No response from soraFetch');
        const responseText = typeof resp === 'string' ? resp : await resp.text();

        // if starts with <!DOCTYPE html>
        if (responseText.startsWith('<!DOCTYPE html>')) {
            sendLog('HTML response detected');
            // Handle HTML response (e.g., parse error page)
            return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
        }

        // sendLog('Response Text:', responseText);
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            sendLog('JSON parse error: ' + e);
            return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
        }


        let animes = data.series;

        // remove any items which category is not 'anime'
        animes = animes.filter(anime => anime.category === 'anime');


        // If you need to filter by dub availability, uncomment the next line
        // const filteredAnimes = animes.filter(anime => anime.episodes && anime.episodes.dub !== null);

     const transformedResults = animes.map(anime => ({
            title: anime.name,
            image: 'https://anime-base.net' + anime.image,
            href: `https://anime-base.net/${anime.category}/${anime.nameSlug}`
        }));
        // sendLog('Results: ' + JSON.stringify(transformedResults));
        sendLog('Got ' + transformedResults.length + ' results for keyword: ' + keyword);
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        sendLog('Fetch error: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}



/** extractDetails
 * Extracts details of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime details.
 */
async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const pageContent = await response.text();
        
        // inside <body class="font-sans antialiased bg-[#1A1A1A]"><div data-server-rendered="true" id="app" data-page="HERE_IS_JSON_DATA">
        const jsonMatch = pageContent.match(/<div data-server-rendered="true" id="app" data-page="([^"]+)">/);
        if (!jsonMatch) {
            sendLog('No JSON data found in page');
            return JSON.stringify([{
                description: 'Error loading description',
                aliases: 'Duration: Unknown',
                airdate: 'Aired: Unknown'
            }]);
        }

        let pageData;
        try {
            pageData = JSON.parse(jsonMatch[1].replace(/&quot;/g, '"'));
        } catch (e) {
            sendLog('JSON parse error: ' + e);
            return JSON.stringify([{
                description: 'Error loading description',
                aliases: 'Duration: Unknown',
                airdate: 'Aired: Unknown'
            }]);
        }

        // sendLog('Page Data:', pageData);

        animeDetails = pageData.props?.serie || {};
        // sendLog('Anime Data:', animeDetails);

        let description = animeDetails.description || 'No description available';
        // remove &lt; 
        description = description.replace(/&lt;/g, '').replace(/&gt;/g, '');
        // remove Quelle: and anything after it (without regex)
        description = description.split('Quelle:')[0].trim();
        // remove \r\n
        description = description.replace(/\r\n/g, ' ').trim();

        let transformedResults = [{
            description: description,
            aliases: animeDetails?.originalName,
            airdate: `Aired: ${animeDetails?.year || 'Unknown'}`
        }];

        sendLog('Details Results: ' + JSON.stringify(transformedResults));

        // add animeDetails to the first item of transformedResults
        transformedResults[0] = {
            ...transformedResults[0],
            animeDetails: animeDetails
        };
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        sendLog('Details error: ' + error);
        return JSON.stringify([{
        description: 'Error loading description',
        aliases: 'Duration: Unknown',
        airdate: 'Aired: Unknown'
        }]);
  }
}

/** extractEpisodes
 * Extracts episodes of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime episodes.
 */
async function extractEpisodes(url) {
    try {

      if(!animeDetails || !animeDetails.episodes) {
        sendLog('Anime details or episodes not loaded, fetching details first...');
        animeDetails = await extractDetails(url);
        animeDetails = JSON.parse(animeDetails)[0].animeDetails;
      }
        
        let episodes = animeDetails.episodes || [];
        /* 
        "episodes": [
                {
          "id": 1876857,
          "serieId": 117,
          "season": "2",
          "name": "Dismay of I, the Chicken",
          "type": 0,
          "filler": 0,
          "dubsub": 0,
          "link1": "https://lulustream.com/d/5coon2cukmxq",
          "link2": "",
          "link3": "https://voe.sx/ccmhvfalora7",
          "link4": "https://listeamed.net/v/MAlwEMR3YMlOJ39",
          "link5": "",
          "link6": "",
          "link7": "https://strmup.to/TIPKCsJSF4pXz",
          "link8": "https://d-s.io/d/lgw63clo905w",
          "createdAt": "2025-09-06T19:47:48.000+00:00",
          "updatedAt": "2025-09-06T19:47:48.000+00:00",
          "episode": 23
        },
        ...
    ]
        */

    // group episodes by season
    // note, season is a string, so we need to convert it to number for sorting
    episodes.sort((a, b) => {
        const seasonA = parseInt(a.season) || 0;
        const seasonB = parseInt(b.season) || 0;
        return seasonA - seasonB;
    });

    // sort episodes within each season
    episodes.sort((a, b) => {
        const seasonA = parseInt(a.season) || 0;
        const seasonB = parseInt(b.season) || 0;
        if (seasonA !== seasonB) {
            return seasonA - seasonB;
        }
        return (a.episode || 0) - (b.episode || 0);
    });



    // group by dub/sub/eng sub (dubsub: 0 = sub, 1 = dub, 2 = eng sub)
    const groupedEpisodes = {
        sub: [],
        dub: [],
        engSub: []
    };

    episodes.forEach(episode => {
        if (episode.dubsub === 1 && episode.type === 0) {
            groupedEpisodes.dub.push(episode);
        } else if (episode.dubsub === 0 && episode.type === 0) {
            groupedEpisodes.sub.push(episode);
        } else if (episode.dubsub === 2 && episode.type === 0) {
            groupedEpisodes.engSub.push(episode);
        }
    });

    // get episodes with type 1 (OVA/Movie) and add them to the end of each group
    episodes.forEach(episode => {
        if (episode.type === 1) {
            if (episode.dubsub === 1) {
                groupedEpisodes.sub.push(episode);
            } else if (episode.dubsub === 0) {
                groupedEpisodes.dub.push(episode);
            } else if (episode.dubsub === 2) {
                groupedEpisodes.engSub.push(episode);
            }
        }
    });

    // sendLog('Grouped Episodes:', groupedEpisodes);

    if (langType === 'dub' && groupedEpisodes.dub.length > 0) {
        selectedEpisodes = groupedEpisodes.dub;
    } else if (langType === 'sub' && groupedEpisodes.sub.length > 0) {
        selectedEpisodes = groupedEpisodes.sub;
    } else if (langType === 'engsub' && groupedEpisodes.engSub.length > 0) {
        selectedEpisodes = groupedEpisodes.engSub;
    }

        // use running number for episode numbering, instead of season and episode
    // selectedEpisodes = selectedEpisodes.map((episode, index) => ({
    //     ...episode,
    //     number: index + 1
    // }));

    // if no episodes found for the selected langType, try others
    if (selectedEpisodes.length === 0) {
        if (groupedEpisodes.dub.length > 0) {
            selectedEpisodes = groupedEpisodes.dub;
        } else if (groupedEpisodes.sub.length > 0) {
            selectedEpisodes = groupedEpisodes.sub;
        } else if (groupedEpisodes.engSub.length > 0) {
            selectedEpisodes = groupedEpisodes.engSub;
        }
    }

    sendLog('Selected Episodes: ' + JSON.stringify(selectedEpisodes));

        let transformedResults = selectedEpisodes.map(episode => ({
            href: url + "###" + episode.id,
            number: episode.episode
        }));
        // add selected Episodes to the first item of transformedResults inside 'data' key
        transformedResults[0] = {
            ...transformedResults[0],
            data: selectedEpisodes
        };
        sendLog('Transformed Episodes: ' + JSON.stringify(transformedResults));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        sendLog('Fetch error: ' + error);
    }    
}

/** extractStreamUrl
 * Extracts the stream URL of an anime episode from its page URL.
 * @param {string} url - The URL of the anime episode page.
 * @returns {Promise<string|null>} - The stream URL or null if not found.
 */
async function extractStreamUrl(input) {
    try {
      // split the input by ###
      const parts = input.split("###");
      const url = parts[0];
      const episodeId = parseInt(parts[1]);
        if (isNaN(episodeId)) {
            sendLog('Invalid episode ID: ' + url);
            return null;
        }
        sendLog('Extracting stream URL for episode ID: ' + episodeId);

        if (!selectedEpisodes || selectedEpisodes.length === 0) {
            sendLog('No selected episodes available, fetching episodes first...');
            selectedEpisodes = await extractEpisodes(url);
            selectedEpisodes = JSON.parse(selectedEpisodes);
            // get the data key from the first item            
            if (selectedEpisodes && selectedEpisodes.length > 0) {
                selectedEpisodes = selectedEpisodes[0].data || [];
            }
        }

        const episode = selectedEpisodes.find(ep => ep.id === episodeId);
        if (!episode) {
            sendLog('Episode not found for ID: ' + episodeId);
            return null;
        }

        sendLog('Episode Links: ' + JSON.stringify(episode));
        let providerNames = ["lulustream", "", "voe", "vidguard", "filemoon", "", "streamup", "doodstream"];

        const links = {};
        // providerNames index of a provider corresponds to link1, link2, ...
        for (let i = 1; i <= 8; i++) {
            const linkKey = 'link' + i;
            if (episode[linkKey]) {
                links[episode[linkKey]] = providerNames[i - 1] || `Provider${i}`;
            }
        }

        sendLog('Extracting links with multiExtractor: ' + JSON.stringify(links));

        let streams = [];
        try {
            streams = await multiExtractor(links);
            let returnedStreams = {
                streams: streams,
            }

            sendLog("Multi extractor streams: " + JSON.stringify(returnedStreams));
            return JSON.stringify(returnedStreams);
        } catch (error) {
            sendLog("Multi extractor error:" + error);
            return JSON.stringify([{ provider: "Error2", link: "" }]);
        }

    } catch (error) {
       sendLog('Fetch error: ' + error);
       return null;
    }
}


/** Fetch function that tries to use a custom fetch implementation first,
 * and falls back to the native fetch if it fails.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - The options for the fetch request.
 * @returns {Promise<Response|null>} - The response object or null if an error occurs.
 * @note This function is designed to provide Node.js compatibility
 */
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            await sendLog('soraFetch error: ' + error.message);
            return null;
        }
    }
}


async function getAllCookies() {
    try {
    const site = await soraFetch("https://anime-base.net/");

    // helper to read header values in plain JS environments where Headers.get may not exist
    function headerValue(headers, name) {
      if (!headers) return null;
      const target = String(name).toLowerCase();

      sendLog('Trying method 0 to get header (node-fetch)');
      // 0) Node-Fetch: headers.get() -> single value
      try {
        if (typeof headers.get === 'function') {
          const value = headers.get(target);
          if (value) return value;
        }
      } catch (e) { /* ignore */ }

      sendLog('Trying method 1 to get header');
      // 1) Node/Fetch: headers.raw() -> object with arrays
      try {
        if (typeof headers.raw === 'function') {
          const raw = headers.raw();
          if (raw && raw[target]) return raw[target];
        }
      } catch (e) { /* ignore */ }

      sendLog('Trying method 2 to get header');
      // 2) Plain object (IncomingMessage.headers or simple map)
      if (typeof headers === 'object' && !Array.isArray(headers)) {
        for (const k in headers) {
          if (Object.prototype.hasOwnProperty.call(headers, k) && String(k).toLowerCase() === target) {
            return headers[k];
          }
        }
      }

      sendLog('Trying method 3 to get header');
      // 3) Iterable of pairs (e.g., [ [name, value], ... ])
      try {
        if (typeof headers[Symbol.iterator] === 'function') {
          for (const pair of headers) {
            if (!pair) continue;
            // array pair
            if (Array.isArray(pair) && pair.length >= 2) {
              if (String(pair[0]).toLowerCase() === target) return pair[1];
            }
            // object pair like { name, value }
            if (pair.name && pair.value && String(pair.name).toLowerCase() === target) return pair.value;
          }
        }
      } catch (e) { /* ignore */ }

      sendLog('Trying method 4 to get header');
      // 4) Fallback: try property access (some libs expose lowercase keys)
      try {
        if (headers[target]) return headers[target];
      } catch (e) {}

      return null;
    }

    // Use helper to get set-cookie header(s)
    const setCookieRaw = headerValue(site && site.headers ? site.headers : null, 'set-cookie') || '';

    // Normalize to array of cookie strings
    let cookieArray = [];
    if (Array.isArray(setCookieRaw)) {
      cookieArray = setCookieRaw.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof setCookieRaw === 'string' && setCookieRaw.length > 0) {
      // Split on commas that precede a new cookie name (safe-split)
      cookieArray = String(setCookieRaw).split(/,(?=\s*[A-Za-z0-9_\-]+=)/).map(s => s.trim()).filter(Boolean);
    }

    // Keep only the base name=value (before any attributes)
    const baseCookies = cookieArray.map(c => c.split(';')[0].trim()).filter(Boolean);

    // Filter: keep XSRF-TOKEN or cookies with very long values (original logic)
    const filtered = baseCookies.filter(cookie => {
      if (cookie.startsWith('XSRF-TOKEN=')) return true;
      const parts = cookie.split('=');
      const val = parts[1] || '';
      return val.length > 100;
    });

    return {
      Cookie: filtered.join('; '),
      "x-xsrf-token": decodeURIComponent((filtered.find(c => c.startsWith('XSRF-TOKEN=')) || '').split('=')[1] || '')
    };
    } catch (error) {
        console.error('Error fetching cookies: ' + error);
        return [];
    }
}

async function sendLog(message, msg = null) {
    // send http://192.168.2.130/sora-module/log.php?action=add
    console.log(message, msg ? msg : "");

    return;
    const postMsg = message + (msg ? ' | ' + msg : '');
    await soraFetch('http://192.168.2.130/sora-module/log.php?action=add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: postMsg })

    }).catch(error => {
        console.error('Error sending log: ' + error);
    });
}


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
    if(html == null) {
        if(url == null) {
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
        if(changeStr == null || changeStr == '') continue;
        const changes = changeStr.match(CHANGES_REGEX);
        for(let n of changes) {
            params = params.substring(n);
        }
        while(base[0] == '/') {
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
                if(response == null) throw new Error('Connection timed out.');
            } catch(e) {
                console.error('Rejected due to:', e.message);
                return reject(null);
            }
            if(response?.ok && response?.status === 200) {
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

async function test(query='Frieren') {
// sendLog(getAllCookies());
const searchResultsData = await searchResults(query);
sendLog(searchResultsData);
sendLog('--- Href: ' + JSON.parse(searchResultsData)[0].href);

const detailsData = await extractDetails(JSON.parse(searchResultsData)[0].href);
// sendLog(detailsData);
sendLog('---');

const episodesData = await extractEpisodes(JSON.parse(searchResultsData)[0].href);
// sendLog(episodesData);
sendLog('---');

const streamUrlData = await extractStreamUrl(JSON.parse(episodesData)[2].href);
sendLog(streamUrlData);

}

// if is node environment, run test
if (typeof module !== 'undefined' && typeof require !== 'undefined' && require.main === module) {
    (async () => {
        await test("Evangelion");
    })();
}