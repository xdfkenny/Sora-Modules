/** Sora Module Template
 * This template is designed to help you create a module for Sora.
 * It includes functions for searching, extracting details, episodes, and stream URLs.
 * You can modify these functions to suit your needs.
 * 
 * For more information, visit the Sora documentation at https://sora.jm26.net/docs
 */


/** searchResults
 * Searches for anime/shows/movies based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */
async function searchResults(keyword) {
  try {
    const encodedKeyword = encodeURIComponent(keyword);

    const cookieData = await getAllCookies();

    const xsrf = cookieData['XSRF-TOKEN'];
    const session = cookieData['moflix_stream_session'];

    console.log('XSRF Token:' + xsrf);
    console.log('Session:' + session);

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Referer': 'https://moflix-stream.xyz/',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrf,
      'Cookie': `XSRF-TOKEN=${xsrf}; moflix_stream_session=${session}`
    };

    const response = await fetchv2(
      `https://moflix-stream.xyz/api/v1/search/${encodedKeyword}?loader=searchAutocomplete`,
      headers, "GET", null
    );
    sendLog('Response Status:' + response.status);

    // if response contains cloudflare
    if (response.status === 503) {
      throw new Error('Cloudflare protection detected. Unable to fetch search results.');
    }

    const data = await response.json() || await JSON.parse(response);

    let results = data.results || [];
    // remove items with model_type not equal to "title"
    results = results.filter(item => item.model_type === "title");



    const transformedResults = results.map(item => ({
      title: item.name,
      image: item.poster,
      href: `https://moflix-stream.xyz/titles/${item.id}/${item.name}`
    }));

    // console.log('Transformed Results:' + transformedResults);

    return JSON.stringify(transformedResults);

  } catch (error) {
    console.log('Fetch error:' + error);
    return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
  }
}


/** extractDetails
 * Extracts details of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime details.
 */
async function extractDetails(url) {
  try {
    const match = url.match(/https:\/\/moflix-stream\.xyz\/titles\/(.+)\/(.+)/);
    const encodedID = match[1];
    console.log('Encoded ID:' + encodedID);

    const cookieData = await getAllCookies();
    const xsrf = cookieData['XSRF-TOKEN'];
    const session = cookieData['moflix_stream_session'];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Referer': 'https://moflix-stream.xyz/',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrf,
      'Cookie': `XSRF-TOKEN=${xsrf}; moflix_stream_session=${session}`
    };

    const response = await fetchv2(`https://moflix-stream.xyz/api/v1/titles/${encodedID}?loader=titlePage`, headers, "GET", null);
    const data = await response.json() || await JSON.parse(response);


    const info = data.title || {};

    const runtime = parseInt(info.runtime) || 0;
    // convert to hh:mm format
    const hours = parseInt(runtime / 60, 10);
    const minutes = runtime % 60;
    const formattedRuntime = `${hours}h ${minutes}m`;

    const formattedDate = info.release_date ? info.release_date.split('T')[0] : 'Unknown';

    const transformedResults = [{
      description: info.description || 'No description available',
      aliases: `Duration: ${formattedRuntime || 'Unknown'}`,
      airdate: `Aired: ${formattedDate}`
    }];


    return JSON.stringify(transformedResults);
  } catch (error) {
    console.log('Details error:' + error);
    return JSON.stringify([{
      description: 'Error loading description',
      aliases: 'Duration: Unknown',
      airdate: 'Aired: Unknown'
    }]);
  }
}

function fuzzysearch(needle, haystack) {
  var hlen = haystack.length;
  var nlen = needle.length;
  if (nlen > hlen) {
    return false;
  }
  if (nlen === hlen) {
    return needle === haystack;
  }
  outer: for (var i = 0, j = 0; i < nlen; i++) {
    var nch = needle.charCodeAt(i);
    while (j < hlen) {
      if (haystack.charCodeAt(j++) === nch) {
        continue outer;
      }
    }
    return false;
  }
  return true;
}

