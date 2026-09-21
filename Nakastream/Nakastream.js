// ==========================================
// ⚙️ MODULE SORA — NAKASTREAM
// ==========================================

const BASE_URL = "https://nakastream.tv";
const API_URL = "https://nakastream.tv/api/v1";

// ==========================================
// 🗄️ TRACKER SUPABASE (Statistiques Uniquement)
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
    } catch (e) { console.log(`[Tracker] 🚨 Erreur Supabase : ${e.message}`); }
}

// ==========================================
// ⚙️ LOGIQUE DU MODULE NAKASTREAM
// ==========================================

function slugify(text) {
    return text.toString().toLowerCase()
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // Enlève les accents
        .replace(/[^a-z0-9 -]/g, "") // Garde juste les lettres et chiffres
        .replace(/\s+/g, '-') // Remplace les espaces par des tirets
        .replace(/-+/g, '-').trim();
}

// --- 1. RECHERCHE ---
async function searchResults(keyword) {
    console.log(`\n======================================`);
    console.log(`[Recherche Nakastream] 🔍 Lancement pour : "${keyword}"`);

    try {
        const cleanKeyword = keyword.trim();
        const encodedKeyword = encodeURIComponent(cleanKeyword);
        const searchUrl = `${API_URL}/browse/catalog?page=1&limit=20&sort=recent&search=${encodedKeyword}`;
        
        // 🌟 CORRECTION : Ajout des en-têtes vitaux
        let headers = { 
            "Accept": "application/json", 
            "User-Agent": "Mozilla/5.0",
            "Origin": BASE_URL,
            "Referer": `${BASE_URL}/`
        };

        const response = await soraFetch(searchUrl, { headers: headers });
        const textResponse = await response.text();
        const json = JSON.parse(textResponse);
        const results = [];

        if (json.data && Array.isArray(json.data)) {
            for (let item of json.data) {
                let imgUrl = item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : "https://via.placeholder.com/500x750/222222/FFFFFF?text=Aucune+Affiche";
                results.push({
                    title: item.title,
                    image: imgUrl,
                    href: `${BASE_URL}/${item.mediaType}/${item.id}-${slugify(item.title)}`
                });
            }
        }

        sendSupabaseLog("NakaStream", "SEARCH", { 
            keyword: keyword, results_count: results.length, top_results: results.slice(0, 3).map(r => r.title)
        });

        return JSON.stringify(results);

    } catch (error) { 
        console.log('[Nakastream] 🚨 Erreur Recherche : ' + error.message);
        sendSupabaseLog("NakaStream", "ERROR", { keyword: keyword, error_message: String(error) });
        return JSON.stringify([]); 
    }
}

// --- 2. DÉTAILS ---
async function extractDetails(url) {
    if (url === `${BASE_URL}/`) return JSON.stringify([{ description: "Action effectuée avec succès !", aliases: "Système", airdate: "N/A" }]);

    sendSupabaseLog("NakaStream", "DETAILS", { media_url: url });

    try {
        const match = url.match(/\/(tv|movie)\/([a-z0-9-]+)/i);
        if (!match) throw new Error("Format d'URL invalide");
        
        const id = match[2].split('-')[0];
        const detailsUrl = `${API_URL}/browse/catalog?page=1&limit=1&search=&id=${id}`;

        // 🌟 CORRECTION : On simule qu'on est sur la page du film
        let headers = { 
            "Accept": "application/json",
            "Origin": BASE_URL,
            "Referer": url
        };

        const response = await soraFetch(detailsUrl, { headers: headers });
        const json = await response.json();
        
        if (json.data && json.data.length > 0) {
            const item = json.data.find(d => String(d.id) === id) || json.data[0];
            const description = item.overview || "Aucune description disponible.";
            const rating = item.voteAverage ? `${item.voteAverage}/10` : "N/A";
            const year = item.releaseDate ? item.releaseDate.substring(0, 4) : "Inconnue";

            return JSON.stringify([{ description: description, aliases: `Note : ${rating}`, airdate: year }]);
        }
        throw new Error("Aucune donnée trouvée");
    } catch (error) {
        sendSupabaseLog("NakaStream", "ERROR", { media_url: url, error_message: String(error) });
        return JSON.stringify([{ description: 'Erreur de chargement. Vérifiez vos paramètres ou la source.', aliases: '', airdate: '' }]);
    }
}

// --- 3. ÉPISODES ---
async function extractEpisodes(url) {
    if (url === `${BASE_URL}/`) return JSON.stringify([]);

    try {
        const match = url.match(/\/(tv|movie)\/([a-z0-9-]+)/i);
        if (!match) throw new Error("Format d'URL invalide");
        
        const type = match[1];
        const fullId = match[2]; 
        const showId = fullId.split('-')[0]; 
        let episodesList = [];

        if (type === "movie") {
            episodesList.push({ href: `${fullId}/movie/1/1`, number: 1, season: 1, title: "Film Complet" });
            return JSON.stringify(episodesList);
        }

        // 🌟 CORRECTION : En-têtes furtifs
        let headers = { 
            "Accept": "application/json",
            "Origin": BASE_URL,
            "Referer": url
        };

        const detailsUrl = `${API_URL}/browse/catalog?page=1&limit=1&id=${showId}`;
        const detailsRes = await soraFetch(detailsUrl, { headers: headers });
        const detailsJson = await detailsRes.json();
        
        if (detailsJson.data && detailsJson.data.length > 0) {
            const item = detailsJson.data.find(d => String(d.id) === showId) || detailsJson.data[0];
            const maxSeasons = item.numberOfSeasons || 1;

            for (let s = 1; s <= maxSeasons; s++) {
                try {
                    const seasonUrl = `${API_URL}/browse/${showId}/season/${s}`;
                    const sRes = await soraFetch(seasonUrl, { headers: headers });
                    const sJson = await sRes.json();

                    if (sJson.episodes && Array.isArray(sJson.episodes)) {
                        for (let ep of sJson.episodes) {
                            episodesList.push({
                                href: `${fullId}/tv/${s}/${ep.episode_number}`,
                                number: ep.episode_number,
                                season: s,
                                title: ep.name || `Épisode ${ep.episode_number}`
                            });
                        }
                    }
                } catch (e) { }
            }
        }
        return JSON.stringify(episodesList);
    } catch (error) { 
        sendSupabaseLog("NakaStream", "ERROR", { media_url: url, error_message: String(error) });
        return JSON.stringify([]); 
    }
}

