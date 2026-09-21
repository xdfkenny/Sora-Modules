// ==========================================
// ⚙️ MODULE SORA — DESSINANIME (Extracteurs Stricts + Mixdrop Fix)
// ==========================================

const BASE_URL = "https://dessinanime.cc";

// ==========================================
// 🗄️ TRACKER SUPABASE
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
    } catch (e) { console.log(`[Tracker] 🚨 Erreur : ${e.message}`); }
}

// ==========================================
// ⚙️ 1. RECHERCHE
// ==========================================
async function searchResults(keyword) {
    try {
        const searchUrl = `${BASE_URL}/api/search?q=${encodeURIComponent(keyword.trim())}`;
        
        const response = await soraFetch(searchUrl);
        const data = await response.json();
        
        let results = [];

        if (Array.isArray(data)) {
            for (let item of data) {
                let type = item.mediaType === "MOVIE" ? "movie" : "tv";
                let imageUrl = item.posterPath && item.posterPath.startsWith('http') 
                    ? item.posterPath 
                    : `https://image.tmdb.org/t/p/w500${item.posterPath}`;

                results.push({
                    title: item.title || item.slug,
                    image: imageUrl,
                    href: `${BASE_URL}/${type}/${item.slug}`
                });
            }
        }

        sendSupabaseLog("DessinAnime", "SEARCH", { 
            keyword: keyword, results_count: results.length, top_results: results.slice(0, 3).map(r => r.title)
        });

        return JSON.stringify(results);

    } catch (error) { 
        console.log(`[DessinAnime] 🚨 Erreur Recherche : ${error}`);
        sendSupabaseLog("DessinAnime", "ERROR", { keyword: keyword, error_message: String(error) });
        return JSON.stringify([]); 
    }
}

// ==========================================
// ⚙️ 2. DÉTAILS
// ==========================================
async function extractDetails(url) {
    sendSupabaseLog("DessinAnime", "DETAILS", { media_url: url });
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        
        let description = "Aucune description disponible.";
        let year = "Inconnue";

        const descMatch = html.match(/name="description","content":"([^"]+)"/i) || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
        if (descMatch) description = descMatch[1].replace(/\\"/g, '"');

        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
            const yearMatch = titleMatch[1].match(/\((\d{4})\)/);
            if (yearMatch) year = yearMatch[1];
        }

        return JSON.stringify([{ description: description, aliases: "", airdate: year }]);
    } catch (error) {
        return JSON.stringify([{ description: 'Erreur de chargement.', aliases: '', airdate: '' }]);
    }
}

