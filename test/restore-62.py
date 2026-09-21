#!/usr/bin/env python3
"""Restore archived Sora modules from git.luna-app.eu/ into the repo root.

For each module: copy manifest+script into root/<name>/ with the canonical
<name>.json / <name>.js naming, repoint scriptUrl/scriptURL at this repo's
GitHub raw, normalize required manifest fields, and register it in
modules.json. No network calls; pure file surgery.
"""
import json, os, shutil, glob, re, sys

ROOT = '/Users/xdfke/Documents/xdfkenny-sora-modules'
ARC  = os.path.join(ROOT, 'git.luna-app.eu')
RAW  = 'https://raw.githubusercontent.com/xdfkenny/xdfkenny-sora-modules/main'

# name -> (source_dir_under_ARC, manifest filename)
# manifest filename drives the JS pick: scriptUrl/scriptURL basename wins,
# else fall back to <name>.js in the source dir.
SRC = {
    # ---- Anime ----
    'animeheaven':   ('50n50_sources/animeheaven', 'animeheaven.json'),
    'animeweek':     ('50n50_sources/animeweek', 'animeweek.json'),
    'animexin':      ('50n50_sources/animexin', 'animexin.json'),
    'anoboye':       ('50n50_sources/anoboye', 'anoboye.json'),
    'anihq':         ('50n50_sources/anihq', 'anihq.json'),
    'animesdigital': ('50n50_sources/animesdigital', 'animesdigital.json'),
    'animesrbija':   ('50n50_sources/animesrbija', 'animesrbija.json'),
    'donghuastream': ('50n50_sources/donghuastream', 'donghuastream.json'),
    'luciferdonghua':('50n50_sources/luciferdonghua', 'luciferdonghua.json'),
    'otakutsu':      ('50n50_sources/otakutsu', 'otakutsu.json'),
    'dessin-anime':  ('MXFia19_sources/dessin-anime', 'dessin-anime.json'),
    'miruro':        ('MXFia19_sources/miruro', 'miruro.json'),
    'kuudere':       ('ibro_services/kuudere', 'kuudere.json'),
    'anizone':       ('ibro_services/anizone', 'anizone.json'),
    'ristoanime':    ('ibro_services/ristoanime', 'ristoanime.json'),
    'sameband':      ('anonymous_sources/sameband', 'sameband.json'),
    'shizaproject':  ('anonymous_sources/shizaproject', 'shizaproject.json'),
    'spacepowerfans':('ibro_services/spacepowerfans', 'spacepowerfans.json'),
    'anime-base':    ('Cufiy_sora-modules/modules/anime-base', 'anime-base-DUB.json'),
    'animeportal':   ('ibro_services/animeportal', 'animeportal.json'),
    'anify':         ('ibro_services/anify', 'anify.json'),
    'anikoto':       ('ibro_services/anikoto', 'anikoto.json'),
    'latanime':      ('Cufiy_sora-modules/modules/latanime', 'latanime.json'),
    '1tamilcrow':    ('50n50_sources/1tamilcrow', '1tamilcrow.json'),
    # ---- Movies / Shows ----
    '111movies':     ('ibro_services/111movies', '111movies.json'),
    'filmo':         ('Cufiy_sora-modules/modules/filmo', 'filmo_en.json'),
    'filmpalast':    ('Cufiy_sora-modules/modules/filmpalast', 'filmpalast.json'),
    'catflix':       ('Cufiy_sora-modules/modules/catflix', 'catflix.json'),
    'hdrezka':       ('anonymous_sources/hdrezka', 'hdrezka2.json'),
    'moflix':        ('Cufiy_sora-modules/modules/moflix', 'moflix.json'),
    'movix':         ('MXFia19_sources/movix', 'movix.json'),
    'Nakastream':    ('MXFia19_sources/Nakastream', 'Nakastream.json'),
    'rgshows':       ('ibro_services/rgshows', 'rgshows.json'),
    'asia2tv':       ('50n50_sources/asia2tv', 'asia2tv.json'),
    'turkish123':    ('50n50_sources/turkish123', 'turkish123.json'),
    'vidapi':        ('ibro_services/vidapi', 'vidapi.json'),
    'vidlink':       ('50n50_sources/vidlink', 'vidlink.json'),
    'vidrock':       ('ibro_services/vidrock', 'vidrock.json'),
    'xiaoxintv':     ('50n50_sources/xiaoxintv', 'xiaoxintv.json'),
    'arabictoons':   ('ibro_services/arabictoons', 'arabictoons.json'),
    'topcinema':     ('ibro_services/topcinema', 'topcinema.json'),
    'uaserial':      ('ibro_services/uaserial', 'uaserial.json'),
    'purstream':     ('MXFia19_sources/purstream', 'purstream.json'),
    'doramaland':    ('50n50_sources/doramaland', 'doramaland.json'),
    # ---- Novels ----
    'lightnovelworld': ('50n50_sources/lightnovelworld', 'lightnovelworld.json'),
    'novelbuddy':      ('ibro_services/novelbuddy', 'novelbuddy.json'),
    'noveldot':        ('ibro_services/noveldot', 'noveldot.json'),
    'novelfire':       ('ibro_services/novelfire', 'novelfire.json'),
    'readnovelfull':   ('50n50_sources/readnovelfull', 'readnovelfull.json'),
    # ---- Manga ----
    'mangafire':     ('50n50_sources/mangafire', 'mangafire.json'),
    'mangakatana':   ('50n50_sources/mangakatana', 'mangakatana.json'),
    'mangataro':     ('50n50_sources/mangataro', 'mangataro.json'),
    'kaliscan':      ('50n50_sources/kaliscan', 'kaliscan.json'),
    'rumanhua1':     ('50n50_sources/rumanhua1', 'rumanhua.json'),
    # ---- Fan recuts / pace (pixeldrain-hosted) ----
    'narucannon':          ('ibro_services/narucannon', 'narucannon.json'),
    'onepace':             ('ibro_services/onepace', 'onepace.json'),
    'onePieceFilmRedAmaLeeScore': ('ibro_services/onePieceFilmRedAmaLeeScore', 'onePieceFilmRedAmaLeeScore.json'),
    'onePieceTreasureEdition':    ('ibro_services/onePieceTreasureEdition', 'onePieceTreasureEdition.json'),
    'rebuildOfNaruto':     ('ibro_services/rebuildOfNaruto', 'rebuildOfNaruto.json'),
    'yuYuHakushoPace':     ('ibro_services/yuYuHakushoPace', 'yuYuHakushoPace.json'),
}

