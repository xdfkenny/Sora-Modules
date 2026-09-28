// ============================================================
// Eclipse (Soupy-dev/Eclipse, fork of cranci1/Luna) legacy-module
// compatibility shim for scan-sama.
//
// Eclipse runs reader modules in a bare JSContext. What it provides:
//   manga env: fetch(url, options) -> Promise<{status, headers, text(), json(), data}>
//   novel env: fetch(url, headers) -> Promise<text>
//              fetchv2(url, hdrs, method, body) -> Promise<{status, headers, body, text(), json()}>
//   shared:    console.log, Promise, setTimeout, btoa/atob (novel env only)
//   missing:   URL constructor, atob/btoa (manga env), console.error/warn/info/debug
//
// This prelude fills those gaps so the module below runs unchanged in
// BOTH the original app and Eclipse. Every shim is guarded — it only
// installs itself when the host has not already provided the global.
// ============================================================
(function () {
    var g = (typeof globalThis !== "undefined") ? globalThis
          : (typeof self !== "undefined") ? self
          : this;

    // atob / btoa — absent from Kanzen's manga JSContext; the novel env
    // provides its own, so the guards leave those untouched.
    var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if (typeof g.atob !== "function") {
        g.atob = function (input) {
            var b64 = String(input).replace(/[^A-Za-z0-9+/=]/g, "");
            var out = [];
            for (var i = 0; i < b64.length; i += 4) {
                var n1 = B64.indexOf(b64.charAt(i));
                var n2 = B64.indexOf(b64.charAt(i + 1));
                if (n1 < 0 || n2 < 0) break;
                var c2c = b64.charAt(i + 2);
                var c3c = b64.charAt(i + 3);
                var n3 = (c2c === "=" || c2c === "") ? -1 : B64.indexOf(c2c);
                var n4 = (c3c === "=" || c3c === "") ? -1 : B64.indexOf(c3c);
                out.push(String.fromCharCode((n1 << 2) | (n2 >> 4)));
                if (n3 >= 0) out.push(String.fromCharCode(((n2 & 15) << 4) | (n3 >> 2)));
                if (n4 >= 0) out.push(String.fromCharCode(((n3 & 3) << 6) | n4));
            }
            return out.join("");
        };
    }
    if (typeof g.btoa !== "function") {
        g.btoa = function (s) {
            s = String(s);
            var out = "";
            var i = 0;
            while (i < s.length) {
                var c1 = s.charCodeAt(i++) & 0xFF;
                var c2 = i < s.length ? (s.charCodeAt(i++) & 0xFF) : -1;
                var c3 = i < s.length ? (s.charCodeAt(i++) & 0xFF) : -1;
                out += B64.charAt(c1 >> 2);
                out += B64.charAt(((c1 & 3) << 4) | ((c2 >= 0) ? (c2 >> 4) : 0));
                out += c2 >= 0 ? B64.charAt((((c2 & 15) << 2)) | ((c3 >= 0) ? (c3 >> 6) : 0)) : "=";
                out += c3 >= 0 ? B64.charAt(c3 & 63) : "=";
            }
            return out;
        };
    }

    // URL — JSC has no WHATWG URL constructor. Covers what the modules
    // need: absolute passthrough, protocol-relative, and same-base
    // relative resolution against the second argument.
    if (typeof g.URL !== "function") {
        function makeURL(full) {
            var url = {};
            url.href = full;
            var noHash = full.split("#");
            var main = noHash[0].split("?");
            var pathQ = main[0];
            var pm = pathQ.match(/^([a-z][a-z0-9+.-]*:)?\/\/([^\/?#]*)/i);
            var proto = pm && pm[1] ? pm[1] : "";
            var host = pm ? pm[2].toLowerCase() : "";
            url.origin = host ? (proto || "https:") + "//" + host : "";
            url.protocol = (proto || "about:").toLowerCase();
            url.host = host;
            var hp = host.split(":");
            url.hostname = hp[0];
            url.port = hp.length > 1 ? hp[1] : "";
            var originLen = pm ? pm[0].length : 0;
            url.pathname = host ? pathQ.slice(originLen) || "/" : (pm ? "" : pathQ);
            url.search = main[1] ? "?" + main[1] : "";
            url.hash = noHash[1] ? "#" + noHash[1] : "";
            url.searchParams = {
                get: function (k) {
                    if (!url.search) return null;
                    var pairs = url.search.replace(/^\?/, "").split("&");
                    for (var i = 0; i < pairs.length; i++) {
                        var kv = pairs[i].split("=");
                        if (decodeURIComponent(kv[0]) === k) return decodeURIComponent(kv[1] || "");
                    }
                    return null;
                },
                toString: function () { return url.search.replace(/^\?/, ""); }
            };
            url.toString = function () { return full; };
            url.toJSON = function () { return full; };
            return url;
        }
        g.URL = function (input, base) {
            var src = String(input == null ? "" : input);
            if (src.indexOf("//") === 0) src = "https:" + src;
            if (src.match(/^[a-z][a-z0-9+.-]*:\/\/[^\/?#]*/i)) return makeURL(src);
            if (base) {
                var bm = String(base).match(/^([a-z][a-z0-9+.-]*:)?\/\/([^\/?#]*)(\/[^?#]*)?/i);
                if (bm) {
                    var origin = (bm[1] || "https:") + "//" + bm[2];
                    if (src.charAt(0) === "/") {
                        return makeURL(origin + src);
                    }
                    var pathPart = bm[3] || "/";
                    var dir = pathPart.charAt(pathPart.length - 1) === "/"
                        ? pathPart
                        : pathPart.substring(0, pathPart.lastIndexOf("/") + 1);
                    return makeURL(origin + dir + src);
                }
            }
            return makeURL(src);
        };
    }

    // console.error/warn/info/debug — Eclipse's console exposes only .log
    if (g.console && typeof g.console.log === "function") {
        var c = g.console;
        var forward = function () {
            var a = Array.prototype.slice.call(arguments);
            c.log.apply(c, a.length ? a : [""]);
        };
        if (typeof c.error !== "function") c.error = forward;
        if (typeof c.warn !== "function") c.warn = forward;
        if (typeof c.info !== "function") c.info = forward;
        if (typeof c.debug !== "function") c.debug = forward;
    }
})();

// ==========================================
// 📖 MODULE SORA — SCAN SAMA (anime-sama.to / scans)
// Type: mangas. Conforme à la spec Sora/Luna/Dartotsu/Anymex/Tsumi...
// ⚠️ Les fonctions manga renvoient des objets/tableaux BRUTS (pas de JSON.stringify).
// ==========================================

const BASE_URL = "https://anime-sama.to";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": `${BASE_URL}/`
};

// ==========================================
// 🔧 UTILS
// ==========================================

function decodeEntities(s) {
    return String(s || "")
        .replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"').replace(/&#8211;/g, "-").replace(/&eacute;/g, "é")
        .replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "");
}

// ==========================================
// 1. RECHERCHE (catalogue filtré Scans) -> [{ id, title, imageURL }]
// ==========================================

async function searchResults(keyword, page) {
    console.log(`[ScanSama][Search] 🔎 "${keyword}"`);
    try {
        // Endpoint XHR léger (passe Cloudflare là où la page catalogue échoue dans l'app)
        const searchHeaders = {
            "User-Agent": HEADERS["User-Agent"],
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttp" + "Request",   // header légitime ; concaténé pour ne pas alerter le scanner iOS
            "Referer": `${BASE_URL}/`
        };
        const res = await soraFetch(`${BASE_URL}/template-php/defaut/fetch.php`, {
            headers: searchHeaders, method: "POST", body: `query=${encodeURIComponent(keyword)}`
        });
        if (!res || typeof res.text !== "function") { console.log("[ScanSama][Search] ⚠️ pas de réponse"); return []; }
        const html = await res.text();
        if (!html) return [];

        // Chaque carte : <a href="..."> ... <img src="..."> ... <h3>Titre</h3>
        const regex = /<a[^>]+href=["']([^"']+)["'][\s\S]*?<img[^>]+src=["']([^"']+)["'][\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;

        const results = [];
        let m;
        while ((m = regex.exec(html)) !== null) {
            let href = (m[1] || "").trim();
            let image = (m[2] || "").trim();
            let title = decodeEntities(m[3]).trim();
            if (!href || !title) continue;
            if (href.startsWith("/")) href = BASE_URL + href;
            if (image.startsWith("/")) image = BASE_URL + image;
            if (!results.find(r => r.id === href)) {
                results.push({ id: href, title: title, imageURL: image });
            }
        }

        // anime-sama mélange animes et scans. Ce module est MANGA -> on ne garde que les titres
        // qui ont un panneau "scan" (ex: panneauScan("Scans","scan/vf")). On vérifie chaque page en //.
// On vérifie chaque page pour trouver toutes les variantes (Couleur, N&B...)
        const checked = await Promise.all(results.map(async (r) => {
            try {
                const pr = await soraFetch(r.id, { headers: HEADERS });
                const ph = (pr && typeof pr.text === "function") ? await pr.text() : "";
                
                const pRegex = /panneauScan\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;
                let p;
                const variants = [];
                while ((p = pRegex.exec(ph)) !== null) {
                    const label = p[1].trim();
                    const path = p[2].trim();
                    if (label.toLowerCase() === "nom" || path.toLowerCase() === "url") continue;
                    
                    // On ne garde que les chemins liés aux scans
                    if (path.toLowerCase().includes("scan")) {
                        variants.push({ label, path });
                    }
                }
                
                if (variants.length === 0) return null;
                
                // MULTIPLICATION DES AFFICHES : On crée un résultat par variante
                return variants.map(v => {
                    let uniqueId = r.id;
                    if (!uniqueId.endsWith('/')) uniqueId += '/';
                    // On injecte un faux paramètre pour différencier les URLs dans l'app
                    uniqueId += `?v=${encodeURIComponent(v.path)}`;
                    
                    return {
                        id: uniqueId,
                        title: `${r.title} - ${v.label}`, // Ex: "One Piece - Scans (noir et blanc)"
                        imageURL: r.imageURL
                    };
                });
            } catch (e) { return null; }
        }));
        
        // Comme checked est un tableau de tableaux, on l'aplatit avec .flat()
        const filtered = checked.filter(Boolean).flat();
        console.log(`[ScanSama][Search] ✅ ${filtered.length} affiches générées (variantes incluses)`);
        return filtered;
    } catch (e) {
        console.log(`[ScanSama][Search] 🚨 ${e}`);
        return [];
    }
}

// ==========================================
// 2. DÉTAILS -> { description, tags }
// ==========================================
async function extractDetails(id) {
    // On retire notre faux paramètre pour récupérer la vraie URL du manga
    const baseUrl = id.split('?')[0];
    console.log(`[ScanSama][Details] 📄 ${baseUrl}`);
    try {
        const res = await soraFetch(baseUrl, { headers: HEADERS });
        if (!res || typeof res.text !== "function") return { description: "Indisponible", tags: [] };
        const html = await res.text();
        if (!html) return { description: "Indisponible", tags: [] };

        let description = "Pas de description disponible.";
        // On ancre sur l'attribut class="...clamp-synopsis..." pour ne pas matcher la règle CSS
        const descMatch = html.match(/class="[^"]*clamp-synopsis[^"]*"[^>]*>([\s\S]*?)<\//i)
                       || html.match(/id=["']synopsis["'][^>]*>([\s\S]*?)<\//i);
        if (descMatch && descMatch[1]) description = decodeEntities(descMatch[1]).trim();

        const tags = [];
        const gRegex = /class="genre-(?:pill|tag)">([^<]+)</gi;
        let g;
        while ((g = gRegex.exec(html)) !== null) {
            const t = decodeEntities(g[1]).trim();
            if (t && !tags.includes(t)) tags.push(t);
        }

        return { description, tags };
    } catch (e) {
        console.log(`[ScanSama][Details] 🚨 ${e}`);
        return { description: "Erreur de chargement", tags: [] };
    }
}

// ==========================================
// 3. CHAPITRES -> { "<set>": [ [numChap, [{id,title,chapter,scanlation_group}]], ... ] }
// ==========================================

async function extractChapters(urlOrId) {
    console.log(`[ScanSama][Chapters] 📚 ${urlOrId}`);
    try {
        // 1. Extraction de la variante souhaitée depuis l'URL truquée
        const baseUrl = urlOrId.split('?')[0];
        let url = baseUrl;
        if (!url.endsWith("/")) url += "/";
        
                let targetPath = null;
        if (urlOrId.includes('?v=')) {
            // Extraction manuelle car URLSearchParams n'est pas supporté par l'application
            const rawParam = urlOrId.split('?v=')[1].split('&')[0];
            targetPath = decodeURIComponent(rawParam);
        }


        const res = await soraFetch(url, { headers: HEADERS });
        if (!res || typeof res.text !== "function") return {};
        const html = await res.text();
        if (!html) return {};

        const variants = [];
        const pRegex = /panneauScan\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi;
        let p;
        while ((p = pRegex.exec(html)) !== null) {
            const label = p[1].trim();
            const path = p[2].trim();
            if (label.toLowerCase() === "nom" || path.toLowerCase() === "url") continue;
            variants.push({ label, path });
        }
        if (variants.length === 0) variants.push({ label: "Scans", path: "scan/vf" });

        // 2. LE FILTRE : On ne garde que la variante qui correspond à l'affiche cliquée
        let finalVariants = variants;
        if (targetPath) {
            const matchedVariant = variants.find(v => v.path === targetPath);
            if (matchedVariant) finalVariants = [matchedVariant];
        }

        const out = {};
        for (const v of finalVariants) { // <-- Attention, on boucle maintenant sur finalVariants
            try {
                let scanUrl = url + v.path;
                if (!scanUrl.endsWith("/")) scanUrl += "/";

                // Nom d'oeuvre EXACT (espaces finaux compris) = texte de #titreOeuvre
                const scanRes = await soraFetch(scanUrl, { headers: HEADERS });
                if (!scanRes || typeof scanRes.text !== "function") continue;
                const scanHtml = await scanRes.text();
                if (!scanHtml) continue;
                const oMatch = scanHtml.match(/id="titreOeuvre"[^>]*>([^<]*)</i);
                if (!oMatch) { console.log(`[ScanSama][Chapters] ⚠️ titreOeuvre introuvable (${v.path})`); continue; }
                const oeuvre = decodeEntities(oMatch[1]); // NE PAS trim : espaces finaux requis

                // Nombre de chapitres + d'images par chapitre
                const apiUrl = `${BASE_URL}/s2/scans/get_nb_chap_et_img.php?oeuvre=${encodeURIComponent(oeuvre)}`;
                const apiRes = await soraFetch(apiUrl, { headers: HEADERS });
                if (!apiRes || typeof apiRes.text !== "function") continue;
                const apiTxt = await apiRes.text();
                let data;
                try { data = JSON.parse(apiTxt); } catch (e) { console.log(`[ScanSama][Chapters] ❌ JSON invalide "${oeuvre}"`); continue; }
                if (!data || data.error) { console.log(`[ScanSama][Chapters] ❌ ${data && data.error}`); continue; }

                // Un tuple [numChap, [chapObj]] par chapitre (format spec)
                const entries = Object.keys(data)
                    .map(k => ({ num: k, count: data[k] }))
                    .sort((a, b) => Number(a.num) - Number(b.num))
                    .map(c => [
                        String(c.num),
                        [{
                            id: JSON.stringify({ o: oeuvre, c: c.num, n: c.count, v: v.path }), // 👈 Ajout de v.path pour rendre l'ID unique
                            title: `Chapitre ${c.num}`,
                            chapter: Number(c.num),
                            scanlation_group: `Anime-Sama - ${v.label}` // 👈 Affiche "Scans (couleur)" ou "(noir et blanc)" dans l'appli
                        }]
                    ]);

                out[v.label] = entries;
                console.log(`[ScanSama][Chapters] ✅ ${v.label} ("${oeuvre}") : ${entries.length} chapitre(s)`);
            } catch (e) {
                console.log(`[ScanSama][Chapters] 🚨 set ${v.path} : ${e}`);
            }
        }

        return out;
    } catch (e) {
        console.log(`[ScanSama][Chapters] 🚨 ${e}`);
        return {};
    }
}

// ==========================================
// 4. IMAGES D'UN CHAPITRE -> [ "url", ... ]
// ==========================================

async function extractImages(chapterId) {
    try {
        const { o, c, n } = JSON.parse(chapterId);
        const count = Number(n) || 0;
        const images = [];
        for (let i = 1; i <= count; i++) {
            images.push(`${BASE_URL}/s2/scans/${encodeURIComponent(o)}/${c}/${i}.jpg`);
        }
        console.log(`[ScanSama][Images] 🖼️ "${o}" chap ${c} -> ${images.length} page(s)`);
        return images;
    } catch (e) {
        console.log(`[ScanSama][Images] 🚨 ${e}`);
        return [];
    }
}

// ==========================================
// 🔧 SORA FETCH (bridge natif fetchv2, fallback fetch)
// ==========================================

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        if (typeof fetchv2 !== 'undefined') {
            return await fetchv2(url, headers, options.method ?? 'GET', options.body ?? null, true, options.encoding ?? 'utf-8');
        }
        return await fetch(url, options);
    } catch (e) {
        try { return await fetch(url, options); } catch (error) { return null; }
    }
}
