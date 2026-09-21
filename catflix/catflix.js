/**
 * catflix.js
 * A module for Sora that provides watch functionality for catflix.su
 * @module catflix
 * @author JMcrafte26
 * @license MIT
 * @version 1.0.0
 * 
 * 
 * NOTE: I DO NOT OWN catflix.su AND THIS MODULE IS NOT AFFILIATED WITH catflix.su IN ANY WAY.
 * IN NO WAY DO I PROMOTE PIRACY. THIS MODULE IS FOR EDUCATIONAL PURPOSES ONLY AND SHOULD DEMONSTRATE HOW TO EASY IT IS TO SCRAPE WEBSITES.
 * USE THIS MODULE AT YOUR OWN RISK.
 * 
 * No Liability
 * The developer(s) of this module assumes no liability for damages, legal claims, or other issues arising from the use or misuse of this module. Users bear full responsibility for their actions. Use this module at your own risk.
 * Third-Party Websites and Intellectual Property
 * This module is not affiliated with or endorsed by any third-party entity. Users are responsible for verifying that using this module complies with the terms of service and intellectual property rights of the sites they interact with.
 * DMCA
 * The developer(s) is not responsible for the misuse of any content and shall not be responsible for the dissemination of any content associated with this module. Any violations should be send to the source website The developer is not legally responsible for the use of this module.
 *
*/

async function searchResults(keyword) {

  try {
    // this is the original api, but it requires an api key, so i used my own api
    // const response = await fetch(`https://api.themoviedb.org/3/search/multi?query=${keyword}&include_adult=false&language=en-US&page=1&sort_by=popularity.desc`, {
    //     headers: {
    //         'Authorization': 'your token here',
    //         'accept': 'application/json'
    //     }
    // });

    // this is my own api, it may be a pit slow, as it fetches data from tmdb, but i dont want to share the api key
    const response = await fetch(
      `https://api.jm26.net/sora-modules/tmdb-api/?type=search&query=${keyword}&page=1`
    );
    let data = await JSON.parse(response);

    // if there is a results array, use it, otherwise use the data object
    data = data.results || data;
    // https://catflix.su/tv/breaking-bad-1396

    const transformedResults = data.map((result) => (
      {
      title: result.title || result.name,
      image: "https://image.tmdb.org/t/p/w500" + result.poster_path,
      href: `https://catflix.su/${result.media_type === "tv" ? "tv" : "movie"}/${(result.title || result.name).replace(/ /g, "-").replace(":", "")}-${result.id}`,
    }));

    return JSON.stringify(transformedResults);
  } catch (error) {
    console.log("Fetch error:", error);
    return JSON.stringify([{ title: "Error", image: "", href: "" }]);
  }
}

function getId(url) {
        let id = url.split("-").slice(-1).join("");
        let type = url.split("/").slice(-2, -1).join("");
        id = (type === "tv" ? "s-" : "m-") + id;
        return id;
}


async function extractDetails(url) {
  console.log("extractDetails:", url);
  // return JSON.stringify([{
  //     description: 'IMPLEMENT DESCRIPTION FUNCTION',
  //     aliases: '---',
  //     airdate: '---'
  //     }]);

  try {
    const id = getId(url);


    console.log("id:", id);
    const response = await fetch(
      `https://api.jm26.net/sora-modules/tmdb-api/?id=${id}`
    );
    const data = await JSON.parse(response);
    // console.log("Description data:", data);
    let aired = "";
    if (data.release_date) {
      aired = data.release_date.split("-").slice(0, 1).join(".");
    } else if (data.first_air_date) {
      aired =
        data.first_air_date.split("-").slice(0, 1).join(".") +
        " - " +
        data.last_air_date.split("-").slice(0, 1).join(".");
    }
    let aliases = "";
    if (data.runtime) {
      aliases = "Duration: " + data.runtime + " min";
    } else if (data.original_name) {
      aliases = "Original Name: " + data.original_name;
    }

    const transformedResults = [
      {
        description: data.overview,
        aliases,
        airdate: "Aired: " + aired,
      },
    ];

    return JSON.stringify(transformedResults);
  } catch (error) {
    console.log("Details error:", error);
    return JSON.stringify([
      {
        description: "Error loading description",
        aliases: "Duration: Unknown",
        airdate: "Aired: Unknown",
      },
    ]);
  }
}