// ==========================================
// ⚙️ 3. ÉPISODES
// ==========================================
async function extractEpisodes(url) {
    try {
        if (url.includes('/movie/')) {
            return JSON.stringify([{ href: url, number: 1, season: 1, title: "Film Complet" }]);
        }

        const response = await soraFetch(url);
        let html = await response.text();
        let episodes = [];

        const pathMatch = url.match(/\/tv\/([^/]+)/);
        if (!pathMatch) return JSON.stringify([]);
        const slug = pathMatch[1];

        let cleanHtml = html.replace(/\\"/g, '"').replace(/\\\//g, '/');

        let maxSeason = 1;
        const seasonRegex = new RegExp(`/tv/${slug}/(\\d+)/1`, "gi");
        let match;
        while ((match = seasonRegex.exec(cleanHtml)) !== null) {
            let s = parseInt(match[1]);
            if (s > maxSeason) maxSeason = s;
        }

        let epSet = new Set();
        function extractFromHtml(htmlContent) {
            let clean = htmlContent.replace(/\\"/g, '"').replace(/\\\//g, '/');
            const epRegex = new RegExp(`/tv/${slug}/(\\d+)/(\\d+)`, "gi");
            let m;
            while ((m = epRegex.exec(clean)) !== null) {
                epSet.add(`${m[1]}/${m[2]}`);
            }
        }

        if (maxSeason >= 1) {
            let fetchPromises = [];
            for (let s = 1; s <= maxSeason; s++) {
                let seasonUrl = `${BASE_URL}/tv/${slug}/${s}/1`;
                fetchPromises.push(soraFetch(seasonUrl).then(res => res.text()).catch(() => ""));
            }
            const htmlPages = await Promise.all(fetchPromises);
            for (let pageHtml of htmlPages) extractFromHtml(pageHtml);
        }

        for (let ep of epSet) {
            let [s, e] = ep.split('/');
            episodes.push({
                href: `${BASE_URL}/tv/${slug}/${s}/${e}`,
                number: parseInt(e),
                season: parseInt(s),
                title: `Épisode ${e}`
            });
        }

        episodes.sort((a, b) => a.season !== b.season ? a.season - b.season : a.number - b.number);
        return JSON.stringify(episodes);

    } catch (error) {
        return JSON.stringify([]);
    }
}

// ==========================================
// ⚙️ 4. LECTEUR & UNPACKER
// ==========================================
async function extractStreamUrl(url) {
    try {
        console.log(`\n[DessinAnime] 🎬 Démarrage de l'extraction lecteur pour : ${url}`);
        const startTime = Date.now();
        
        const response = await soraFetch(url);
        const html = await response.text();

        // ⚠️ dessinanime.cc protège les pages /tv/ par un Cloudflare managed challenge.
        // Le cf_clearance résolu en WebView (Shirox) est lié à l'empreinte TLS et n'est
        // PAS accepté rejoué via URLSession/fetchv2 -> on reçoit encore le challenge.
        // Tant que ce n'est pas le cas, l'extraction des lecteurs ne peut pas aboutir.
        if (html.includes('Just a moment') || html.includes('challenge-platform')) {
            console.log(`[DessinAnime] 🛑 Bloqué par le challenge Cloudflare (cf_clearance non rejouable hors WebView).`);
            return JSON.stringify({ type: "none" });
        }

        let streams = [];
        let failedLinks = [];
        let extractedPlayers = [];

        let cleanHtml = html.replace(/\\"/g, '"').replace(/\\\//g, '/');
        
        let idx = cleanHtml.indexOf('"players":[');
        
        if (idx !== -1) {
            let start = idx + '"players":'.length; 
            let bracketCount = 0;
            let end = -1;
            let inString = false;
            let escapeNext = false;
            
            for (let i = start; i < cleanHtml.length; i++) {
                let char = cleanHtml[i];
                if (escapeNext) { escapeNext = false; continue; }
                if (char === '\\') { escapeNext = true; continue; }
                if (char === '"') { inString = !inString; continue; }
                
                if (!inString) {
                    if (char === '[') bracketCount++;
                    else if (char === ']') bracketCount--;

                    if (bracketCount === 0) {
                        end = i + 1;
                        break;
                    }
                }
            }
            
            if (end !== -1) {
                try {
                    let playersStr = cleanHtml.substring(start, end);
                    let playersData = JSON.parse(playersStr);
                    console.log(`[DessinAnime] 🎯 Tableau "players" extrait avec succès ! (${playersData.length} objets)`);
                    
                    for (let p of playersData) {
                        if (p.embedId && p.host && p.host.iframeTemplate) {
                            let embedUrl = p.host.iframeTemplate.replace('{{slug}}', p.embedId);
                            let hostName = p.host.name ? p.host.name.toUpperCase() : "SERVEUR";
                            
                            let langName = p.language && p.language.name ? p.language.name : "";
                            if (langName && langName !== "MULTI") {
                                hostName += ` [${langName}]`;
                            }
                            
                            extractedPlayers.push({ url: embedUrl, hostName: hostName });
                        }
                    }
                } catch(e) {
                    console.log(`[DessinAnime] ⚠️ Erreur de parsage du tableau JSON players: ${e.message}`);
                }
            }
        }

        if (extractedPlayers.length === 0) {
            const fallbackRegex = /"embedUrl"\s*:\s*"([^"]+)"/gi;
            let match;
            while ((match = fallbackRegex.exec(cleanHtml)) !== null) {
                if (match[1].startsWith('http')) {
                    extractedPlayers.push({ url: match[1], hostName: "SERVEUR" });
                }
            }
        }
        
        console.log(`[DessinAnime] 🧩 ${extractedPlayers.length} liens de lecteur(s) prêts à être déchiffrés.`);

        for (let player of extractedPlayers) {
            try {
                let embedUrl = player.url;
                let hostName = player.hostName;

                let directUrl = await getDirectLink(embedUrl, hostName);

                if (directUrl) {
                    let streamReferer = BASE_URL + "/";
                    try {
                        if (directUrl !== embedUrl) streamReferer = new URL(embedUrl).origin + "/"; 
                    } catch(e) {}

                    if (!streams.find(s => s.streamUrl === directUrl)) {
                        streams.push({
                            title: `DessinAnime (${hostName})`,
                            streamUrl: directUrl,
                            headers: { 
                                "Referer": streamReferer,
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
                            }
                        });
                        console.log(`[DessinAnime] ➕ Serveur validé et ajouté : ${hostName}`);
                    }
                } else {
                    console.log(`[DessinAnime] ❌ Serveur ignoré (Impossible d'extraire le fichier direct) : ${hostName}`);
                    failedLinks.push({ server_name: hostName, url: embedUrl });
                }
            } catch(e) {
                console.log(`[DessinAnime] ❌ Erreur sur un bloc lecteur : ${e.message}`);
            }
        }

        if (streams.length === 0) {
            console.log(`[DessinAnime] ⚠️ Aucun lecteur direct n'a pu être extrait. Fin.`);
        } else {
            console.log(`[DessinAnime] 🎯 Fin de l'extraction : ${streams.length} flux direct(s) prêt(s).`);
        }

        let isMovie = url.includes('/movie/');
        let mediaTitle = "Inconnu";
        let seasonNumber = "N/A";
        let epNumber = isMovie ? "movie" : "1";

        const urlParts = url.split('/');
        if (urlParts.length >= 5) {
            let slug = urlParts[4];
            mediaTitle = slug.includes('-') ? slug.substring(slug.indexOf('-') + 1).replace(/-/g, ' ') : slug;
            mediaTitle = mediaTitle.replace(/\b\w/g, c => c.toUpperCase());
            if (!isMovie && urlParts.length >= 7) {
                seasonNumber = urlParts[5];
                epNumber = urlParts[6];
            }
        }

        sendSupabaseLog("DessinAnime", "PLAYER", { 
            media_title: mediaTitle, media_url: url, season_number: seasonNumber, ep_number: epNumber,
            streams_found: streams.length, execution_time_ms: Date.now() - startTime,
            servers: streams.map(s => ({ nom: s.title, lien: s.streamUrl }))
        });

        if (failedLinks.length > 0) {
            sendSupabaseLog("DessinAnime", "UNSUPPORTED_HOSTS", {
                media_title: mediaTitle, media_url: url, season_number: seasonNumber, ep_number: epNumber,
                failed_count: failedLinks.length, failed_links: failedLinks
            });
        }

        if (streams.length > 0) {
            return JSON.stringify({ type: "servers", streams: streams, subtitles: "" });
        } else {
            return JSON.stringify({ type: "none" });
        }

    } catch (error) {
        console.log(`[DessinAnime] 🚨 Erreur critique : ${error}`);
        sendSupabaseLog("DessinAnime", "ERROR", { media_url: url, error_message: String(error) });
        return JSON.stringify({ type: "none" });
    }
}

// ==========================================
// 🛡️ UNPACKER UNIVERSEL STRIQUE (Force les Liens Vidéo)
// ==========================================
async function getDirectLink(embedUrl, hostName) {
    try {
        const hostUpper = hostName.toUpperCase();
        console.log(`[Unpacker] 🔍 Analyse de l'hôte : ${hostUpper} | URL : ${embedUrl}`);

        if (hostUpper.includes("HYDRAX") || embedUrl.includes("short.icu") || embedUrl.includes("abysscdn")) {
            console.log(`[Unpacker] ❌ Hydrax ignoré (Format Iframe non supporté par Sora TV).`);
            return null; 
        }

        if (hostUpper.includes("PLAYER4ME")) {
            try {
                let videoId = embedUrl.split('#')[1] || embedUrl.split('id=')[1];
                let apiUrl = `https://dessinanime.4meplayer.com/api/v1/video?id=${videoId}&w=1920&h=1080&r=`;
                
                const req = await soraFetch(apiUrl, { headers: { "Referer": BASE_URL + "/" } });
                const encryptedText = await req.text(); 
                
                if (encryptedText) {
                    let streamUrl = await player4meExtractor(encryptedText);
                    if (streamUrl) return streamUrl;
                }
            } catch(e) { console.log(`[Unpacker] ❌ Échec Player4me : ${e.message}`); }
            return null; 
        }

        if (hostUpper.includes("MIXDROP")) {
            try {
                const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL + "/" } });
                const html = await req.text();
                let streamUrl = mixdropExtractor(html); 
                if (streamUrl) return streamUrl;
            } catch(e) {}
            return null;
        }

        if (hostUpper.includes("VIDHIDE") || hostUpper.includes("STREAMHIDE") || hostUpper.includes("LULUVDO")) {
            try {
                const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL + "/" } });
                const html = await req.text();

                if (html.includes('/vidhide/') || html.includes('eval(function(p,a,c,k,e,d)')) {
                    if (typeof vidhideExtractor === "function") {
                        let streamUrl = vidhideExtractor(html); 
                        if (streamUrl) return streamUrl;
                    }
                }
            } catch(e) {}
            return null;
        }

        if (hostUpper.includes("UQLOAD")) {
           try {
                const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL + "/" } });
                const html = await req.text();

                if (html.includes('/vidhide/') || html.includes('eval(function(p,a,c,k,e,d)')) {
                    if (typeof vidhideExtractor === "function") {
                        let streamUrl = vidhideExtractor(html); 
                        if (streamUrl) return streamUrl;
                    }
                }
            } catch(e) {}
            return null;
        }

        if (hostUpper.includes("VOE")) {
            try {
                const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL + "/" } });
                const html = await req.text();
                const match = html.match(/'hls':\s*'([^']+)'/i) || html.match(/"hls":\s*"([^"]+)"/i);
                if (match && match[1]) return match[1];
            } catch(e) {}
            return null;
        }

        try {
            const req = await soraFetch(embedUrl, { headers: { "Referer": BASE_URL + "/" } });
            const html = await req.text();
            const genericMatch = html.match(/(https:\/\/[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*)/i);
            if (genericMatch && genericMatch[1] && !genericMatch[1].includes('blank.mp4')) {
                return genericMatch[1];
            }
        } catch(e) {}

        console.log(`[Unpacker] ❌ Lien direct introuvable. Serveur ignoré.`);
        return null; 
    } catch (e) {
        return null;
    }
}

