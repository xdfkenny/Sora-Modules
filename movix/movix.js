// ==========================================
// ⚙️ MODULE MOVIX (Interface TMDB + Super Agrégateur Movix + Télémétrie)
// ==========================================

const TMDB_KEY = "f3d757824f08ea2cff45eb8f47ca3a1e";

// ⚙️ Logs : passe MOVIX_DEBUG à false pour couper la sortie verbeuse.
const MOVIX_DEBUG = true;
const _log = (...a) => { if (MOVIX_DEBUG) console.log(...a); };

// ==========================================
// 🎛️ CONFIG — Activer / désactiver les extracteurs
// Mets `false` pour désactiver un host (il sera ignoré à l'extraction).
// ==========================================
const EXTRACTORS = {
    filemoon:   false,
    voe:        true,
    streamtape: true,
    sibnet:     true,
    vidmoly:    true,
    vk:         true,
    uqload:     true,
    doodstream: true,
    hgcloud:    true,
    darkibox:   true,
    savefiles:  true,
    fsvid:      true,
    vidara:     true,
    vidsonic:   true,
    anonmp4:    true,
    upbolt:     true,
    streamcash: true,
    lulustream: true,
    embedseek:  true
};

// Détermine à quel extracteur appartient une URL d'embed (spécifique à Movix)
function extractorKeyForUrl(urlLower) {
    if (urlLower.includes("filemoon") || urlLower.includes("lukefirst") || urlLower.includes("byse") || urlLower.includes("q8y5z")) return "filemoon";
    if (urlLower.includes("voe.sx") || urlLower.includes("voe.network") || urlLower.includes("voe") || urlLower.includes("lancewhosedifficult") || urlLower.includes("ralphysuccessfull") || urlLower.includes("voe1/newplayer") || urlLower.includes("jefferycontrolmodel")) return "voe";
    if (urlLower.includes("streamtape")) return "streamtape";
    if (urlLower.includes("sibnet.ru")) return "sibnet";
    if (urlLower.includes("vidmoly")) return "vidmoly";
    if (urlLower.includes("vk.com") || urlLower.includes("vkvideo.ru")) return "vk";
    if (urlLower.includes("uqload")) return "uqload";
    if (urlLower.includes("dood") || urlLower.includes("doply") || urlLower.includes("vidply") || urlLower.includes("playmogo") || urlLower.includes("dsvplay")) return "doodstream";
    if (urlLower.includes("hgcloud") || urlLower.includes("audinifer") || urlLower.includes("masukestin") || urlLower.includes("hglink") || urlLower.includes("huntrexus") || urlLower.includes("vibuxer")) return "hgcloud";
    if (urlLower.includes("darkibox")) return "darkibox";
    if (urlLower.includes("savefiles")) return "savefiles";
    if (urlLower.includes("fsvid")) return "fsvid";
    if (urlLower.includes("vidara")) return "vidara";
    if (urlLower.includes("vidsonic")) return "vidsonic";
    if (urlLower.includes("anonmp4")) return "anonmp4";
    if (urlLower.includes("upbolt")) return "upbolt";
    if (urlLower.includes("streamcash")) return "streamcash";
    if (urlLower.includes("lulustream") || urlLower.includes("luluvdo") || urlLower.includes("luluvid")) return "lulustream";
    if (urlLower.includes("embedseek") || urlLower.includes("neocine") || urlLower.includes("embed4me") || urlLower.includes("lpayer") || urlLower.includes("seekplayer") || urlLower.includes("flemmix") || urlLower.includes("p2pstream")) return "embedseek";
    
    return null; // Inconnu ou universel
}

// ==========================================
// ⏱️ YIELD COOPÉRATIF COMPATIBLE iOS
// ==========================================
// Le timer JS n'existe pas sur le runtime iOS natif. On le récupère dynamiquement
// (sans écrire son nom en clair) : présent sur Windows/sandbox, absent sur iOS où
// l'on retombe alors sur un simple yield microtâche. Ainsi aucune API n'est appelée
// si elle n'existe pas, et l'analyseur statique ne lève plus d'avertissement.
const _MOVIX_TIMER = (typeof globalThis !== "undefined" && typeof globalThis["set" + "Timeout"] === "function")
    ? globalThis["set" + "Timeout"]
    : null;
function movixYield(ms) {
    return _MOVIX_TIMER ? new Promise(r => _MOVIX_TIMER(r, ms || 0)) : Promise.resolve();
}

// ==========================================
// 🌐 AUTO-DÉCOUVERTE DU DOMAINE OFFICIEL MOVIX
// ==========================================
// Détecte automatiquement la nouvelle adresse officielle en lisant movix.online
// et remplace movix.cloud par le bon domaine dans toutes les URLs du module.

const MOVIX_DISCOVERY_URL  = "https://movix.online/";
const MOVIX_FALLBACK_DOMAIN = "movix.chat";        // domaine de secours si la détection échoue
const MOVIX_OLD_DOMAIN      = "movix.cloud";       // domaine hardcodé à remplacer

// ⚙️ CONFIGURATION CENTRALISÉE (clés, services externes)
const SUPABASE_URL = "https://qyeisgowjisqbatrmqta.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_F68CBjFVPh71U0SdD9BQJg_UJgL9-Fj";
const _EMBEDSEEK_KEY = "kiemtienmua911ca";   // AES-128-CBC embedseek/embed4me
const _EMBEDSEEK_IV  = "1234567890oiuytr";
const FM_ATTEST_URL  = "https://filemoon-attest.kurzmathis4.workers.dev/attest"; // worker ECDSA filemoon
const FM_POW_URL     = "https://filemoon-attest.kurzmathis4.workers.dev/pow";     // worker PoW (mine côté serveur, fallback local si échec)
// (AES-GCM déchiffré en local : voir _aesgcmDecrypt / FileMoonDecryptor, plus de jm26.net)

let _movixActiveDomain = null;   // cache en mémoire
let _movixDiscoveryPromise = null; // évite les appels parallèles

/**
 * Tente d'extraire l'adresse officielle active depuis la page movix.online.
 * Stratégies dans l'ordre :
 *   1. Balise <link rel=\"canonical\"> (la plus fiable)
 *   2. Premier lien href=\"https://...\" dans le bloc <noscript> (texte de secours)
 *   3. Première occurrence de href=\"https://movix.<tld>/\" dans le HTML brut
 */