var uFuzzy = function () { "use strict"; const e = (e, t) => e > t ? 1 : t > e ? -1 : 0, t = 1 / 0, l = e => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), n = "eexxaacctt", r = /\p{P}/gu, i = ["en", { numeric: !0, sensitivity: "base" }], s = (e, t, l) => e.replace("A-Z", t).replace("a-z", l), a = { unicode: !1, alpha: null, interSplit: "[^A-Za-z\\d']+", intraSplit: "[a-z][A-Z]", interBound: "[^A-Za-z\\d]", intraBound: "[A-Za-z]\\d|\\d[A-Za-z]|[a-z][A-Z]", interLft: 0, interRgt: 0, interChars: ".", interIns: t, intraChars: "[a-z\\d']", intraIns: null, intraContr: "'[a-z]{1,2}\\b", intraMode: 0, intraSlice: [1, t], intraSub: null, intraTrn: null, intraDel: null, intraFilt: () => !0, toUpper: e => e.toLocaleUpperCase(), toLower: e => e.toLocaleLowerCase(), compare: null, sort: (t, l, n, r = e) => { let { idx: i, chars: s, terms: a, interLft2: u, interLft1: g, start: f, intraIns: c, interIns: h, cases: o } = t; return i.map(((e, t) => t)).sort(((e, t) => s[t] - s[e] || c[e] - c[t] || a[t] + u[t] + .5 * g[t] - (a[e] + u[e] + .5 * g[e]) || h[e] - h[t] || f[e] - f[t] || o[t] - o[e] || r(l[i[e]], l[i[t]]))) } }, u = (e, l) => 0 == l ? "" : 1 == l ? e + "??" : l == t ? e + "*?" : e + `{0,${l}}?`, g = "(?:\\b|_)"; function f(t) { t = Object.assign({}, a, t); let { unicode: f, interLft: c, interRgt: o, intraMode: p, intraSlice: d, intraIns: m, intraSub: x, intraTrn: b, intraDel: R, intraContr: A, intraSplit: y, interSplit: I, intraBound: S, interBound: z, intraChars: E, toUpper: L, toLower: k, compare: C } = t; m ??= p, x ??= p, b ??= p, R ??= p, C ??= "undefined" == typeof Intl ? e : new Intl.Collator(...i).compare; let j = t.letters ?? t.alpha; if (null != j) { let e = L(j), t = k(j); I = s(I, e, t), y = s(y, e, t), z = s(z, e, t), S = s(S, e, t), E = s(E, e, t), A = s(A, e, t) } let Z = f ? "u" : ""; const $ = '".+?"', w = RegExp($, "gi" + Z), D = RegExp(`(?:\\s+|^)-(?:${E}+|${$})`, "gi" + Z); let { intraRules: T } = t; null == T && (T = e => { let t = a.intraSlice, l = 0, n = 0, r = 0, i = 0; if (/[^\d]/.test(e)) { let s = e.length; s > 4 ? (t = d, l = m, n = x, r = b, i = R) : 3 > s || (r = Math.min(b, 1), 4 == s && (l = Math.min(m, 1))) } return { intraSlice: t, intraIns: l, intraSub: n, intraTrn: r, intraDel: i } }); let B = !!y, M = RegExp(y, "g" + Z), U = RegExp(I, "g" + Z), F = RegExp("^" + I + "|" + I + "$", "g" + Z), O = RegExp(A, "gi" + Z); const v = (e, t = !1) => { let l = []; e = (e = e.replace(w, (e => (l.push(e), n)))).replace(F, ""), t || (e = k(e)), B && (e = e.replace(M, (e => e[0] + " " + e[1]))); let r = 0; return e.split(U).filter((e => "" != e)).map((e => e === n ? l[r++] : e)) }, G = /[^\d]+|\d+/g, N = (e, n = 0, r = !1) => { let i = v(e); if (0 == i.length) return []; let s, a = Array(i.length).fill(""); if (i = i.map(((e, t) => e.replace(O, (e => (a[t] = e, ""))))), 1 == p) s = i.map(((e, t) => { if ('"' === e[0]) return l(e.slice(1, -1)); let n = ""; for (let l of e.matchAll(G)) { let e = l[0], { intraSlice: r, intraIns: i, intraSub: s, intraTrn: g, intraDel: f } = T(e); if (i + s + g + f == 0) n += e + a[t]; else { let [l, c] = r, h = e.slice(0, l), o = e.slice(c), p = e.slice(l, c); 1 == i && 1 == h.length && h != p[0] && (h += "(?!" + h + ")"); let d = p.length, m = [e]; if (s) for (let e = 0; d > e; e++)m.push(h + p.slice(0, e) + E + p.slice(e + 1) + o); if (g) for (let e = 0; d - 1 > e; e++)p[e] != p[e + 1] && m.push(h + p.slice(0, e) + p[e + 1] + p[e] + p.slice(e + 2) + o); if (f) for (let e = 0; d > e; e++)m.push(h + p.slice(0, e + 1) + "?" + p.slice(e + 1) + o); if (i) { let e = u(E, 1); for (let t = 0; d > t; t++)m.push(h + p.slice(0, t) + e + p.slice(t) + o) } n += "(?:" + m.join("|") + ")" + a[t] } } return n })); else { let e = u(E, m); 2 == n && m > 0 && (e = ")(" + e + ")("), s = i.map(((t, n) => '"' === t[0] ? l(t.slice(1, -1)) : t.split("").map(((e, t, l) => (1 == m && 0 == t && l.length > 1 && e != l[t + 1] && (e += "(?!" + e + ")"), e))).join(e) + a[n])) } let f = 2 == c ? g : "", h = 2 == o ? g : "", d = h + u(t.interChars, t.interIns) + f; return n > 0 ? r ? s = f + "(" + s.join(")" + h + "|" + f + "(") + ")" + h : (s = "(" + s.join(")(" + d + ")(") + ")", s = "(.??" + f + ")" + s + "(" + h + ".*)") : (s = s.join(d), s = f + s + h), [RegExp(s, "i" + Z), i, a] }, P = (e, t, l) => { let [n] = N(t); if (null == n) return null; let r = []; if (null != l) for (let t = 0; l.length > t; t++) { let i = l[t]; n.test(e[i]) && r.push(i) } else for (let t = 0; e.length > t; t++)n.test(e[t]) && r.push(t); return r }; let Y = !!S, _ = RegExp(z, Z), q = RegExp(S, Z); const H = (e, l, n) => { let [r, i, s] = N(n, 1), a = v(n, !0), [u] = N(n, 2), g = i.length, f = Array(g), h = Array(g); for (let e = 0; g > e; e++) { let t = i[e], l = a[e], n = '"' == t[0] ? t.slice(1, -1) : t + s[e], r = '"' == l[0] ? l.slice(1, -1) : l + s[e]; f[e] = n, h[e] = r } let p = e.length, d = Array(p).fill(0), m = { idx: Array(p), start: d.slice(), chars: d.slice(), cases: d.slice(), terms: d.slice(), interIns: d.slice(), intraIns: d.slice(), interLft2: d.slice(), interRgt2: d.slice(), interLft1: d.slice(), interRgt1: d.slice(), ranges: Array(p) }, x = 1 == c || 1 == o, b = 0; for (let n = 0; e.length > n; n++) { let i = l[e[n]], s = i.match(r), a = s.index + s[1].length, p = a, d = !1, R = 0, A = 0, y = 0, I = 0, S = 0, z = 0, E = 0, L = 0, C = 0, j = []; for (let e = 0, l = 2; g > e; e++, l += 2) { let n = k(s[l]), r = f[e], u = r.length, m = n.length, b = n == r; if (s[l] == h[e] && E++, !b && s[l + 1].length >= u) { let t = k(s[l + 1]).indexOf(r); t > -1 && (j.push(p, m, t, u), p += J(s, l, t, u), n = r, m = u, b = !0, 0 == e && (a = p)) } if (x || b) { let t = p - 1, g = p + m, f = !1, h = !1; if (-1 == t || _.test(i[t])) b && R++, f = !0; else { if (2 == c) { d = !0; break } if (Y && q.test(i[t] + i[t + 1])) b && A++, f = !0; else if (1 == c) { let t = s[l + 1], g = p + m; if (t.length >= u) { let c, h = 0, o = !1, d = RegExp(r, "ig" + Z); for (; c = d.exec(t);) { h = c.index; let e = g + h, t = e - 1; if (-1 == t || _.test(i[t])) { R++, o = !0; break } if (q.test(i[t] + i[e])) { A++, o = !0; break } } o && (f = !0, j.push(p, m, h, u), p += J(s, l, h, u), n = r, m = u, b = !0, 0 == e && (a = p)) } if (!f) { d = !0; break } } } if (g == i.length || _.test(i[g])) b && y++, h = !0; else { if (2 == o) { d = !0; break } if (Y && q.test(i[g - 1] + i[g])) b && I++, h = !0; else if (1 == o) { d = !0; break } } b && (S += u, f && h && z++) } if (m > u && (C += m - u), e > 0 && (L += s[l - 1].length), !t.intraFilt(r, n, p)) { d = !0; break } g - 1 > e && (p += m + s[l + 1].length) } if (!d) { m.idx[b] = e[n], m.interLft2[b] = R, m.interLft1[b] = A, m.interRgt2[b] = y, m.interRgt1[b] = I, m.chars[b] = S, m.terms[b] = z, m.cases[b] = E, m.interIns[b] = L, m.intraIns[b] = C, m.start[b] = a; let t = i.match(u), l = t.index + t[1].length, r = j.length, s = r > 0 ? 0 : 1 / 0, g = r - 4; for (let e = 2; t.length > e;)if (s > g || j[s] != l) l += t[e].length, e++; else { let n = j[s + 1], r = j[s + 2], i = j[s + 3], a = e, u = ""; for (let e = 0; n > e; a++)u += t[a], e += t[a].length; t.splice(e, a - e, u), l += J(t, e, r, i), s += 4 } l = t.index + t[1].length; let f = m.ranges[b] = [], c = l, h = l; for (let e = 2; t.length > e; e++) { let n = t[e].length; l += n, e % 2 == 0 ? h = l : n > 0 && (f.push(c, h), c = h = l) } h > c && f.push(c, h), b++ } } if (e.length > b) for (let e in m) m[e] = m[e].slice(0, b); return m }, J = (e, t, l, n) => { let r = e[t] + e[t + 1].slice(0, l); return e[t - 1] += r, e[t] = e[t + 1].slice(l, l + n), e[t + 1] = e[t + 1].slice(l + n), r.length }; return { search: (...e) => ((e, n, i, s = 1e3, a) => { i = i ? !0 === i ? 5 : i : 0; let u = null, g = null, f = []; n = n.replace(D, (e => { let t = e.trim().slice(1); return t = '"' === t[0] ? l(t.slice(1, -1)) : t.replace(r, ""), "" != t && f.push(t), "" })); let c, o = v(n); if (f.length > 0) { if (c = RegExp(f.join("|"), "i" + Z), 0 == o.length) { let t = []; for (let l = 0; e.length > l; l++)c.test(e[l]) || t.push(l); return [t, null, null] } } else if (0 == o.length) return [null, null, null]; if (i > 0) { let t = v(n); if (t.length > 1) { let l = t.slice().sort(((e, t) => t.length - e.length)); for (let t = 0; l.length > t; t++) { if (0 == a?.length) return [[], null, null]; a = P(e, l[t], a) } if (t.length > i) return [a, null, null]; u = h(t).map((e => e.join(" "))), g = []; let n = new Set; for (let t = 0; u.length > t; t++)if (a.length > n.size) { let l = a.filter((e => !n.has(e))), r = P(e, u[t], l); for (let e = 0; r.length > e; e++)n.add(r[e]); g.push(r) } else g.push([]) } } null == u && (u = [n], g = [a?.length > 0 ? a : P(e, n)]); let p = null, d = null; if (f.length > 0 && (g = g.map((t => t.filter((t => !c.test(e[t])))))), s >= g.reduce(((e, t) => e + t.length), 0)) { p = {}, d = []; for (let l = 0; g.length > l; l++) { let n = g[l]; if (null == n || 0 == n.length) continue; let r = u[l], i = H(n, e, r), s = t.sort(i, e, r, C); if (l > 0) for (let e = 0; s.length > e; e++)s[e] += d.length; for (let e in i) p[e] = (p[e] ?? []).concat(i[e]); d = d.concat(s) } } return [[].concat(...g), p, d] })(...e), split: v, filter: P, info: H, sort: t.sort } } const c = (() => { let e = { A: "ÁÀÃÂÄĄĂÅ", a: "áàãâäąăå", E: "ÉÈÊËĖĚ", e: "éèêëęě", I: "ÍÌÎÏĮİ", i: "íìîïįı", O: "ÓÒÔÕÖ", o: "óòôõö", U: "ÚÙÛÜŪŲŮŰ", u: "úùûüūųůű", C: "ÇČĆ", c: "çčć", D: "Ď", d: "ď", G: "Ğ", g: "ğ", L: "Ł", l: "ł", N: "ÑŃŇ", n: "ñńň", S: "ŠŚȘŞ", s: "šśșş", T: "ŢȚŤ", t: "ţțť", Y: "Ý", y: "ý", Z: "ŻŹŽ", z: "żźž" }, t = {}, l = ""; for (let n in e) e[n].split("").forEach((e => { l += e, t[e] = n })); let n = RegExp(`[${l}]`, "g"), r = e => t[e]; return e => { if ("string" == typeof e) return e.replace(n, r); let t = Array(e.length); for (let l = 0; e.length > l; l++)t[l] = e[l].replace(n, r); return t } })(); function h(e) { let t, l, n = (e = e.slice()).length, r = [e.slice()], i = Array(n).fill(0), s = 1; for (; n > s;)s > i[s] ? (t = s % 2 && i[s], l = e[s], e[s] = e[t], e[t] = l, ++i[s], s = 1, r.push(e.slice())) : (i[s] = 0, ++s); return r } const o = (e, t) => t ? `<mark>${e}</mark>` : e, p = (e, t) => e + t; return f.latinize = c, f.permute = e => h([...Array(e.length).keys()]).sort(((e, t) => { for (let l = 0; e.length > l; l++)if (e[l] != t[l]) return e[l] - t[l]; return 0 })).map((t => t.map((t => e[t])))), f.highlight = function (e, t, l = o, n = "", r = p) { n = r(n, l(e.substring(0, t[0]), !1)) ?? n; for (let i = 0; t.length > i; i += 2)n = r(n, l(e.substring(t[i], t[i + 1]), !0)) ?? n, t.length - 3 > i && (n = r(n, l(e.substring(t[i + 1], t[i + 2]), !1)) ?? n); return r(n, l(e.substring(t[t.length - 1]), !1)) ?? n }, f }();