// ==========================================
// 🛡️ OUTILS DE DÉCHIFFREMENT JAVASCRIPT
// ==========================================
// ==========================================
// 🔓 PLAYER4ME / EMBED4ME — AES-128-CBC 100% LOCAL (porté de movix, plus de localhost)
// L'API /api/v1/video?id=... renvoie un blob hex chiffré (même famille qu'embedseek).
//   key = "kiemtienmua911ca" / iv = "1234567890oiuytr"
// ==========================================
const _P4M_KEY = "kiemtienmua911ca";
const _P4M_IV  = "1234567890oiuytr";

// --- AES-128 pur JS (déchiffrement CBC) ---
const _AES = (function () {
    const sbox = [], invSbox = [], rcon = [0x01];
    (function init() {
        const p = new Uint8Array(256), q = new Uint8Array(256);
        let x = 1, xi = 1;
        for (let i = 0; i < 256; i++) {
            p[i] = x;
            x ^= (x << 1) ^ ((x & 0x80) ? 0x11b : 0);
            xi ^= xi << 1; xi ^= xi << 2; xi ^= xi << 4;
            if (xi & 0x80) xi ^= 0x09;
            q[x & 0xff === 0 ? 0 : x] = 0; // placeholder, real inverse below
        }
        // table de log/antilog correcte
        const log = new Uint8Array(256), alog = new Uint8Array(256);
        let a = 1;
        for (let i = 0; i < 255; i++) {
            alog[i] = a; log[a] = i;
            a ^= (a << 1) ^ ((a & 0x80) ? 0x11b : 0); a &= 0xff;
        }
        const inv = (g) => g === 0 ? 0 : alog[(255 - log[g]) % 255];
        for (let i = 0; i < 256; i++) {
            let s = inv(i), xf = s;
            for (let k = 0; k < 4; k++) { xf = ((xf << 1) | (xf >> 7)) & 0xff; s ^= xf; }
            s ^= 0x63;
            sbox[i] = s; invSbox[s] = i;
        }
        for (let i = 1; i < 10; i++) {
            rcon[i] = (rcon[i - 1] << 1) ^ ((rcon[i - 1] & 0x80) ? 0x11b : 0);
            rcon[i] &= 0xff;
        }
    })();

    function expandKey(key) { // key: 16 bytes
        const w = new Array(44);
        for (let i = 0; i < 4; i++)
            w[i] = [key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]];
        for (let i = 4; i < 44; i++) {
            let t = w[i - 1].slice();
            if (i % 4 === 0) {
                t = [t[1], t[2], t[3], t[0]].map(b => sbox[b]);
                t[0] ^= rcon[i / 4 - 1];
            }
            w[i] = w[i - 4].map((b, j) => b ^ t[j]);
        }
        return w;
    }

    function xtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x11b : 0)) & 0xff; }
    function mul(a, b) {
        let r = 0;
        for (let i = 0; i < 8; i++) {
            if (b & 1) r ^= a;
            const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b;
            b >>= 1;
        }
        return r & 0xff;
    }

    function decryptBlock(inp, w) {
        let s = [[], [], [], []];
        for (let i = 0; i < 16; i++) s[i % 4][(i / 4) | 0] = inp[i];

        const addRound = (rnd) => {
            for (let c = 0; c < 4; c++)
                for (let r = 0; r < 4; r++)
                    s[r][c] ^= w[rnd * 4 + c][r];
        };
        const invSub = () => {
            for (let r = 0; r < 4; r++)
                for (let c = 0; c < 4; c++) s[r][c] = invSbox[s[r][c]];
        };
        const invShift = () => {
            for (let r = 1; r < 4; r++) {
                const row = s[r].slice();
                for (let c = 0; c < 4; c++) s[r][c] = row[(c - r + 4) % 4];
            }
        };
        const invMix = () => {
            for (let c = 0; c < 4; c++) {
                const a0 = s[0][c], a1 = s[1][c], a2 = s[2][c], a3 = s[3][c];
                s[0][c] = mul(a0,14)^mul(a1,11)^mul(a2,13)^mul(a3,9);
                s[1][c] = mul(a0,9)^mul(a1,14)^mul(a2,11)^mul(a3,13);
                s[2][c] = mul(a0,13)^mul(a1,9)^mul(a2,14)^mul(a3,11);
                s[3][c] = mul(a0,11)^mul(a1,13)^mul(a2,9)^mul(a3,14);
            }
        };

        addRound(10);
        for (let rnd = 9; rnd >= 1; rnd--) {
            invShift(); invSub(); addRound(rnd); invMix();
        }
        invShift(); invSub(); addRound(0);

        const out = new Uint8Array(16);
        for (let i = 0; i < 16; i++) out[i] = s[i % 4][(i / 4) | 0];
        return out;
    }

    function cbcDecrypt(cipher, key, iv) {
        const w = expandKey(key);
        const out = new Uint8Array(cipher.length);
        let prev = iv;
        for (let off = 0; off < cipher.length; off += 16) {
            const block = cipher.subarray(off, off + 16);
            const dec = decryptBlock(block, w);
            for (let i = 0; i < 16; i++) out[off + i] = dec[i] ^ prev[i];
            prev = block;
        }
        // retire le padding PKCS#7
        const pad = out[out.length - 1];
        return (pad > 0 && pad <= 16) ? out.subarray(0, out.length - pad) : out;
    }

    return { cbcDecrypt };
})();