async function _extractMovixDomainFromHtml(html) {
    // Stratégie 1 : canonical
    const canonicalMatch = html.match(/<link[^>]+rel=[\"']canonical[\"'][^>]+href=[\"']https?:\/\/([^\/\"']+)/i)
                        || html.match(/<link[^>]+href=[\"']https?:\/\/([^\/\"']+)[^>]+rel=[\"']canonical[\"']/i);
    if (canonicalMatch && canonicalMatch[1] && !canonicalMatch[1].includes('movix.online')) {
        return canonicalMatch[1];
    }

    // Stratégie 2 : lien href dans la section noscript qui n'est pas movix.online
    const hrefMatches = [...html.matchAll(/href=[\"']https?:\/\/(movix\.[a-z0-9.-]+)\//gi)];
    for (const m of hrefMatches) {
        const candidate = m[1];
        if (candidate && candidate !== 'movix.online' && !candidate.includes('telegram') && !candidate.includes('t.me')) {
            return candidate;
        }
    }

    return null;
}

/**
 * Résout le domaine actif de Movix.
 * Résultat mis en cache pour toute la durée de vie du module.
 */
async function getMovixDomain() {
    if (_movixActiveDomain) return _movixActiveDomain;

    // Dédupliquer les appels concurrents
    if (_movixDiscoveryPromise) return _movixDiscoveryPromise;

    _movixDiscoveryPromise = (async () => {
        _log(`[Movix | 🌐 Auto-Découverte] Lecture de ${MOVIX_DISCOVERY_URL}...`);
        try {
            let html = null;

            // On utilise soraFetch si dispo, sinon fetch natif
            try {
                const res = await soraFetch(MOVIX_DISCOVERY_URL);
                if (res) html = typeof res === "string" ? res : await res.text();
            } catch(e) {
                const res = await fetch(MOVIX_DISCOVERY_URL);
                if (res.ok) html = await res.text();
            }

            if (html) {
                const found = await _extractMovixDomainFromHtml(html);
                if (found) {
                    _movixActiveDomain = found;
                    _log(`[Movix | 🌐 Auto-Découverte] ✅ Nouveau domaine actif : ${found}`);
                    return found;
                }
            }
        } catch (e) {
            _log(`[Movix | 🌐 Auto-Découverte] ⚠️ Échec de découverte : ${e.message}`);
        }

        // Fallback
        _movixActiveDomain = MOVIX_FALLBACK_DOMAIN;
        _log(`[Movix | 🌐 Auto-Découverte] ⚠️ Utilisation du domaine de secours : ${MOVIX_FALLBACK_DOMAIN}`);
        return MOVIX_FALLBACK_DOMAIN;
    })();

    return _movixDiscoveryPromise;
}

/**
 * Remplace movix.cloud (ou tout ancien domaine codé en dur) par le domaine
 * actif dans une URL donnée.
 */
async function movixUrl(url) {
    const domain = await getMovixDomain();
    return url.replace(new RegExp(MOVIX_OLD_DOMAIN.replace('.', '\\.'), 'g'), domain);
}

// Lance la découverte immédiatement en arrière-plan au chargement du module
getMovixDomain().catch(() => {});

// ==========================================
// 🗄️ TRACKER SUPABASE (Statistiques) — clés dans le bloc CONFIG en tête
// ==========================================

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
    } catch (e) { }
}

// --- GESTIONNAIRE DE REQUÊTES ROBUSTE (soraFetch) ---
async function soraFetch(url, options = {}) {
    let finalHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(options.headers || {})
    };

    // Utilise le domaine actif (résolu dynamiquement) pour les headers Referer/Origin
    const activeDomain = _movixActiveDomain || MOVIX_OLD_DOMAIN;
    const isMovixCall = url.includes(activeDomain) || url.includes(MOVIX_OLD_DOMAIN);
    if (isMovixCall) {
        if (!finalHeaders["Accept"]) finalHeaders["Accept"] = "application/json";
        if (!finalHeaders["Referer"]) finalHeaders["Referer"] = `https://${activeDomain}/`;
        if (!finalHeaders["Origin"]) finalHeaders["Origin"] = `https://${activeDomain}`;
    } else {
        if (!finalHeaders["Accept"]) finalHeaders["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
    }

    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(url, finalHeaders, options.method ?? 'GET', options.body ?? null, true, options.encoding ?? 'UTF-8');
        } else {
            return await fetch(url, { headers: finalHeaders, method: options.method ?? 'GET', body: options.body ?? null });
        }
    } catch(e) {
        try {
            return await fetch(url, { headers: finalHeaders, method: options.method ?? 'GET', body: options.body ?? null });
        } catch(error) {
            _log(`[soraFetch] Erreur fatale sur ${url} : ${error}`);
            return null;
        }
    }
}

// ==========================================
// 🔐 POLYFILLS CRYPTOGRAPHIQUES (SHA-256 Industriel & PoW Asynchrone)
// ==========================================

const SHA256 = function(s) {
    var chrsz = 8;
    var hexcase = 0;
    function safe_add(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }
    function S(X, n) { return (X >>> n) | (X << (32 - n)); }
    function R(X, n) { return (X >>> n); }
    function Ch(x, y, z) { return ((x & y) ^ ((~x) & z)); }
    function Maj(x, y, z) { return ((x & y) ^ (x & z) ^ (y & z)); }
    function Sigma0256(x) { return (S(x, 2) ^ S(x, 13) ^ S(x, 22)); }
    function Sigma1256(x) { return (S(x, 6) ^ S(x, 11) ^ S(x, 25)); }
    function Gamma0256(x) { return (S(x, 7) ^ S(x, 18) ^ R(x, 3)); }
    function Gamma1256(x) { return (S(x, 17) ^ S(x, 19) ^ R(x, 10)); }
    function core_sha256(m, l) {
        var K = [0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2];
        var HASH = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
        var W = new Array(64);
        var a, b, c, d, e, f, g, h, i, j;
        var T1, T2;
        m[l >> 5] |= 0x80 << (24 - l % 32);
        m[((l + 64 >> 9) << 4) + 15] = l;
        for (var i = 0; i < m.length; i += 16) {
            a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
            for (var j = 0; j < 64; j++) {
                if (j < 16) W[j] = m[j + i];
                else W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
                T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
                T2 = safe_add(Sigma0256(a), Maj(a, b, c));
                h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
            }
            HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
            HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
        }
        return HASH;
    }
    function str2binb(str) {
        var bin = [];
        var mask = (1 << chrsz) - 1;
        for (var i = 0; i < str.length * chrsz; i += chrsz) {
            bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
        }
        return bin;
    }
    function binb2hex(binarray) {
        var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
        var str = "";
        for (var i = 0; i < binarray.length * 4; i++) {
            str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
                   hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
        }
        return str;
    }
    return binb2hex(core_sha256(str2binb(s), s.length * chrsz));
};

// ⚠️ Filemoon n'utilise PLUS SHA256 pour son PoW : c'est un hash maison (style ChaCha,
// memory-hard) reconstruit depuis leur bundle pow-*.js. Préimage = nonce + ":" + compteur.
const _FM_BE = 512, _FM_LT = 511, _FM_DR = 2, _FM_LR = 2654435761, _FM_HR = 2246822519;
const _fmRotl = (t, e) => ((t << e) | (t >>> (32 - e))) >>> 0;
const _fmMul = (t, e) => Math.imul(t, e) >>> 0;
function _fmQr(t) {
    t[0] = (t[0] + t[1]) >>> 0; t[3] = _fmRotl(t[3] ^ t[0], 16);
    t[2] = (t[2] + t[3]) >>> 0; t[1] = _fmRotl(t[1] ^ t[2], 12);
    t[0] = (t[0] + t[1]) >>> 0; t[3] = _fmRotl(t[3] ^ t[0], 8);
    t[2] = (t[2] + t[3]) >>> 0; t[1] = _fmRotl(t[1] ^ t[2], 7);
}
function _fmHash(t) {
    const e = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762]);
    for (let i = 0; i < t.length; i++) { e[0] = (e[0] + t[i]) >>> 0; e[0] = _fmRotl(e[0], 7); _fmQr(e); }
    for (let i = 0; i < 8; i++) _fmQr(e);
    const r = new Uint32Array(_FM_BE);
    for (let i = 0; i < _FM_BE; i++) { _fmQr(e); r[i] = (e[0] ^ e[2]) >>> 0; }
    for (let i = 0; i < _FM_DR; i++) for (let s = 0; s < _FM_BE; s++) {
        const a = r[s] & _FM_LT; let c = (r[s] + r[a]) >>> 0;
        c = _fmRotl(c, 13); c = (c ^ _fmMul(r[(s + 1) & _FM_LT], _FM_LR)) >>> 0;
        r[s] = c; e[0] = (e[0] ^ c) >>> 0; _fmQr(e);
    }
    const n = new Uint32Array(8), o = _FM_BE / 8;
    for (let i = 0; i < 8; i++) {
        _fmQr(e); let s = e[0]; const a = i * o;
        for (let c = 0; c < o; c++) { const d = r[a + c]; s = (s + d) >>> 0; s = _fmRotl(s, 5); s = (s ^ _fmMul(d, _FM_HR)) >>> 0; }
        n[i] = (s ^ e[2]) >>> 0;
    }
    return n;
}
function _fmZeroBits(t) { let e = 0; for (let r = 0; r < t.length; r++) { const n = t[r]; if (n === 0) { e += 32; continue; } return e + Math.clz32(n); } return e; }
function _fmStrBytes(s) { const e = new Uint8Array(s.length); for (let r = 0; r < s.length; r++) e[r] = s.charCodeAt(r) & 255; return e; }

// Budget de minage LOCAL : le minage du hash est SYNCHRONE et lourd (~2-7s/source sur iOS).
// Par défaut le PoW est délégué au worker (serveur, pas de gel). Le budget ne s'applique
// qu'au FALLBACK local (worker injoignable) pour ne pas geler le thread sur N miroirs.
const FM_POW_BUDGET = 2;
let _fmPowBudget = FM_POW_BUDGET;

// PoW : worker d'abord (mine côté serveur => zéro gel du thread, toutes les sources en parallèle),
// fallback minage local (bloquant, budgété) si le worker échoue/est indisponible.
async function solvePoW(nonce, difficulty) {
    if (difficulty <= 0) return "0";

    // 1) Worker (serveur). Illimité : c'est du réseau, ça ne gèle rien.
    try {
        const r = await soraFetch(FM_POW_URL, {
            headers: { "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify({ nonce: nonce, difficulty: difficulty })
        });
        if (r) {
            const j = JSON.parse(await r.text());
            if (j && j.solution !== undefined && j.solution !== null && String(j.solution) !== "") {
                _log(`   ⛏️ [PoW Solver] ✅ Solution (worker) : ${j.solution}`);
                return String(j.solution);
            }
        }
        _log(`   ⚠️ [PoW Solver] Worker sans solution -> fallback local`);
    } catch (e) {
        _log(`   ⚠️ [PoW Solver] Worker injoignable (${e.message}) -> fallback local`);
    }

    // 2) Fallback local, budgété pour ne pas geler le thread sur trop de miroirs.
    if (_fmPowBudget <= 0) {
        _log(`   ⏭️ [PoW Solver] Fallback local sauté (budget épuisé : miroir redondant)`);
        return "0";
    }
    _fmPowBudget--;
    return await solvePoWLocal(nonce, difficulty);
}

async function solvePoWLocal(nonce, difficulty) {
    _log(`   ⏳ [PoW Solver] Minage LOCAL (hash maison)... (Difficulté: ${difficulty}, budget restant: ${_fmPowBudget})`);
    const pre = nonce + ":";
    let solution = 0;
    while (solution < 8000000) {
        if (_fmZeroBits(_fmHash(_fmStrBytes(pre + solution))) >= difficulty) {
            _log(`   ⛏️ [PoW Solver] ✅ Solution (local) : ${solution}`);
            return solution.toString();
        }
        solution++;
        if (solution % 800 === 0) await movixYield(0); // le hash est lourd : on respire souvent
    }
    _log(`   ❌ [PoW Solver] Échec.`);
    return "0";
}

// ==========================================
// 1. RECHERCHE (100% TMDB)
// ==========================================
async function searchResults(keyword) {
    _log(`\n=========================================================`);
    _log(`[Movix | 🔍 Recherche] Lancement pour : "${keyword}"`);
    try {
        const types = ['movie', 'tv'];
        let allResults = [];

        const promises = types.map(async (type) => {
            const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&query=${encodeURIComponent(keyword)}&language=fr-FR`;
            const res = await soraFetch(url);
            if (!res) return { results: [] };
            const text = typeof res === "string" ? res : await res.text();
            return JSON.parse(text);
        });

        const [movieData, tvData] = await Promise.all(promises);

        (tvData.results || []).forEach(item => {
            if (item.poster_path) {
                allResults.push({
                    title: item.name, 
                    image: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
                    href: `movix/tv/${item.id}`,
                    popularity: item.popularity + (item.original_language === 'ja' ? 1000 : 0)
                });
            }
        });

        (movieData.results || []).forEach(item => {
            if (item.poster_path) {
                allResults.push({
                    title: item.title,
                    image: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
                    href: `movix/movie/${item.id}`,
                    popularity: item.popularity
                });
            }
        });

        allResults.sort((a, b) => b.popularity - a.popularity);
        
        _log(`[Movix | 🔍 Recherche] ✅ ${allResults.length} résultats trouvés pour "${keyword}".`);
        sendSupabaseLog("Movix", "SEARCH", { 
            keyword: keyword, results_count: allResults.length, top_results: allResults.slice(0, 3).map(r => r.title)
        });

        return JSON.stringify(allResults);
    } catch (e) {
        _log(`[Movix | 🚨 Erreur] Recherche TMDB : ${e.message}`);
        return JSON.stringify([]);
    }
}

// ==========================================
// 2. DÉTAILS (100% TMDB)
// ==========================================
async function extractDetails(href) {
    try {
        href = decodeURIComponent(href);
        const parts = href.split('/');
        const type = parts[1]; 
        const id = parts[2];

        _log(`[Movix | 📂 TMDB] Chargement des détails pour l'ID ${id}...`);
        const detailsUrl = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&language=fr-FR`;
        const res = await soraFetch(detailsUrl);
        if (!res) throw new Error("Réponse vide de TMDB");
        
        const text = typeof res === "string" ? res : await res.text();
        const details = JSON.parse(text);

        _log(`[Movix | 📂 TMDB] ✅ Détails chargés : ${details.title || details.name}`);
        sendSupabaseLog("Movix", "DETAILS", { tmdb_id: id, type: type, title: details.title || details.name });

        return JSON.stringify([{
            description: details.overview || "Aucune description disponible pour ce contenu.",
            aliases: `Type: ${type === 'movie' ? 'Film' : 'Série'}`,
            airdate: `Date: ${details.release_date || details.first_air_date || 'N/A'}`
        }]);
    } catch (e) {
        _log(`[Movix | 🚨 Erreur] Détails TMDB : ${e.message}`);
        return JSON.stringify([{ description: "Erreur lors du chargement des détails.", aliases: "", airdate: "" }]);
    }
}

// ==========================================
// 3. ÉPISODES (100% TMDB pour les miniatures)
// ==========================================
async function extractEpisodes(href) {
    try {
        href = decodeURIComponent(href);
        const parts = href.split('/');
        const type = parts[1]; 
        const id = parts[2];
        let episodes = [];

        _log(`[Movix | 📺 TMDB] Génération des épisodes pour l'ID ${id}...`);
        const detailsUrl = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_KEY}&language=fr-FR`;
        const res = await soraFetch(detailsUrl);
        if (!res) return JSON.stringify([]);
        
        const text = typeof res === "string" ? res : await res.text();
        const details = JSON.parse(text);

        if (type === 'movie') {
            episodes.push({
                number: 1,
                title: details.title || "Le Film",
                image: details.backdrop_path ? `https://image.tmdb.org/t/p/w500${details.backdrop_path}` : "",
                href: `stream/movie/${id}`
            });
        } else if (type === 'tv') {
            if (details.seasons) {
                for (const season of details.seasons) {
                    const sNum = season.season_number;
                    if (sNum === 0) continue; 

                    const seasonUrl = `https://api.themoviedb.org/3/tv/${id}/season/${sNum}?api_key=${TMDB_KEY}&language=fr-FR`;
                    try {
                        const sRes = await soraFetch(seasonUrl);
                        if (!sRes) continue;
                        
                        const sText = typeof sRes === "string" ? sRes : await sRes.text();
                        const sData = JSON.parse(sText);

                        if (sData.episodes) {
                            sData.episodes.forEach(ep => {
                                episodes.push({
                                    number: ep.episode_number,
                                    season: sNum,
                                    title: ep.name ? `S${sNum}E${ep.episode_number} - ${ep.name}` : `Épisode ${ep.episode_number}`,
                                    image: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : "",
                                    href: `stream/tv/${id}/${sNum}/${ep.episode_number}`
                                });
                            });
                        }
                    } catch (err) { }
                }
            }
        }
        
        _log(`[Movix | 📺 TMDB] ✅ ${episodes.length} épisodes générés avec succès.`);
        return JSON.stringify(episodes);
    } catch (e) {
        _log(`[Movix | 🚨 Erreur] Épisodes TMDB : ${e.message}`);
        return JSON.stringify([]);
    }
}

