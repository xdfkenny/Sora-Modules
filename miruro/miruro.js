// ==========================================
// ⚙️ SORA MODULE — MIRURO (Node.js/VM Sandbox)
// ==========================================

const BASE_URL = "https://www.miruro.to";
const PIPE_URL = "https://www.miruro.to/api/secure/pipe";
const MIRURO_PIPE_OBF_KEY = "71951034f8fbcf53d89db52ceb3dc22c";

// 🌟 SECURE GLOBAL DETECTION
let _global;
try { _global = globalThis; } catch(e) { 
    try { _global = window; } catch(e) { 
        try { _global = global; } catch(e) { _global = this; } 
    } 
}

const OBF_KEY_BYTES = [];
for (let i = 0; i < MIRURO_PIPE_OBF_KEY.length; i += 2) {
    OBF_KEY_BYTES.push(parseInt(MIRURO_PIPE_OBF_KEY.substr(i, 2), 16));
}

// ==========================================
// 🗄️ SUPABASE TRACKER
// ==========================================
const SUPABASE_URL = "https://qyeisgowjisqbatrmqta.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F68CBjFVPh71U0SdD9BQJg_UJgL9-Fj";

async function sendSupabaseLog(moduleName, actionType, dataPayload) {
    try {
        const payload = { module: moduleName, action: actionType, data: dataPayload };
        const headers = { 
            "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Prefer": "return=minimal" 
        };
        
        if (typeof fetchv2 !== 'undefined') {
            await fetchv2(`${SUPABASE_URL}/rest/v1/app_logs`, headers, "POST", JSON.stringify(payload));
        } else {
            await fetch(`${SUPABASE_URL}/rest/v1/app_logs`, { method: "POST", headers: headers, body: JSON.stringify(payload) });
        }
    } catch (e) {
        console.log(`[Tracker] 🚨 Erreur d'envoi vers Supabase : ${e.message}`);
    }
}

// ==========================================
// 🛠️ DECRYPTION ENGINE (Pure JS Polyfills)
// ==========================================

function pureBtoa(input) {
    let str = String(input); let output = '';
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    for (let block = 0, charCode, i = 0, map = chars;
        str.charAt(i | 0) || (map = '=', i % 1);
        output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
        charCode = str.charCodeAt(i += 3/4);
        block = block << 8 | charCode;
    }
    return output;
}

function pureAtob(input) {
    let str = String(input).replace(/=+$/, ''); 
    if (str.length % 4 == 1) return null;
    let output = '';
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    for (let bc = 0, bs = 0, buffer, i = 0;
        buffer = str.charAt(i++);
        ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) { buffer = chars.indexOf(buffer); }
    return output;
}

