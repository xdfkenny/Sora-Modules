async function searchResults(keyword) {
    const results = [];
    const response = await soraFetch(`https://onepace.net/en/watch`);
    const html = await response.text();

    // First, extract all images in order
    const allImages = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/g)].map(m => m[1])
                      .concat([...html.matchAll(/background-image:\s*url\(['"]([^'"]+)['"]\)/g)].map(m => m[1]));
    
    const arcSections = html.split('<h2');
    
    
    // Process each arc section starting from index 1 (skip the first split result)
    for (let i = 1; i < arcSections.length; i++) {
        const currentSection = arcSections[i];
        
        // Extract title from current section
        const titleMatch = currentSection.match(/<a href="#[^"]*"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        let arcTitle = titleMatch[1]
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<[^>]+>/g, '')
            .trim()
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"');
        
        // Get image for this arc - shifted by 1 to align correctly
        let arcImage = '';
        if (allImages[i]) {  // Using i instead of i-1 to shift image index forward
            arcImage = allImages[i].replace(/&amp;/g, '&');
            if (arcImage.startsWith('/_next')) {
                arcImage = 'https://onepace.net' + arcImage;
            }
        }
        
        // For the last arc, use the last image from the array
        if (i === arcSections.length - 1 && allImages[0]) {
            arcImage = allImages[0].replace(/&amp;/g, '&');
            if (arcImage.startsWith('/_next')) {
                arcImage = 'https://onepace.net' + arcImage;
            }
        }

        const episodeBlocks = currentSection.split('<span class="flex-1">');
        for (let j = 1; j < episodeBlocks.length; j++) {
            const block = episodeBlocks[j];
            
            let type = '';
            if (block.includes('English Subtitles')) {
                type = 'English Subtitles';
                if (block.includes('Extended')) {
                    type += ', Extended';
                }
                if (block.includes('Alternate')) {
                    type += ', Alternate';
                }
            } else if (block.includes('English Dub with Closed Captions')) {
                type = 'English Dub with Closed Captions';
                if (block.includes('Extended')) {
                    type += ', Extended';
                }
                if (block.includes('Alternate')) {
                    type += ', Alternate';
                }
            } else if (block.includes('English Dub')) {
                type = 'English Dub';
                if (block.includes('Extended')) {
                    type += ', Extended';
                }
                if (block.includes('Alternate')) {
                    type += ', Alternate';
                }
            } else {
                continue;
            }

            // Get quality-specific links
            let qualityLinks = new Map();
            const qualityMatches = [...block.matchAll(/>\s*(480p|720p|1080p)\s*</g)];
            const linkMatches = [...block.matchAll(/href="(https:\/\/pixeldrain\.net\/l\/[^"]+)"/g)];
            
            // Match links with qualities in order
            if (qualityMatches.length > 0 && linkMatches.length > 0) {
                // Make sure we have at most one link per quality
                const uniqueQualities = [...new Set(qualityMatches.map(m => m[1]))];
                uniqueQualities.forEach((quality, index) => {
                    if (index < linkMatches.length) {
                        qualityLinks.set(quality, linkMatches[index][1]);
                    }
                });
            }
            
            // Add entries for all found qualities
            for (const [quality, href] of qualityLinks) {
                const title = `${arcTitle}, ${type}, ${quality.trim()}`;
                if (!keyword || title.toLowerCase().includes(keyword.toLowerCase()) || 
                    keyword.toLowerCase() === 'all' || 
                    keyword.toLowerCase() === 'everything') {
                    results.push({
                        title: title,
                        href: href,
                        image: arcImage
                    });
                }
            }
        }
    }

    if (results.length === 1) {
        results.push({
            title: "[SUB] [1080p] Romance Dawn",
            href: "https://pixeldrain.net/l/VmpS467P",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Romance Dawn",
            href: "https://pixeldrain.net/l/HdPqPTPH",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Romance Dawn",
            href: "https://pixeldrain.net/l/bhS9Ckwd",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Romance Dawn",
            href: "https://pixeldrain.net/l/pvG4Abkj",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Romance Dawn",
            href: "https://pixeldrain.net/l/8tTqRmqz",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Romance Dawn",
            href: "https://pixeldrain.net/l/ffUWgo1D",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[DUB w/ CC] [1080p] Romance Dawn",
            href: "https://pixeldrain.net/l/wizeJCj9",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[DUB w/ CC] [720p] Romance Dawn",
            href: "https://pixeldrain.net/l/Ari5Ky2Y",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[DUB w/ CC] [480p] Romance Dawn",
            href: "https://pixeldrain.net/l/hC2wxGhk",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-1-Romance-Dawn-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Orange Town",
            href: "https://pixeldrain.net/l/sT25hhHR",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-2-Orange-Town-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Orange Town",
            href: "https://pixeldrain.net/l/mY9ec67L",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-2-Orange-Town-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Orange Town",
            href: "https://pixeldrain.net/l/bjaCwAUg",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-2-Orange-Town-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Orange Town",
            href: "https://pixeldrain.net/l/iaNhR5m9",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-2-Orange-Town-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Orange Town",
            href: "https://pixeldrain.net/l/15ZENNeo",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-2-Orange-Town-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Orange Town",
            href: "https://pixeldrain.net/l/SMYKttMf",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-2-Orange-Town-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Syrup Village",
            href: "https://pixeldrain.net/l/qWAH3hqU",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-3-Syrup-Village-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Syrup Village",
            href: "https://pixeldrain.net/l/w1PoW7PJ",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-3-Syrup-Village-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Syrup Village",
            href: "https://pixeldrain.net/l/QqXe6SEY",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-3-Syrup-Village-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Syrup Village",
            href: "https://pixeldrain.net/l/tMvvu6Yq",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-3-Syrup-Village-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Syrup Village",
            href: "https://pixeldrain.net/l/YYUazeje",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-3-Syrup-Village-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Syrup Village",
            href: "https://pixeldrain.net/l/JVkHktvL",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-3-Syrup-Village-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Gaimon",
            href: "https://pixeldrain.net/l/RnBjG5bE",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-4-Gaimon-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Gaimon",
            href: "https://pixeldrain.net/l/iiTTYhCg",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-4-Gaimon-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Gaimon",
            href: "https://pixeldrain.net/l/mjFVQAjP",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-4-Gaimon-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Gaimon",
            href: "https://pixeldrain.net/l/c9i2eVL5",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-4-Gaimon-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Gaimon",
            href: "https://pixeldrain.net/l/FV9EJ5ve",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-4-Gaimon-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Gaimon",
            href: "https://pixeldrain.net/l/dPtUZAyk",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-4-Gaimon-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Baratie",
            href: "https://pixeldrain.net/l/o4TEDwm6",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-5-Baratie-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Baratie",
            href: "https://pixeldrain.net/l/dbL8ujD9",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-5-Baratie-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Baratie",
            href: "https://pixeldrain.net/l/Cjxhskb6",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-5-Baratie-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Baratie",
            href: "https://pixeldrain.net/l/ZwgqE6ar",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-5-Baratie-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Baratie",
            href: "https://pixeldrain.net/l/3LcuJRuQ",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-5-Baratie-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Baratie",
            href: "https://pixeldrain.net/l/2f85nrQt",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-5-Baratie-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Arlong Park",
            href: "https://pixeldrain.net/l/L2yDubpH",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Arlong Park",
            href: "https://pixeldrain.net/l/8HF9AiaK",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Arlong Park",
            href: "https://pixeldrain.net/l/nZLW8b72",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Arlong Park Extended",
            href: "https://pixeldrain.net/l/stjsG6YJ",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Arlong Park Extended",
            href: "https://pixeldrain.net/l/9nQMxFRn",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Arlong Park Extended",
            href: "https://pixeldrain.net/l/Y759DobB",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Arlong Park",
            href: "https://pixeldrain.net/l/w2hAukxX",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Arlong Park",
            href: "https://pixeldrain.net/l/7yQEMBFq",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Arlong Park",
            href: "https://pixeldrain.net/l/6azKaGxc",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Arlong Park Extended",
            href: "https://pixeldrain.net/l/7zWaSGZv",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Arlong Park Extended",
            href: "https://pixeldrain.net/l/jBLrC2Zq",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Arlong Park Extended",
            href: "https://pixeldrain.net/l/KL51iUeH",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-6-Arlong-Park-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] The Adventures of Buggy's Crew",
            href: "https://pixeldrain.net/l/HnL9ip5k",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-7-The-Adventures-of-Buggys-Crew-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] The Adventures of Buggy's Crew",
            href: "https://pixeldrain.net/l/MbJLcYcA",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-7-The-Adventures-of-Buggys-Crew-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Loguetown",
            href: "https://pixeldrain.net/l/Humwo7QP",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-8-Loguetown-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [480p] Loguetown",
            href: "https://pixeldrain.net/l/TBaw1Tp6",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-8-Loguetown-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [720p] Reverse Mountain",
            href: "https://pixeldrain.net/l/1kVQHoeo",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-9-Reverse-Mountain-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [720p] Reverse Mountain",
            href: "https://pixeldrain.net/l/s4DEnuS5",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-9-Reverse-Mountain-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [480p] Whisky Peak",
            href: "https://pixeldrain.net/l/xMf7ZMzv",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-10-Whiskey-Peak-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [720p] The Trials of Koby-Meppo",
            href: "https://pixeldrain.net/l/Sspa78Sd",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-11-The-Trials-of-Koby-Meppo-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] The Trials of Koby-Meppo",
            href: "https://pixeldrain.net/l/b9XwPSBA",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-11-The-Trials-of-Koby-Meppo-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Little Garden",
            href: "https://pixeldrain.net/l/7Ge8FAsV",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-12-Little-Garden-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [720p] Little Garden",
            href: "https://pixeldrain.net/l/uhd3P85A",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-12-Little-Garden-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [480p] Little Garden",
            href: "https://pixeldrain.net/l/QYHi9mzX",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-12-Little-Garden-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Little Garden",
            href: "https://pixeldrain.net/l/SrFc5Em4",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-12-Little-Garden-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [720p] Little Garden",
            href: "https://pixeldrain.net/l/G6P9DNFe",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-12-Little-Garden-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [480p] Little Garden",
            href: "https://pixeldrain.net/l/ABkpM5Nr",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-12-Little-Garden-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [720p] Drum Island",
            href: "https://pixeldrain.net/l/ayrMbpVW",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-13-Drum-Island-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [720p] Drum Island",
            href: "https://pixeldrain.net/l/f4Kt9jzH",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-13-Drum-Island-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Alabasta",
            href: "https://pixeldrain.net/l/VxHtEguD",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-14-Alabasta-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Alabasta",
            href: "https://pixeldrain.net/l/apd1qjBN",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-14-Alabasta-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Alabasta",
            href: "https://pixeldrain.net/l/XxvpSBuJ",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-14-Alabasta-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Alabasta",
            href: "https://pixeldrain.net/l/TYiY6GU4",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-14-Alabasta-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Alabasta",
            href: "https://pixeldrain.net/l/9MzVKBPD",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-14-Alabasta-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Alabasta",
            href: "https://pixeldrain.net/l/9Y5TEMdV",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-14-Alabasta-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Jaya",
            href: "https://pixeldrain.net/l/6G1A3ufN",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-15-Jaya-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [720p] Jaya",
            href: "https://pixeldrain.net/l/mo4QoCFk",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-15-Jaya-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Skypiea",
            href: "https://pixeldrain.net/l/zS8jNCGf",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Skypiea",
            href: "https://pixeldrain.net/l/B3yZ2Yei",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Skypiea",
            href: "https://pixeldrain.net/l/kLKJCU2q",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Skypiea Alternate (G-8)",
            href: "https://pixeldrain.net/l/ZUnxxNgk",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Skypiea Alternate (G-8)",
            href: "https://pixeldrain.net/l/iVWt8WcW",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Skypiea Alternate (G-8)",
            href: "https://pixeldrain.net/l/BH2vja2K",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Skypiea",
            href: "https://pixeldrain.net/l/HsuguvD3",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Skypiea",
            href: "https://pixeldrain.net/l/AeNHWRGL",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Skypiea",
            href: "https://pixeldrain.net/l/cqahHH4y",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Skypiea Alternate (G-8)",
            href: "https://pixeldrain.net/l/7MkvW5o9",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Skypiea Alternate (G-8)",
            href: "https://pixeldrain.net/l/g4sDD6fM",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Skypiea Alternate (G-8)",
            href: "https://pixeldrain.net/l/xKt2ijfA",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-16-Skypiea-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Long Ring Long Land",
            href: "https://pixeldrain.net/l/wdnDUcoh",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-17-Long-Ring-Long-Land-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [720p] Long Ring Long Land",
            href: "https://pixeldrain.net/l/RSp1aAPY",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-17-Long-Ring-Long-Land-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [480p] Long Ring Long Land",
            href: "https://pixeldrain.net/l/v2VhAUMy",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-17-Long-Ring-Long-Land-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Long Ring Long Land",
            href: "https://pixeldrain.net/l/DK165Lfd",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-17-Long-Ring-Long-Land-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [720p] Long Ring Long Land",
            href: "https://pixeldrain.net/l/kTb436Vv",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-17-Long-Ring-Long-Land-ALT-2.jpg"
        });

        results.push({
            title: "[DUB] [480p] Long Ring Long Land",
            href: "https://pixeldrain.net/l/qe6NsBnd",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-17-Long-Ring-Long-Land-ALT-2.jpg"
        });

        results.push({
            title: "[SUB] [720p] Water Seven",
            href: "https://pixeldrain.net/l/WW5J2jX9",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-18-Water-Seven-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Water Seven",
            href: "https://pixeldrain.net/l/59HCmx6N",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-18-Water-Seven-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Enies Lobby",
            href: "https://pixeldrain.net/l/auVnaWWb",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-19-Enies-Lobby-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Enies Lobby",
            href: "https://pixeldrain.net/l/mUdZdtXz",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-19-Enies-Lobby-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Post-Enies Lobby",
            href: "https://pixeldrain.net/l/ybXdFXtN",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-20-Post-Enies-Lobby-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Thriller Bark",
            href: "https://pixeldrain.net/l/HoiVPVa9",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-21-Thriller-Bark-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Sabaody Archipelago",
            href: "https://pixeldrain.net/l/Br89QGLT",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-22-Sabaody-Archipelago-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Amazon Lily",
            href: "https://pixeldrain.net/l/eo9wEgfe",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-23-Amazon-Lily-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Impel Down",
            href: "https://pixeldrain.net/l/B7K3GLhN",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-24-Impel-Down-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] If You Could Go Anywhere... The Adventures of the Straw Hats",
            href: "https://pixeldrain.net/l/Sa5AHh5z",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-25-If-You-Could-Go-Anywhere.-The-Adventures-of-the-Straw-Hats-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] If You Could Go Anywhere... The Adventures of the Straw Hats",
            href: "https://pixeldrain.net/l/enZf6R88",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-25-If-You-Could-Go-Anywhere.-The-Adventures-of-the-Straw-Hats-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Marineford",
            href: "https://pixeldrain.net/l/1EvkpXLD",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-26-Marineford-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Post-War",
            href: "https://pixeldrain.net/l/bN2sHsft",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-27-Post-War-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Post-War",
            href: "https://pixeldrain.net/l/WjxroZSq",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-27-Post-War-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Return to Sabaody",
            href: "https://pixeldrain.net/l/L43AyDMU",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-28-Return-to-Sabaody-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Return to Sabaody",
            href: "https://pixeldrain.net/l/JNBvnBsg",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-28-Return-to-Sabaody-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Fishman Island",
            href: "https://pixeldrain.net/l/gcFZLsPn",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-29-Fishman-Island-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Punk Hazard",
            href: "https://pixeldrain.net/l/JhEhtVpm",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-30-Punk-Hazard-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Dressrosa",
            href: "https://pixeldrain.net/l/PGjvkoYC",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-31-Dressrosa-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Zou",
            href: "https://pixeldrain.net/l/ETokmVWr",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-32-Zou-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Whole Cake Island",
            href: "https://pixeldrain.net/l/5pVTECas",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-33-Whole-Cake-Island-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Reverie",
            href: "https://pixeldrain.net/l/KVo2feRk",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-34-Reverie-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Reverie",
            href: "https://pixeldrain.net/l/twsSB1xc",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-34-Reverie-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Reverie",
            href: "https://pixeldrain.net/l/a91XPU2A",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-34-Reverie-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Reverie",
            href: "https://pixeldrain.net/l/HgqaUnRr",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-34-Reverie-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Reverie",
            href: "https://pixeldrain.net/l/zrfn5Vor",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-34-Reverie-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Reverie",
            href: "https://pixeldrain.net/l/WU4pgbvE",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-34-Reverie-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Wano",
            href: "https://pixeldrain.net/l/SVKiQSGE",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Wano",
            href: "https://pixeldrain.net/l/du8Dr9rw",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Wano",
            href: "https://pixeldrain.net/l/87WvGckH",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Wano Extended",
            href: "https://pixeldrain.net/l/d7qi5the",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Wano Extended",
            href: "https://pixeldrain.net/l/dxS5pzF3",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Wano Extended",
            href: "https://pixeldrain.net/l/o8PiHdb8",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Wano",
            href: "https://pixeldrain.net/l/ce5RfrJA",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Wano",
            href: "https://pixeldrain.net/l/1vPgfM3y",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Wano",
            href: "https://pixeldrain.net/l/teLAJnPL",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Wano Extended",
            href: "https://pixeldrain.net/l/AgcNBUKh",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Wano Extended",
            href: "https://pixeldrain.net/l/6YpD1oDY",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Wano Extended",
            href: "https://pixeldrain.net/l/mtAAKA4Q",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-35-Wano-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Egghead",
            href: "https://pixeldrain.net/l/ZEtWgytk",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Egghead",
            href: "https://pixeldrain.net/l/2nxix7bF",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Egghead",
            href: "https://pixeldrain.net/l/1TBGe6im",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] Egghead Extended",
            href: "https://pixeldrain.net/l/v9RkPU61",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[SUB] [720p] Egghead Extended",
            href: "https://pixeldrain.net/l/fSWVaiWV",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[SUB] [480p] Egghead Extended",
            href: "https://pixeldrain.net/l/At3KpFF2",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Egghead",
            href: "https://pixeldrain.net/l/G2iWxohw",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Egghead",
            href: "https://pixeldrain.net/l/nKTEVT1f",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Egghead",
            href: "https://pixeldrain.net/l/gZQ7qeUt",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[DUB] [1080p] Egghead Extended",
            href: "https://pixeldrain.net/l/7eicwoJt",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[DUB] [720p] Egghead Extended",
            href: "https://pixeldrain.net/l/MTiCn7cK",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[DUB] [480p] Egghead Extended",
            href: "https://pixeldrain.net/l/CLnfKrsG",
            image: "https://onepace.co/wp-content/uploads/2025/09/Season-36-Egghead-ALT.jpg"
        });

        results.push({
            title: "[SUB] [1080p] One Piece Fan Letter",
            href: "https://pixeldrain.net/l/FA11f6u2",
            image: ""
        });

        results.push({
            title: "[SUB] [720p] One Piece Fan Letter",
            href: "https://pixeldrain.net/l/cTvXTid9",
            image: ""
        });

        results.push({
            title: "[SUB] [480p] One Piece Fan Letter",
            href: "https://pixeldrain.net/l/JGkNAa1V",
            image: ""
        });

        results.push({
            title: "[SUB] [1080p] Warship Island 01 (April Fools 2025)",
            href: "https://pixeldrain.net/l/Fo4iTm7F",
            image: ""
        });

        results.push({
            title: "[SUB] [720p] Warship Island 01 (April Fools 2025)",
            href: "https://pixeldrain.net/l/y3pdBczx",
            image: ""
        });

        results.push({
            title: "[SUB] [480p] Warship Island 01 (April Fools 2025)",
            href: "https://pixeldrain.net/l/YTERtTLz",
            image: ""
        });
    }
    
    console.log(`Results: ${JSON.stringify(results)}`);
    return JSON.stringify(results);
}

