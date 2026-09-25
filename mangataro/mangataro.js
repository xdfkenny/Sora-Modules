async function searchResults(keyword, page = 0) {
    let results = [];
    try {
        const headers = {
            "Content-Type": "application/json"
        };
        const postData = {query:keyword,limit:200};
        const response = await soraFetch("https://mangataro.org/auth/search", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(postData)
        });

        const data = await response.json();
        if (Array.isArray(data.results)) {
            for (const doc of data.results) {
                results.push({
                    id: doc.permalink + "." + doc.id,
                    href: doc.permalink + "." + doc.id,
                    imageURL: doc.thumbnail,
                    title: doc.title,

                });
            }
        }
        return results;
    } catch (err) {
        return [];
    }
}

async function extractDetails(urlID) {
    try {
        const url = urlID.split(".").slice(0, -1).join(".");
        const response = await fetch(url);
        const html = await response.text();

        const descRegex = /<meta name=['"]description['"] content=['"]([^'"]+)['"]/i;
        const descMatch = descRegex.exec(html);
        const description = descMatch ? descMatch[1].trim() : "";
        return {
            description,
            tags: []
        };
    } catch (err) {
        return {
            description: "Error",
            tags: []
        };
    }
}

async function extractChapters(urlID) {
    const results = [];
    try {
        function md5(string) {
            function rotateLeft(value, shift) {
                return (value << shift) | (value >>> (32 - shift));
            }

            function addUnsigned(x, y) {
                const lsw = (x & 0xFFFF) + (y & 0xFFFF);
                const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
                return (msw << 16) | (lsw & 0xFFFF);
            }

            function md5F(x, y, z) {
                return (x & y) | ((~x) & z);
            }

            function md5G(x, y, z) {
                return (x & z) | (y & (~z));
            }

            function md5H(x, y, z) {
                return x ^ y ^ z;
            }

            function md5I(x, y, z) {
                return y ^ (x | (~z));
            }

            function md5FF(a, b, c, d, x, s, ac) {
                a = addUnsigned(a, addUnsigned(addUnsigned(md5F(b, c, d), x), ac));
                return addUnsigned(rotateLeft(a, s), b);
            }

            function md5GG(a, b, c, d, x, s, ac) {
                a = addUnsigned(a, addUnsigned(addUnsigned(md5G(b, c, d), x), ac));
                return addUnsigned(rotateLeft(a, s), b);
            }

            function md5HH(a, b, c, d, x, s, ac) {
                a = addUnsigned(a, addUnsigned(addUnsigned(md5H(b, c, d), x), ac));
                return addUnsigned(rotateLeft(a, s), b);
            }

            function md5II(a, b, c, d, x, s, ac) {
                a = addUnsigned(a, addUnsigned(addUnsigned(md5I(b, c, d), x), ac));
                return addUnsigned(rotateLeft(a, s), b);
            }

            function convertToWordArray(string) {
                let lWordCount, lMessageLength = string.length,
                    lNumberOfWords_temp1 = lMessageLength + 8,
                    lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64,
                    lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16,
                    lWordArray = Array(lNumberOfWords - 1),
                    lBytePosition = 0,
                    lByteCount = 0;
                while (lByteCount < lMessageLength) {
                    lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                    lBytePosition = (lByteCount % 4) * 8;
                    lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
                    lByteCount++;
                }
                lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;
                lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
                lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
                lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
                return lWordArray;
            }

            function wordToHex(value) {
                let wordToHexValue = "",
                    wordToHexValue_temp = "",
                    lByte, lCount;
                for (lCount = 0; lCount <= 3; lCount++) {
                    lByte = (value >>> (lCount * 8)) & 255;
                    wordToHexValue_temp = "0" + lByte.toString(16);
                    wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2);
                }
                return wordToHexValue;
            }
            let x = [],
                k, AA, BB, CC, DD, a, b, c, d;
            const S11 = 7,
                S12 = 12,
                S13 = 17,
                S14 = 22,
                S21 = 5,
                S22 = 9,
                S23 = 14,
                S24 = 20,
                S31 = 4,
                S32 = 11,
                S33 = 16,
                S34 = 23,
                S41 = 6,
                S42 = 10,
                S43 = 15,
                S44 = 21;
            x = convertToWordArray(string);
            a = 0x67452301;
            b = 0xEFCDAB89;
            c = 0x98BADCFE;
            d = 0x10325476;
            for (k = 0; k < x.length; k += 16) {
                AA = a;
                BB = b;
                CC = c;
                DD = d;
                a = md5FF(a, b, c, d, x[k], S11, 0xD76AA478);
                d = md5FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
                c = md5FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
                b = md5FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
                a = md5FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
                d = md5FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
                c = md5FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
                b = md5FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
                a = md5FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
                d = md5FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
                c = md5FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
                b = md5FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
                a = md5FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
                d = md5FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
                c = md5FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
                b = md5FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
                a = md5GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
                d = md5GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
                c = md5GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
                b = md5GG(b, c, d, a, x[k], S24, 0xE9B6C7AA);
                a = md5GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
                d = md5GG(d, a, b, c, x[k + 10], S22, 0x2441453);
                c = md5GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
                b = md5GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
                a = md5GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
                d = md5GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
                c = md5GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
                b = md5GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
                a = md5GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
                d = md5GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
                c = md5GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
                b = md5GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
                a = md5HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
                d = md5HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
                c = md5HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
                b = md5HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
                a = md5HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
                d = md5HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
                c = md5HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
                b = md5HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
                a = md5HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
                d = md5HH(d, a, b, c, x[k], S32, 0xEAA127FA);
                c = md5HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
                b = md5HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
                a = md5HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
                d = md5HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
                c = md5HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
                b = md5HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
                a = md5II(a, b, c, d, x[k], S41, 0xF4292244);
                d = md5II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
                c = md5II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
                b = md5II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
                a = md5II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
                d = md5II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
                c = md5II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
                b = md5II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
                a = md5II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
                d = md5II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
                c = md5II(c, d, a, b, x[k + 6], S43, 0xA3014314);
                b = md5II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
                a = md5II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
                d = md5II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
                c = md5II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
                b = md5II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
                a = addUnsigned(a, AA);
                b = addUnsigned(b, BB);
                c = addUnsigned(c, CC);
                d = addUnsigned(d, DD);
            }
            return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
        }

        function generateToken() {
            const timestamp = Math.floor(Date.now() / 1000);
            const hour = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, '');
            const secret = 'mng_ch_' + hour;
            const hash = md5(timestamp + secret).substring(0, 16);
            return {
                token: hash,
                timestamp: timestamp
            };
        }

        const ID = urlID.split(".").pop();
        const offset = 0;
        const limit = 500;
        const order = "DESC";
        const { token: _t, timestamp: _ts } = generateToken();
        const apiUrl = `https://mangataro.org/auth/manga-chapters?manga_id=${ID}&offset=${offset}&limit=${limit}&order=${order}&_t=${_t}&_ts=${_ts}`;
        const response = await fetch(apiUrl);
        const data = await response.json();
        console.log(data);
        if (Array.isArray(data.chapters)) {
            let total = data.chapters.length;
            for (let i = 0; i < total; i++) {
                const chapter = data.chapters[i];
                results.push([
                    String(total - i - 1),
                    [{
                        id: chapter.url,
                        chapter: chapter.chapter,
                        scanlation_group: chapter.title
                    }]
                ]);
            }
        }
        return { en: results.reverse() };
    } catch (err) {
        return { en: [] };
    }
}

async function extractImages(url) {
    try {
        const cleanUrl = url.split("?")[0].split("#")[0].replace(/\/$/, "");
        let chapterId = cleanUrl.split("-").pop();
        if (!/^\d+$/.test(chapterId)) {
            const match = cleanUrl.match(/\/(\d+)$/) || cleanUrl.match(/(\d+)$/);
            if (match) {
                chapterId = match[1];
            } else {
                return [];
            }
        }

        const response = await fetch(`https://mangataro.org/auth/chapter-content?chapter_id=${chapterId}`);
        const data = await response.json();
        if (data && Array.isArray(data.images)) {
            return data.images;
        }
        return [];
    } catch (err) {
        return [];
    }
}
// Canonical soraFetch wrapper — wraps fetchv2 (url, headers, method, body).
// (searchResults above references this; it was previously undefined, so search
//  always threw and returned [].)
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            const res = await fetch(url, { method: options.method || 'GET', headers, body: options.body || null });
            return {
                ok: res.ok,
                status: res.status,
                text: async () => await res.text(),
                json: async () => await res.json()
            };
        } catch (error) {
            return null;
        }
    }
}