function base64UrlEncode(obj) {
    const jsonStr = JSON.stringify(obj);
    const utf8Str = unescape(encodeURIComponent(jsonStr));
    const b64 = pureBtoa(utf8Str);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeBytesToString(u8arr) {
    let s = ""; 
    for(let i = 0; i < u8arr.length; i++) s += String.fromCharCode(u8arr[i]);
    try { return decodeURIComponent(escape(s)); } catch(e) { return s; }
}

async function ensurePako() {
    if (_global.pako) return;
    try {
        const res = await soraFetch("https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js");
        const code = await res.text();
        const runner = new Function('window', 'global', code);
        runner(_global, _global);
    } catch (e) { 
        console.log("[Miruro] 🚨 Pako Error : " + e.message); 
    }
}

// ==========================================
// 🛡️ REACTOR CORE (Miruro Pipe)
// ==========================================

async function makeSecureRequest(path, query = {}, refererUrl = null) {
    await ensurePako();

    const payload = { path: path, method: "GET", query: query, body: null, version: "0.2.0" };
    const encodedPayload = base64UrlEncode(payload);
    
    const url = `${PIPE_URL}?e=${encodedPayload}`;
    console.log(`[Pipe] 🚀 Sending '${path}' request (GET)...`);
    console.log(`[Pipe] 🔗 Exact link generated : ${url}`);

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": BASE_URL,
        "Referer": refererUrl || `${BASE_URL}/`, 
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Sec-CH-UA": '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-GPC": "1",
        "Priority": "u=1, i"
    };

    let b64Text = "";
    let responseStatus = "Unknown";
    
    try {
        let response = await soraFetch(url, { method: 'GET', headers: headers });
        if (response) {
            responseStatus = response.status || 'Unknown';
            b64Text = typeof response.text === 'function' ? await response.text() : response.data;
            console.log(`[X-Ray] 🌐 HTTP Status : ${responseStatus} | Raw size : ${b64Text ? b64Text.length : 0} bytes`);
        }
    } catch(e) {
        console.error(`[X-Ray] ❌ Network crash : ${e.message}`);
    }

    if (!b64Text) throw new Error("No valid response obtained from servers.");

    // 🛑 CLOUDFLARE DETECTION
    if (b64Text.trim().startsWith("<") || b64Text.toLowerCase().includes("cloudflare") || b64Text.toLowerCase().includes("just a moment") || b64Text.toLowerCase().includes("upstream unreachable")) {
        console.error(`[Pipe] ❌ API Rejected (Cloudflare or Firewall).`);
        return { _blocked_by_cloudflare: true, _raw_html: b64Text.substring(0, 200) };
    }

    // 🛑 SHORT JSON ERROR DETECTION
    if (b64Text.length < 200 && b64Text.includes("error")) {
        console.error(`[Pipe] ❌ SERVER ANOMALY : => "${b64Text}"`);
        return null;
    }

    let b64 = b64Text.replace(/-/g, '+').replace(/_/g, '/');
    let pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);

    const binaryStr = pureAtob(b64);
    if (!binaryStr) {
        console.error("[Pipe Debug] Total failure of Base64 decoding.");
        return null;
    }

    const bytes = [];
    for (let i = 0; i < binaryStr.length; i++) bytes.push(binaryStr.charCodeAt(i));

    let jsonStr = "";
    let isDecompressed = false;

    // PLAN A: XOR + DECOMPRESSION
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= OBF_KEY_BYTES[i % OBF_KEY_BYTES.length];
    try {
        jsonStr = _global.pako.ungzip(bytes, { to: 'string' });
        isDecompressed = true;
    } catch (e1) {
        try { jsonStr = _global.pako.inflate(bytes, { to: 'string' }); isDecompressed = true; } catch (e2) {}
    }

    // PLAN B: DECOMPRESSION WITHOUT XOR (PURE GZIP)
    if (!isDecompressed) {
        for (let i = 0; i < bytes.length; i++) bytes[i] ^= OBF_KEY_BYTES[i % OBF_KEY_BYTES.length];
        try {
            jsonStr = _global.pako.ungzip(bytes, { to: 'string' });
            isDecompressed = true;
        } catch (e3) {
            try { jsonStr = _global.pako.inflate(bytes, { to: 'string' }); isDecompressed = true; } catch (e4) {}
        }
    }

    if (!isDecompressed) {
        jsonStr = safeBytesToString(bytes);
    }

    const safeStr = String(jsonStr || "");

    try {
        const parsedObject = JSON.parse(safeStr);
        if (!path.includes("episodes")) {
            console.log(`[X-Ray] 🟢 JSON DECRYPTED SUCCESSFULLY :`);
            console.log(parsedObject); 
        }
        return parsedObject;
    } catch (parseError) {
        console.error(`[Pipe] ❌ Final text is not valid JSON.`);
        return null;
    }
}

// ==========================================
// ⚙️ SORA MODULE LOGIC
// ==========================================

async function searchResults(keyword) {
    console.log(`[Search] 🔍 Starting for : "${keyword}"`);
    try {
        const data = await makeSecureRequest("search", {
            q: keyword, 
            limit: 30, 
            offset: 0, 
            sort: "POPULARITY_DESC", 
            type: "ANIME",
            isAdult: false 
        });

        if (!data || data._blocked_by_cloudflare) {
            sendSupabaseLog("Miruro", "ERROR", { keyword: keyword, error_message: "Blocked by Cloudflare during search" });
            return JSON.stringify([]);
        }

        const results = [];
        let items = [];

        if (data && data.results) items = data.results;
        else if (Array.isArray(data)) items = data;

        for (let item of items) {
            if (item.isAdult === true) continue;
            if (item.genres && Array.isArray(item.genres) && item.genres.includes("Hentai")) continue;

            const id = item.id;
            const title = item.title?.romaji || item.title?.english || item.title?.native || "Unknown Title";
            const image = item.coverImage?.large || item.coverImage?.medium || "https://via.placeholder.com/200x300.png?text=No+Poster";
            
            results.push({ title: title, image: image, href: `miruro://${id}` });
        }

        sendSupabaseLog("Miruro", "SEARCH", { 
            keyword: keyword, 
            results_count: results.length,
            top_results: results.slice(0, 3).map(r => r.title)
        });
        
        return JSON.stringify(results);

    } catch (error) { 
        sendSupabaseLog("Miruro", "ERROR", { keyword: keyword, error_message: String(error) });
        return JSON.stringify([]); 
    }
}