async function fuzzyMatch(needle, haystack) {
  needle = needle.toLowerCase().replace(/[\W_]+/g, '');

  let uf = new uFuzzy({});
  let idxs = uf.filter(haystack, needle);
  if (idxs != null && idxs.length > 0) {
    // sort/rank only when <= 1,000 items
    let infoThresh = 1e3;

    if (idxs.length <= infoThresh) {
      let info = uf.info(idxs, haystack, needle);

      // order is a double-indirection array (a re-order of the passed-in idxs)
      // this allows corresponding info to be grabbed directly by idx, if needed
      let order = uf.sort(info, haystack, needle);

      // render post-filtered & ordered matches
      for (let i = 0; i < order.length; i++) {
        // using info.idx here instead of idxs because uf.info() may have
        // further reduced the initial idxs based on prefix/suffix rules
        console.log(haystack[info.idx[order[i]]]);
      }
    } else {
      // render pre-filtered but unordered matches
      for (let i = 0; i < idxs.length; i++) {
        console.log(haystack[idxs[i]]);
      }
    }
  }
  return idxs.length > 0;
}

async function getTypeFromUrl(url) {
  try {
    const match = url.match(/https:\/\/moflix-stream\.xyz\/titles\/(.+)\/(.+)/);
    const encodedID = match[1];
    const cookieData = await getAllCookies();
    const xsrf = cookieData['XSRF-TOKEN'];
    const session = cookieData['moflix_stream_session'];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Referer': 'https://moflix-stream.xyz/',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrf,
      'Cookie': `XSRF-TOKEN=${xsrf}; moflix_stream_session=${session}`
    };

    const response = await fetchv2(`https://moflix-stream.xyz/api/v1/titles/${encodedID}?loader=titlePage`, headers, "GET", null);
    const data = await response.json();
    const type = data.title && (data.title.type || (data.title.is_series ? 'tv' : 'movie'));
    console.log('getTypeFromUrl type:' + type);
    return type;
  } catch (error) {
    console.log('getTypeFromUrl error:' + error);
  }
  return null;
}