# baseUrl fallbacks for manga manifests that lack it (verified hardcoded in JS)
MANGA_BASE = {
    'mangafire':   'https://mangafire.to/',
    'mangakatana': 'https://mangakatana.com/',
    'mangataro':   'https://mangataro.org/',
    'kaliscan':    'https://kaliscan.io/',
    'rumanhua1':   'http://rumanhua1.com/',
}

def raw_for(name, jsv):
    return f'{RAW}/{name}/{jsv}'

def pick_js(src_dir, manifest, name):
    """Determine the JS file: manifest scriptUrl/scriptURL basename first."""
    for key in ('scriptUrl', 'scriptURL'):
        u = manifest.get(key)
        if u:
            base = os.path.basename(str(u).split('?')[0])
            if base and os.path.exists(os.path.join(src_dir, base)):
                return base
    cand = name + '.js'
    if os.path.exists(os.path.join(src_dir, cand)):
        return cand
    js = glob.glob(os.path.join(src_dir, '*.js'))
    if js:
        return os.path.basename(js[0])
    return None

def main():
    existing = set(os.listdir(ROOT))
    done, skipped = [], []
    for name in sorted(SRC):
        if name in existing:
            skipped.append((name, 'already in root'))
            continue
        subdir, mfile = SRC[name]
        src_dir = os.path.join(ARC, subdir)
        if not os.path.isdir(src_dir):
            skipped.append((name, 'source dir missing'))
            continue
        mpath = os.path.join(src_dir, mfile)
        if not os.path.exists(mpath):
            skipped.append((name, 'manifest missing: ' + mfile))
            continue
        try:
            with open(mpath, encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception as e:
            skipped.append((name, 'manifest unreadable: ' + str(e)))
            continue

        jsv = pick_js(src_dir, manifest, name)
        if not jsv:
            skipped.append((name, 'no JS found'))
            continue

        # ---- copy files ----
        dst_dir = os.path.join(ROOT, name)
        os.makedirs(dst_dir, exist_ok=True)
        shutil.copy2(os.path.join(src_dir, mfile), os.path.join(dst_dir, name + '.json'))
        shutil.copy2(os.path.join(src_dir, jsv),   os.path.join(dst_dir, name + '.js'))

        # ---- normalize manifest ----
        typ = manifest.get('type') or 'anime'
        is_org = 'mangas' in str(typ)
        is_novel = 'novels' in str(typ)

        m = dict(manifest)
        base = m.get('baseUrl') or MANGA_BASE.get(name) or ''
        # baseUrl may have no trailing slash; normalize that
        if base and not base.endswith('/'):
            base = base + '/'
        m['baseUrl'] = base
        if not m.get('searchBaseUrl'):
            m['searchBaseUrl'] = base
        if is_org:
            m.setdefault('streamType', 'mangas')
            m.setdefault('quality', 'N/A')
        if is_novel:
            m['novel'] = True
            m.setdefault('streamType', 'novels')
            m.setdefault('quality', 'N/A')
        m['asyncJS'] = True
        # author {name, icon} normalization
        au = m.get('author') or {}
        if not isinstance(au, dict):
            au = {}
        if 'icon' not in au and 'iconURL' in au:
            au['icon'] = au['iconURL']
        if 'name' not in au:
            au['name'] = m.get('sourceName') or name
        m['author'] = au
        # iconUrl normalization (favicon fallback for modules.json entry)
        if not m.get('iconUrl') and not m.get('iconURL'):
            host = re.sub(r'^https?://', '', base).split('/')[0]
            m['iconURL'] = f'https://{host}/favicon.ico'
        # scriptUrl -> this repo
        m['scriptUrl'] = raw_for(name, name + '.js')
        m['scriptURL'] = m['scriptUrl']

        # ---- write manifest ----
        with open(os.path.join(dst_dir, name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(m, f, indent=2, ensure_ascii=False)
            f.write('\n')
        done.append((name, jsv, typ, base, mfile))

    print(f'RESTORED {len(done)} modules:')
    for name, jsv, typ, base, mfile in done:
        print(f'  {name:<26} type={typ:<20} base={base:<34} js={jsv}')
    if skipped:
        print(f'\nSKIPPED {len(skipped)}:')
        for name, why in skipped:
            print(f'  {name}: {why}')
    return done

if __name__ == '__main__':
    main()