async function extractDetails(url) {
    console.log(`[Details] 📖 Loading info for : ${url}`);
    
    const id = url.replace('miruro://', '');
    const finalMediaUrl = `${BASE_URL}/watch?id=${id}`;
    
    sendSupabaseLog("Miruro", "DETAILS", { media_url: finalMediaUrl });

    try {
        const data = await makeSecureRequest(`info/anilist/${id}`);
        
        if (!data || data._blocked_by_cloudflare) return JSON.stringify([{ description: 'Network error.', aliases: '', airdate: '' }]);

        let description = "No description available.";
        let year = "Unknown"; let rating = "N/A";

        if (data) {
            if (data.description) description = data.description.replace(/<[^>]+>/g, '').trim();
            if (data.seasonYear) year = data.seasonYear;
            if (data.averageScore) rating = `${data.averageScore}/100`;
        }

        return JSON.stringify([{ description: description, aliases: `Score: ${rating}`, airdate: `Year: ${year}` }]);
    } catch (error) { 
        sendSupabaseLog("Miruro", "ERROR", { media_url: finalMediaUrl, error_message: String(error) });
        return JSON.stringify([{ description: 'Loading error.', aliases: '', airdate: '' }]); 
    }
}

async function extractEpisodes(url) {
    console.log(`[Episodes] 📂 Searching episodes for : ${url}`);
    try {
        const anilistId = url.replace('miruro://', '');
        const data = await makeSecureRequest("episodes", { anilistId: anilistId });
        
        if(!data || data._blocked_by_cloudflare) return JSON.stringify([]);

        let allEps = [];
        function searchEpisodes(obj) {
            if (Array.isArray(obj)) {
                if (obj.length > 0 && obj[0].id !== undefined && obj[0].number !== undefined) allEps = allEps.concat(obj);
                else obj.forEach(searchEpisodes);
            } else if (typeof obj === 'object' && obj !== null) Object.values(obj).forEach(searchEpisodes);
        }
        searchEpisodes(data);

        const uniqueEps = [];
        const seenNumbers = new Set();
        
        for (let ep of allEps) {
            if (!seenNumbers.has(ep.number)) {
                seenNumbers.add(ep.number);
                uniqueEps.push({
                    href: `miruro-play://${anilistId}/${ep.number}`,
                    number: ep.number, season: 1, title: ep.title || `Episode ${ep.number}`
                });
            }
        }

        uniqueEps.sort((a, b) => a.number - b.number);
        return JSON.stringify(uniqueEps);
    } catch (error) { 
        const anilistId = url.replace('miruro://', '');
        sendSupabaseLog("Miruro", "ERROR", { media_url: `${BASE_URL}/watch?id=${anilistId}`, error_message: String(error) });
        return JSON.stringify([]); 
    }
}