/** extractEpisodes
 * Extracts episodes of an anime from its page URL.
 * @author ibro - modified by Cufiy
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime episodes.
 */
async function extractEpisodes(url) {
  try {
    const type = await getTypeFromUrl(url);
    console.log('Determined type:' + type);

    const match = url.match(/https:\/\/moflix-stream\.xyz\/titles\/(.+)\/(.+)/);
    const showId = match[1];
    const name = match[2];

    if (type === 'movie') {
      const movie = [
        { href: url, number: 1, title: "Full Movie" }
      ];

      console.log(movie);
      return JSON.stringify(movie);
    } else if (type === 'tv') {

      const cookieData = await getAllCookies();
      const xsrf = cookieData['XSRF-TOKEN'];
      const session = cookieData['moflix_stream_session'];

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'Referer': 'https://moflix-stream.xyz/',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrf,
        'Cookie': `XSRF-TOKEN=${xsrf}; moflix_stream_session=${session}`
      };

      let seasonCount = 1;
      const allEpisodes = [];

      while (true) {
        const response = await fetchv2(`https://moflix-stream.xyz/api/v1/titles/${showId}/seasons/${seasonCount}?loader=seasonPage&perPage=100`, headers, "GET", null);
        const data = await response.json() || await JSON.parse(response);
        const episodes = data.episodes?.data || [];

        if (episodes.length === 0) {
          break; // No more seasons
        }

        for (const episode of episodes) {
          const episodeNumber = parseInt(episode.episode_number) || 0;
          const episodeTitle = episode.name || episode.title || `Episode ${episodeNumber}`;
          // https://moflix-stream.xyz/titles/85333/jujutsu-kaisen/season/1/episode/1
          const episodeUrl = `https://moflix-stream.xyz/titles/${showId}/${name}/season/${seasonCount}/episode/${episodeNumber}`;

          allEpisodes.push({
            href: episodeUrl,
            number: episodeNumber,
            title: episodeTitle
          });
        }

        seasonCount++;
      }

      console.log(allEpisodes);
      return JSON.stringify(allEpisodes);
    } else {
      console.error('Unknown type for URL:' + url);
      throw new Error("Invalid URL format");
    }
  } catch (error) {
    console.log('Fetch error in extractEpisodes: ' + error);
    return JSON.stringify([]);
  }
}


/** extractStreamUrl
 * Extracts the stream URL of an anime episode from its page URL.
 * @param {string} url - The URL of the anime episode page.
 * @returns {Promise<string|null>} - The stream URL or null if not found.
 */
async function extractStreamUrl(url) {
  try {
    const match = url.match(/https:\/\/moflix-stream\.xyz\/titles\/([^\/]+)\/([^\/]+)(?:\/season\/(\d+)\/episode\/(\d+))?/);
    if (!match) {
      console.error('Invalid moflix URL:' + url);
      return null;
    }
    const encodedID = match[1];
    const name = match[2];
    const seasonNum = match[3];
    const episodeNum = match[4];
    const type = (seasonNum && episodeNum) ? 'tv' : 'movie';
    console.log('ID:' + encodedID, 'Name:' + name, 'Type:' + type);

    const cookieData = await getAllCookies();
    const xsrf = cookieData['XSRF-TOKEN'];
    const session = cookieData['moflix_stream_session'];

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Referer': 'https://moflix-stream.xyz/',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrf,
      'Cookie': `XSRF-TOKEN=${xsrf}; moflix_stream_session=${session}`
    };

    let apiUrl;
    if (type === 'tv') {
      // TV episode
      const seasonNumber = seasonNum;
      const episodeNumber = episodeNum;
      console.log('Season number:' + seasonNumber, 'Episode number:' + episodeNumber, 'for show ID:' + encodedID);
      apiUrl = `https://moflix-stream.xyz/api/v1/titles/${encodedID}/seasons/${seasonNumber}/episodes/${episodeNumber}?loader=episodePage`;
    } else {
      // Movie
      apiUrl = `https://moflix-stream.xyz/api/v1/titles/${encodedID}?loader=titlePage`;
    }
    console.log('API URL:' + apiUrl);

    const response = await fetchv2(apiUrl, headers, "GET", null);
    const data = await response.json() || await JSON.parse(response);

    let mirrors = [];
    if (type === 'movie') {
      mirrors = data.title?.videos || [];
    } else {
      mirrors = data.episode?.videos || [];
    }

    if (mirrors.length === 0) {
      console.error('No video mirrors found for URL:' + url);
      return null;
    }
    console.log('Found mirrors:' + mirrors);
    /*
    Found mirrors: [{"id":156053,"name":"Mirror 1","thumbnail":null,"src":"https://moflix-stream.day/e/PKN4OwnnvPnEDLj","type":"embed","quality":"1080p/stereo","title_id":85333,"season_num":1,"episode_num":1,"origin":"local","downvotes":0,"upvotes":0,"approved":true,"order":0,"created_at":"2024-02-13T20:48:19.000000Z","updated_at":"2024-02-13T20:48:19.000000Z","user_id":358,"language":"de","category":"full","episode_id":37163,"score":null,"model_type":"video"},{"id":155858,"name":"Mirror 2","thumbnail":null,"src":"https://moflix-stream.click/v/s6hidu0v7pz1","type":"embed","quality":"1080p/stereo","title_id":85333,"season_num":1,"episode_num":1,"origin":"local","downvotes":0,"upvotes":0,"approved":true,"order":0,"created_at":"2024-02-13T19:50:53.000000Z","updated_at":"2024-02-13T19:50:53.000000Z","user_id":358,"language":"de","category":"full","episode_id":37163,"score":null,"model_type":"video"}]
    */

    const providerMatch = {
      'moflix-stream.click': 'packer-mirror1',
      'doods.to': 'veev',
      'streamtape.com': 'streamtape',
      'mixdrop.co': 'mixdrop',
    }
    // You will need to get the stream Urls yourself 
    // and put them in the providers object like this:
    // providers = {
    //   "https://vidmoly.to/embed-preghvoypr2m.html": "vidmoly",
    //   "https://speedfiles.net/123456": "speedfiles",
    //   "https://voe.sx/123456": "voe"
    // };

    let providers = {};
    for (const mirror of mirrors) {
      for (const key in providerMatch) {
        if (mirror.src.includes(key)) {
          providers[mirror.src] = providerMatch[key];
        }
      }
    }
    console.log('Providers to extract:' + providers);

    let streams = [];
    // Extract all available streams
    try {
      streams = await multiExtractor(providers);
      let returnedStreams = {
        streams: streams,
      }

      console.log("Multi extractor streams: " + JSON.stringify(returnedStreams));
      return JSON.stringify(returnedStreams);
    } catch (error) {
      console.log("Multi extractor error:" + error);
      return JSON.stringify([{ provider: "Error2", link: "" }]);
    }

  } catch (error) {
    console.log('Fetch error:' + error);
    return null;
  }
}