async function extractEpisodes(url) {
  try {
    const id = getId(url);
    const response = await fetch(
      `https://api.jm26.net/sora-modules/tmdb-api/?id=${id}`
    );
    const data = await JSON.parse(response);
    console.log("Seasons data:", data);

    const imdbId = data.external_ids.imdb_id;

    // if seasons is in the data, its a tv show, otherwise its a movie
    let transformedResults = [];
    if (!data.seasons || data.seasons.length === 0) {
      console.log("No seasons found, must be a movie");
      let hashData = {
        "imdb_id": imdbId,
        "season": false,
        "episode": false
      };
      let hash = base64Encode(JSON.stringify(hashData));

        transformedResults = [
            {
            href: url + "#" + hash,
            number: 0
        }];
    } else {         
        // fetch the episode ids from the api
        const seasonIds = data.seasons.map((season) => season.id);
        // console.log("seasonIds:", seasonIds);
        let seasonCount = 1;
        let episodeCount = 1;
        const fetchPromises = [];
        
        seasonIds.forEach((seasonId) => {
          const fetchPromise = fetch(
            `https://api.jm26.net/sora-modules/tmdb-api/?season=${seasonCount}&id=${id}`
          )
          .then(async (seasonData) => {
            seasonData = await JSON.parse(seasonData);
              // console.log("seasonData:", seasonData);
              // add the episodes to the transformedResults array
              // https://catflix.su/episode/breaking-bad-season-1-episode-2/eid-62086 - example episode url
              transformedResults = transformedResults.concat(
                seasonData.episodes.map((episode, index) => ({
                  href: `https://catflix.su/episode/${data.name.replace(/ /g, "-").replace(':', '')}-season-${seasonCount}-episode-${index + 1}/eid-${episode.id}#${base64Encode(JSON.stringify({ imdb_id: imdbId, season: seasonCount, episode: index + 1 }))}`,
                  number: episodeCount++,
                }))
              );
          console.log("Fetched season " + seasonCount + "/" + seasonIds.length);
              seasonCount++;
            });
          fetchPromises.push(fetchPromise);
        });
        
        // wait for all fetches to finish
        await Promise.all(fetchPromises);
        console.log("transformedResults:", transformedResults);
    }
    return JSON.stringify(transformedResults);

  } catch (error) {
    console.log("Fetch error:", error);
    return JSON.stringify([{ href: "", number: "Error" }]);
  }
}


async function extractStreamUrl(url) {
  const language = 'eng';
  const phpsessid = ''; // no need for that actually
  // embedUrl = 'https://turbovid.eu/embed/ZhkbFoEBXfJu';
  try {
    // fetch the embed url from the original url
    const response = await fetch(url);
    // get the embed link from the response: 'const main_origin = "aHR0cHM6Ly90dXJib3ZpZC5ldS9lbWJlZC9sUXRtYkxJRHhXQkQ=";' -is base64 encoded
    const html = await response;
	let embedUrl = null;
	let base64EmbedUrl = null;
    try {
    base64EmbedUrl = html.match(/main_origin = "([^"]+)"/)[1];
    embedUrl = base64Decode(base64EmbedUrl);
    console.log("embedUrl:", embedUrl);
    } catch(e) {
        console.log("CATFLIX HOSTER NOT FOUND! I will add more soon");
        return null;
    }
    

      // 1. Extract critical variables from embed page
      const { mediaType, apKey, xxId } = await extractEmbedVariables(embedUrl);
      console.log("mediaType:" + mediaType + " | apKey:" + apKey + " | xxId:" + xxId);

      
      // 2. Get decryption keys
      const juiceKeys = await fetchJuiceKeys(embedUrl);
      console.log("juiceKeys: " + juiceKeys.juice);
      
      // 3. Get encrypted video payload
      const encryptedPayload = await fetchEncryptedPayload(embedUrl, apKey, xxId);

      let subtitles = null;
      // get the hash data from the url
      const hashData = url.split("#")[1];
      const { imdb_id: imdbId, season, episode } = JSON.parse(base64Decode(hashData));
      console.log("imdbId:" + imdbId + " | season:" + season + " | episode:" + episode);

      try {
          subtitles = await fetchSubtitles(imdbId, season, episode, language);
          console.log("Fetched subtitles:", subtitles);
      } catch (error) {
          console.log("Subtitles error:", error);
      }

      // 4. Decrypt and return final url
      const streamUrl = xorDecryptHex(encryptedPayload, juiceKeys.juice);

      return JSON.stringify({ stream: streamUrl, subtitles: subtitles });

  } catch (error) {
      console.log('Extraction failed:' + error);
      return JSON.stringify({ stream: null, subtitles: null });
  }
}

// Helper functions
async function extractEmbedVariables(embedUrl) {
  const response = await fetch(embedUrl);
  // const html = await response.text();
  const html = await response;
  // console.log('html of embedUrl:' + html);
  
  return {
      mediaType: getJsVarValue(html, 'media_type'),
      // posterPath: getJsVarValue(html, 'posterPath'),
      apKey: getJsVarValue(html, 'apkey'),
      dKey: getJsVarValue(html, 'dakey'),
      xxId: getJsVarValue(html, 'xxid'),
      xyId: getJsVarValue(html, 'xyid')
  };
}