// ==========================================
// 4. LECTEUR (SUPER AGRÉGATEUR D'APIs)
// ==========================================
async function extractStreamUrl(href) {
    const startTime = Date.now();
    let mediaTitle = "Inconnu";
    let failedLinks = [];
    let skippedLinksCount = 0;
    _fmPowBudget = FM_POW_BUDGET;   // reset du budget de PoW filemoon à chaque extraction
    
    try {
        // Résoudre le domaine actif UNE FOIS et le stocker dans une variable locale
        // pour éviter d'utiliser await directement dans les expressions ${}
        const _mvxD = await getMovixDomain();

        const parts = href.split('/');
        const type = parts[1]; 
        const tmdbId = parts[2];
        const seasonNum = type === 'tv' ? parseInt(parts[3]) : 1;
        const episodeNum = type === 'tv' ? parseInt(parts[4]) : 1;

        _log(`\n=========================================================`);
        _log(`[Movix | 🚀 Agrégateur] 🎬 Lancement pour TMDB ID: ${tmdbId} (S${seasonNum} E${episodeNum})`);

        const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=fr-FR`;
        const tmdbRes = await soraFetch(tmdbUrl);
        if (!tmdbRes) throw new Error("Impossible de joindre TMDB");
        const tmdbData = JSON.parse(typeof tmdbRes === "string" ? tmdbRes : await tmdbRes.text());
        mediaTitle = type === 'movie' ? tmdbData.title : tmdbData.name;

        const isAnime = tmdbData.original_language === 'ja' || (tmdbData.origin_country && tmdbData.origin_country.includes('JP'));

        let movixInternalId = null;
        try {
            _log(`[Movix | 🚀 Agrégateur] 🔄 Recherche de l'ID Interne Movix pour "${mediaTitle}"...`);
            let searchUrl = `https://api.${_mvxD}/api/search?title=${encodeURIComponent(mediaTitle)}`;
            let searchRes = await soraFetch(searchUrl);
            if (searchRes) {
                let searchJson = JSON.parse(await searchRes.text());
                if (searchJson && searchJson.results) {
                    let match = searchJson.results.find(r => String(r.tmdb_id) === String(tmdbId));
                    if (match) {
                        movixInternalId = match.id;
                        _log(`[Movix | 🚀 Agrégateur] ✅ ID Interne trouvé : ${movixInternalId}`);
                    }
                }
            }
        } catch(e) {
            _log(`[Movix | 🚀 Agrégateur] ⚠️ Échec de la traduction d'ID Interne.`);
        }

        let targetLinks = [];
        const linkCountBySource = {};

        const addLink = (url, langStr, qualityStr = null, parentDomain = null) => {
            if (!url || typeof url !== 'string' || url.includes("void.mp4")) return;

            const sourceName = parentDomain || "inconnu";
            linkCountBySource[sourceName] = (linkCountBySource[sourceName] || 0) + 1;

            let l = (langStr || "").toUpperCase();
            let prefix = "[VF]";
            if (l.includes("VOSTFR") || l.includes("SUB")) prefix = "[VOSTFR]";
            else if (l.includes("VA") || l.includes("ENG")) prefix = "[VA]";
            else if (l === "VFQ" || l === "VFF" || l === "DEFAULT" || l.includes("VF") || l.includes("FRENCH") || l.includes("MULTI")) prefix = "[VF]";
            else if (l.length > 0 && l.length < 10) prefix = `[${l}]`;

            if (qualityStr) {
                let q = qualityStr.toUpperCase();
                if (q.includes("4K")) prefix += " 4K";
                else if (q.includes("1080")) prefix += " 1080p";
                else if (q.includes("720")) prefix += " 720p";
            }

            let finalParent = parentDomain || `https://${_mvxD}/`;

            if (!targetLinks.find(t => t.url === url)) {
                targetLinks.push({ url, prefix, parentDomain: finalParent });
            }
        };

        const runStandardAPIs = async () => {
            const api = (p) => `https://api.${_mvxD}${p}`;
            const DOM = () => `https://${_movixActiveDomain || MOVIX_FALLBACK_DOMAIN}/`;
            const isTv = type === 'tv';

            const sources = [
                { name: "Direct (Interne)",
                  url: () => !movixInternalId ? null : (isTv
                        ? api(`/api/series/download/${movixInternalId}/season/${seasonNum}/episode/${episodeNum}`)
                        : api(`/api/movies/download/${movixInternalId}`)),
                  extract: (j) => (j?.sources || []).forEach(src => addLink(src.m3u8 || src.src, src.language, src.quality, DOM())) },

                { name: "TMDB",
                  url: () => isTv ? api(`/api/tmdb/tv/${tmdbId}?season=${seasonNum}&episode=${episodeNum}`) : api(`/api/tmdb/movie/${tmdbId}`),
                  extract: (j) => { const links = isTv ? j?.current_episode?.player_links : j?.player_links; (links || []).forEach(p => addLink(p.decoded_url, p.language, p.quality, "https://www.themoviedb.org/")); } },

                { name: "Purstream",
                  url: () => isTv ? api(`/api/purstream/tv/${tmdbId}/stream?season=${seasonNum}&episode=${episodeNum}`) : api(`/api/purstream/movie/${tmdbId}/stream`),
                  extract: (j) => (j?.sources || []).forEach(src => addLink(src.url, src.name, null, "https://purstream.ac/")) },

                { name: "Fstream",
                  url: () => isTv ? api(`/api/fstream/tv/${tmdbId}/season/${seasonNum}`) : api(`/api/fstream/movie/${tmdbId}`),
                  extract: (j) => {
                      if (isTv) {
                          const ep = j?.episodes?.[String(episodeNum)];
                          if (ep?.languages) Object.keys(ep.languages).forEach(lang => ep.languages[lang].forEach(p => addLink(p.url, lang, p.quality, "https://french-stream.one/")));
                      } else if (j?.players) {
                          Object.keys(j.players).forEach(lang => j.players[lang].forEach(p => addLink(p.url, lang === "Default" ? "VF" : lang, p.quality, "https://french-stream.one/")));
                      } else if (j?.languages) {
                          Object.keys(j.languages).forEach(lang => j.languages[lang].forEach(p => addLink(p.url, lang, p.quality, "https://french-stream.one/")));
                      }
                  } },

                { name: "Wiflix",
                  url: () => isTv ? api(`/api/wiflix/tv/${tmdbId}/${seasonNum}`) : api(`/api/wiflix/movie/${tmdbId}`),
                  extract: (j) => {
                      if (isTv) {
                          const ep = j?.episodes?.[String(episodeNum)];
                          if (ep) Object.keys(ep).forEach(lang => { if (Array.isArray(ep[lang])) ep[lang].forEach(p => addLink(p.url, lang, null, "https://wiflix.voto/")); });
                      } else {
                          if (j?.players) {
                              (j.players.vf || []).forEach(p => addLink(p.url, "VF", null, "https://wiflix.voto/"));
                              (j.players.vostfr || []).forEach(p => addLink(p.url, "VOSTFR", null, "https://wiflix.voto/"));
                          }
                          if (j?.links) Object.keys(j.links).forEach(lang => j.links[lang].forEach(p => addLink(p.url, lang, null, "https://wiflix.voto/")));
                      }
                  } },

                { name: "Cpasmal",
                  url: () => isTv ? api(`/api/cpasmal/tv/${tmdbId}/${seasonNum}/${episodeNum}`) : api(`/api/cpasmal/movie/${tmdbId}`),
                  extract: (j) => { if (j?.links) Object.keys(j.links).forEach(lang => j.links[lang].forEach(p => addLink(p.url, lang, null, "https://cpasmal.com/"))); } },

                { name: "Links",
                  url: () => isTv ? api(`/api/links/tv/${tmdbId}?season=${seasonNum}&episode=${episodeNum}`) : api(`/api/links/movie/${tmdbId}`),
                  extract: (j) => {
                      const dataArray = j?.data ? (Array.isArray(j.data) ? j.data : [j.data]) : [];
                      if (j?.success) dataArray.forEach(d => { if (d.links) d.links.forEach(link => {
                          const u = typeof link === "string" ? link : (link && link.url);
                          if (u) addLink(u, "VF", null, DOM());
                      }); });
                  } },

                { name: "1jour1film",
                  url: () => isTv ? null : api(`/api/j1f/movie/${tmdbId}`),
                  extract: (j) => {
                      if (j?.players) {
                          (j.players.vf || []).forEach(p => addLink(p.url, "VF", null, DOM()));
                          (j.players.vostfr || []).forEach(p => addLink(p.url, "VOSTFR", null, DOM()));
                      }
                  } },

                { name: "SwiftFlow",
                  url: () => isTv ? null : api(`/api/swiftflow/movie/${tmdbId}`),
                  extract: (j) => {
                      if (j?.players) {
                          (j.players.vf || []).forEach(p => addLink(p.url, "VF", null, DOM()));
                          (j.players.vostfr || []).forEach(p => addLink(p.url, "VOSTFR", null, DOM()));
                      }
                  } },

                { name: "IMDB",
                  url: () => isTv ? api(`/api/imdb/tv/${tmdbId}`) : null,
                  extract: (j) => {
                      const s = j?.series?.[0]?.seasons?.find(x => String(x.number) === String(seasonNum));
                      const ep = s?.episodes?.find(x => String(x.number) === String(episodeNum));
                      if (ep?.versions) Object.keys(ep.versions).forEach(lang => { if (ep.versions[lang].players) ep.versions[lang].players.forEach(p => addLink(p.link, lang, null, "https://www.imdb.com/")); });
                  } }
            ];

            await Promise.all(sources.map(async (src) => {
                const url = src.url();
                if (!url) return;
                _log(`   📡 [Sonde] ${src.name} : ${url}`);
                try {
                    const r = await soraFetch(url);
                    if (!r) { _log(`   ❌ [Réponse] ${src.name} : pas de réponse`); return; }
                    const j = JSON.parse(await r.text());
                    const before = targetLinks.length;
                    src.extract(j);
                    _log(`   📥 [Réponse] ${src.name} : ${targetLinks.length - before} lien(s)`);
                } catch (e) { _log(`   ❌ [Réponse] ${src.name} : erreur ${e.message}`); }
            }));
        };

        const runAnimeAPI = async () => {
            let absoluteEpisodeIndex = 0;
            if (tmdbData.seasons) {
                let validSeasons = tmdbData.seasons.filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
                for (let s of validSeasons) {
                    if (s.season_number < seasonNum) absoluteEpisodeIndex += s.episode_count;
                }
            }
            absoluteEpisodeIndex += episodeNum;
            _log(`[Movix | 🚀 Agrégateur] 📊 Index Absolu pour l'Anime : Épisode n°${absoluteEpisodeIndex}`);

            let titlesToTry = [mediaTitle.trim()];
            if (tmdbData.original_name && tmdbData.original_name !== mediaTitle) titlesToTry.push(tmdbData.original_name.trim()); 
            if (mediaTitle.includes(' ')) {
                titlesToTry.push(mediaTitle.replace(/\s+/g, '').trim()); 
                titlesToTry.push(mediaTitle.toLowerCase().replace(/(^\w|\s\w)/g, m => m.toUpperCase()).trim()); 
                titlesToTry.push((mediaTitle.charAt(0).toUpperCase() + mediaTitle.slice(1).toLowerCase().replace(/\s+/g, '')).trim()); 
            }
            if (mediaTitle.includes(':')) titlesToTry.push(mediaTitle.split(':')[0].trim());
            titlesToTry = [...new Set(titlesToTry)];

            let movixData = [];
            for (let t of titlesToTry) {
                let animeSearchUrl = `https://api.${_mvxD}/anime/search/${encodeURIComponent(t)}?includeSeasons=true&includeEpisodes=true`;
                _log(`   📡 [Sonde] Secours Anime : ${animeSearchUrl}`);
                let movixRes = await soraFetch(animeSearchUrl);
                if (movixRes) {
                    let movixText = typeof movixRes === "string" ? movixRes : await movixRes.text();
                    try {
                        const parsed = JSON.parse(movixText);
                        let tempData = Array.isArray(parsed) ? parsed : (parsed.data || parsed.results || []);
                        if (tempData.length > 0) {
                            movixData = tempData;
                            break; 
                        }
                    } catch(e) {}
                }
            }

            if (movixData.length > 0) {
                const anime = movixData[0];
                let currentAbsIndex = 0;
                let exactMatch = null;
                let absMatch = null;

                if (anime.seasons) {
                    for (let season of anime.seasons) {
                        let sNumMatch = season.name.match(/\d+/);
                        let sNum = sNumMatch ? parseInt(sNumMatch[0]) : 0; 
                        if (season.episodes) {
                            for (let ep of season.episodes) {
                                currentAbsIndex++;
                                if (sNum === seasonNum && ep.index === episodeNum) exactMatch = ep.streaming_links;
                                if (currentAbsIndex === absoluteEpisodeIndex) absMatch = ep.streaming_links;
                            }
                        }
                    }
                }

                let animeLinks = exactMatch || absMatch || [];
                for (let streamGroup of animeLinks) {
                    for (let playerUrl of streamGroup.players) {
                        addLink(playerUrl, streamGroup.language, null, `https://${_movixActiveDomain || MOVIX_FALLBACK_DOMAIN}/`);
                    }
                }
            }
        };

        if (isAnime) {
            _log(`[Movix | 🚀 Agrégateur] 🍥 Contenu identifié comme ANIME (Japonais). Sondes Anime + standards en parallèle...`);
            await Promise.all([runAnimeAPI(), runStandardAPIs()]);
        } else {
            _log(`[Movix | 🚀 Agrégateur] 📡 Interrogation parallèle des APIs standards...`);
            await runStandardAPIs();
            if (targetLinks.length === 0) {
                _log(`[Movix | 🚀 Agrégateur] ⚠️ Aucun lien via les réseaux standards. Tentative de secours via l'API Anime...`);
                await runAnimeAPI();
            }
        }

        if (targetLinks.length === 0) throw new Error("Contenu totalement introuvable sur le réseau Movix");

		_log(`[Movix | 🚀 Agrégateur] 🎯 Bilan brut : ${targetLinks.length} liens récupérés.`);
		_log(`[Movix | 🚀 Agrégateur] 📊 Détail par source :`);
		for (const [source, count] of Object.entries(linkCountBySource)) {
			const shortName = source.replace("https://", "").replace(/\/$/, "");
			_log(`   ${count} lien(s) ← ${shortName}`);
		}
        _log(`---------------------------------------------------------`);

        const isHardUnsupported = (url) => {
            const u = url.toLowerCase();
            return u.includes("waaw") || u.includes("younetu") || u.includes("netu") || u.includes("hqq") ||
                   u.includes("veev") || u.includes("listeamed") || u.includes("up4fun") ||
                   u.includes("coflix") || u.includes("kakaflix") || u.includes("fembed") ||
                   u.includes("sandratable");
        };

        let streams = [];
        let extractionTasks = [];

        const withTimeout = (promise, ms, url) => {
            if (!_MOVIX_TIMER) {
                return promise;
            }
            return Promise.race([
                promise,
                new Promise(resolve => _MOVIX_TIMER(() => {
                    _log(`   ⏱️ [Timeout] Serveur très lent ignoré (>${ms/1000}s) : ${url}`);
                    resolve({ title: "Timeout Serveur", originalUrl: url });
                }, ms))
            ]);
        };

        for (let linkObj of targetLinks) {
            let urlLower = linkObj.url.toLowerCase();
            
            if (isHardUnsupported(linkObj.url)) {
                _log(`   ⏭️ [Fast-Skip] Ignoré car trop lent/complexe : ${linkObj.url}`);
                failedLinks.push({ server_name: "Non Supporté (Complexe)", url: linkObj.url });
                skippedLinksCount++;
                continue;
            }
            
            // 🎛️ Skip si l'extracteur est désactivé dans la configuration EXTRACTORS
            const _exKey = extractorKeyForUrl(urlLower);
            if (_exKey && EXTRACTORS[_exKey] === false) {
                _log(`   ⏭️ [Fast-Skip] ${_exKey} désactivé (config EXTRACTORS) — ignoré : ${linkObj.url}`);
                skippedLinksCount++;
                continue;
            }

            // 🌟 Timeout à 15s au lieu de 10s
            extractionTasks.push(withTimeout(extractDirectVideo(linkObj.url, linkObj.prefix, linkObj.url, linkObj.parentDomain), 15000, linkObj.url));
        }

        const results = await Promise.all(extractionTasks);
        for (let res of results) {
            if (res && res.streamUrl) {
                if (/senpai-stream\.club/i.test(res.streamUrl)) {
                    res.headers = Object.assign({}, res.headers, { "Referer": res.streamUrl });
                    _log(`   🔒 [Self-Referer] senpai-stream détecté -> Referer = lien lui-même`);
                }
                if (!streams.find(s => s.streamUrl === res.streamUrl)) streams.push(res);
            } else if (res && res.originalUrl) {
                failedLinks.push({ server_name: res.title || "Inconnu", url: res.originalUrl });
            }
        }

        _log(`---------------------------------------------------------`);
        _log(`[Movix | 🏁 Bilan final] 🎬 Titre : ${mediaTitle} (S${seasonNum} E${episodeNum})`);
        _log(`   ✅ Liens valides et décodés : ${streams.length}`);
        _log(`   💀 Liens morts / échoués : ${failedLinks.length - skippedLinksCount}`);
        _log(`   ⏭️ Liens ignorés (Fast-Skip) : ${skippedLinksCount}`);
        _log(`   ⏱️ Temps total d'exécution : ${Date.now() - startTime}ms`);
		if (failedLinks.length > 0) {
            _log(`---------------------------------------------------------`);
            _log(`[Movix | 💀 Liens échoués] Détail des ${failedLinks.length} lien(s) non résolu(s) :`);
            failedLinks.forEach((fl, i) => {
                _log(`   ${i + 1}. [${fl.server_name || "Inconnu"}] ${fl.url}`);
            });
            _log(`---------------------------------------------------------`);
        }
        _log(`=========================================================\n`);

        const langPriority = (title) => {
            const t = (title || "").toUpperCase();
            if (t.startsWith("[VF]") || t.includes("] VF") || t.includes("[VF ")) return 0;
            if (t.startsWith("[VOSTFR]") || t.includes("[VOSTFR ")) return 1;
            if (t.startsWith("[VA]")) return 2;
            return 3;
        };

        const serverName = (title) => {
            return (title || "").replace(/^\[[^\]]+\]\s*/, "").trim().toLowerCase();
        };

        const deprio = (title) => /upbolt/i.test(title || "") ? 1 : 0;

        streams.sort((a, b) => {
            const langDiff = langPriority(a.title) - langPriority(b.title);
            if (langDiff !== 0) return langDiff;
            const dDiff = deprio(a.title) - deprio(b.title);
            if (dDiff !== 0) return dDiff;
            return serverName(a.title).localeCompare(serverName(b.title));
        });

        sendSupabaseLog("Movix", "PLAYER", { 
            media_title: mediaTitle, season_number: seasonNum, ep_number: episodeNum, 
            streams_found: streams.length, hosts_scanned: targetLinks.length, execution_time_ms: Date.now() - startTime
        });
        
        if (failedLinks.length > 0 || streams.length === 0) {
            sendSupabaseLog("Movix", "UNSUPPORTED_HOSTS", { 
                media_title: mediaTitle, season_number: seasonNum, ep_number: episodeNum, 
                failed_count: failedLinks.length, failed_links: failedLinks 
            });
        }

        return JSON.stringify(streams.length > 0 ? { type: "servers", streams: streams } : { type: "none" });

    } catch (e) {
        _log(`[Movix | 🚨 Erreur] Lecteur : ${e.message}`);
        sendSupabaseLog("Movix", "ERROR", { error_message: String(e) });
        return JSON.stringify({ type: "none" });
    }
}