async function extractStreamUrl(url) {
    console.log(`[Player] 🎬 Video extraction started for : ${url}`);
    let startTime = Date.now(); 
    let finalMediaUrl = url; 
    let epNumber = 1;
    
    try {
        const parts = url.replace('miruro-play://', '').split('/');
        const anilistId = parts[0];
        epNumber = parts.length > 2 ? parts[2] : parts[1];
        
        const watchReferer = `${BASE_URL}/watch/${anilistId}/${epNumber}?ep=${epNumber}`;
        finalMediaUrl = watchReferer;

        console.log(`[Player] 🔄 Dynamic mapping of providers, IDs, and Languages...`);
        const epsData = await makeSecureRequest("episodes", { anilistId: anilistId });
        
        let dynamicConfigs = []; 
        let failedLinks = []; 
        
        if (epsData && epsData.providers) {
            for (let provKey in epsData.providers) {
                const provData = epsData.providers[provKey];
                
                if (provData && provData.episodes && typeof provData.episodes === 'object') {
                    for (let catKey in provData.episodes) {
                        const epList = provData.episodes[catKey];
                        
                        if (Array.isArray(epList)) {
                            const ep = epList.find(e => parseInt(e.number) === parseInt(epNumber));
                            
                            if (ep && ep.id) {
                                const isDub = catKey.toLowerCase().includes('dub');
                                const langLabel = isDub ? "DUB" : "SUB";
                                
                                dynamicConfigs.push({
                                    name: provKey.toLowerCase(),
                                    cat: catKey.toLowerCase(),
                                    id: ep.id,
                                    lang: langLabel
                                });
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`[Player] 🗺️ Routing generated: ${dynamicConfigs.length} streams detected!`);

        if (dynamicConfigs.length === 0) {
            console.log(`[Player] ⚠️ Mapping failed. Fallback attempt...`);
            sendSupabaseLog("Miruro", "UNSUPPORTED_HOSTS", { 
                media_url: finalMediaUrl, 
                season_number: "1", 
                ep_number: epNumber, 
                failed_count: 1, 
                failed_links: [{ server_name: "Mapping", url: "Recherche API", reason: "Aucun ID détecté" }] 
            });
            return JSON.stringify({ type: "none" });
        }
        
        let streams = []; 
        let bestSubtitle = "";
        let bestSubtitleHeaders = {};
        let allSubtitles = [];

        // 🌟 LA FAMEUSE LISTE BLANCHE DES PROVIDERS ÉTENDUE
        const providersRequiringAnilistId = [
            "dune", "zoro", "arc", "kiwi", "telli", "bee", "bun", "nun", "ally", "hop"
        ];

        for (let config of dynamicConfigs) {
            let prov = config.name;
            let cat = config.cat;
            let specificEpisodeId = config.id;
            let langLabel = config.lang;
            
            let apiTargetUrl = `API Pipe -> Provider: ${prov.toUpperCase()} (${cat.toUpperCase()})`;
            
            try {
                console.log(`-----------------------------------------------------`);
                console.log(`[Player] 📡 Request to: ${prov.toUpperCase()} (${cat.toUpperCase()}) [${langLabel}]`);
                
                let reqQuery = { 
                    episodeId: specificEpisodeId,
                    provider: prov, 
                    category: cat,
                    ttl: 86400
                };
                
                // Si le provider est dans notre liste étendue, on ajoute l'ID !
                if (providersRequiringAnilistId.includes(prov)) {
                    reqQuery.anilistId = parseInt(anilistId);
                }

                const res = await makeSecureRequest("sources", reqQuery, watchReferer);

                if (!res) {
                    console.log(`[Player] ⚠️ Provider returned null.`);
                    failedLinks.push({ server_name: prov.toUpperCase(), url: apiTargetUrl, reason: "Null response" });
                    continue;
                }

                if (res._blocked_by_cloudflare) {
                    console.log(`[Player] 🛡️ Blocked by Cloudflare (502/444).`);
                    failedLinks.push({ server_name: prov.toUpperCase(), url: apiTargetUrl, reason: "Blocked by Cloudflare" });
                    continue;
                }

                let videoArray = res.sources || res.streams || [];
                let subArray = res.subtitles || [];

                if (!Array.isArray(videoArray) || videoArray.length === 0) {
                    const possibleKeys = [cat, 'sub', 'ssub', 'dub', 'hdub', 'hsub'];
                    for (let k of possibleKeys) {
                        if (res[k]) {
                            if (Array.isArray(res[k].streams) && res[k].streams.length > 0) {
                                videoArray = res[k].streams;
                                subArray = res[k].subtitles || subArray;
                                break;
                            } else if (Array.isArray(res[k].sources) && res[k].sources.length > 0) {
                                videoArray = res[k].sources;
                                subArray = res[k].subtitles || subArray;
                                break;
                            }
                        }
                    }
                }

                if (Array.isArray(videoArray) && videoArray.length > 0) {
                    console.log(`[Player] ✅ ${videoArray.length} video qualities found!`);

                    for (let s of videoArray) {
                        if (!s.url) continue;

                        const urlLower = s.url.toLowerCase();
                        const isM3U8 = urlLower.includes('.m3u8') || s.type === 'hls';

                        if (!isM3U8) {
                            console.log(`   -> Ignored (not m3u8, type=${s.type}) : ${s.url}`);
                            continue;
                        }

                        const ref = s.referer || BASE_URL + "/";
                        const label = s.quality || 'HLS';

                        // La variante "owo" (/hls/owo.m3u8) est plus stable que "uwu" (/stream/uwu.m3u8).
                        let streamUrl = s.url;
                        if (streamUrl.includes("uwu.m3u8")) {
                            streamUrl = streamUrl.replace("/stream/", "/hls/").replace("uwu.m3u8", "owo.m3u8");
                        }

                        console.log(`   -> Link added (m3u8) : ${streamUrl}`);
                        streams.push({
                            title: `Server ${prov.toUpperCase()} (${label}) [${langLabel}]`,
                            streamUrl: streamUrl,
                            headers: { "Referer": ref }
                        });
                    }

                } else {
                    console.log(`[Player] ℹ️ No video available for this stream.`);
                    failedLinks.push({ server_name: prov.toUpperCase(), url: apiTargetUrl, reason: "Valid JSON but no video array" });
                }

                if (subArray && Array.isArray(subArray)) {
                    for (let sub of subArray) {
                        const subUrl = sub.url || sub.file || "";
                        if (!subUrl) continue;
                        const lang = (sub.language || sub.lang || sub.label || "").toLowerCase();

						allSubtitles.push({
							url: subUrl,
							label: sub.label || sub.language || sub.lang || "Unknown",
							kind: sub.kind || "captions",
							// ← Referer = domaine extrait de l'URL du sous-titre
							headers: { "Referer": (subUrl.match(/https?:\/\/[^/]+/) || [BASE_URL])[0] + "/" }
						});

                        if (lang.includes("eng") || lang.includes("english")) {
                            if (bestSubtitle === "" || !lang.includes("forced")) {
                                bestSubtitle = subUrl;
                                bestSubtitleHeaders = { "Referer": BASE_URL + "/" };
                            }
                        } else if (bestSubtitle === "") {
                            bestSubtitle = subUrl;
                            bestSubtitleHeaders = { "Referer": BASE_URL + "/" };
                        }
                    }
                }

            } catch (e) {
                console.log(`[Player] ⚠️ Error with ${prov} : ${e.message}`);
                failedLinks.push({ server_name: prov.toUpperCase(), url: apiTargetUrl, reason: e.message });
            }
        }

        console.log(`-----------------------------------------------------`);
        console.log(`[Player] 📊 Summary: ${streams.length} valid video links extracted.`);

        sendSupabaseLog("Miruro", "PLAYER", { 
            media_url: finalMediaUrl, 
            season_number: "1",
            ep_number: epNumber,
            streams_found: streams.length, 
            subtitles_found: bestSubtitle !== "", allSubtitles_count: allSubtitles.length, 
            execution_time_ms: Date.now() - startTime, 
            servers: streams.map(s => ({ nom: s.title, lien: s.streamUrl }))
        });

        if (failedLinks.length > 0) {
            sendSupabaseLog("Miruro", "UNSUPPORTED_HOSTS", { 
                media_url: finalMediaUrl, 
                season_number: "1",
                ep_number: epNumber, 
                failed_count: failedLinks.length, 
                failed_links: failedLinks 
            });
        }

        if (streams.length > 0) {
            return JSON.stringify({ type: "servers", streams: streams, subtitles: bestSubtitle, subtitlesHeaders: bestSubtitleHeaders, allSubtitles: allSubtitles });
        } else {
            return JSON.stringify({ type: "none" });
        }
    } catch (error) {
        sendSupabaseLog("Miruro", "ERROR", { media_url: finalMediaUrl, season_number: "1", error_message: String(error) });
        return JSON.stringify({ type: "none" });
    }
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
        } else {
            return await fetch(url, options);
        }
    } catch(e) {
        try { return await fetch(url, options); } catch(error) { return null; }
    }
}