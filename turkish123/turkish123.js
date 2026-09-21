async function searchResults(keyword) {
    const searchUrl = `https://ahs.turkish123.com/?s=${encodeURIComponent(keyword)}`;
    try {
        const response = await fetchv2(searchUrl);
        const html = await response.text();
        const results = [];

        const itemRegex = /<div[^>]*class="ml-item"[^>]*>[\s\S]*?<\/div>/g;
        const items = html.match(itemRegex) || [];

        items.forEach((itemHtml) => {
            const titleMatch = itemHtml.match(/<span class="mli-info"><h2>([^<]+)<\/h2><\/span>/);
            const imgMatch = itemHtml.match(/<img[^>]*src="([^"]+)"[^>]*class="mli-thumb"/);
            const hrefMatch = itemHtml.match(/<a href="([^"]+)"[^>]*class="ml-mask/);

            if (!titleMatch || !imgMatch || !hrefMatch) return;

            const title = titleMatch[1].trim();
            const imageUrl = imgMatch[1].trim();
            const href = hrefMatch[1].trim();

            results.push({
                title,
                image: imageUrl,
                href
            });
        });
        return JSON.stringify(results);
    } catch (error) {
        throw error;
    }
}

async function extractDetails(url) {
    const details = [];

    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const descriptionMatch = html.match(/<p class="f-desc">([\s\S]*?)<\/p>/);
        let description = descriptionMatch ? descriptionMatch[1].trim() : 'Weirdly the website doesn\'t provide any description, either that or I\'m blind.';

        description = description.replace(/&#8211;/g, '–').replace(/&#8217;/g, '’');

        const yearMatch = html.match(/<i class="fa fa-calendar" aria-hidden="true"><\/i><strong>Year:<\/strong>[\s\S]*?<a href="[^"]*" rel="tag">(\d{4})<\/a>/);
        const airdate = yearMatch ? yearMatch[1] : 'N/A';

        details.push({
            description,
            alias: 'N/A',
            airdate
        });
        return JSON.stringify(details);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    const response = await fetchv2(url);
    const html = await response.text();
    const episodes = [];

    const episodeMatches = html.match(/<a class="episodi" href="([^"]+)">[^<]*Episode (\d+)[^<]*(?:<span[^>]*>[^<]*<\/span>)?[^<]*<\/a>/g);

    if (episodeMatches) {
        episodeMatches.forEach((match) => {
            const hrefMatch = match.match(/href="([^"]+)"/);
            const episodeNumberMatch = match.match(/Episode (\d+)/);

            if (hrefMatch && episodeNumberMatch) {
                episodes.push({
                    href: hrefMatch[1].trim(),
                    number: parseInt(episodeNumberMatch[1], 10) 
                });
            }
        });
    }
    return JSON.stringify(episodes);
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();

        const downloadNaviMatch = html.match(/<div class="download_navi">([\s\S]*?)<\/div>/);
        if (!downloadNaviMatch) return null;

        const serverMatch = downloadNaviMatch[1].match(/<div class="les-content">\s*<a href="([^"]+)"[^>]*>Server 1<\/a>/);
        if (!serverMatch) return null;

        const headers = {
            "Referer": "https://ahs.turkish123.com/"
        };
        const serverUrl = serverMatch[1].replace('/d/', '/f/');
        const responseTwo = await fetchv2(serverUrl, headers);
        const htmlTwo = await responseTwo.text();

        const obfuscatedScript = htmlTwo.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);

        if (obfuscatedScript) {
            const unpacked = unpack(obfuscatedScript[1]);
            const m3u8Match = unpacked.match(/file\s*:\s*"([^"]+)"/) || unpacked.match(/src\s*:\s*"([^"]+)"/);
            if (m3u8Match) {
                return m3u8Match[1];
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

/*
 * DEOBFUSCATOR CODE
 */
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