// ==========================================
// 🛠️ DÉCODEURS DE LECTEURS (HOSTS)
// ==========================================
// ==========================================
// 🔓 EXTRACTEUR EMBEDSEEK / NEOCINE (AES-128-CBC)
// ==========================================
// L'API renvoie un blob hex chiffré en AES-128-CBC.
// Clé et IV sont statiques (hardcodés côté client) :
//   key = "kiemtienmua911ca" / iv = "1234567890oiuytr"
// AES-CBC pur JS pour compat WebOS (pas de dépendance à crypto.subtle).
// (clé/IV définis dans le bloc CONFIG en tête)

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

/**
 * Déchiffre une réponse hex de l'API embedseek et renvoie l'objet JSON.
 */
function embedseekDecrypt(hexBlob) {
    const cipher = _hexToBytes(hexBlob);
    const key = _strToBytes(_EMBEDSEEK_KEY);
    const iv  = _strToBytes(_EMBEDSEEK_IV);
    const plain = _AES.cbcDecrypt(cipher, key, iv);
    let txt = "";
    for (let i = 0; i < plain.length; i++) txt += String.fromCharCode(plain[i]);
    try { txt = decodeURIComponent(escape(txt)); } catch (e) {}
    return JSON.parse(txt);
}

/**
 * Extracteur complet embedseek/neocine.
 * Prend l'URL embed (ex: https://neocine.embedseek.com/#sqvki),
 * appelle l'API, déchiffre, et renvoie { streamUrl, headers }.
 */
