// ==========================================
// ⚙️ MODULE SORA — PURSTREAM (Supabase Edition)
// ==========================================

// ==========================================
// 🗄️ TRACKER SUPABASE (Base de données)
// ==========================================

const SUPABASE_URL = "https://qyeisgowjisqbatrmqta.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F68CBjFVPh71U0SdD9BQJg_UJgL9-Fj";

async function sendSupabaseLog(moduleName, actionType, dataPayload) {
    try {
        const payload = {
            module: moduleName,
            action: actionType,
            data: dataPayload
        };

        const headers = { 
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "Prefer": "return=minimal" 
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
// ⚙️ LOGIQUE DU MODULE PURSTREAM
// ==========================================

let WORKING_DOMAIN = null;

async function getWorkingDomain() {
    if (WORKING_DOMAIN) return WORKING_DOMAIN; 

    // 🌟 1. PLAN A : Utilisation de l'API Serveur de Purstream (Super Rapide)
    try {
        console.log("[Purstream] Vérification de l'API de statut (purstream.wiki/api/server-status)...");
        const response = await soraFetch("https://purstream.wiki/api/server-status");
        const json = await response.json();
        
        if (json && json.servers && Array.isArray(json.servers)) {
            // On cherche le serveur principal
            const mainServer = json.servers.find(s => s.id === "main");
            
            if (mainServer && mainServer.url) {
                // Nettoyage de "https://purstream.ac/" pour ne garder que "purstream.ac"
                let cleanDomain = mainServer.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
                WORKING_DOMAIN = cleanDomain;
                console.log(`[Purstream] Domaine officiel trouvé via API : ${WORKING_DOMAIN}`);
                return WORKING_DOMAIN;
            }
        }
        throw new Error("Serveur principal introuvable dans le JSON.");
        
    } catch (err) {
        console.log(`[Purstream] Échec de l'API de statut, tentative de secours via HTML... (${err.message})`);
        
        // 🚨 2. PLAN B : Lecture HTML (En cas de panne de l'API JSON)
        try {
            const response = await soraFetch("https://purstream.wiki/");
            const html = await response.text();
            const match = html.match(/https:\/\/(purstream\.[a-z]+)/);
            
            if (match && match[1]) {
                WORKING_DOMAIN = match[1]; 
                console.log(`[Purstream] Domaine officiel trouvé via HTML : ${WORKING_DOMAIN}`);
                return WORKING_DOMAIN;
            } else {
                throw new Error("Impossible de trouver le domaine sur le wiki (HTML).");
            }
        } catch (err2) {
            console.log(`[Purstream] Échec total. Utilisation du domaine de secours. Erreur: ${err2.message}`);
            WORKING_DOMAIN = "purstream.ac"; // On met le dernier nom de domaine connu par défaut
            return WORKING_DOMAIN;
        }
    }
}

// --- 1. RECHERCHE ---
async function searchResults(keyword) {
    try {
        const domain = await getWorkingDomain();
        const cleanKeyword = keyword.trim().toLowerCase();
        let apiUrl = "";
        let isCatalog = false;

        // --- GESTION DES COMMANDES COMBINÉES ---
        if (cleanKeyword.includes("!")) {
            isCatalog = true;

            let typeParam = "*";
            if (cleanKeyword.includes("!anime")) typeParam = "anime";
            else if (cleanKeyword.includes("!movie") || cleanKeyword.includes("!film")) typeParam = "movie";
            else if (cleanKeyword.includes("!serie") || cleanKeyword.includes("!tv")) typeParam = "tv";

            let sortParam = "recently-added";
            if (cleanKeyword.includes("!trend") || cleanKeyword.includes("!populaire")) sortParam = "most-viewed";
            else if (cleanKeyword.includes("!top")) sortParam = "best-rated";
            else if (cleanKeyword.includes("!new")) sortParam = "newest";

            apiUrl = `https://api.${domain}/api/v1/catalog/movies?page=1&sortBy=${sortParam}&types=${typeParam}&categoriesIds=*&franchisesIds=*&displayMode=large&perPage=50`;
        } 
        else {
            // --- RECHERCHE NORMALE ---
            const encodedKeyword = encodeURIComponent(keyword);
            apiUrl = `https://api.${domain}/api/v1/search-bar/search/${encodedKeyword}`;
        }

        const responseText = await soraFetch(apiUrl);
        const data = await responseText.json();

        function findArrayInObject(obj) {
            if (Array.isArray(obj)) return obj;
            if (obj && typeof obj === 'object') {
                for (let key in obj) {
                    if (Array.isArray(obj[key])) return obj[key];
                    let found = findArrayInObject(obj[key]);
                    if (found) return found;
                }
            }
            return null;
        }

        let items = [];

        if (isCatalog) {
            items = findArrayInObject(data) || [];
        } else {
            items = data?.data?.items?.movies?.items || [];
        }

        if (!Array.isArray(items) || items.length === 0) {
             return JSON.stringify([]);
        }

        // --- TRANSFORMATION DES RÉSULTATS ---
        const transformedResults = items.map(result => {
            let imgUrl = result.large_poster_path || result.small_poster_path || result.wallpaper_poster_path || result.poster_path || "https://via.placeholder.com/300x450/222222/FFFFFF?text=Aucune+Affiche";
            let title = result.title || result.name || "Titre inconnu";
            let hrefType = (result.type === "movie") ? "movie" : "serie";

            if (!result.type && isCatalog) {
                if (cleanKeyword.includes("!anime") || cleanKeyword.includes("!serie") || cleanKeyword.includes("!tv")) hrefType = "serie";
                if (cleanKeyword.includes("!movie") || cleanKeyword.includes("!film")) hrefType = "movie";
            }

            return {
                title: title,
                image: imgUrl,
                href: `https://${domain}/${hrefType}/${result.id}-${slugify(title)}`
            };
        }).filter(Boolean);

        // 📡 Log Supabase (Recherche)
        sendSupabaseLog("Purstream", "SEARCH", { 
            keyword: keyword, 
            results_count: transformedResults.length,
            top_results: transformedResults.slice(0, 3).map(r => r.title)
        });

        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        // 🌟 Tracker d'erreur ajouté
        sendSupabaseLog("Purstream", "ERROR", { keyword: keyword, error_message: String(error) });
        return JSON.stringify([]);
    }
}

function slugify(title) {
    return title
      .toLowerCase()
      .normalize("NFKD")                 
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")      
      .trim()
      .replace(/\s+/g, "-")              
      .replace(/-+/g, "-");              
}

// --- 2. DÉTAILS ---
async function extractDetails(url) {
    console.log(`[Détails] 📖 Chargement des infos pour : ${url}`);
    
    // 📡 Log Supabase (Détails)
    sendSupabaseLog("Purstream", "DETAILS", { media_url: url });

    try {
        const domain = await getWorkingDomain();
        let apiUrl = "";

        if(url.includes('movie')) {
            const match = url.match(/\/movie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            apiUrl = `https://api.${domain}/api/v1/media/${match[1]}/sheet`;
        } else if(url.includes('serie')) {
            const match = url.match(/\/serie\/(\d+)/);
            if (!match) throw new Error("Invalid URL format");
            apiUrl = `https://api.${domain}/api/v1/media/${match[1]}/sheet`;
        } else {
            throw new Error("Invalid URL format");
        }

        const responseText = await soraFetch(apiUrl, {
            headers: {
                "Referer": `https://${domain}/`,
                "Origin": `https://${domain}`
            }
        });
        const json = await responseText.json();
        const data = json.data.items;

        const duration = url.includes('movie') && data.runtime?.minutes 
            ? `${data.runtime.minutes} minutes` 
            : 'N/A';

        const transformedResults = [{
            description: data.overview || 'No description available',
            aliases: `Duration: ${duration}`,
            airdate: `Released: ${data.releaseDate ? data.releaseDate : 'N/A'}`
        }];

        return JSON.stringify(transformedResults);

    } catch (error) {
        console.log('Details error: ' + error);
        // 🌟 Tracker d'erreur ajouté
        sendSupabaseLog("Purstream", "ERROR", { media_url: url, error_message: String(error) });
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired/Released: Unknown'
        }]);
    }
}

// --- 3. ÉPISODES ---
async function extractEpisodes(url) {
    try {
        const domain = await getWorkingDomain();

        // 🌟 Nouveau Regex qui capture l'ID ET le nom complet (ex: 3914-alice-in-borderland)
        const match = url.match(/\/(movie|serie)\/([a-z0-9-]+)/i);
        if (!match) throw new Error("Invalid URL format");
        
        const type = match[1];
        const fullId = match[2]; // "3914-alice-in-borderland"
        const showId = fullId.split('-')[0]; // "3914" (pour interroger l'API)

        // 1. SI C'EST UN FILM
        if(type === 'movie') {
            const responseText = await soraFetch(`https://api.${domain}/api/v1/media/${showId}/sheet`, {
                headers: { "Referer": `https://${domain}/`, "Origin": `https://${domain}` }
            });
            const json = await responseText.json();
            const data = json.data.items;

            return JSON.stringify([
                { 
                    href: `${fullId}/movie`, // 🌟 On fait passer le nom complet au lecteur !
                    number: 1, season: 1, 
                    title: data.title || data.name || "Film complet", 
                    image: data.posters ? (data.posters.large || data.posters.small) : "", 
                    duration: data.runtime ? data.runtime.human : ""
                }
            ]);
            
        // 2. SI C'EST UNE SÉRIE / UN ANIME
        } else if(type === 'serie') {
            const responseText = await soraFetch(`https://api.${domain}/api/v1/media/${showId}/sheet`, {
                headers: { "Referer": `https://${domain}/`, "Origin": `https://${domain}` }
            });
            const json = await responseText.json();
            const data = json.data.items;
            let allEpisodes = [];

            for (let i = 1; i <= data.seasons; i++) {
                try {
                    const seasonResponseText = await soraFetch(`https://api.${domain}/api/v1/media/${showId}/season/${i}`, {
                        headers: { "Referer": `https://${domain}/`, "Origin": `https://${domain}` }
                    });
                    const seasonJson = await seasonResponseText.json();
                    
                    if (seasonJson && seasonJson.data && seasonJson.data.items) {
                        const seasonData = seasonJson.data.items;
                        for (const episode of seasonData.episodes) {
                            allEpisodes.push({
                                href: `${fullId}/${i}/${episode.episode}`, // 🌟 On fait passer le nom complet !
                                number: parseFloat(episode.episode) || 0,
                                season: i,
                                title: episode.name || `Épisode ${episode.episode}`,
                                image: episode.poster || "",
                                duration: episode.runtime ? episode.runtime.human : ""
                            });
                        }
                    }
                } catch (e) { }
            }

            allEpisodes.sort((a, b) => {
                if (a.season !== b.season) return a.season - b.season;
                return a.number - b.number;
            });

            return JSON.stringify(allEpisodes);
        }
    } catch (error) {
        sendSupabaseLog("Purstream", "ERROR", { media_url: url, error_message: String(error) });
        return JSON.stringify([]);
    }   
}

// --- 4. LECTEUR (Tracker Pro + Sous-titres VTT) ---
async function extractStreamUrl(url) {
    let finalMediaUrl = url; // Par sécurité

    try {
        const startTime = Date.now();
        const domain = await getWorkingDomain();
        let streams = [];
        let extractedNames = [];
        let failedLinks = [];
        let subtitleUrl = "";

        // url ressemble à "3914-alice-in-borderland/1/1" ou "3914-film/movie"
        const parts = url.split('/');
        const fullId = parts[0]; 
        const showId = fullId.split('-')[0]; // "3914"

        // 🌟 On extrait le vrai titre (Alice In Borderland)
        let mediaTitle = showId;
        if (fullId.includes('-')) {
            let cleanStr = fullId.substring(fullId.indexOf('-') + 1).replace(/-/g, ' ');
            mediaTitle = cleanStr.replace(/\b\w/g, c => c.toUpperCase()); 
        }

        let seasonNumber = "";
        let episodeNumber = "";
        let typePath = "serie";

        if (parts[1] === 'movie') {
            episodeNumber = "movie";
            typePath = "movie";
        } else {
            seasonNumber = parts[1];
            episodeNumber = parts[2];
        }

        finalMediaUrl = `https://${domain}/${typePath}/${fullId}`;

        let apiUrl = episodeNumber === "movie" 
            ? `https://api.${domain}/api/v1/stream/${showId}`
            : `https://api.${domain}/api/v1/stream/${showId}/episode?season=${seasonNumber}&episode=${episodeNumber}`;

        const response = await soraFetch(apiUrl, {
            headers: { "Referer": `https://${domain}/`, "Origin": `https://${domain}` }
        });
        
        let json = {};
        try { json = await response.json(); } catch(e) {
            failedLinks.push({ server_name: "API Purstream (Crash)", url: apiUrl, reason: "Response JSON Parse failed" });
        }

        const sources = json?.data?.items?.sources || [];

        for (const source of sources) {
            if (source.stream_url) {
                let serverName = source.source_name || "Purstream (Direct)";
                streams.push({
                    title: serverName,
                    streamUrl: source.stream_url,
                    headers: {
                        "Origin": `https://${domain}`,
                        "Referer": `https://${domain}/`,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                });
                extractedNames.push(serverName);

                // 🛑 --- EXTRACTION DES SOUS-TITRES (.VTT) --- 🛑
                if (subtitleUrl === "" && source.stream_url.includes('.m3u8')) {
                    try {
                        const m3u8Res = await soraFetch(source.stream_url);
                        const m3u8Text = await m3u8Res.text();

                        const baseUrl = source.stream_url.substring(0, source.stream_url.lastIndexOf('/') + 1);
                        const lines = m3u8Text.split('\n');

                        for (const line of lines) {
                            if (line.includes('TYPE=SUBTITLES')) {
                                const uriMatch = line.match(/URI="([^"]+)"/);
                                const nameMatch = line.match(/NAME="([^"]+)"/);
                                const langMatch = line.match(/LANGUAGE="([^"]+)"/i);

                                if (uriMatch) {
                                    const uri = uriMatch[1];
                                    const langName = nameMatch ? nameMatch[1] : (langMatch ? langMatch[1] : "Inconnu");
                                    const folderPath = uri.split('/')[0]; 
                                    const vttUrl = `${baseUrl}${folderPath}/subtitle.vtt`;

                                    const isFrench = langName.toLowerCase().includes("fra") || langName.toLowerCase().includes("fre");
                                    const isForced = langName.toLowerCase().includes("forced");

                                    if (subtitleUrl === "") {
                                        subtitleUrl = vttUrl; 
                                    } else if (isFrench && !isForced) {
                                        subtitleUrl = vttUrl;
                                    }
                                }
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        if (streams.length === 0 && failedLinks.length === 0) {
            failedLinks.push({ server_name: "API Purstream", url: apiUrl, reason: "Aucune vidéo trouvée pour ce média" });
        }

        // 📡 Log Supabase (Player)
        sendSupabaseLog("Purstream", "PLAYER", { 
            media_title: mediaTitle, 
            media_url: finalMediaUrl, 
            season_number: seasonNumber,
            ep_number: episodeNumber,
            streams_found: streams.length,
            subtitles_found: subtitleUrl !== "",
            execution_time_ms: Date.now() - startTime,
            servers: streams.map(s => ({ nom: s.title, lien: s.streamUrl }))
        });

        if (failedLinks.length > 0) {
            sendSupabaseLog("Purstream", "UNSUPPORTED_HOSTS", {
                media_title: mediaTitle,
                media_url: finalMediaUrl,
                season_number: seasonNumber,
                ep_number: episodeNumber,
                failed_count: failedLinks.length,
                failed_links: failedLinks
            });
        }

        return JSON.stringify({ streams, subtitles: subtitleUrl });

    } catch (error) {
        sendSupabaseLog("Purstream", "ERROR", { media_url: finalMediaUrl, error_message: String(error) });
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

// --- FONCTION UTILITAIRE SORA ---
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(
                url,
                options.headers ?? {},
                options.method ?? 'GET',
                options.body ?? null,
                true,
                options.encoding ?? 'utf-8'
            );
        } else {
            return await fetch(url, options);
        }
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}