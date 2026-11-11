'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const script = path.join(root, 'animesfhd/animesfhd.js');
const base = 'https://animesfhd.net';
const seriesId = '1709160706373932';
const movieId = '2110072639862535';
const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8').replace(/^\uFEFF/, ''));

function load(respond) {
    const calls = [];
    const context = vm.createContext({
        fetchv2: async (url, headers, method, body) => {
            calls.push({ url, headers, method, body });
            const data = await respond(new URL(url));
            if (data instanceof Error) throw data;
            return data && data.response ? data.response : { json: () => data };
        }
    });
    assert.ok(fs.existsSync(script), 'AnimesFHD module must exist');
    vm.runInContext(fs.readFileSync(script, 'utf8'), context);
    return { context, calls };
}

async function result(context, method, argument) {
    assert.equal(typeof context[method], 'function', method + ' must be global');
    const value = await context[method](argument);
    assert.equal(typeof value, 'string');
    return JSON.parse(value);
}

test('search preserves large IDs, encodes queries and exposes explicit season/audio versions', async () => {
    const { context, calls } = load(url => {
        if (url.pathname === '/api/series') return fixture('busca-frieren');
        return {
            versions: [
                { series_id: 2751618645542326, title: 'Sousou no Frieren', season_label: 'Temporada 1', audio: 'legendado' },
                { series_id: 2751618645542327, title: 'Sousou no Frieren', season_label: 'Temporada 1', audio: 'dublado' },
                { series_id: 2751618645542328, title: 'Sousou no Frieren', season_label: 'Temporada 2', audio: 'legendado' }
            ]
        };
    });
    const items = await result(context, 'searchResults', ' Frieren & além ');
    assert.deepEqual(items.map(x => x.href), [base + '/serie/2751618645542326', base + '/serie/2751618645542327', base + '/serie/2751618645542328']);
    assert.match(items[1].title, /Temporada 1.*Dublado/);
    assert.match(items[2].title, /Temporada 2.*Legendado/);
    assert.equal(items[0].image, 'https://image.tmdb.org/t/p/original/d9IuDqPWoUYukwblQhqV00jlCzZ.jpg');
    assert.equal(new URL(calls[0].url).searchParams.get('q'), 'Frieren & além');
    for (const call of calls) {
        assert.equal(call.headers.Referer, base + '/');
        assert.match(call.headers['User-Agent'], /Mozilla\/5.0/);
        assert.equal(call.method, 'GET');
        assert.equal(call.body, null);
    }
});

test('empty search uses popular titles and survives unavailable version metadata', async () => {
    const { context, calls } = load(url => url.pathname === '/api/series' ? fixture('populares') : new Error('offline'));
    const items = await result(context, 'searchResults', '');
    assert.equal(items.length, fixture('populares').series.length);
    assert.equal(new URL(calls[0].url).searchParams.get('sort'), 'popular');
    assert.equal(new URL(calls[0].url).searchParams.has('q'), false);
    assert.ok(items.every(x => /^https:\/\/animesfhd.net\/serie\/\d+$/.test(x.href)));
});

test('details map description, newline aliases and release date from the real series fixture', async () => {
    const { context } = load(() => fixture('serie-' + seriesId));
    const details = await result(context, 'extractDetails', base + '/serie/' + seriesId);
    assert.equal(details.length, 1);
    assert.match(details[0].description, /^Sato pode ser/);
    assert.equal(details[0].aliases, 'The Cold Sato-san is Only Sweet to Me, Shiotaiou no Satou-san ga Ore ni dake Amai');
    assert.equal(details[0].airdate, '2026-10-06');
});

test('episodes paginate, deduplicate IDs, sort numbers and keep specials without mixing versions', async () => {
    const { context, calls } = load(url => {
        const data = fixture('serie-' + seriesId);
        data.versions.push({ series_id: 42, audio: 'dublado', season: 2 });
        if (url.searchParams.get('page') === '1') {
            data.episodes = [data.episodes[1], data.episodes[0]];
            data.has_more = true;
        } else {
            data.episodes = [data.episodes[1], { id: 9999, episode_number: 2.5 }, { id: 10000, episode_number: 0 }];
            data.has_more = false;
        }
        return data;
    });
    const episodes = await result(context, 'extractEpisodes', base + '/serie/' + seriesId);
    assert.deepEqual(episodes, [
        { href: base + '/episod/10000', number: 0 },
        { href: base + '/episod/22882', number: 1 },
        { href: base + '/episod/109246', number: 2 },
        { href: base + '/episod/9999', number: 2.5 }
    ]);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => new URL(c.url).pathname === '/api/series/' + seriesId));
    assert.ok(calls.every(c => new URL(c.url).searchParams.get('per_page') === '200'));
});

test('movies use their single real episode and expose its source subtitle', async () => {
    const { context } = load(url => url.pathname.startsWith('/api/series/') ? fixture('serie-filme-' + movieId) : fixture('episodio-filme-1049086484300956'));
    const episodes = await result(context, 'extractEpisodes', base + '/serie/' + movieId);
    assert.deepEqual(episodes, [{ href: base + '/episod/1049086484300956', number: 1 }]);
    const media = await result(context, 'extractStreamUrl', episodes[0].href);
    assert.equal(media.streams[0].streamUrl, base + '/api/v/s4?source=2591675809550102&playlist=.m3u8');
    assert.equal(media.subtitles, base + '/api/v/s4?source=2591675809550102&subtitle=1');
});