async function getAllCookies() {
  try {
    const site = await soraFetch("https://moflix-stream.xyz/", { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36' } });

    // helper to read header values in plain JS environments where Headers.get may not exist
    function headerValue(headers, name) {
      if (!headers) return null;
      const target = String(name).toLowerCase();

      sendLog('Trying method 0 to get header (node-fetch)');
      // 0) Node-Fetch: headers.get() -> single value
      // try {
      //   if (typeof headers.get === 'function') {
      //     const value = headers.get(target);
      //     if (value) return value;
      //   }
      // } catch (e) { /* ignore */ }

      sendLog('Trying method 1 to get header');
      // 1) Node/Fetch: headers.raw() -> object with arrays
      try {
        if (typeof headers.raw === 'function') {
          const raw = headers.raw();
          if (raw && raw[target]) return raw[target];
        }
      } catch (e) { /* ignore */ }

      sendLog('Trying method 2 to get header');
      // 2) Plain object (IncomingMessage.headers or simple map)
    //   try{
    //   if (typeof headers === 'object' && !Array.isArray(headers)) {
    //     for (const k in headers) {
    //       if (Object.prototype.hasOwnProperty.call(headers, k) && String(k).toLowerCase() === target) {
    //         return headers[k];
    //       }
    //     }
    //   }
    // } catch (e) { /* ignore */ }

      sendLog('Trying method 3 to get header');
      // 3) Iterable of pairs (e.g., [ [name, value], ... ])
      try {
        if (typeof headers[Symbol.iterator] === 'function') {
          for (const pair of headers) {
            if (!pair) continue;
            // array pair
            if (Array.isArray(pair) && pair.length >= 2) {
              if (String(pair[0]).toLowerCase() === target) return pair[1];
            }
            // object pair like { name, value }
            if (pair.name && pair.value && String(pair.name).toLowerCase() === target) return pair.value;
          }
        }
      } catch (e) { /* ignore */ }

      sendLog('Trying method 4 to get header');
      // 4) Fallback: try property access (some libs expose lowercase keys)
      try {
        if (headers[target]) return headers[target];
      } catch (e) { }

      return null;
    }

    // Use helper to get set-cookie header(s)
    const setCookieRaw = headerValue(site && site.headers ? site.headers : null, 'set-cookie') || '';

    // Normalize to array of cookie strings
    let cookieArray = [];
    if (Array.isArray(setCookieRaw)) {
      cookieArray = setCookieRaw.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof setCookieRaw === 'string' && setCookieRaw.length > 0) {
      // Split on newlines or commas that precede a new cookie name (safe-split)
      cookieArray = String(setCookieRaw).split(/[\n,] *(?=[A-Za-z0-9_\-]+=)/).map(s => s.trim()).filter(Boolean);
    }

    // console.log('Fetched cookies:' + cookieArray);

    // Keep only the base name=value (before any attributes)
    const baseCookies = cookieArray.map(c => c.split(';')[0].trim()).filter(Boolean);

    // Filter: keep XSRF-TOKEN or cookies with very long values (original logic)
    const filtered = baseCookies.filter(cookie => {
      if (cookie.startsWith('XSRF-TOKEN=')) return true;
      const parts = cookie.split('=');
      const val = parts[1] || '';
      return val.length > 100;
    });

    sendLog();

    return {
      Cookie: filtered.join('; '),
      "XSRF-TOKEN": decodeURIComponent((filtered.find(c => c.startsWith('XSRF-TOKEN=')) || '').split('=')[1] || ''),
      "moflix_stream_session": decodeURIComponent((filtered.find(c => c.startsWith('moflix_stream_session=')) || '').split('=')[1] || '')
    };
  } catch (error) {
    console.error('Error fetching cookies: ' + error);
    return [];
  }
}

async function sendLog(message, msg = null) {
  // send http://192.168.2.130/sora-module/log.php?action=add
  console.log(message, msg ? msg : "");
  return;
  const postMsg = message + (msg ? ' | ' + msg : '');
  await soraFetch('http://192.168.2.130/sora-module/log.php?action=add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: postMsg })

  }).catch(error => {
    console.error('Error sending log: ' + error);
  });
}



// ⚠️ DO NOT EDIT BELOW THIS LINE ⚠️
// EDITING THIS FILE COULD BREAK THE UPDATER AND CAUSE ISSUES WITH THE EXTRACTOR

/* {GE START} */
/* {VERSION: 1.2.3} */

/**
 * @name global_extractor.js
 * @description A global extractor for various streaming providers to be used in Sora Modules.
 * @author Cufiy
 * @url https://github.com/JMcrafter26/sora-global-extractor
 * @license CUSTOM LICENSE - see https://github.com/JMcrafter26/sora-global-extractor/blob/main/LICENSE
 * @date 2026-06-18 04:12:29
 * @version 1.2.3
 * @note This file was generated automatically.
 * The global extractor comes with an auto-updating feature, so you can always get the latest version. https://github.com/JMcrafter26/sora-global-extractor#-auto-updater
 */


function globalExtractor(providers) {
  for (const [url, provider] of Object.entries(providers)) {
    try {
      const streamUrl = extractStreamUrlByProvider(url, provider);
      // check if streamUrl is an object with streamUrl property
      if (streamUrl && typeof streamUrl === "object" && !Array.isArray(streamUrl) && streamUrl.streamUrl) {
        return streamUrl.streamUrl;
      }
      // check if streamUrl is not null, a string, and starts with http or https
      if (
        streamUrl &&
        typeof streamUrl === "string" &&
        streamUrl.startsWith("http")
      ) {
        return streamUrl;
        // if its an array, get the value that starts with http
      } else if (Array.isArray(streamUrl)) {
        const httpStream = streamUrl.find((url) => url.startsWith("http"));
        if (httpStream) {
          return httpStream;
        }
      } else if (streamUrl || typeof streamUrl !== "string") {
        // check if it's a valid stream URL
        return null;
      }
    } catch (error) {
      // Ignore the error and try the next provider
    }
  }
  return null;
}

async function multiExtractor(providers) {
  /* this scheme should be returned as a JSON object
  {
  "streams": [
  {
    "title": "FileMoon",
    "streamUrl": "https://filemoon.example/stream1.m3u8",
  },
  {
    "title": "StreamWish",
    "streamUrl": "https://streamwish.example/stream2.m3u8",
  },
  {
    "title": "Okru",
    "streamUrl": "https://okru.example/stream3.m3u8",
    "headers": { // Optional headers for the stream
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Referer": "https://okru.example/",
    },
  },
  {
    "title": "MP4",
    "streamUrl": "https://mp4upload.example/stream4.mp4",
  },
  {
    "title": "Default",
    "streamUrl": "https://default.example/stream5.m3u8"
  }
  ]
}
  */

  const streams = [];
  const providersCount = {};
  for (let [url, provider] of Object.entries(providers)) {
    try {
      // if provider starts with "direct-", then add the url to the streams array directly
      if (provider.startsWith("direct-")) {
        const directName = provider.slice(7); // remove "direct-" prefix
        const title = (directName && directName.length > 0) ? directName : "Direct";
        streams.push({
          title: title,
          streamUrl: url
        });
        continue; // skip to the next provider
      }
      if (provider.startsWith("direct")) {
        provider = provider.slice(7); // remove "direct-" prefix
        const title = (provider && provider.length > 0) ? provider : "Direct";
        streams.push({
          title: title,
          streamUrl: url
        });
        continue; // skip to the next provider
      }

      let customName = null; // to store the custom name if provided

      // if the provider has - then split it and use the first part as the provider name
      if (provider.includes("-")) {
        const parts = provider.split("-");
        provider = parts[0]; // use the first part as the provider name
        customName = parts.slice(1).join("-"); // use the rest as the custom name
      }

      // check if providercount is not bigger than 3
      if (providersCount[provider] && providersCount[provider] >= 3) {
        console.log(`Skipping ${provider} as it has already 3 streams`);
        continue;
      }
      let result = await extractStreamUrlByProvider(url, provider);
      let streamUrl = null;
      let headers = null;

      // Check if result is an object with streamUrl and optional headers
      if (result && typeof result === "object" && !Array.isArray(result) && result.streamUrl) {
        streamUrl = result.streamUrl;
        headers = result.headers || null;
      } else if (result && Array.isArray(result)) {
        const httpStream = result.find((url) => url.startsWith("http"));
        if (httpStream) {
          streamUrl = httpStream;
        }
      } else if (result && typeof result === "string") {
        streamUrl = result;
      }

      // check if streamUrl is valid
      if (
        !streamUrl ||
        typeof streamUrl !== "string" ||
        !streamUrl.startsWith("http")
      ) {
        continue; // skip if streamUrl is not valid
      }

      // if customName is defined, use it as the name
      if (customName && customName.length > 0) {
        provider = customName;
      }

      let title;
      if (providersCount[provider]) {
        providersCount[provider]++;
        title = provider.charAt(0).toUpperCase() +
            provider.slice(1) +
            "-" +
            (providersCount[provider] - 1); // add a number to the provider name
      } else {
        providersCount[provider] = 1;
        title = provider.charAt(0).toUpperCase() + provider.slice(1);
      }
      
      const streamObject = {
        title: title,
        streamUrl: streamUrl
      };
      
      // Add headers if they exist
      if (headers && typeof headers === "object" && Object.keys(headers).length > 0) {
        streamObject.headers = headers;
      }
      
      streams.push(streamObject);
    } catch (error) {
      // Ignore the error and try the next provider
    }
  }
  return streams;
}

async function extractStreamUrlByProvider(url, provider) {
  if (eval(`typeof ${provider}Extractor`) !== "function") {
    // skip if the extractor is not defined
    console.log(
      `Extractor for provider ${provider} is not defined, skipping...`
    );
    return null;
  }
  let uas = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
  ];
  let headers = {
    "User-Agent": uas[(url.length + provider.length) % uas.length], // use a different user agent based on the url and provider
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": url,
    "Connection": "keep-alive",
    "x-Requested-With": "XMLHttpRequest",
  };

  switch (provider) {
    case "bigwarp":
      delete headers["User-Agent"];
      break;
    case "vk":
    case "sibnet":
      headers["encoding"] = "windows-1251"; // required
      break;
    case "supervideo":
    case "savefiles":
        headers = {
          "Accept": "*/*",
          "Accept-Encoding": "gzip, deflate, br",
          "User-Agent": "EchoapiRuntime/1.1.0",
          "Connection": "keep-alive",
          "Cache-Control": "no-cache",
          "Host": url.match(/https?:\/\/([^\/]+)/)[1],
        };
      break;
    case "streamtape":
      headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };
      break;
  }
  // console.log("Using headers: " + JSON.stringify(headers));

  // fetch the url
  // and pass the response to the extractor function
  console.log("Fetching URL: " + url);
  const response = await soraFetch(url, {
    headers,
  });

  console.log("Response: " + response.status);
  let html = response.text ? await response.text() : response;
  // if title contains redirect, then get the redirect url
  const title = html.match(/<title>(.*?)<\/title>/);
  if (title && title[1].toLowerCase().includes("redirect")) {
    const matches = [
      /<meta http-equiv="refresh" content="0;url=(.*?)"/,
      /window\.location\.href\s*=\s*["'](.*?)["']/,
      /window\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/,
      /window\.location\s*=\s*["'](.*?)["']/,
      /window\.location\.assign\s*\(\s*["'](.*?)["']\s*\)/,
      /top\.location\s*=\s*["'](.*?)["']/,
      /top\.location\.replace\s*\(\s*["'](.*?)["']\s*\)/,
    ];
    for (const match of matches) {
      const redirectUrl = html.match(match);
      if (redirectUrl && redirectUrl[1] && typeof redirectUrl[1] === "string" && redirectUrl[1].startsWith("http")) {
        console.log("Redirect URL found: " + redirectUrl[1]);
        url = redirectUrl[1];
        headers['Referer'] = url;
        headers['Host'] = url.match(/https?:\/\/([^\/]+)/)[1];
        html = await soraFetch(url, {
          headers,
        }).then((res) => res.text());
        break;
      }
    }
  }

  // console.log("HTML: " + html);
  switch (provider) {
        case "doodstream":
      try {
         return await doodstreamExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from doodstream:", error);
         return null;
      }
    case "earnvids":
      try {
         return await earnvidsExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from earnvids:", error);
         return null;
      }
    case "mp4upload":
      try {
         return await mp4uploadExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from mp4upload:", error);
         return null;
      }
    case "packer":
      try {
         return await packerExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from packer:", error);
         return null;
      }
    case "sendvid":
      try {
         return await sendvidExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from sendvid:", error);
         return null;
      }
    case "sibnet":
      try {
         return await sibnetExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from sibnet:", error);
         return null;
      }
    case "streamtape":
      try {
         return await streamtapeExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from streamtape:", error);
         return null;
      }
    case "uqload":
      try {
         return await uqloadExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from uqload:", error);
         return null;
      }
    case "videospk":
      try {
         return await videospkExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from videospk:", error);
         return null;
      }
    case "vidmoly":
      try {
         return await vidmolyExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from vidmoly:", error);
         return null;
      }
    case "vidoza":
      try {
         return await vidozaExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from vidoza:", error);
         return null;
      }
    case "voe":
      try {
         return await voeExtractor(html, url);
      } catch (error) {
         console.log("Error extracting stream URL from voe:", error);
         return null;
      }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

////////////////////////////////////////////////
//                 EXTRACTORS                 //
////////////////////////////////////////////////

// DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING //
/* --- doodstream --- */

/**
 * @name doodstreamExtractor
 * @author Cufiy
 */
async function doodstreamExtractor(html, url = null) {
    console.log("DoodStream extractor called");
    console.log("DoodStream extractor URL: " + url);
    const match = html.match(/\/pass_md5\/([a-fA-F0-9\-]+)\/([a-zA-Z0-9]+)/);
    if (!match) {
        console.log('Could not find hash/token in the page.');
        return;
    }
    const hash = match[1];
    const token = match[2];
    console.log('🔑 Hash:', hash, 'Token:', token);
    const hostUrl = url.match(/https?:\/\/[^\/]+/)[0];
    // 2. Request the base video URL
    const request = await soraFetch(`${hostUrl}/pass_md5/${hash}/${token}`);
    if (!request) {
        console.error('Failed to fetch the base video URL.');
        return;
    }
    const data = await request.text();

    if (!data) {
        console.error('Failed to fetch the base video URL.');
        return;
    }
    if (data.trim() === 'RELOAD') {
        console.error('Token expired or invalid. Received RELOAD response.');
        return;
    }
    let baseUrl = data.trim();
    // If the server returns a relative path, make it absolute
    if (!baseUrl.startsWith('http')) {
        baseUrl = hostUrl + baseUrl;
    }
    console.log('🎬 Base video URL:', baseUrl);
    // 3. Replicate makePlay() – random 10 chars + token + expiry
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomStr = '';
    for (let i = 0; i < 10; i++) {
        randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const suffix = randomStr + '?token=' + token + '&expiry=' + Date.now();
    const finalUrl = baseUrl + suffix;
    console.log('Final video URL:', finalUrl);
    return finalUrl;
}
/* --- earnvids --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name earnvidsExtractor
 * @author 50/50
 */
async function earnvidsExtractor(html, url = null) {
    try {
        const obfuscatedScript = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        const unpackedScript = unpack(obfuscatedScript[1]);
        const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
        const hlsLink = streamMatch ? streamMatch[1] : null;
        const baseUrl = url.match(/^(https?:\/\/[^/]+)/)[1];
        console.log("HLS Link:" + baseUrl + hlsLink);
        return baseUrl + hlsLink;
    } catch (err) {
        console.log(err);
        return "https://files.catbox.moe/avolvc.mp4";
    }
}

/* --- mp4upload --- */

/**
 * @name mp4uploadExtractor
 * @author Cufiy
 */
async function mp4uploadExtractor(html, url = null) {
    const regex = /src:\s*"([^"]+)"/;
  const match = html.match(regex);
  if (match) {
    return match[1];
  } else {
    console.log("No match found for mp4upload extractor");
    return null;
  }
}
/* --- packer --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name packerExtractor
 * @author 50/50
 */
async function packerExtractor(data, url = null) {
    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
    const unpackedScript = unpack(obfuscatedScript[1]);
    const m3u8Match = unpackedScript.match(/"hls2"\s*:\s*"([^"]+)"/);
    const m3u8Url = m3u8Match[1];
    return m3u8Url;
}

/* --- sendvid --- */

/**
 * @name sendvidExtractor
 * @author 50/50
 */
async function sendvidExtractor(data, url = null) {
    const match = data.match(/var\s+video_source\s*=\s*"([^"]+)"/);
    const videoUrl = match ? match[1] : null;
    return videoUrl;
}
/* --- sibnet --- */

/**
 * @name sibnetExtractor
 * @author scigward
 */
async function sibnetExtractor(html, embedUrl) {
    try {
        const videoMatch = html.match(
            /player\.src\s*\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/i
        );
        if (!videoMatch || !videoMatch[1]) {
            throw new Error("Sibnet video source not found");
        }
        const videoPath = videoMatch[1];
        const videoUrl = videoPath.startsWith("http")
            ? videoPath
            : `https://video.sibnet.ru${videoPath}`;
        return videoUrl;
    } catch (error) {
        console.log("SibNet extractor error: " + error.message);
        return null;
    }
}
/* --- streamtape --- */

/**
 * 
 * @name streamTapeExtractor
 * @author ShadeOfChaos
 */
async function streamtapeExtractor(html, url) {
    let promises = [];
    const LINK_REGEX = /link['"]{1}\).innerHTML *= *['"]{1}([\s\S]*?)["'][\s\S]*?\(["']([\s\S]*?)["']([\s\S]*?);/g;
    const CHANGES_REGEX = /([0-9]+)/g;
    if(html == null) {
        if(url == null) {
            throw new Error('Provided incorrect parameters.');
        }
        const response = await soraFetch(url);
        html = await response.text();
    }
    const matches = html.matchAll(LINK_REGEX);
    for (const match of matches) {
        let base = match?.[1];
        let params = match?.[2];
        const changeStr = match?.[3];
        if(changeStr == null || changeStr == '') continue;
        const changes = changeStr.match(CHANGES_REGEX);
        for(let n of changes) {
            params = params.substring(n);
        }
        while(base[0] == '/') {
            base = base.substring(1);
        }
        const url = 'https://' + base + params;
        promises.push(testUrl(url));
    }
    // Race for first success
    return Promise.any(promises).then((value) => {
        return value;
    }).catch((error) => {
        return null;
    });
    async function testUrl(url) {
        return new Promise(async (resolve, reject) => {
            try {
                // Timeout version prefered, but Sora does not support it currently
                // var response = await soraFetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
                var response = await soraFetch(url);
                if(response == null) throw new Error('Connection timed out.');
            } catch(e) {
                console.error('Rejected due to:', e.message);
                return reject(null);
            }
            if(response?.ok && response?.status === 200) {
                return resolve(url);
            }
            console.warn('Reject because of response:', response?.ok, response?.status);
            return reject(null);
        });
    }
}
/* --- uqload --- */

/**
 * @name uqloadExtractor
 * @author scigward
 */
async function uqloadExtractor(html, embedUrl) {
    try {
        const match = html.match(/sources:\s*\[\s*"([^"]+\.mp4)"\s*\]/);
        const videoSrc = match ? match[1] : "";
        return videoSrc;
    } catch (error) {
        console.log("uqloadExtractor error:", error.message);
        return null;
    }
}
/* --- videospk --- */

/* {REQUIRED PLUGINS: unbaser} */
/**
 * @name videospkExtractor
 * @author 50/50
 */
async function videospkExtractor(data, url = null) {
        const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);
        const unpackedScript = unpack(obfuscatedScript[1]);
        const streamMatch = unpackedScript.match(/["'](\/stream\/[^"']+)["']/);
        const hlsLink = streamMatch ? streamMatch[1] : null;
        return "https://videospk.xyz" + hlsLink;
}

/* --- vidmoly --- */

/**
 * @name vidmolyExtractor
 * @author Ibro
 */
async function vidmolyExtractor(html, url = null) {
  const regexSub = /<option value="([^"]+)"[^>]*>\s*SUB - Omega\s*<\/option>/;
  const regexFallback = /<option value="([^"]+)"[^>]*>\s*Omega\s*<\/option>/;
  const fallback =
    /<option value="([^"]+)"[^>]*>\s*SUB v2 - Omega\s*<\/option>/;
  let match =
    html.match(regexSub) || html.match(regexFallback) || html.match(fallback);
  if (match) {
    const decodedHtml = atob(match[1]); // Decode base64
    const iframeMatch = decodedHtml.match(/<iframe\s+src="([^"]+)"/);
    if (!iframeMatch) {
      console.log("Vidmoly extractor: No iframe match found");
      return null;
    }
    const streamUrl = iframeMatch[1].startsWith("//")
      ? "https:" + iframeMatch[1]
      : iframeMatch[1];
    let uas = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15",
      "Mozilla/5.0 (Linux; Android 11; Pixel 4 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36",
    ];
    let headers = {
      "User-Agent": uas[(url.length) % uas.length], // use a different user agent based on the url and provider
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": url,
      "Connection": "keep-alive",
      "x-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-User": "?1",
    };
    const response = await soraFetch(url, { headers });
    html = await response.text();
  } 
    console.log("Vidmoly extractor: No match found, using fallback");
    //  regex the sources: [{file:"this_is_the_link"}]
    const sourcesRegex = /sources:\s*\[\s*\{\s*file:\s*['"](https?:\/\/[^'"]+)['"]\s*\}/;
    const sourcesMatch = html.match(sourcesRegex);
    let sourcesString = sourcesMatch
      ? sourcesMatch[1].replace(/'/g, '"')
      : null;
    return sourcesString;
  
}
/* --- vidoza --- */

/**
 * @name vidozaExtractor
 * @author Cufiy
 */
async function vidozaExtractor(html, url = null) {
  const regex = /<source src="([^"]+)" type='video\/mp4'>/;
  const match = html.match(regex);
  if (match) {
    return match[1];
  } else {
    console.log("No match found for vidoza extractor");
    return null;
  }
}
/* --- voe --- */

