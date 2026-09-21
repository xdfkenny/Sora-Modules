async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`https://novelfire.net/ajax/searchLive?keyword=${encodedKeyword}&type=title`);
        const data = await responseText.json();

        // const html = data.html;
        // const results = [];

        // const regex = /<a href="([^"]+)">[\s\S]*?<img src="([^"]+)">[\s\S]*?<h4 class="novel-title[^>]*">([^<]+)<\/h4>/g;

        // let match;
        // while ((match = regex.exec(html)) !== null) {
        //     results.push({
        //         title: match[3].trim(),
        //         image: match[2].trim(),
        //         href: match[1].trim()
        //     });
        // }

        const results = data.data.map(item => ({
            title: item.title,
            image: `https://novelfire.net/${item.image}`,
            href: `https://novelfire.net/book/${item.slug}`,
        }));

        console.log(results);
        return JSON.stringify(results);
    } catch (error) {
        console.log('Fetch error in searchResults: ' + error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

searchResults("class");

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        // Extract description
        const descriptionMatch = htmlText.match(/<p class="description">([\s\S]*?)<\/p>/);
        const description = descriptionMatch ? descriptionMatch[1].trim() : 'No description available';

        // Author(s)
        const authorMatch = htmlText.match(/<div class="author">[\s\S]*?<span>Author:<\/span>([\s\S]*?)<\/div>/);
        let authors = 'Unknown';
        if (authorMatch) {
            const authorRegex = /<span itemprop="author">([^<]+)<\/span>/g;
            const authorList = [];
            let aMatch;
            while ((aMatch = authorRegex.exec(authorMatch[1])) !== null) {
                authorList.push(aMatch[1].trim());
            }
            authors = authorList.join(', ');
        }

        // Rank
        const rankMatch = htmlText.match(/<div class="rank"><i class="icon-crown"><\/i>\s*<strong>RANK (\d+)<\/strong>/);
        const rank = rankMatch ? rankMatch[1] : 'Unknown';

        // Rating
        const ratingMatch = htmlText.match(/<strong class="nub">([\d.]+)<\/strong>/);
        const rating = ratingMatch ? ratingMatch[1] : 'Unknown';

        // Chapters
        const chaptersMatch = htmlText.match(/<i class="icon-book-open"><\/i>\s*(\d+)\s*<\/strong><small>Chapters<\/small>/);
        const chapters = chaptersMatch ? chaptersMatch[1] : 'Unknown';

        // Views
        const viewsMatch = htmlText.match(/<i class="icon-eye"><\/i>\s*([\d.,Kk]+)\s*<\/strong><small>Views<\/small>/);
        const views = viewsMatch ? viewsMatch[1] : 'Unknown';

        // Status
        const statusMatch = htmlText.match(/<strong class="completed">([^<]+)<\/strong>\s*<small>Status<\/small>/);
        const status = statusMatch ? statusMatch[1] : 'Unknown';

        // Genres
        const genresMatch = htmlText.match(/<div class="categories">[\s\S]*?<ul>([\s\S]*?)<\/ul>/);
        let genres = 'Unknown';
        if (genresMatch) {
            const genreRegex = /<a [^>]+title="([^"]+)"[^>]*>/g;
            const genreList = [];
            let gMatch;
            while ((gMatch = genreRegex.exec(genresMatch[1])) !== null) {
                genreList.push(gMatch[1].trim());
            }
            genres = genreList.join(', ');
        }

        const aliases = `
Author(s): ${authors}
Rank: ${rank}
Rating: ${rating}
Chapters: ${chapters}
Views: ${views}
Status: ${status}
Genres: ${genres}
        `.trim();

        const transformedResults = [{
            description,
            aliases,
            airdate: ''
        }];

        console.log(transformedResults);
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error: ' + error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Unknown',
            airdate: ''
        }]);
    }
}

async function extractChapters(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        const chaptersMatch = htmlText.match(/<i class="icon-book-open"><\/i>\s*(\d+)\s*<\/strong><small>Chapters<\/small>/);
        const chaptersNumber = chaptersMatch ? chaptersMatch[1] : 'Unknown';

        let chapters = [];

        for (let i = 1; i <= chaptersNumber; i++) {
            const chapterUrl = `${url}/chapter-${i}`;
            const chapter = {
                href: chapterUrl,
                number: i,
                title: `Chapter ${i}`
            };

            chapters.push(chapter);
        }

        console.log(chapters);
        return JSON.stringify(chapters);
    } catch (error) {
        console.log('Fetch error in extractChapters: ' + error);
        return JSON.stringify([]);
    }
}

async function extractText(url) {
    try {
        const response = await soraFetch(url);
        const htmlText = await response.text();

        // --- Capture entire #content block ---
        const contentMatch = htmlText.match(/<div id="content"[^>]*>([\s\S]*)<\/div>/i);
        if (!contentMatch) {
            throw new Error("Content block not found");
        }

        let content = contentMatch[1];

        // Remove notification boxes
        content = content.replace(/<p class="box-notification[^"]*">[\s\S]*?<\/p>\s*/gi, '');

        // Remove junk tags like <azxxxx>...</azxxxx>
        content = content.replace(/<az[a-z0-9]+>[\s\S]*?<\/az[a-z0-9]+>/gi, '');

        // Remove unwanted <div class="free-support-top"> ... </div>
        content = content.replace(/<div class="free-support-top"[^>]*>[\s\S]*?<\/div>/gi, '');

        // Extract only <p>...</p> blocks
        let paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
            .map(m => m[0].trim());

        // Filter out junk paragraphs (ads, disclaimers, login, etc.)
        paragraphs = paragraphs.filter(p => {
            return !/Novel Fire|Disclaimer|Login|Sign Up|Privacy Policy|Terms of Service|Latest Novels|Userful links|ads redirect|broken links|spam, social, or other folders/i.test(p);
        });

        const cleaned = paragraphs.join("\n");

        console.log(cleaned);
        return cleaned;
    } catch (error) {
        console.log("Fetch error in extractText: " + error);
        return JSON.stringify({ text: 'Error extracting text' });
    }
}

// searchResults('mushoku');
// extractDetails('https://novelfire.net/book/mushoku-tensei');
// extractChapters('https://novelfire.net/book/mushoku-tensei');
// extractText('https://novelfire.net/book/mushoku-tensei/chapter-1');

// searchResults('my long');
// extractDetails('https://novelfire.net/book/my-longevity-simulation');
// extractChapters('https://novelfire.net/book/my-longevity-simulation');
// extractText('https://novelfire.net/book/my-longevity-simulation/chapter-1');

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}