async function fetchSubtitles(imdbId, season, episode, language) {
let url = `https://justaproxy.xyz/subsApi.php?version=2&getsubs=simp&imdbid=${imdbId}&subkey=${language}`;
  if (season && episode) {
      url += `&season=${season}&episode=${episode}`;
  }

  const response = await fetch(url);
  const responseJson = await JSON.parse(response);
  console.log('RJSON: ', responseJson);

  // let url = `https://justaproxy.xyz/subsApi.php?version=2&getsubs=simp&imdbid=${imdbId}&subkey=${language}`;
  // if (season && episode) {
  //     url += `&season=${season}&episode=${episode}`;
  // }
  // console.log("Subtitles url:", url);
  // // const headers = "Origin=https://turbovid.eu|Referer=https://turbovid.eu/";
  // // const vercelUrl = `https://sora-passthrough.vercel.app/passthrough?url=${ url }&headers=${ headers }`;
  // const response = await fetch(url);
  // // const response = await fetch(url);
  // console.log("Subtitles response:", response);
  // const responseJson = JSON.parse(response);
  /*
  [
{
  "SubDownloadLink": "https://turbovid.eu/subs/tv-62086/Breaking.Bad.-.S01E02.-.Cat's.in.the.Bag.EAC3.5.1.HDTV-1080p.VP9-PHDTeam_eng.vtt",
  ...
},
...
]
  */
 if (responseJson.length === 0) {
     return null;
  } else if (!responseJson[0].SubDownloadLink) {
      return null;
  }

  const subtitleObject = responseJson.find(subs => subs.SubFormat === 'vtt');

  const subtitle = subtitleObject.SubDownloadLink;
  return subtitle;
}



function getJsVarValue(html, varName) {
  const regex = new RegExp(`const ${varName}\\s*=\\s*"([^"]+)`);
  const match = html.match(regex);
  return match ? match[1] : null;
}

async function fetchJuiceKeys(embedUrl) {
/*
let headers;
try {
  headers = new Headers({
      'Referer': embedUrl,
      'Accept': 'application/json',
  });
} catch (error) {
  fetchHeaders = {
      'Referer': embedUrl,
      'Accept': 'application/json',
  };
}

const vercelUrl = "https://sora-passthrough.vercel.app/convert?embedUrl=${ source }&referer=${ referer }"";

//const vercelResponse = await fetch(vercelUrl);
//const vercelData = await vercelResponse.json();


*/


  const headers = `Referer=${embedUrl}|Origin=${embedUrl}`;


const fetchUrl = base64Decode('aHR0cHM6Ly90dXJib3ZpZC5ldS9hcGkvY3Vja2VkLw==') + 'juice_key';
  
  const vercelUrl = `https://sora-passthrough.vercel.app/passthrough?url=${ fetchUrl }&headers=${ headers } }`;

  // I use the base64 encoded url to hide the url from Claude, as it finds it inappropiate somehow and I needed advice from it
  const response = await fetch(vercelUrl);
  
  return await JSON.parse(response);
}

async function fetchEncryptedPayload(embedUrl, apKey, xxId) {

/*
let headers;
try {
  headers = new Headers({
      'Referer': embedUrl,
      'Accept': 'application/json',
  });
} catch (error) {
  
   headers = {
      'Referer': embedUrl,
      'Accept': 'application/json',
  };
}
*/
  
  const url = base64Decode('aHR0cHM6Ly90dXJib3ZpZC5ldS9hcGkvY3Vja2VkLw==') + 'the_juice_v2/?' + apKey + '=' + xxId;
  console.log('url:', url);
  
  const headers = `Referer=${embedUrl}|Origin=${embedUrl}`;


//const vercelUrl = "https://sora-passthrough.vercel.app/convert?embedUrl=${ source }&referer=${ referer }"";

//const vercelResponse = await fetch(vercelUrl);
//const vercelData = await vercelResponse.json();

// const fetchUrl = base64Decode('aHR0cHM6Ly90dXJib3ZpZC5ldS9hcGkvY3Vja2VkLw==') + 'juice_key';
  
  const vercelUrl = `https://sora-passthrough.vercel.app/passthrough?url=${ url }&headers=${ headers } }`;

  // I use the base64 encoded url to hide the url from Claude, as it finds it inappropiate somehow and I needed advice from it
  const response = await fetch(vercelUrl);
  
  
      const data = await JSON.parse(response);
  
  return data.data;
}

function xorDecryptHex(hexData, key) {
  if (!hexData) {
      throw new Error('hexData is undefined or null');
  }
  const buffer = new Uint8Array(hexData.toString().match(/../g).map(h => parseInt(h, 16)));
  let decrypted = '';
  
  for (let i = 0; i < buffer.length; i++) {
      const keyByte = key.charCodeAt(i % key.length);
      decrypted += String.fromCharCode(buffer[i] ^ keyByte);
  }
  
  return decrypted;
}

// Helper function to fetch the base64 encoded string
function base64Decode(str) {
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
let output = '';

str = String(str).replace(/=+$/, '');

if (str.length % 4 === 1) {
    throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
}

for (let bc = 0, bs, buffer, idx = 0; (buffer = str.charAt(idx++)); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = chars.indexOf(buffer);
}

return output;
}

function base64Encode(str) {
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
let output = '';

for (let block = 0, charCode, idx = 0, map = chars; str.charAt(idx | 0) || (map = '=', idx % 1); output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
    charCode = str.charCodeAt(idx += 3 / 4);

    if (charCode > 255) {
        throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
    }

    block = block << 8 | charCode;
}

return output;
}

// Check out the Sora WebUI at https://api.jm26.net/sora-modules/