async function extractDetails(url) {
    const match = url.match(/https:\/\/pixeldrain\.net\/l\/([^\/]+)/);
    if (!match) throw new Error("Invalid URL format");
            
    const arcId = match[1];

    const response = await soraFetch(`https://pixeldrain.net/api/list/${arcId}`);
    const data = await response.json();    

    const transformedResults = [{
        description: `Title: ${data.title}\nFile Count: ${data.file_count}`,
        aliases: `Title: ${data.title}\nFile Count: ${data.file_count}`,
        airdate: ''
    }];

    console.log(`Details: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

async function extractEpisodes(url) {
    const match = url.match(/https:\/\/pixeldrain\.net\/l\/([^\/]+)/);
    if (!match) throw new Error("Invalid URL format");
            
    const arcId = match[1];

    const response = await soraFetch(`https://pixeldrain.net/api/list/${arcId}`);
    const data = await response.json();

    const transformedResults = data.files.map((result, index) => {
        return {
            href: `${result.id}`,
            number: index + 1,
        };
    });

    console.log(`Episodes: ${JSON.stringify(transformedResults)}`);
    return JSON.stringify(transformedResults);
}

// searchResults("all");
// extractDetails("https://pixeldrain.net/l/sT25hhHR");
// extractEpisodes("https://pixeldrain.net/l/sT25hhHR");

async function extractStreamUrl(url) {
    return JSON.stringify({
        streams: [{ title: "Pixeldrain", streamUrl: `https://pixeldrain.net/api/file/${url}?download`, headers: {} }]
    });
}

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