test('streams preserve HLS and redirect URLs, filter embeds and non-native entries, and carry player headers', async () => {
    const { context, calls } = load(() => {
        const data = fixture('episodio-22882');
        data.episode.subtitle_url = '/api/v/s11?id=22882';
        data.sources.push(
            { label: 'Player 2', kind: 'file', native_video: true, audio: 'dublado', media_kind: 's5', url: '/api/v/s5?source=123' },
            { kind: 'embed', native_video: true, url: 'https://example.org/embed' },
            { kind: 'file', native_video: false, url: 'https://example.org/not-native.mp4' },
            { kind: 'file', native_video: 'true', url: 'https://example.org/string-flag.mp4' },
            { kind: 'file', native_video: 1, url: 'https://example.org/numeric-flag.mp4' },
            { kind: 'file', url: 'https://example.org/missing-flag.mp4' },
            { kind: 'file', native_video: true, url: 'javascript:bad()' },
            { kind: 'file', native_video: true, url: '' }
        );
        return data;
    });
    const media = await result(context, 'extractStreamUrl', base + '/episod/22882');
    assert.deepEqual(media.streams.map(x => x.streamUrl), [base + '/api/v/s6?source=2016384480747057&playlist=.m3u8', base + '/api/v/s5?source=123']);
    assert.match(media.streams[1].title, /Dublado/);
    assert.equal(media.subtitles, base + '/api/v/s11?id=22882');
    for (const stream of media.streams) {
        assert.equal(stream.headers.Referer, base + '/');
        assert.match(stream.headers['User-Agent'], /Mozilla\/5.0/);
    }
    assert.equal(calls.length, 1, 'media redirects must be followed by the player, not downloaded by the scraper');
});

test('source subtitles are shared only when all returned streams use the same track', async () => {
    for (const [second, expected] of [['/captions.vtt', base + '/captions.vtt'], ['/other.vtt', undefined], [null, undefined]]) {
        const { context } = load(() => ({
            sources: [
                { native_video: true, kind: 'file', url: '/first.mp4', subtitle_url: '/captions.vtt' },
                { native_video: true, kind: 'file', url: '/second.mp4', subtitle_url: second }
            ]
        }));
        const media = await result(context, 'extractStreamUrl', base + '/episod/1');
        assert.equal(media.streams.length, 2);
        assert.equal(media.subtitles, expected);
    }
});

test('registry and manifest expose a locally loadable anime provider with the template raw URL pattern', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'modules.json'), 'utf8'));
    const entries = registry.modules.filter(m => m.id === 'animesfhd');
    assert.equal(entries.length, 1);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'animesfhd/animesfhd.json'), 'utf8'));
    const template = JSON.parse(fs.readFileSync(path.join(root, 'animesdigital/animesdigital.json'), 'utf8'));
    assert.equal(entries[0].manifestUrl, template.scriptUrl.replace(/animesdigital/g, 'animesfhd').replace(/\.js$/, '.json'));
    assert.equal(manifest.scriptUrl, template.scriptUrl.replace(/animesdigital/g, 'animesfhd'));
    assert.equal(manifest.scriptURL, manifest.scriptUrl);
    assert.equal(manifest.sourceName, 'AnimesFHD');
    assert.equal(manifest.type, 'anime');
    assert.equal(manifest.language, 'Portuguese');
    assert.equal(manifest.asyncJS, true);
    assert.equal(manifest.supportsSora, true);
    assert.equal(manifest.supportsLuna, true);
    assert.match(manifest.searchBaseUrl, /%s/);
});

test('episode pagination stops on repeated pages and rejects incomplete network results', async () => {
    for (const repeat of [true, false]) {
        const { context, calls } = load(url => {
            if (!repeat && url.searchParams.get('page') === '2') return new Error('offline');
            return { episodes: [{ id: 1, episode_number: 1 }], has_more: true };
        });
        assert.deepEqual(await result(context, 'extractEpisodes', base + '/serie/1'), []);
        assert.equal(calls.length, 2);
    }
});

test('all entry points return typed fallbacks on network, HTTP and JSON failures', async () => {
    for (const response of [new Error('offline'), { response: { status: 503, json: () => ({}) } }, { response: { json: () => { throw new Error('bad JSON'); } } }, null]) {
        const { context } = load(() => response);
        assert.deepEqual(await result(context, 'searchResults', 'frieren'), []);
        assert.deepEqual(await result(context, 'extractDetails', base + '/serie/1'), [{ description: 'N/A', aliases: 'N/A', airdate: 'N/A' }]);
        assert.deepEqual(await result(context, 'extractEpisodes', base + '/serie/1'), []);
        assert.deepEqual(await result(context, 'extractStreamUrl', base + '/episod/1'), { streams: [] });
    }
});

test('invalid or foreign detail/episode URLs never trigger requests', async () => {
    const { context, calls } = load(() => { throw new Error('unexpected request'); });
    for (const url of ['https://evil.example/serie/1', base + '/serie/1oops', base + '/episod/1/extra', null]) {
        await result(context, 'extractDetails', url);
        assert.deepEqual(await result(context, 'extractEpisodes', url), []);
        assert.deepEqual(await result(context, 'extractStreamUrl', url), { streams: [] });
    }
    assert.equal(calls.length, 0);
});