/**
 * @name voeExtractor
 * @author Cufiy
 */
function voeExtractor(html, url = null) {
// Extract the first <script type="application/json">...</script>
    const jsonScriptMatch = html.match(
      /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (!jsonScriptMatch) {
      console.log("No application/json script tag found");
      return null;
    }

    const obfuscatedJson = jsonScriptMatch[1].trim();
  let data;
  try {
    data = JSON.parse(obfuscatedJson);
  } catch (e) {
    throw new Error("Invalid JSON input.");
  }
  if (!Array.isArray(data) || typeof data[0] !== "string") {
    throw new Error("Input doesn't match expected format.");
  }
  let obfuscatedString = data[0];
  // Step 1: ROT13
  let step1 = voeRot13(obfuscatedString);
  // Step 2: Remove patterns
  let step2 = voeRemovePatterns(step1);
  // Step 3: Base64 decode
  let step3 = voeBase64Decode(step2);
  // Step 4: Subtract 3 from each char code
  let step4 = voeShiftChars(step3, 3);
  // Step 5: Reverse string
  let step5 = step4.split("").reverse().join("");
  // Step 6: Base64 decode again
  let step6 = voeBase64Decode(step5);
  // Step 7: Parse as JSON
  let result;
  try {
    result = JSON.parse(step6);
  } catch (e) {
    throw new Error("Final JSON parse error: " + e.message);
  }
  // console.log("Decoded JSON:", result);
  // check if direct_access_url is set, not null and starts with http
  if (result && typeof result === "object") {
    const streamUrl =
      result.direct_access_url ||
      result.source
        .map((source) => source.direct_access_url)
        .find((url) => url && url.startsWith("http"));
    if (streamUrl) {
      console.log("Voe Stream URL: " + streamUrl);
      return streamUrl;
    } else {
      console.log("No stream URL found in the decoded JSON");
    }
  }
  return result;
}
function voeRot13(str) {
  return str.replace(/[a-zA-Z]/g, function (c) {
    return String.fromCharCode(
      (c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13)
        ? c
        : c - 26
    );
  });
}
function voeRemovePatterns(str) {
  const patterns = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
  let result = str;
  for (const pat of patterns) {
    result = result.split(pat).join("");
  }
  return result;
}
function voeBase64Decode(str) {
  // atob is available in browsers and Node >= 16
  if (typeof atob === "function") {
    return atob(str);
  }
  // Node.js fallback
  return Buffer.from(str, "base64").toString("utf-8");
}
function voeShiftChars(str, shift) {
  return str
    .split("")
    .map((c) => String.fromCharCode(c.charCodeAt(0) - shift))
    .join("");
}


////////////////////////////////////////////////
//                 PLUGINS                    //
////////////////////////////////////////////////

/**
 * Uses Sora's fetchv2 on ipad, fallbacks to regular fetch on Windows
 * @author ShadeOfChaos
 *
 * @param {string} url The URL to make the request to.
 * @param {object} [options] The options to use for the request.
 * @param {object} [options.headers] The headers to send with the request.
 * @param {string} [options.method='GET'] The method to use for the request.
 * @param {string} [options.body=null] The body of the request.
 *
 * @returns {Promise<Response|null>} The response from the server, or null if the
 * request failed.
 */
async function soraFetch(
  url,
  options = { headers: {}, method: "GET", body: null }
) {
  try {
    return await fetchv2(
      url,
      options.headers ?? {},
      options.method ?? "GET",
      options.body ?? null
    );
  } catch (e) {
    try {
      return await fetch(url, options);
    } catch (error) {
      await console.log("soraFetch error: " + error.message);
      return null;
    }
  }
}
/***********************************************************
 * UNPACKER MODULE
 * Credit to GitHub user "mnsrulz" for Unpacker Node library
 * https://github.com/mnsrulz/unpacker
 ***********************************************************/
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

function detectUnbaser(source) {
    /* Detects whether `source` is P.A.C.K.E.R. coded. */
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
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
                if (a[2] == "[]") {
                }
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


/* {GE END} */