// --- 4. LECTEUR ---
async function extractStreamUrl(url) {
    if (url === `${BASE_URL}/`) return JSON.stringify({ type: "none" });

    let finalMediaUrl = url; 

    try {
        const startTime = Date.now();
        const parts = url.split('/');
        
        const fullId = parts[0]; // "543-interstellar"
        const showId = fullId.split('-')[0]; // "543"
        
        let mediaTitle = showId;
        if (fullId.includes('-')) {
            let cleanStr = fullId.substring(fullId.indexOf('-') + 1).replace(/-/g, ' ');
            mediaTitle = cleanStr.charAt(0).toUpperCase() + cleanStr.slice(1);
        }

        const type = parts[1]; // "movie" ou "tv"
        const seasonNum = parts[2];
        const episodeNum = parts[3];

        let apiUrl = `${API_URL}/streaming/sources/${showId}?type=${type}`;
        if (type === "tv") apiUrl += `&season=${seasonNum}&episode=${episodeNum}`;

        // 🌟 CORRECTION MAJEURE : On fabrique le Referer PARFAIT
        const perfectReferer = `${BASE_URL}/${type}/${fullId}`;
        
        let headers = { 
            "Accept": "application/json",
            "Origin": BASE_URL,
            "Referer": perfectReferer
        };

        const response = await soraFetch(apiUrl, { headers: headers });
        let json = {};
        let failedLinks = [];
        
        try { 
            json = await response.json(); 
            
            if (json.tmdbId) {
                finalMediaUrl = `${BASE_URL}/content/${type}/${json.tmdbId}`;
            }

        } catch(e) { 
            failedLinks.push({ server_name: "API Nakastream (Crash)", url: apiUrl }); 
        }

        let streams = [];
        let extractedNames = [];
        let subtitleUrl = ""; 
        
        const sources = json.sources || [];

        for (let i = 0; i < sources.length; i++) {
            let source = sources[i];
            if (!source.url) continue;

            let finalUrl = source.url.startsWith('/') ? BASE_URL + source.url : source.url;
            let serverName = source.type === "encoded" ? "Serveur Nakastream (Encode)" : "Serveur Alternatif";
            if (source.maxQuality) serverName += ` [${source.maxQuality}]`;

            streams.push({
                title: serverName,
                streamUrl: finalUrl,
                headers: { "Referer": BASE_URL + "/", "User-Agent": "Mozilla/5.0" }
            });
            extractedNames.push(serverName);

            if (subtitleUrl === "" && source.subtitles && Array.isArray(source.subtitles)) {
                for (let sub of source.subtitles) {
                    if (sub.url) {
                        let subUrl = sub.url.startsWith('/') ? BASE_URL + sub.url : sub.url;
                        let lang = (sub.lang || sub.label || "").toLowerCase();
                        
                        if (subtitleUrl === "" || lang.includes("fr") || lang.includes("fre")) {
                            subtitleUrl = subUrl;
                        }
                    }
                }
            }
        }

        if (streams.length === 0 && failedLinks.length === 0) failedLinks.push({ server_name: "API Nakastream (Vide/Indisponible)", url: apiUrl });

        sendSupabaseLog("NakaStream", "PLAYER", { 
            media_title: mediaTitle,
            media_url: finalMediaUrl,
            season_number: seasonNum, 
            ep_number: episodeNum, 
            streams_found: streams.length, 
            subtitles_found: subtitleUrl !== "",
            execution_time_ms: Date.now() - startTime,
            servers: streams.map(s => ({ nom: s.title, lien: s.streamUrl }))
        });
        
        if (failedLinks.length > 0) {
            sendSupabaseLog("NakaStream", "UNSUPPORTED_HOSTS", { 
                media_title: mediaTitle,
                media_url: finalMediaUrl,
                season_number: seasonNum, 
                ep_number: episodeNum, 
                failed_count: failedLinks.length, 
                failed_links: failedLinks 
            });
        }

        return JSON.stringify({ streams: streams, subtitles: subtitleUrl });

    } catch (error) { 
        sendSupabaseLog("NakaStream", "ERROR", { media_url: finalMediaUrl, error_message: String(error) });
        return JSON.stringify({ streams: [], subtitles: "" }); 
    }
}

// --- FONCTION UTILITAIRE SORA ---
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        if (typeof fetchv2 !== 'undefined') return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null, true, options.encoding ?? 'utf-8');
        else return await fetch(url, options);
    } catch(e) {
        try { return await fetch(url, options); } catch(error) { return null; }
    }
}