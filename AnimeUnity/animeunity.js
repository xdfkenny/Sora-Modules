/* AnimeUnity — archivio (search) + info_api (details) + video-player (episodes)
 * + vixcloud embed (stream).
 *
 * Domain move 2026-10-20: animeunity.so is NXDOMAIN; the site relaunched on
 * animeunity.co (2026-11-09 rotation) and the vixcloud.co embeds moved to vixcloud.cc, where the
 * embed page now exposes window.masterPlaylist (url + token + expires) and
 * the playlist answers 200 only with an extra `h=1` unlock param.
 */

const AU_BASE = "https://www.animeunity.co";

async function searchResults(keyword) {
  try {
    const response = await soraFetch(
      `${AU_BASE}/archivio?title=${encodeURIComponent(keyword)}`
    );
    if (!response) return JSON.stringify([]);
    const html = await response.text();

    const match = /<archivio[^>]*records="([^"]*)"/.exec(html);
    if (!match || !match[1]) {
      return JSON.stringify([]);
    }

    const items = JSON.parse(match[1].replaceAll(`&quot;`, `"`));

    const results =
      items.map((item) => ({
        title: item.title ?? item.title_eng,
        image: item.imageurl,
        href: `${AU_BASE}/info_api/${item.id}`,
      })).filter((r) => r.title) || [];

    return JSON.stringify(results);
  } catch (error) {
    console.log("search error:", error);
    return JSON.stringify([]);
  }
}

async function extractDetails(url) {
  try {
    const response = await soraFetch(url);
    if (!response) {
      return JSON.stringify([{ description: "", aliases: "N/A", airdate: "" }]);
    }
    const json = JSON.parse(await response.text());

    return JSON.stringify([
      {
        description: json.plot,
        aliases: "N/A",
        airdate: json.date,
      },
    ]);
  } catch (error) {
    console.log("details error:", error);
    return JSON.stringify([{ description: "", aliases: "N/A", airdate: "" }]);
  }
}

async function extractEpisodes(url) {
  try {
    const episodes = [];

    const apiResponse = await soraFetch(url);
    if (!apiResponse) return JSON.stringify(episodes);
    const apiJson = JSON.parse(await apiResponse.text());
    const slug = apiJson.slug;
    const idAnime = apiJson.id;

    if (!slug) {
      console.log("No slug found in API response");
      return JSON.stringify(episodes);
    }

    const pageResponse = await soraFetch(
      `${AU_BASE}/anime/${idAnime}-${slug}`
    );
    if (!pageResponse) return JSON.stringify(episodes);
    const html = await pageResponse.text();

    const videoPlayerRegex =
      /<video-player[^>]*anime="([^"]*)"[^>]*episodes="([^"]*)"/;
    const videoPlayerMatch = html.match(videoPlayerRegex);
    if (!videoPlayerMatch) {
      console.log("No video-player tag found");
      return JSON.stringify(episodes);
    }

    const decodeHtml = (str) =>
      str.replace(/&quot;/g, '"').replace(/\\\//g, "/");

    const episodesJsonStr = decodeHtml(videoPlayerMatch[2]);
    const episodesData = JSON.parse(episodesJsonStr);

    episodesData.forEach((episode) => {
      episodes.push({
        href: `${AU_BASE}/anime/${idAnime}-${slug}/${episode.id}`,
        number: parseInt(episode.number),
      });
    });

    return JSON.stringify(episodes);
  } catch (error) {
    console.log("Error extracting episodes:", error);
    return JSON.stringify([]);
  }
}

/* vixcloud embed page: prefer window.masterPlaylist (HLS master, per-render
 * tokens inside the playlist), fall back to the legacy downloadUrl mp4.
 * The playlist edge only answers 200 with the `h=1` unlock param appended. */
async function extractStreamUrl(url) {
  try {
    const response1 = await soraFetch(url);
    if (!response1) return JSON.stringify({ streams: [], subtitle: "" });
    const html = await response1.text();

    const vixcloudMatch = html.match(
      /embed_url="(https:\/\/vixcloud\.(?:cc|co|net|gg)\/embed\/\d+\?[^"]+)"/
    );
    if (!vixcloudMatch) {
      console.log("No vixcloud URL found in the HTML.");
      return JSON.stringify({ streams: [], subtitle: "" });
    }

    let vixcloudUrl = vixcloudMatch[1];
    vixcloudUrl = vixcloudUrl.replace(/&amp;/g, "&");

    // The embed edge 403s without an AnimeUnity Referer.
    const response2 = await soraFetch(vixcloudUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Referer": AU_BASE + "/",
      },
    });
    if (!response2) return JSON.stringify({ streams: [], subtitle: "" });
    const embed = await response2.text();

    let streamUrl = null;

    const mpUrlMatch = embed.match(
      /window\.masterPlaylist\s*=\s*\{[\s\S]*?url:\s*['"]([^'"]+)['"]/
    );
    const mpTokenMatch = embed.match(
      /window\.masterPlaylist\s*=\s*\{[\s\S]*?token['"]?\s*[:=]\s*['"]?([^'",}\s]+)/
    );
    const mpExpiresMatch = embed.match(
      /window\.masterPlaylist\s*=\s*\{[\s\S]*?expires['"]?\s*[:=]\s*['"]?([^'",}\s]+)/
    );
    if (mpUrlMatch && mpTokenMatch && mpUrlMatch[1].includes("/playlist/")) {
      const sep = mpUrlMatch[1].includes("?") ? "&" : "?";
      streamUrl = mpUrlMatch[1] + sep + "token=" + encodeURIComponent(mpTokenMatch[1]);
      if (mpExpiresMatch) streamUrl += "&expires=" + encodeURIComponent(mpExpiresMatch[1]);
      streamUrl += "&h=1";
    }

    if (!streamUrl) {
      const downloadUrlMatch = embed.match(
        /window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/
      );
      if (downloadUrlMatch && downloadUrlMatch[1]) streamUrl = downloadUrlMatch[1];
    }

    if (!streamUrl) {
      console.log("No stream URL found in vixcloud embed.");
      return JSON.stringify({ streams: [], subtitle: "" });
    }

    const qMatch = streamUrl.match(/rendition=(\d{3,4}p)/);
    return JSON.stringify({
      streams: [
        {
          title: "VixCloud" + (qMatch ? " " + qMatch[1] : ""),
          streamUrl: streamUrl,
          headers: {},
        },
      ],
      subtitle: "",
    });
  } catch (error) {
    console.log("Fetch error:", error);
    return JSON.stringify({ streams: [], subtitle: "" });
  }
}

async function soraFetch(url, options = {
    headers: {},
    method: 'GET',
    body: null
}) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch (e) {
        try {
            return await fetch(url, options);
        } catch (error) {
            return null;
        }
    }
}
