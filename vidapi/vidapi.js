async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`https://api.themoviedb.org/3/search/multi?api_key=71fdb081b0133511ac14ac0cc10fd307&query=${encodedKeyword}`);
        const data = await responseText.json();

        const transformedResults = data.results.map(result => {
            if(result.media_type === "movie" || result.title) {
                return {
                    title: result.title || result.name,
                    image: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
                    href: `https://vidapi.xyz/embed/movie/${result.id}`
                };
            }
            else if(result.media_type === "tv" || result.name) {
                return {
                    title: result.name || result.title,
                    image: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
                    href: `https://vidapi.xyz/embed/tv/${result.id}&s=1&e=1`
                };
            }
        });

        console.log(JSON.stringify(transformedResults));
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

async function extractDetails(url) {
    try {
        if(url.includes('/embed/movie/')) {
            const match = url.match(/https:\/\/vidapi\.xyz\/embed\/movie\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];
            const responseText = await soraFetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=71fdb081b0133511ac14ac0cc10fd307&append_to_response=videos,credits`);
            const data = await responseText.json();

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.runtime ? data.runtime + " minutes" : 'Unknown'}`,
                airdate: `Released: ${data.release_date ? data.release_date : 'Unknown'}`
            }];

            return JSON.stringify(transformedResults);
        } else if(url.includes('/embed/tv/')) {
            const match = url.match(/https:\/\/vidapi\.xyz\/embed\/tv\/([^\/]+)\&s=([^&]+)\&e=([^&]+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];
            const responseText = await soraFetch(`https://api.themoviedb.org/3/tv/${showId}?api_key=71fdb081b0133511ac14ac0cc10fd307&append_to_response=seasons`);
            const data = await responseText.json();

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.episode_run_time && data.episode_run_time.length ? data.episode_run_time.join(', ') : 'Unknown'}`,
                airdate: `Aired: ${data.first_air_date ? data.first_air_date : 'Unknown'}`
            }];

            return JSON.stringify(transformedResults);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Duration: Unknown',
            airdate: 'Aired/Released: Unknown'
        }]);
    }
}

async function extractEpisodes(url) {
    try {
        if(url.includes('/embed/movie/')) {
            const match = url.match(/https:\/\/vidapi\.xyz\/embed\/movie\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");
            const movieId = match[1];
            return JSON.stringify([
                { href: `https://vidapi.xyz/embed/movie/${movieId}`, number: 1, title: "Full Movie" }
            ]);
        } else if(url.includes('/embed/tv/')) {
            const match = url.match(/https:\/\/vidapi\.xyz\/embed\/tv\/([^\/]+)\&s=([^&]+)\&e=([^&]+)/);
            if (!match) throw new Error("Invalid URL format");
            const showId = match[1];
            
            const showResponseText = await soraFetch(`https://api.themoviedb.org/3/tv/${showId}?api_key=71fdb081b0133511ac14ac0cc10fd307`);
            const showData = await showResponseText.json();
            
            let allEpisodes = [];
            for (const season of showData.seasons) {
                const seasonNumber = season.season_number;

                if(seasonNumber === 0) continue;
                
                const seasonResponseText = await soraFetch(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}?api_key=71fdb081b0133511ac14ac0cc10fd307`);
                const seasonData = await seasonResponseText.json();
                
                if (seasonData.episodes && seasonData.episodes.length) {
                    const episodes = seasonData.episodes.map(episode => ({
                        href: `https://vidapi.xyz/embed/tv/${showId}&s=${seasonNumber}&e=${episode.episode_number}`,
                        number: episode.episode_number,
                        title: episode.name || ""
                    }));
                    allEpisodes = allEpisodes.concat(episodes);
                }
            }
            
            return JSON.stringify(allEpisodes);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Fetch error in extractEpisodes: ' + error);
        return JSON.stringify([]);
    }    
}

// searchResults("breaking bad");
// extractDetails("https://vidapi.xyz/embed/tv/1396&s=1&e=1");
// extractEpisodes("https://vidapi.xyz/embed/tv/1396&s=1&e=1");
// extractStreamUrl("https://vidapi.xyz/embed/tv/1396&s=1&e=1");

async function extractStreamUrl(url) {
    try {
        const u = String(url);
        const m = u.match(/\/?(?:embed\/)?(movie|tv)\/([^\/\s&?]+)/);
        if (!m) return JSON.stringify({ streams: [], subtitles: null });
        const type = m[1];
        const tmdbID = m[2];
        let seasonNumber = null, episodeNumber = null;
        if (type === 'tv') {
            const se = u.match(/(?:&|\?|\/|^)s=(\d+)[^\d]*e=(\d+)/);
            if (se) { seasonNumber = se[1]; episodeNumber = se[2]; }
            else {
                const seg = u.split('/');
                const nums = seg.filter(p => /^\d+$/.test(p));
                if (nums.length >= 3) { seasonNumber = nums[1]; episodeNumber = nums[2]; }
            }
        }
        if (type === 'tv' && (seasonNumber == null || episodeNumber == null)) {
            return JSON.stringify({ streams: [], subtitles: null });
        }

        const encRes = await fetchv2("https://enc-dec.app/api/enc-vidlink?text=" + tmdbID);
        const encData = await encRes.json();

        const vidlinkHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "Origin": "https://vidlink.pro",
            "Referer": "https://vidlink.pro/"
        };
        const apiUrl = type === 'movie'
            ? `https://vidlink.pro/api/b/movie/${encData.result}?multiLang=0`
            : `https://vidlink.pro/api/b/tv/${encData.result}/${seasonNumber}/${episodeNumber}?multiLang=0`;

        const resp = await fetchv2(apiUrl, vidlinkHeaders, "GET", null);
        if (!resp) return JSON.stringify({ streams: [], subtitles: null });
        const text = await resp.text();
        if (!text || String(text).trim() === "") return JSON.stringify({ streams: [], subtitles: null });

        const data = JSON.parse(text);
        const streamObjects = [];
        if (data.stream && data.stream.playlist) {
            streamObjects.push({
                title: "Primary",
                streamUrl: data.stream.playlist,
                headers: { "Origin": "https://vidlink.pro", "Referer": "https://vidlink.pro/" }
            });
        }
        if (data.stream && data.stream.qualities) {
            for (const q of Object.keys(data.stream.qualities)) {
                if (data.stream.qualities[q] && data.stream.qualities[q].url) {
                    streamObjects.push({
                        title: q + "p",
                        streamUrl: data.stream.qualities[q].url,
                        headers: { "Origin": "https://vidlink.pro", "Referer": "https://vidlink.pro/" }
                    });
                }
            }
        }
        let englishSubtitle = null;
        if (data.stream && data.stream.captions) {
            const en = data.stream.captions.find(s => String(s.language || '').toLowerCase().includes('english'));
            englishSubtitle = en && en.url ? en.url : null;
        }
        return JSON.stringify({ streams: streamObjects, subtitles: englishSubtitle });
    } catch (e) {
        console.log('Stream error:', e);
        return JSON.stringify({ streams: [], subtitles: null });
    }
}



async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