function _hexToBytes(hex) {
    hex = hex.trim();
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}
function _strToBytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
}

function player4meDecrypt(hexBlob) {
    const cipher = _hexToBytes(String(hexBlob).trim().replace(/[^0-9a-fA-F]/g, ''));
    const plain = _AES.cbcDecrypt(cipher, _strToBytes(_P4M_KEY), _strToBytes(_P4M_IV));
    let txt = "";
    for (let i = 0; i < plain.length; i++) txt += String.fromCharCode(plain[i]);
    try { txt = decodeURIComponent(escape(txt)); } catch (e) {}
    return JSON.parse(txt);
}

async function player4meExtractor(encryptedHex) {
    try {
        const data = player4meDecrypt(encryptedHex);
        // Structure embedseek-like : { source: master.m3u8, hlsVideoTiktok, ... }
        // + variantes possibles { sources:[{file/src}] } / { file }
        let url = data.source
               || (data.sources && data.sources[0] && (data.sources[0].file || data.sources[0].src))
               || data.file
               || (data.hlsVideoTiktok ? `https://dessinanime.4meplayer.com${data.hlsVideoTiktok}` : null);
        if (url) { console.log(`[Player4me] ✅ Déchiffré en local -> ${url.slice(0, 70)}`); return url; }
        console.log(`[Player4me] ❌ Déchiffrement OK mais aucune source`);
        return null;
    } catch (e) {
        console.log(`[Player4me] ❌ Déchiffrement local échoué : ${e.message}`);
        return null;
    }
}

