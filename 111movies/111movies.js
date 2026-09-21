async function searchResults(keyword) {
    try {
        let transformedResults = [];

        const keywordGroups = {
            trending: ["!trending", "!hot", "!tr", "!!"],
            topRatedMovie: ["!top-rated-movie", "!topmovie", "!tm", "??"],
            topRatedTV: ["!top-rated-tv", "!toptv", "!tt", "::"],
            popularMovie: ["!popular-movie", "!popmovie", "!pm", ";;"],
            popularTV: ["!popular-tv", "!poptv", "!pt", "++"],
        };

        const skipTitleFilter = Object.values(keywordGroups).flat();

        const shouldFilter = !matchesKeyword(keyword, skipTitleFilter);

        // --- TMDB Section ---
        const encodedKeyword = encodeURIComponent(keyword);
        let baseUrl = null;

        if (matchesKeyword(keyword, keywordGroups.trending)) {
            baseUrl = `https://api.themoviedb.org/3/trending/all/week?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=`;
        } else if (matchesKeyword(keyword, keywordGroups.topRatedMovie)) {
            baseUrl = `https://api.themoviedb.org/3/movie/top_rated?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=`;
        } else if (matchesKeyword(keyword, keywordGroups.topRatedTV)) {
            baseUrl = `https://api.themoviedb.org/3/tv/top_rated?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=`;
        } else if (matchesKeyword(keyword, keywordGroups.popularMovie)) {
            baseUrl = `https://api.themoviedb.org/3/movie/popular?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=`;
        } else if (matchesKeyword(keyword, keywordGroups.popularTV)) {
            baseUrl = `https://api.themoviedb.org/3/tv/popular?api_key=9801b6b0548ad57581d111ea690c85c8&include_adult=false&page=`;
        } else {
            baseUrl = `https://api.themoviedb.org/3/search/multi?api_key=9801b6b0548ad57581d111ea690c85c8&query=${encodedKeyword}&include_adult=false&page=`;
        }

        let dataResults = [];

        if (baseUrl) {
            const pagePromises = Array.from({ length: 5 }, (_, i) =>
                soraFetch(`https://clannad-peak.vercel.app/api/proxy?url=${encodeURIComponent(baseUrl + (i + 1))}`).then(r => r.json())
            );
            const pages = await Promise.all(pagePromises);
            dataResults = pages.flatMap(p => p.results || []);
        }

        if (dataResults.length > 0) {
            transformedResults = transformedResults.concat(
                dataResults
                    .map(result => {
                        if (result.media_type === "movie" || result.title) {
                            return {
                                title: result.title || result.name || result.original_title || result.original_name || "Untitled",
                                image: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : "",
                                href: `movie/${result.id}`,
                            };
                        } else if (result.media_type === "tv" || result.name) {
                            return {
                                title: result.name || result.title || result.original_name || result.original_title || "Untitled",
                                image: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : "",
                                href: `tv/${result.id}/1/1`,
                            };
                        }
                    })
                    .filter(Boolean)
                    .filter(result => result.title !== "Overflow")
                    .filter(result => result.title !== "My Marriage Partner Is My Student, a Cocky Troublemaker")
                    .filter(r => !shouldFilter || r.title.toLowerCase().includes(keyword.toLowerCase()))
            );
        }

        console.log("Transformed Results: " + JSON.stringify(transformedResults));
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log("Fetch error in searchResults: " + error);
        return JSON.stringify([{ title: "Error", image: "", href: "" }]);
    }
}

function matchesKeyword(keyword, commands) {
    const lower = keyword.toLowerCase();
    return commands.some(cmd => lower.startsWith(cmd.toLowerCase()));
}

async function extractDetails(url) {
    try {
        if(url.includes('movie')) {
            const match = url.match(/movie\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const movieId = match[1];
            const responseText = await soraFetch(`https://clannad-peak.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/movie/${movieId}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}`);
            const data = await responseText.json();

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.runtime ? data.runtime + " minutes" : 'Unknown'}`,
                airdate: `Released: ${data.release_date ? data.release_date : 'Unknown'}`
            }];

            return JSON.stringify(transformedResults);
        } else if(url.includes('tv')) {
            const match = url.match(/tv\/([^\/]+)/);
            if (!match) throw new Error("Invalid URL format");

            const showId = match[1];
            const responseText = await soraFetch(`https://clannad-peak.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}`);
            const data = await responseText.json();

            const transformedResults = [{
                description: data.overview || 'No description available',
                aliases: `Duration: ${data.episode_run_time && data.episode_run_time.length ? data.episode_run_time.join(', ') + " minutes" : 'Unknown'}`,
                airdate: `Aired: ${data.first_air_date ? data.first_air_date : 'Unknown'}`
            }];

            console.log(JSON.stringify(transformedResults));
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
        if(url.includes('movie')) {
            const match = url.match(/movie\/([^\/]+)/);
            
            if (!match) throw new Error("Invalid URL format");
            
            const movieId = match[1];
            
            const movie = [
                { href: `https://111movies.com/movie/${movieId}`, number: 1, title: "Full Movie" }
            ];

            console.log(movie);
            return JSON.stringify(movie);
        } else if(url.includes('tv')) {
            const match = url.match(/tv\/([^\/]+)\/([^\/]+)\/([^\/]+)/);
            
            if (!match) throw new Error("Invalid URL format");
            
            const showId = match[1];
            
            const showResponseText = await soraFetch(`https://clannad-peak.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}`);
            const showData = await showResponseText.json();
            
            let allEpisodes = [];
            for (const season of showData.seasons) {
                const seasonNumber = season.season_number;

                if(seasonNumber === 0) continue;
                
                const seasonResponseText = await soraFetch(`https://clannad-peak.vercel.app/api/proxy?url=${encodeURIComponent(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNumber}?api_key=ad301b7cc82ffe19273e55e4d4206885`)}`);
                const seasonData = await seasonResponseText.json();
                
                if (seasonData.episodes && seasonData.episodes.length) {
                    const episodes = seasonData.episodes.map(episode => ({
                        href: `https://111movies.com/tv/${showId}/${seasonNumber}/${episode.episode_number}`,
                        number: episode.episode_number,
                        title: episode.name || ""
                    }));
                    allEpisodes = allEpisodes.concat(episodes);
                }
            }
            
            console.log(allEpisodes);
            return JSON.stringify(allEpisodes);
        } else {
            throw new Error("Invalid URL format");
        }
    } catch (error) {
        console.log('Fetch error in extractEpisodes: ' + error);
        return JSON.stringify([]);
    }    
}

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




async function soraFetch(url, options = { headers: {}, method: 'GET', body: null, encoding: 'utf-8' }) {
    try {
        return await fetchv2(
            url,
            options.headers ?? {},
            options.method ?? 'GET',
            options.body ?? null,
            true,
            options.encoding ?? 'utf-8'
        );
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