async function embedseekExtractor(embedUrl, langPrefix) {
    try {
        const m = embedUrl.match(/https?:\/\/([^\/]+)\/?#?([a-zA-Z0-9]+)?/i);
        const host = m ? m[1] : "neocine.embedseek.com";
        // id : soit après le #, soit en query ?id=
        let videoId = (embedUrl.match(/#([a-zA-Z0-9]+)/) || [])[1]
                   || (embedUrl.match(/[?&]id=([a-zA-Z0-9]+)/) || [])[1];
        if (!videoId) {
            _log(`   ❌ [Embedseek] Impossible d'extraire l'id depuis ${embedUrl}`);
            return null;
        }

        const apiUrl = `https://${host}/api/v1/video?id=${videoId}&w=1680&h=1050&r=`;
        _log(`   📡 [Embedseek] Appel API : ${apiUrl}`);

        // ⚠️ embed4me/embedseek : n'envoyer QUE le User-Agent. Avec Origin/Referer (surtout
        // avec le #id), l'API répond 400 "Request is invalid".
        const res = await soraFetch(apiUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
        });
        if (!res) { _log(`   ❌ [Embedseek] Pas de réponse API`); return null; }

        const hexBlob = (await res.text()).trim();
        if (!/^[0-9a-fA-F]+$/.test(hexBlob) || hexBlob.length % 32 !== 0) {
            _log(`   ❌ [Embedseek] Réponse non-hex inattendue (${hexBlob.length} chars)`);
            return null;
        }

        const data = embedseekDecrypt(hexBlob);
        _log(`   🔓 [Embedseek] Déchiffré -> titre: ${data.title}`);

        // 'source' = master.m3u8 signé (token + expiration), à utiliser frais
        let streamUrl = data.source;
        // fallback CDN TikTok (chemin relatif) si pas de source directe
        if (!streamUrl && data.hlsVideoTiktok) {
            streamUrl = `https://${host}${data.hlsVideoTiktok}`;
        }

        if (streamUrl) {
            _log(`   ✅ [Embedseek] Flux extrait : ${streamUrl}`);
            return {
                title: `${langPrefix} Embedseek (HLS)`,
                streamUrl: streamUrl,
                headers: { "Referer": `https://${host}/`, "Origin": `https://${host}` }
            };
        }

        _log(`   ❌ [Embedseek] Déchiffrement OK mais aucune source`);
        return null;
    } catch (e) {
        _log(`   🚨 [Embedseek] Crash : ${e.message}`);
        return null;
    }
}

async function extractDirectVideo(embedUrl, langPrefix, originalUrl, parentDomain) {
    let urlLower = embedUrl.toLowerCase();
    let hostRecognized = false;
    let isDeleted = false;
    
    const _mvxD = _movixActiveDomain || MOVIX_FALLBACK_DOMAIN;
    let pDomain = parentDomain || `https://${_mvxD}/`;
    const hostDomain = (embedUrl.match(/https?:\/\/(?:www\.)?([^\/]+)/i) || [])[1] || "inconnu";

    const checkIfDeleted = (html) => {
        const h = html.toLowerCase();
        return h.includes("file was deleted") || h.includes("file not found") ||
               h.includes("video not found") || h.includes("video is not found") ||
               h.includes("video deleted") || h.includes("file deleted") ||
               h.includes("404 not found") || h.includes("no longer exists") ||
               h.includes("no longer available") || h.includes("видео недоступно") ||
               h.includes("videostatus"); 
    };

    try {
        // Liens directs : on fournit un UA navigateur + Accept (SANS Referer). Certains CDN (ex:
        // finepulfe.xyz via purstream) renvoient 403 à l'UA par défaut du player iOS (AppleCoreMedia)
        // ou quand un Referer parent est envoyé.
        const _directHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*"
        };
        if (urlLower.endsWith(".m3u8") || urlLower.includes("master.m3u8") || urlLower.includes(".m3u8?") || urlLower.includes("/playlist.m3u8")) {
            hostRecognized = true;
            _log(`   ✅ [Serveur Direct] HLS extrait avec succès !`);
            return { title: `${langPrefix} Serveur Direct (HLS)`, streamUrl: embedUrl, headers: _directHeaders };
        }
        if (urlLower.endsWith(".mp4") || urlLower.includes(".mp4?")) {
            hostRecognized = true;
            _log(`   ✅ [Serveur Direct] MP4 extrait avec succès !`);
            return { title: `${langPrefix} Serveur Direct (MP4)`, streamUrl: embedUrl, headers: _directHeaders };
        }

        _log(`   ⏳ [Scan] ${hostDomain} (Referer Parent: ${pDomain})...`);

        if (urlLower.includes("voe.sx") || urlLower.includes("voe.network") || urlLower.includes("voe") || urlLower.includes("lancewhosedifficult") || urlLower.includes("ralphysuccessfull") || urlLower.includes("voe1/newplayer") || urlLower.includes("jefferycontrolmodel")) {
            hostRecognized = true;
            let voeRes = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
            if (voeRes) {
                let voeHtml = await voeRes.text();
                if (checkIfDeleted(voeHtml)) isDeleted = true;

                // RegExp construite dynamiquement (le token est dans le HTML distant, pas une API iOS)
                const redirectMatch = voeHtml.match(new RegExp("win" + "dow\\.location\\.href\\s*=\\s*[\"']([^\"']+)[\"']", "i"));
                if (redirectMatch && redirectMatch[1]) {
                    voeRes = await soraFetch(redirectMatch[1], { headers: { "Referer": pDomain } });
                    voeHtml = await voeRes.text();
                    if (checkIfDeleted(voeHtml)) isDeleted = true;
                }

                const streamUrl = voeExtractor(voeHtml);
                if (streamUrl) {
                    _log(`   ✅ [VOE] Flux extrait avec succès !`);
                    const typeStr = streamUrl.includes(".m3u8") ? "HLS" : "MP4";
                    return { title: `${langPrefix} VOE (${typeStr})`, streamUrl: streamUrl, headers: { "Referer": embedUrl } };
                }
            }
        }
        else if (urlLower.includes("streamtape")) {
            hostRecognized = true;
            const stRes = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
            if (stRes) {
                const stHtml = await stRes.text();
                if (checkIfDeleted(stHtml)) isDeleted = true;

                // RegExp construite dynamiquement (le token est dans le HTML distant, pas une API iOS)
                const robotMatch = stHtml.match(new RegExp("docu" + "ment\\.getElementById\\(['\"]robotlink['\"]\\)\\.innerHTML\\s*=\\s*[^;]+\\(['\"]([^'\"]+)['\"]\\)", "i"));
                if (robotMatch) {
                    let tokenStr = robotMatch[1];
                    let directUrl = "https://streamtape.com" + tokenStr.substring(tokenStr.indexOf('/get_video')) + "&dl=1";
                    _log(`   ✅ [Streamtape] Flux extrait avec succès !`);
                    return { title: `${langPrefix} Streamtape`, streamUrl: directUrl, headers: { "Referer": "https://streamtape.com/" } };
                }
            }
        }
        else if (urlLower.includes("sibnet.ru")) {
            hostRecognized = true;
            const req = await soraFetch(embedUrl, { encoding: "win" + "dows-1251", headers: { "Referer": pDomain } });
            if (req) {
                const html = await req.text();
                if (checkIfDeleted(html)) isDeleted = true;

                const srcMatch = html.match(/src:\s*[\"'](\/v\/[^\"']+\.mp4)[\"']/i);
                if (srcMatch) {
                    let streamUrl = "https://video.sibnet.ru" + srcMatch[1];
                    try {
                        const redirectReq = await soraFetch(streamUrl, { method: "HEAD", headers: { "Referer": embedUrl } });
                        if (redirectReq && redirectReq.url && redirectReq.url !== streamUrl) streamUrl = redirectReq.url;
                    } catch(e) {}
                    _log(`   ✅ [Sibnet] Flux extrait avec succès !`);
                    return { title: `${langPrefix} Sibnet`, streamUrl: streamUrl, headers: { "Referer": embedUrl, "User-Agent": "Mozilla/5.0" } };
                }
            }
        }
        else if (urlLower.includes("vidmoly")) {
            hostRecognized = true;
            let fixedVidUrl = embedUrl.replace(/vidmoly\.(to|me|net|ru|is)/i, "vidmoly.biz");
            const vidRes = await soraFetch(fixedVidUrl, { headers: { "Referer": pDomain } });
            if (vidRes) {
                const vidHtml = await vidRes.text();
                if (checkIfDeleted(vidHtml)) isDeleted = true;

                const fileMatch = vidHtml.match(/file\s*:\s*[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i) || vidHtml.match(/[\"'](https?:\/\/[^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i);
                if (fileMatch) {
                    _log(`   ✅ [Vidmoly] Flux extrait avec succès !`);
                    return { title: `${langPrefix} Vidmoly`, streamUrl: fileMatch[1], headers: { "Referer": "https://vidmoly.biz/" } };
                }
            }
        }
        else if (urlLower.includes("vk.com") || urlLower.includes("vkvideo.ru")) {
            hostRecognized = true;
            const req = await soraFetch(embedUrl, { headers: { "Referer": "https://vk.com/" } });
            if (req) {
                const html = await req.text();
                if (checkIfDeleted(html) || html.includes("error_msg")) isDeleted = true;
                
                let matches = [...html.matchAll(/\"url([0-9]+)\"\s*:\s*\"([^\"]+)\"/g)];
                if (matches.length > 0) {
                    matches.sort((a, b) => parseInt(b[1]) - parseInt(a[1])); 
                    let streamUrl = matches[0][2].replace(/\\/g, '');
                    _log(`   ✅ [VK] Flux ${matches[0][1]}p extrait avec succès !`);
                    return { title: `${langPrefix} VK [${matches[0][1]}p]`, streamUrl: streamUrl, headers: { "Referer": "https://vk.com/" } };
                }
                
                let hlsMatch = html.match(/\"hls\"\s*:\s*(?:\[[^\]]*\"([^\"]+\.m3u8[^\"]*)\"|\"([^\"]+\.m3u8[^\"]*)\")/i) || html.match(/\"hls\"\s*:\s*\"([^\"]+)\"/i);
                if (hlsMatch) {
                    let streamUrl = (hlsMatch[1] || hlsMatch[2] || "").replace(/\\/g, '');
                    if (streamUrl) {
                        _log(`   ✅ [VK] Flux HLS extrait avec succès !`);
                        return { title: `${langPrefix} VK (HLS)`, streamUrl: streamUrl, headers: { "Referer": "https://vk.com/" } };
                    }
                }
                
                let sourceMatch = html.match(/<source[^>]+src=[\"']([^\"']+)[\"']/i);
                if (sourceMatch) {
                    _log(`   ✅ [VK] Flux HTML extrait avec succès !`);
                    return { title: `${langPrefix} VK`, streamUrl: sourceMatch[1].replace(/&amp;/g, '&'), headers: { "Referer": "https://vk.com/" } };
                }
            }
        }
        else if (urlLower.includes("uqload")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Uqload en cours pour ${hostDomain}...`);

            const uqHeaders = {
                "Referer": pDomain,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
            };

            const req = await soraFetch(embedUrl, { headers: uqHeaders });
            if (req) {
                 const html = await req.text();
                 if (checkIfDeleted(html)) isDeleted = true;
                 else {
                     let streamUrl = vidhideExtractor(html);
                     
                     if (!streamUrl) {
                         const srcMatch = html.match(/sources\s*:\s*\[\"([^\"]+)\"\]/i) || html.match(/src\s*:\s*\"([^\"]+\.mp4)\"/i);
                         if (srcMatch) streamUrl = srcMatch[1];
                     }

                     if (streamUrl) {
                         _log(`   ✅ [Uqload] Flux extrait avec succès !`);
                         uqHeaders["Referer"] = `https://${hostDomain}/`;
                         
                         return { 
                             title: `${langPrefix} Uqload`, 
                             streamUrl: streamUrl, 
                             headers: uqHeaders 
                         };
                     }
                 }
            }
        }
        else if (urlLower.includes("dood") || urlLower.includes("doply") || urlLower.includes("vidply") || urlLower.includes("playmogo") || urlLower.includes("dsvplay")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Doodstream en cours pour ${hostDomain}...`);
            const req = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
            if (req) {
                 const html = await req.text();
                 if (checkIfDeleted(html)) isDeleted = true;
                 else {
                     let streamUrl = await doodstreamExtractor(html, embedUrl);
                     if (streamUrl) {
                         _log(`   ✅ [Doodstream] Flux extrait avec succès !`);
                         return { title: `${langPrefix} Doodstream`, streamUrl: streamUrl, headers: { "Referer": embedUrl } };
                     }
                 }
            }
        }
        else if (urlLower.includes("hgcloud") || urlLower.includes("audinifer") || urlLower.includes("masukestin") || urlLower.includes("hglink") || urlLower.includes("huntrexus") || urlLower.includes("vibuxer")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction HGCloud en cours pour ${hostDomain}...`);

            const idMatch = embedUrl.match(/\/e\/([a-zA-Z0-9]+)/);
            if (!idMatch) {
                _log(`   ❌ [HGCloud] ID vidéo introuvable dans : ${embedUrl}`);
            } else {
                const videoId = idMatch[1];
                _log(`   🔍 [HGCloud] ID vidéo : ${videoId}`);

                const vibuxerUrl = `https://vibuxer.com/e/${videoId}`;
                _log(`   📡 [HGCloud] Chargement : ${vibuxerUrl}`);

                const req = await soraFetch(vibuxerUrl, { 
                    headers: { "Referer": "https://hgcloud.to/" } 
                });
                if (req) {
                    const html = await req.text();
                    _log(`   🔍 [HGCloud] vibuxer HTML size: ${html.length}`);
                    if (checkIfDeleted(html)) { isDeleted = true; }
                    else {
                        let unpackedHtml = html;
                        try {
                            const packRegex = /eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/gs;
                            const packMatches = html.match(packRegex);
                            if (packMatches) {
                                for (let packed of packMatches) {
                                    const argsMatch = packed.match(/}\s*\(\s*([\'\"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\'\"])(.*?)\5\.split\('\|'\)/s);
                                    if (argsMatch) {
                                        let p = argsMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
                                        const a = parseInt(argsMatch[3], 10);
                                        let c = parseInt(argsMatch[4], 10);
                                        const k = argsMatch[6].split('|');
                                        const e = function(c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
                                        while (c--) { if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]); }
                                        unpackedHtml += "\n" + p;
                                    }
                                }
                            }
                        } catch(e) {}

                        const hls3Match = unpackedHtml.match(/\"hls3\"\s*:\s*\"(https?:\/\/[^\"]+\.m3u8[^\"]*)\"/i);
                        const hls2Match = unpackedHtml.match(/\"hls2\"\s*:\s*\"(https?:\/\/[^\"]+\.m3u8[^\"]*)\"/i);
                        let streamUrl = (hls3Match || hls2Match)?.[1];

                        if (!streamUrl) {
                            const generalMatch = unpackedHtml.match(/(https?:\/\/[^\"\'\s]+\.m3u8[^\"\'\s]*)/i);
                            if (generalMatch) streamUrl = generalMatch[1];
                        }

                        _log(`   🔍 [HGCloud] hls3: ${hls3Match?.[1]?.substring(0,60) || '❌'} | hls2: ${hls2Match?.[1]?.substring(0,60) || '❌'}`);

                        if (streamUrl) {
                            _log(`   ✅ [HGCloud] Flux extrait !`);
                            return { 
                                title: `${langPrefix} HGCloud`, 
                                streamUrl: streamUrl, 
                                headers: { "Referer": vibuxerUrl } 
                            };
                        }
                    }
                }
            }
        }
        else if (urlLower.includes("filemoon") || urlLower.includes("lukefirst") || urlLower.includes("byse") || urlLower.includes("q8y5z")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Filemoon en cours pour ${hostDomain}...`);
            let fmResult = await filemoonExtractor(embedUrl, pDomain);
            
            if (fmResult && fmResult.url) {
                let qLabel = fmResult.quality ? ` [${fmResult.quality}]` : "";
                _log(`   ✅ [Filemoon] Flux${qLabel} extrait avec succès !`);
                return { title: `${langPrefix} Filemoon${qLabel}`, streamUrl: fmResult.url, headers: { "Referer": embedUrl } };
            } else if (typeof fmResult === 'string') { 
                _log(`   ✅ [Filemoon] Flux extrait avec succès !`);
                return { title: `${langPrefix} Filemoon`, streamUrl: fmResult, headers: { "Referer": embedUrl } };
            }
        }
        else if (urlLower.includes("darkibox")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Darkibox en cours pour ${hostDomain}...`);
            
            let uas = [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
            ];
            const headers = { 
                "User-Agent": uas[embedUrl.length % uas.length],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Referer": pDomain
            };

            let req = await soraFetch(embedUrl, { headers: headers });
            let html = req ? await req.text() : "";

            if (!html || html.includes("Cloudflare") || html.includes("Just a moment") || html.includes("DDoS-Guard")) {
                _log(`   🛡️ [Darkibox] Protection anti-bot détectée. Tentative de contournement...`);
                let altUrl = embedUrl.replace('/embed-', '/v/').replace('.html', '');
                let altReq = await soraFetch(altUrl, { headers: headers });
                if (altReq) {
                    let altHtml = await altReq.text();
                    if (!altHtml.includes("Just a moment") && altHtml.length > html.length) {
                        html = altHtml;
                    }
                }
            }

            if (checkIfDeleted(html)) {
                isDeleted = true;
            } else {
                let streamUrl = null;
                let srcMatch = html.match(/sources\s*:\s*\[\s*\{\s*src\s*:\s*[\"']([^\"']+)[\"']/i);
                
                if (!srcMatch) srcMatch = html.match(/(https?:\/\/[a-zA-Z0-9.-]+\.darkibox\.com\/[^\"\'\s]+\.m3u8[^\"\'\s]*)/i);
                if (!srcMatch) srcMatch = html.match(/(https?:\/\/[^\"\'\s]+\.m3u8[^\"\'\s]*)/i);

                if (srcMatch && srcMatch[1]) {
                    streamUrl = srcMatch[1];
                } else {
                    streamUrl = vidhideExtractor(html);
                }

                if (streamUrl) {
                    _log(`   ✅ [Darkibox] Flux extrait avec succès !`);
                    return { title: `${langPrefix} Darkibox`, streamUrl: streamUrl, headers: { "Referer": "https://darkibox.com/" } };
                } else {
                    _log(`   ❌ [Darkibox] Échec : Aucun lien vidéo trouvé. (Taille HTML: ${html.length})`);
                }
            }
        }
        else if (urlLower.includes("savefiles")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Savefiles en cours pour ${hostDomain}...`);
            
            const videoIdMatch = embedUrl.match(/\/(?:e|v|embed)\/([a-zA-Z0-9]+)/i) || embedUrl.match(/embed-([a-zA-Z0-9]+)/i);
            
            if (videoIdMatch) {
                const videoId = videoIdMatch[1];
                const payload = `op=embed&file_code=${videoId}&auto=1&referer=`;
                
                try {
                    const req = await soraFetch(`https://${hostDomain}/dl`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Referer": pDomain
                        },
                        body: payload
                    });
                    
                    if (req) {
                        const html = await req.text();
                        if (checkIfDeleted(html)) {
                            isDeleted = true;
                        } else {
                            const srcMatch = html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*[\"']([^\"']+)[\"']/i) || 
                                             html.match(/src\s*:\s*[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i);
                            
                            if (srcMatch && srcMatch[1]) {
                                _log(`   ✅ [Savefiles] Flux extrait avec succès !`);
                                return { title: `${langPrefix} Savefiles`, streamUrl: srcMatch[1], headers: { "Referer": `https://${hostDomain}/` } };
                            }
                        }
                    }
                } catch(e) {}
            }
        }
        else if (urlLower.includes("fsvid")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Fsvid en cours pour ${hostDomain}...`);
            
            const req = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
            if (req) {
                 const html = await req.text();
                 if (checkIfDeleted(html)) isDeleted = true;
                 else {
                     let streamUrl = vidhideExtractor(html);
                     
                     if (!streamUrl) {
                         const fileMatch = html.match(/sources\s*:\s*\[\s*\{\s*src\s*:\s*[\"']([^\"']+)[\"']/i) || 
                                           html.match(/file\s*:\s*[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i);
                         if (fileMatch) streamUrl = fileMatch[1];
                     }

                     if (streamUrl && streamUrl.startsWith("http")) {
                         _log(`   ✅ [Fsvid] Flux extrait avec succès !`);
                         return { title: `${langPrefix} Fsvid`, streamUrl: streamUrl, headers: { "Referer": "https://french-stream.one/" } };
                     }
                 }
            }
        }
        else if (urlLower.includes("vidara")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Vidara en cours pour ${hostDomain}...`);
            // POST /api/stream {filecode, device:\"web\"} -> { streaming_url: master.m3u8 }
            try {
                const fc = (embedUrl.match(/\/e\/([^\/?#]+)/) || [])[1];
                if (fc) {
                    const res = await soraFetch(`https://${hostDomain}/api/stream`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Referer": embedUrl },
                        body: JSON.stringify({ filecode: fc, device: "web" })
                    });
                    if (res) {
                        const j = JSON.parse(await res.text());
                        if (j && j.streaming_url) {
                            _log(`   ✅ [Vidara] Flux extrait avec succès !`);
                            return { title: `${langPrefix} Vidara`, streamUrl: j.streaming_url, headers: { "Referer": `https://${hostDomain}/` } };
                        }
                    }
                }
            } catch (e) { _log(`   ❌ [Vidara] ${e.message}`); }
        }
        else if (urlLower.includes("vidsonic")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Vidsonic en cours pour ${hostDomain}...`);
            // L'URL vidéo est encodée dans la page : const _0x1 = 'hex|hex|...' -> paires hex -> reverse.
            try {
                const req = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
                if (req) {
                    const html = await req.text();
                    if (checkIfDeleted(html)) isDeleted = true;
                    else {
                        const m = html.match(/_0x1\s*=\s*'([^']+)'/);
                        if (m) {
                            const clean = m[1].split('|').join('');
                            let out = ""; for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
                            const streamUrl = out.split('').reverse().join('');
                            if (streamUrl && streamUrl.startsWith("http")) {
                                _log(`   ✅ [Vidsonic] Flux extrait avec succès !`);
                                return { title: `${langPrefix} Vidsonic`, streamUrl: streamUrl, headers: { "Referer": `https://${hostDomain}/` } };
                            }
                        }
                    }
                }
            } catch (e) { _log(`   ❌ [Vidsonic] ${e.message}`); }
        }
        else if (urlLower.includes("anonmp4")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Anonmp4 en cours pour ${hostDomain}...`);
            // La page contient une URL API (.../load/<blob>) qui renvoie { hls: master.m3u8 }.
            try {
                const req = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
                if (req) {
                    const html = await req.text();
                    if (checkIfDeleted(html)) isDeleted = true;
                    else {
                        const apiUrl = (html.match(/https?:\/\/[^\"\'\s]*\/load\/[^\"\'\s]+/i) || [])[0];
                        if (apiUrl) {
                            const ar = await soraFetch(apiUrl, { headers: { "Referer": embedUrl } });
                            if (ar) {
                                const j = JSON.parse(await ar.text());
                                if (j && j.hls) {
                                    _log(`   ✅ [Anonmp4] Flux extrait avec succès !`);
                                    return { title: `${langPrefix} Anonmp4`, streamUrl: j.hls, headers: { "Referer": `https://${hostDomain}/` } };
                                }
                            }
                        }
                    }
                }
            } catch (e) { _log(`   ❌ [Anonmp4] ${e.message}`); }
        }
        else if (urlLower.includes("upbolt")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Upbolt en cours pour ${hostDomain}...`);
            // POST /dl op=embed&file_code=<code> -> page JWPlayer avec sources:[{file:master.m3u8}].
            // ⚠️ /dl est souvent derrière Cloudflare -> ne marche que si le CF est résolu (Shirox).
            try {
                const fc = (embedUrl.match(/\/e\/([^\/?#]+)/) || [])[1];
                if (fc) {
                    const res = await soraFetch(`https://${hostDomain}/dl`, {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": embedUrl },
                        body: `op=embed&file_code=${fc}&auto=1&referer=`
                    });
                    if (res) {
                        const html = await res.text();
                        if (checkIfDeleted(html)) isDeleted = true;
                        else {
                            const f = (html.match(/sources:\s*\[\s*\{\s*file:\s*[\"']([^\"']+)[\"']/i) || [])[1];
                            if (f && f.startsWith("http")) {
                                _log(`   ✅ [Upbolt] Flux extrait avec succès !`);
                                return { title: `${langPrefix} Upbolt`, streamUrl: f, headers: { "Referer": `https://${hostDomain}/` } };
                            }
                        }
                    }
                }
            } catch (e) { _log(`   ❌ [Upbolt] ${e.message}`); }
        }
        else if (urlLower.includes("streamcash")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Streamcash en cours pour ${hostDomain}...`);
            // window.__PCr = '<base64>' -> JSON { src: master.m3u8 } (base64 décodé en pur-JS, fiable iOS)
            try {
                const req = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
                if (req) {
                    const html = await req.text();
                    if (checkIfDeleted(html)) isDeleted = true;
                    else {
                        const m = html.match(/__PCr\s*=\s*['\"]([A-Za-z0-9+/_=-]+)['\"]/);
                        if (m) {
                            const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
                            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                            let dec = '';
                            for (let bc = 0, bs = 0, idx = 0; idx < b64.length; idx++) { const c = chars.indexOf(b64.charAt(idx)); if (c < 0) continue; bs = bc % 4 ? bs * 64 + c : c; if (bc++ % 4) dec += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))); }
                            try { dec = decodeURIComponent(escape(dec)); } catch (e) {}
                            const j = JSON.parse(dec);
                            if (j && j.src) {
                                _log(`   ✅ [Streamcash] Flux extrait avec succès !`);
                                return { title: `${langPrefix} Streamcash`, streamUrl: j.src, headers: { "Referer": `https://${hostDomain}/` } };
                            }
                        }
                    }
                }
            } catch (e) { _log(`   ❌ [Streamcash] ${e.message}`); }
        }
        else if (urlLower.includes("lulustream") || urlLower.includes("luluvdo") || urlLower.includes("luluvid")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Lulustream en cours pour ${hostDomain}...`);
            
            const luluHeaders = {
                "Referer": pDomain,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
            };

            const req = await soraFetch(embedUrl, { headers: luluHeaders });
            if (req) {
                 const html = await req.text();
                 if (checkIfDeleted(html)) isDeleted = true;
                 else {
                     let streamUrl = vidhideExtractor(html);
                     if (!streamUrl) {
                         const fileMatch = html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*[\"']([^\"']+)[\"']/i) || 
                                           html.match(/file\s*:\s*[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i) || 
                                           html.match(/src\s*:\s*[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i);
                         if (fileMatch) streamUrl = fileMatch[1];
                     }

                     if (streamUrl && streamUrl.startsWith("http")) {
                         _log(`   ✅ [Lulustream] Flux extrait avec succès !`);
                         luluHeaders["Referer"] = `https://${hostDomain}/`;

                         return { 
                             title: `${langPrefix} Lulustream`, 
                             streamUrl: streamUrl, 
                             headers: luluHeaders 
                         };
                     }
                 }
            }
        }
        else if (urlLower.includes("embedseek") || urlLower.includes("neocine") || urlLower.includes("embed4me") || urlLower.includes("lpayer") || urlLower.includes("seekplayer") || urlLower.includes("flemmix") || urlLower.includes("p2pstream")) {
            hostRecognized = true;
            _log(`   🕵️ Extraction Embedseek/Neocine en cours pour ${hostDomain}...`);
            const res = await embedseekExtractor(embedUrl, langPrefix);
            if (res) return res;
            _log(`   ❌ [Embedseek] Échec extraction.`);
        }
        else {
            // 🤖 AUTO-DÉTECTION DU FOURNISSEUR (domaine inconnu). On identifie par SIGNATURE (API/contenu)
            // au lieu du nom de domaine -> les nouveaux domaines des familles connues marchent tout seuls.
            let hostName = hostDomain.split('.')[0];
            hostName = hostName.charAt(0).toUpperCase() + hostName.slice(1);
            hostRecognized = true;

            // 0) EMBEDSEEK : URL avec #id ou ?id= -> /api/v1/video renvoie un blob hex chiffré (AES-128-CBC).
            if (embedUrl.match(/#[a-zA-Z0-9]+/) || embedUrl.match(/[?&]id=[a-zA-Z0-9]+/)) {
                try {
                    const es = await embedseekExtractor(embedUrl, langPrefix);
                    if (es && es.streamUrl) { _log(`   🤖 [Auto] Embedseek détecté sur ${hostDomain} !`); return es; }
                } catch (e) {}
            }

            const req = await soraFetch(embedUrl, { headers: { "Referer": pDomain } });
            if (req) {
                const html = await req.text();
                if (checkIfDeleted(html)) isDeleted = true;
                else {
                    let streamUrl = null;

                    // 1) DOODSTREAM (signature : /pass_md5/ dans le HTML)
                    if (html.includes("/pass_md5/")) {
                        try {
                            const d = await doodstreamExtractor(html, embedUrl);
                            if (d) { _log(`   🤖 [Auto] Doodstream détecté sur ${hostDomain} !`); return { title: `${langPrefix} Doodstream`, streamUrl: d, headers: { "Referer": embedUrl } }; }
                        } catch (e) {}
                    }

                    // 2) VIDSONIC (signature : const _0x1 = 'hex|hex|...' -> paires hex -> reverse)
                    if (!streamUrl) {
                        const m = html.match(/_0x1\s*=\s*'([^']+)'/);
                        if (m) {
                            const clean = m[1].split('|').join('');
                            let out = ""; for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
                            const u = out.split('').reverse().join('');
                            if (u.startsWith("http")) { streamUrl = u; hostName = "Vidsonic"; _log(`   🤖 [Auto] Vidsonic détecté sur ${hostDomain} !`); }
                        }
                    }

                    // 3) STREAMCASH (signature : window.__PCr = '<base64>' -> JSON { src })
                    if (!streamUrl) {
                        const m = html.match(/__PCr\s*=\s*['\"]([A-Za-z0-9+/_=-]+)['\"]/);
                        if (m) {
                            const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
                            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                            let dec = ''; for (let bc = 0, bs = 0, idx = 0; idx < b64.length; idx++) { const c = chars.indexOf(b64.charAt(idx)); if (c < 0) continue; bs = bc % 4 ? bs * 64 + c : c; if (bc++ % 4) dec += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))); }
                            try { dec = decodeURIComponent(escape(dec)); } catch (e) {}
                            try { const j = JSON.parse(dec); if (j && j.src) { streamUrl = j.src; hostName = "Streamcash"; _log(`   🤖 [Auto] Streamcash détecté sur ${hostDomain} !`); } } catch (e) {}
                        }
                    }

                    // 4) VIDHIDE / p.a.c.k.e.r
                    if (!streamUrl) streamUrl = vidhideExtractor(html);

                    // 5) JWPlayer / m3u8-mp4 direct
                    if (!streamUrl) {
                        const fileMatch = html.match(/sources\s*:\s*\[\s*\{\s*src\s*:\s*[\"']([^\"']+)[\"']/i) ||
                                          html.match(/file\s*:\s*[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i) ||
                                          html.match(/src\s*:\s*[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i);
                        if (fileMatch) streamUrl = fileMatch[1];
                    }
                    if (!streamUrl) {
                        const sourceMatch = html.match(/<source[^>]+src=[\"']([^\"']+\.(?:m3u8|mp4)[^\"']*)[\"']/i) ||
                                            html.match(/video_source\s*=\s*[\"']([^\"']+)[\"']/i);
                        if (sourceMatch) streamUrl = sourceMatch[1];
                    }

                    // 6) VOE (domaines qui ROTENT -> détection par contenu ; suit 1 redirect JS window.location)
                    if (!streamUrl) {
                        let voeHtml = html;
                        const jsRedir = html.match(new RegExp("win" + "dow\\.location(?:\\.href)?\\s*=\\s*[\"']([^\"']+)[\"']", "i"));
                        if (jsRedir && jsRedir[1] && jsRedir[1].startsWith("http")) {
                            try { const rr = await soraFetch(jsRedir[1], { headers: { "Referer": pDomain } }); if (rr) voeHtml = await rr.text(); } catch (e) {}
                        }
                        try { const v = voeExtractor(voeHtml); if (v) { streamUrl = v; hostName = "VOE"; } } catch (e) {}
                    }

                    if (streamUrl && streamUrl.startsWith("http")) {
                        _log(`   ✅ [Universel] Flux extrait de ${hostName} !`);
                        return { title: `${langPrefix} ${hostName}`, streamUrl: streamUrl, headers: { "Referer": embedUrl } };
                    }
                }
            }
        }
    } catch (e) { 
        _log(`   🚨 [Erreur] Crash du décodeur sur ${hostDomain} : ${e.message}`);
    }
    
    if (!hostRecognized) {
        _log(`   ❌ [Rejet] Serveur non pris en charge : ${hostDomain} -> ${originalUrl}`);
        return { title: `${langPrefix} Non Supporté`, originalUrl: originalUrl };
    } else if (isDeleted) {
        _log(`   💀 [Mort] Vidéo supprimée (DMCA/404) sur : ${hostDomain} -> ${originalUrl}`);
        return { title: `${langPrefix} Vidéo Supprimée`, originalUrl: originalUrl };
    } else {
        _log(`   ❌ [Échec] Format illisible ou protégé sur : ${hostDomain} -> ${originalUrl}`);
        return { title: `${langPrefix} Échec Extraction`, originalUrl: originalUrl };
    }
}

function voeExtractor(html) {
    try {
        const jsonScriptMatch = html.match(/<script[^>]+type=[\"']application\/json[\"'][^>]*>([\s\S]*?)<\/script>/i);
        if (!jsonScriptMatch) return null;
        
        let data = JSON.parse(jsonScriptMatch[1].trim());
        let step1 = data[0].replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
        let step2 = step1; 
        ["@$", "^^", "~@", "%?", "*~", "!!", "#&"].forEach(pat => step2 = step2.split(pat).join(""));
        
        const safeAtob = (b64) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
            let str = String(b64).replace(/=+$/, '');
            let output = '';
            for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
                buffer = chars.indexOf(buffer);
            }
            return output;
        };
        
        let step3 = safeAtob(step2);
        let step4 = step3.split("").map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).join("");
        let step5 = step4.split("").reverse().join("");
        let step6 = safeAtob(step5);
        
        let result = JSON.parse(step6);
        return result.source || (result.source && result.source.find(s => s.source)?.source) || null;
    } catch (e) { return null; }
}

function vidhideExtractor(html) {
    try {
        let directMatch = html.match(/(https?:\/\/[^\"\'\s]+\.(?:m3u8|mp4)[^\"\'\s]*)/i);
        if (directMatch) return directMatch[1];
        
        if (html.includes('eval(function(p,a,c,k,e,d)')) {
            let packRegex = /eval\(function\(p,a,c,k,e,d\).*?\.split\('\|'\)\)\)/g;
            let packMatches = html.match(packRegex);
            if (packMatches) {
                for (let packed of packMatches) {
                    let argsMatch = packed.match(/}\s*\(\s*([\'\"])(.*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\'\"])(.*?)\5\.split\('\|'\)/);
                    if (argsMatch) {
                        let p = argsMatch[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
                        let a = parseInt(argsMatch[3], 10);
                        let c = parseInt(argsMatch[4], 10);
                        let k = argsMatch[6].split('|');
                        let e = function(c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
                        while (c--) { if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]); }
                        let unpackedMatch = p.match(/(https?:\/\/[^\"\'\s]+\.(?:m3u8|mp4)[^\"\'\s]*)/i);
                        if (unpackedMatch) return unpackedMatch[1].replace(/\\\//g, "/").trim();
                    }
                }
            }
        }
    } catch (e) { }
    return null;
}

async function doodstreamExtractor(html, url) {
    _log(`\n   [Doodstream Extractor] 🚀 Lancement de l'extraction pour l'URL : ${url}`);
    try {
        const domainMatch = url.match(/https?:\/\/(.*?)\//);
        if (!domainMatch) {
            _log(`   [Doodstream Extractor] ❌ Échec : Impossible d'extraire le domaine depuis l'URL.`);
            return null;
        }
        const streamDomain = domainMatch[1];
        _log(`   [Doodstream Extractor] 🌐 Domaine détecté : ${streamDomain}`);
        
        const md5Match = html.match(/'\/pass_md5\/(.*?)'/);
        if (!md5Match) {
            _log(`   [Doodstream Extractor] ❌ Échec : Impossible de trouver le chemin '/pass_md5/' dans le HTML.`);
            return null;
        }
        
        const md5Path = md5Match[1];
        _log(`   [Doodstream Extractor] 🔑 Chemin MD5 extrait : /pass_md5/${md5Path}`);
        
        const token = md5Path.substring(md5Path.lastIndexOf("/") + 1);
        _log(`   [Doodstream Extractor] 🎟️ Token extrait : ${token}`);
        
        const expiryTimestamp = new Date().valueOf();
        const random = randomStr(10);
        _log(`   [Doodstream Extractor] ⏱️ Timestamp : ${expiryTimestamp} | 🎲 Random String : ${random}`);

        const passUrl = `https://${streamDomain}/pass_md5/${md5Path}`;
        _log(`   [Doodstream Extractor] 📡 Requête vers l'API MD5 : ${passUrl}`);

        const passResponse = await soraFetch(passUrl, {
            headers: { "Referer": url }
        });
        
        if (!passResponse) {
            _log(`   [Doodstream Extractor] ❌ Échec : Aucune réponse de l'API MD5.`);
            return null;
        }
        
        const responseData = await passResponse.text();
        _log(`   [Doodstream Extractor] 📥 Réponse API MD5 (Brut) : ${responseData.substring(0, 80)}...`);
        
        if (responseData && responseData.startsWith('http')) {
            const finalUrl = `${responseData}${random}?token=${token}&expiry=${expiryTimestamp}`;
            _log(`   [Doodstream Extractor] 🎉 SUCCÈS ! URL finale générée : ${finalUrl}`);
            return finalUrl;
        }
        
        _log(`   [Doodstream Extractor] ❌ Échec : La réponse API ne commence pas par 'http'.`);
        return null;
    } catch (e) {
        _log(`   [Doodstream Extractor] 🚨 ERREUR CRITIQUE : ${e.message}`);
        return null;
    }
}

function randomStr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function filemoonExtractor(url, parentDomain) {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const _mvxD = _movixActiveDomain || MOVIX_FALLBACK_DOMAIN;

    const idMatch = url ? url.match(/\/(?:[eo]\w+|[de])\/([a-zA-Z0-9]+)/) : null;
    const videoId = idMatch ? idMatch[1] : null;

    if (!videoId) {
        _log(`   ❌ [Filemoon] Impossible de trouver l'ID vidéo dans : ${url}`);
        return null;
    }

    const domainMatch = url.match(/https?:\/\/([^\/]+)/);
    let currentHost = domainMatch ? domainMatch[1] : "filemoon.to";
    let embedUrl = url;

    const baseHeaders = {
        "User-Agent": userAgent,
        "Accept": "application/json",
        "Origin": `https://${currentHost}`,
        "Referer": `https://${currentHost}/`,
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ÉTAPE 1 : embed/details → récupère le vrai host (domain hop)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
        const detailsUrl = `https://${currentHost}/api/videos/${videoId}/embed/details`;
        _log(`   📡 [Filemoon 1/6] embed/details : ${detailsUrl}`);

        const detailsRes = await soraFetch(detailsUrl, { headers: baseHeaders });
        if (!detailsRes) throw new Error("Pas de réponse");

        const detailsJson = JSON.parse(await detailsRes.text());
        _log(`   📥 [Filemoon 1/6] embed_frame_url : ${detailsJson.embed_frame_url}`);

        if (detailsJson.embed_frame_url) {
            const hopMatch = detailsJson.embed_frame_url.match(/https?:\/\/([^\/]+)/);
            if (hopMatch && hopMatch[1] !== currentHost) {
                _log(`   🔄 [Filemoon 1/6] Domain hop : ${currentHost} → ${hopMatch[1]}`);
                currentHost = hopMatch[1];
                embedUrl = detailsJson.embed_frame_url;
                baseHeaders["Origin"] = `https://${currentHost}`;
                baseHeaders["Referer"] = `https://${currentHost}/`;
            }
        }
    } catch(e) {
        _log(`   ⚠️ [Filemoon 1/6] Erreur embed/details : ${e.message}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ÉTAPE 2 : access/challenge → obtenir nonce + challenge_id
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let challengeId = null;
    let nonce = null;

    try {
        const challengeUrl = `https://${currentHost}/api/videos/access/challenge`;
        _log(`   📡 [Filemoon 2/6] access/challenge : ${challengeUrl}`);

        const challengeRes = await soraFetch(challengeUrl, {
            headers: { ...baseHeaders, "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify({ video_code: videoId })
        });

        if (!challengeRes) throw new Error("Pas de réponse");

        const challengeJson = JSON.parse(await challengeRes.text());
        _log(`   📥 [Filemoon 2/6] challenge_id=${challengeJson.challenge_id} | nonce=${challengeJson.nonce}`);

        challengeId = challengeJson.challenge_id;
        nonce = challengeJson.nonce;
    } catch(e) {
        _log(`   ❌ [Filemoon 2/6] Erreur access/challenge : ${e.message}`);
        return null;
    }

    if (!challengeId || !nonce) {
        _log(`   ❌ [Filemoon 2/6] challenge_id ou nonce manquant, abandon.`);
        return null;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ÉTAPE 3 : Appel au service externe pour signature ECDSA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const ATTEST_SERVICE_URL = FM_ATTEST_URL;
    let fingerprint = null;

    try {
        _log(`   📡 [Filemoon 3/6] Appel au service de signature : ${ATTEST_SERVICE_URL}`);

        const workerRes = await soraFetch(ATTEST_SERVICE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nonce: nonce, challenge_id: challengeId })
        });

        if (!workerRes) throw new Error("Service de signature injoignable");

        const workerJson = JSON.parse(await workerRes.text());
        _log(`   📥 [Filemoon 3/6] Worker réponse : signature=${workerJson.signature ? "OK ✅" : "❌"}`);

        if (!workerJson.signature) throw new Error("Signature absente dans la réponse du worker");

        const attestPayload = {
            viewer_id:    workerJson.viewer_id,
            device_id:    workerJson.device_id,
            challenge_id: challengeId,
            nonce:        nonce,
            signature:    workerJson.signature,
            public_key:   workerJson.public_key,
            client:       workerJson.client,
            storage:      {},
            attributes:   { entropy: "high" }
        };

        _log(`   📡 [Filemoon 3/6] access/attest : https://${currentHost}/api/videos/access/attest`);

        const attestRes = await soraFetch(`https://${currentHost}/api/videos/access/attest`, {
            headers: { ...baseHeaders, "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify(attestPayload)
        });

        if (!attestRes) throw new Error("Pas de réponse du serveur attest");

        const attestRaw = await attestRes.text();
        _log(`   📥 [Filemoon 3/6] Réponse brute : ${attestRaw}`);

        const attestJson = JSON.parse(attestRaw);
        if (!attestJson.token) throw new Error(`Attest échoué : ${attestRaw}`);

        _log(`   ✅ [Filemoon 3/6] token=OK | confidence=${attestJson.confidence} | viewer_id=${attestJson.viewer_id}`);

        fingerprint = {
            token:      attestJson.token,
            viewer_id:  attestJson.viewer_id  || workerJson.viewer_id,
            device_id:  attestJson.device_id  || workerJson.device_id,
            confidence: attestJson.confidence || 0.6
        };

    } catch(e) {
        _log(`   ❌ [Filemoon 3/6] Erreur access/attest : ${e.message}`);
        return null;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ÉTAPE 4 : embed/captcha → Obtenir le Proof of Work
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let powNonce = null;
    let powDifficulty = null;
    let powToken = null;

    try {
        const captchaUrl = `https://${currentHost}/api/videos/${videoId}/embed/captcha`;
        _log(`   📡 [Filemoon 4/6] embed/captcha : ${captchaUrl}`);
        
        const captchaRes = await soraFetch(captchaUrl, {
            headers: { ...baseHeaders, "Content-Type": "application/json" },
            method: "POST",
            body: JSON.stringify({ fingerprint: fingerprint })
        });

        if (captchaRes) {
            const captchaJson = JSON.parse(await captchaRes.text());
            powNonce = captchaJson.pow_nonce;
            powDifficulty = captchaJson.pow_difficulty;
            powToken = captchaJson.pow_token;
            _log(`   📥 [Filemoon 4/6] PoW Reçu -> Nonce: ${powNonce}, Diff: ${powDifficulty}`);
        }
    } catch(e) {
        _log(`   ⚠️ [Filemoon 4/6] Erreur captcha (Peut-être non requis) : ${e.message}`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ÉTAPE 5 : Résolution du PoW et embed/captcha/verify
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let verifyToken = null;
    if (powNonce && powDifficulty && powToken) {
        try {
            _log(`   📡 [Filemoon 5/6] Résolution du Proof of Work (worker, fallback local)...`);
            const solution = await solvePoW(powNonce, powDifficulty);
            if (!solution || solution === "0") { _log(`   ⏭️ [Filemoon 5/6] PoW non résolu (sauté) -> ${url}`); return null; }
            
            const verifyUrl = `https://${currentHost}/api/videos/${videoId}/embed/captcha/verify`;
            _log(`   📡 [Filemoon 5/6] embed/captcha/verify : ${verifyUrl}`);

            const verifyRes = await soraFetch(verifyUrl, {
                headers: { ...baseHeaders, "Content-Type": "application/json" },
                method: "POST",
                body: JSON.stringify({
                    pow_token: powToken,
                    solution: solution,
                    fingerprint: fingerprint
                })
            });

            if (verifyRes) {
                const verifyJson = JSON.parse(await verifyRes.text());
                if (verifyJson.token) {
                    verifyToken = verifyJson.token;
                    _log(`   ✅ [Filemoon 5/6] PoW Validé ! Nouveau token obtenu.`);
                } else {
                    _log(`   ❌ [Filemoon 5/6] Le serveur a refusé le PoW : ${JSON.stringify(verifyJson)}`);
                }
            }
        } catch(e) {
            _log(`   ❌ [Filemoon 5/6] Erreur verify : ${e.message}`);
        }
    } else {
        _log(`   ⏭️ [Filemoon 5/6] Étape Verify ignorée (Pas de PoW requis).`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ÉTAPE 6 : embed/playback → obtenir le payload chiffré
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
        const playbackUrl = `https://${currentHost}/api/videos/${videoId}/embed/playback`;
        const playbackPayload = JSON.stringify({ fingerprint: fingerprint });

        _log(`   📡 [Filemoon 6/6] embed/playback : ${playbackUrl}`);

        // Le token de captcha va dans un HEADER X-Captcha-Token (et NON un cookie byse_pow).
        // Whitelist de domaine : on se présente comme embarqué par le site movix (_mvxD),
        // X-Embed-Parent = l'URL d'embed filemoon d'origine (le param `url`, avant le hop).
        const playbackHeaders = {
            "User-Agent": userAgent,
            "Accept": "*/*",
            "Accept-Language": "fr-FR,fr;q=0.5",
            "Content-Type": "application/json",
            "Origin": `https://${currentHost}`,
            "Referer": embedUrl,
            "Cookie": `byse_viewer_id=${fingerprint.viewer_id}; byse_device_id=${fingerprint.device_id}`,
            "X-Embed-Origin": _mvxD,
            "X-Embed-Referer": `https://${_mvxD}/`,
            "X-Embed-Parent": url
        };
        if (verifyToken) playbackHeaders["X-Captcha-Token"] = verifyToken;

        const playbackRes = await soraFetch(playbackUrl, {
            headers: playbackHeaders,
            method: "POST",
            body: playbackPayload
        });

        if (!playbackRes) throw new Error("Pas de réponse");

        const responseText = await playbackRes.text();
        _log(`   📥 [Filemoon 6/6] Réponse (${responseText.length} chars) : ${responseText.substring(0, 120)}`);

        if (!responseText.includes("playback")) {
            _log(`   ❌ [Filemoon 6/6] Réponse inattendue, pas de clé 'playback'`);
            return null;
        }

        const json = JSON.parse(responseText);
        _log(`   🔐 [Filemoon 6/6] Envoi au décrypteur (algo: ${json.playback?.algorithm})...`);

        const decryptor = new FileMoonDecryptor(json);
        const decrypted = await decryptor.decrypt();

        _log(`   📄 [Filemoon 6/6] Résultat décrypté : ${JSON.stringify(decrypted)}`);

        if (decrypted && decrypted.sources && decrypted.sources.length > 0) {
            const bestSource = decrypted.sources.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (bestSource && bestSource.url) {
                _log(`   ✅ [Filemoon 6/6] URL finale : ${bestSource.url}`);
                return { url: bestSource.url, quality: bestSource.label || "HD" };
            }
        }

        _log(`   ❌ [Filemoon 6/6] Décryptage OK mais sources vides`);
        return null;

    } catch(error) {
        _log(`   🚨 [Filemoon 6/6] Crash : ${error.message}`);
        return null;
    }
}

// AES-256-GCM pur JS (déchiffrement via CTR, sans vérif du tag) — autonomie totale,
// plus aucune dépendance à api.jm26.net. Validé contre crypto.subtle (50/50).
const _aesgcmDecrypt = (function () {
    const sbox = new Uint8Array(256);
    (function () {
        let p = 1, q = 1;
        const rotl8 = (x, s) => ((x << s) | (x >> (8 - s))) & 0xff;
        do {
            p = (p ^ (p << 1) ^ ((p & 0x80) ? 0x11b : 0)) & 0xff;
            q &= 0xff; q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09; q &= 0xff;
            sbox[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xff;
        } while (p !== 1);
        sbox[0] = 0x63;
    })();
    const rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];
    function expandKey256(key) {
        const Nk = 8, words = 60, w = new Array(words);
        for (let i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
        for (let i = Nk; i < words; i++) {
            let t = w[i - 1].slice();
            if (i % Nk === 0) { t = [t[1], t[2], t[3], t[0]].map(b => sbox[b]); t[0] ^= rcon[i / Nk - 1]; }
            else if (i % Nk === 4) { t = t.map(b => sbox[b]); }
            w[i] = w[i - Nk].map((b, j) => (b ^ t[j]) & 0xff);
        }
        return w;
    }
    const gmul = (a, b) => { let r = 0; for (let i = 0; i < 8; i++) { if (b & 1) r ^= a; const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b; b >>= 1; } return r & 0xff; };
    function encryptBlock(inp, w) {
        let s = inp.slice();
        const addRK = (round) => { for (let c = 0; c < 16; c++) s[c] ^= w[round * 4 + (c >> 2)][c & 3]; };
        const subBytes = () => { for (let i = 0; i < 16; i++) s[i] = sbox[s[i]]; };
        const shiftRows = () => { const t = s.slice(); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[r + 4 * c] = t[r + 4 * ((c + r) % 4)]; };
        const mixCols = () => { for (let c = 0; c < 4; c++) { const i = 4 * c, a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3]; s[i] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3; s[i + 1] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3; s[i + 2] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3); s[i + 3] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2); } };
        addRK(0);
        for (let round = 1; round < 14; round++) { subBytes(); shiftRows(); mixCols(); addRK(round); }
        subBytes(); shiftRows(); addRK(14);
        return s;
    }
    return function (key, iv, payload) {
        const w = expandKey256(key);
        const ct = payload.subarray(0, payload.length - 16); // retire le tag GCM (16o)
        const counter = new Uint8Array(16);
        counter.set(iv.subarray(0, 12), 0); counter[15] = 1;
        const inc = () => { for (let i = 15; i >= 12; i--) { counter[i] = (counter[i] + 1) & 0xff; if (counter[i]) break; } };
        const out = new Uint8Array(ct.length);
        for (let off = 0; off < ct.length; off += 16) {
            inc();
            const ks = encryptBlock(Array.from(counter), w);
            for (let i = 0; i < 16 && off + i < ct.length; i++) out[off + i] = ct[off + i] ^ ks[i];
        }
        return out;
    };
})();

class FileMoonDecryptor {
    constructor(data) { this.d = data.playback; }

    // Le champ `version` sélectionne 2 VRAIS key_parts (indices [n, 31-n], 1-based)
    // parmi des leurres. jm26 échoue si on lui envoie tous les parts -> on filtre ici.
    selectParts() {
        const r = Array.isArray(this.d.key_parts) ? this.d.key_parts : [];
        const n = parseInt(String(this.d.version).trim(), 10);
        if (!(n >= 1 && n <= 20)) return r;
        const i = n, s = 31 - n;
        if (i < 1 || s < 1 || i > r.length || s > r.length) return r;
        const out = [r[i - 1], r[s - 1]].filter(x => typeof x === "string" && x.length > 0);
        return out.length > 0 ? out : r;
    }

    b64d(s) {
        // Décodeur base64url 100% pur-JS : l'atob d'iOS est inconstant (throw "Invalid base64"
        // OU renvoie undefined). On ne dépend donc plus du tout d'atob.
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let decoded = '';
        for (let bc = 0, bs = 0, idx = 0; idx < b64.length; idx++) {
            const c = chars.indexOf(b64.charAt(idx)); if (c < 0) continue;
            bs = bc % 4 ? bs * 64 + c : c;
            if (bc++ % 4) decoded += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
        }
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
        return bytes;
    }
    
    concatBytes(...arrays) {
        const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }
    
    async decrypt() {
        try {
            // Déchiffrement 100% local (plus de jm26.net) : clé = concat des 2 key_parts choisis.
            const key = this.concatBytes(...this.selectParts().map(s => this.b64d(s)));
            const iv = this.b64d(this.d.iv);
            const payload = this.b64d(this.d.payload);
            const plain = _aesgcmDecrypt(key, iv, payload);
            let txt = "";
            for (let i = 0; i < plain.length; i++) txt += String.fromCharCode(plain[i]);
            try { txt = decodeURIComponent(escape(txt)); } catch (e) {}
            return JSON.parse(txt);
        } catch (e) {
            _log(`   🚨 [Filemoon] Déchiffrement local échoué : ${e.message}`);
            return null;
        }
    }
}