function mixdropExtractor(html) {
    try {
        let packRegex = /eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/g;
        let packMatches = html.match(packRegex);
        
        let foundUrl = null;

        if (packMatches) {
            for (let packed of packMatches) {
                let argsMatch = packed.match(/}\s*\(\s*(['"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\5\.split\('\|'\)/);
                if (argsMatch) {
                    let p = argsMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
                    let a = parseInt(argsMatch[3], 10);
                    let c = parseInt(argsMatch[4], 10);
                    let k = argsMatch[6].split('|');

                    let e = function(c) {
                        return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
                    };

                    while (c--) {
                        if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
                    }

                    // 🌟 NOUVEAU REGEX : Recherche aussi "vfile"
                    let wurlMatch = p.match(/wurl\s*=\s*["']([^"']+)["']/i) || 
                                    p.match(/MDCore\.wurl\s*=\s*["']([^"']+)["']/i) ||
                                    p.match(/vfile\s*=\s*["']([^"']+)["']/i) ||
                                    p.match(/MDCore\.vfile\s*=\s*["']([^"']+)["']/i) ||
                                    p.match(/MDCore\.vfile\s*=\s*([a-zA-Z0-9_]+)/i);

                    if (wurlMatch) {
                        let videoUrl = wurlMatch[1];
                        
                        // Si le résultat est le nom d'une autre variable (cas rare d'obfuscation double)
                        if (!videoUrl.includes('.') && !videoUrl.includes('/')) {
                             let realValueMatch = p.match(new RegExp(`var\\s+${videoUrl}\\s*=\s*["']([^"']+)["']`, 'i'));
                             if (realValueMatch) videoUrl = realValueMatch[1];
                        }
                        
                        foundUrl = videoUrl.startsWith('http') ? videoUrl : `https:${videoUrl}`;
                        break;
                    }
                }
            }
        }
        
        if (!foundUrl) console.log(`[Unpacker] ❌ Mixdrop: Le décodeur a réussi, mais la variable vidéo (vfile/wurl) est introuvable.`);
        else console.log(`[Unpacker] ✅ Mixdrop déchiffré avec succès !`);
        
        return foundUrl;
    } catch (e) {
        console.log(`[Unpacker] ❌ Erreur Mixdrop : ${e.message}`);
        return null;
    }
}

function vidhideExtractor(html) {
    try {
        let videoUrl = null;
        let directMatch = html.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
        if (directMatch) {
            videoUrl = directMatch[1];
        } 
        else if (html.includes('eval(function(p,a,c,k,e,d)')) {
            let packRegex = /eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/g;
            let packMatches = html.match(packRegex);
            
            if (packMatches) {
                for (let packed of packMatches) {
                    let argsMatch = packed.match(/}\s*\(\s*(['"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])(.*?)\5\.split\('\|'\)/);
                    if (argsMatch) {
                        let p = argsMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
                        let a = parseInt(argsMatch[3], 10);
                        let c = parseInt(argsMatch[4], 10);
                        let k = argsMatch[6].split('|');
                        
                        let e = function(c) {
                            return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
                        };
                        
                        while (c--) {
                            if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
                        }
                        
                        let unpackedMatch = p.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
                        if (unpackedMatch) {
                            videoUrl = unpackedMatch[1];
                            break;
                        }
                    }
                }
            }
        }

        if (videoUrl) return videoUrl.replace(/\\\//g, "/").trim();
        return null;
    } catch (e) {
        return null;
    }
}

// ==========================================
// 🔧 FONCTION UTILITAIRE SORA
// ==========================================
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        if (typeof fetchv2 !== 'undefined') return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null, true, options.encoding ?? 'utf-8');
        else return await fetch(url, options);
    } catch(e) {
        try { return await fetch(url, options); } catch(error) { return null; }
    }
}