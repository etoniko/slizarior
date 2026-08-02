#!/usr/bin/env node
/**
 * Strict agar/io clone finder — RU IP from this PC.
 * Only counts sites that look like a real playable game (not parking / for-sale).
 *
 *   node find-real.mjs --target 100 --concurrency 40
 */

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKING_FILE = path.join(__dirname, "working-real.txt");
const JSON_FILE = path.join(__dirname, "results-real.json");

const args = process.argv.slice(2);
const target = Number(arg("--target", "100"));
const concurrency = Number(arg("--concurrency", "36"));
const timeoutMs = Number(arg("--timeout", "9000"));

function arg(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const PARKING = [
  /domain.*(for sale|продаётся|продается|на продаже)/i,
  /buy this domain/i,
  /parking(page)?/i,
  /sedo\.com|godaddy|namecheap|dan\.com|afternic|hugedomains|spaceship\.com/i,
  /website\.ws|your internet address for life/i,
  /домен не привязан/i,
  /coming soon/i,
  /parked.*(domain|free)/i,
  /this domain.*(may be|is).*(sale|available)/i,
  /godaddy\.com\/domainsearch/i,
  /squadhelp|brandbucket/i,
  /iis windows server/i,
  /apache.?2.?default|centos.?test.?page/i,
  /403 forbidden|401 authorization|access restricted/i,
  /http error 404|404 not found/i,
];

const GAME_POSITIVE = [
  { re: /<canvas[\s>]/i, w: 3 },
  { re: /new\s+WebSocket|WebSocket\s*\(|wss?:\/\/[^"'<\s]+/i, w: 3 },
  { re: /\b(nickname|nick\s*name|enter\s*(a\s*)?name|ваш\s*ник|никнейм)\b/i, w: 2 },
  { re: /\b(play\s*now|играть|spectate|наблюдать)\b/i, w: 2 },
  { re: /\b(leaderboard|таблица\s*лидеров|top\s*\d+)\b/i, w: 1 },
  { re: /\b(split|eject|feed|mass\s*boost|double\s*split|trick\s*split)\b/i, w: 2 },
  { re: /\b(agar\.?io|agario|cell\s*craft|gota\.io|agma\.io|senpa|tricksplit|blob\.io|germs\.io|vanis\.io|ogar|slither|wormate|wormax|expanding\s*land)\b/i, w: 3 },
  { re: /\b(ffa|party\s*mode|experimental|teams?\s*mode)\b/i, w: 1 },
  { re: /pixi\.js|three\.js|phaser|babylon/i, w: 1 },
  { re: /\b(skin|скин|servers?\s*list|выбор\s*сервера)\b/i, w: 1 },
  { re: /ogario|legend\s*mod|delta\s*client|hslo/i, w: 2 },
];

const SEED_GAMES = [
  "agar.io", "www.agar.io",
  "agar.su", "www.agar.su", "api.agar.su", "ffa.agar.su", "play.agar.su",
  "agario.fun", "m.agario.fun", "www.agario.fun",
  "gota.io", "www.gota.io", "play.gota.io",
  "agma.io", "www.agma.io", "play.agma.io",
  "senpa.io", "www.senpa.io",
  "tricksplit.io", "www.tricksplit.io",
  "blob.io", "www.blob.io",
  "germs.io", "www.germs.io",
  "cellcraft.io", "www.cellcraft.io",
  "vanis.io", "www.vanis.io",
  "expanding.land", "www.expanding.land",
  "agar2.com", "www.agar2.com",
  "imsolo.pro", "www.imsolo.pro",
  "slither.io", "www.slither.io", "slither.su", "www.slither.su",
  "wormate.io", "www.wormate.io",
  "wormax.io", "www.wormax.io",
  "littlebigsnake.com", "www.littlebigsnake.com",
  "evoworld.io", "flyordie.io",
  "diep.io", "www.diep.io",
  "mope.io", "deeeep.io", "florr.io",
  "starve.io", "paper-io.com", "hole-io.com",
  "iogames.space", "io-games.io", "iogames.fun",
  "privateagario.net", "www.privateagario.net",
  "agar-io.io", "playagario.org", "agariohub.io",
  "gagar.io", "cells.io", "cagar.io", "wagar.io",
  "ogar.pw", "multiogar.org",
  "sixz.ru", "ffa.agar.su",
  "agarioskins.com", "agariomods.com",
  "jimboy365.com", "deltatouch.com",
  "galax.io", "bubbles.io",
  "territorial.io", "arras.io", "bonk.io", "splix.io",
  "shellshock.io", "krunker.io", "zombsroyale.io",
  "1v1.lol", "bapbap.gg",
  "y8.com", "poki.com", "crazygames.com",
  "agar.live", "agar.fun", "agar.bio", "agar.red", "agar.cool",
  "agar.party", "agar.pro", "agar.gg", "agar.online",
  "agario.live", "agario.pro", "agario.online", "agario.org",
  "agario.net", "agario.su", "agario.ru", "agario.io",
  "playagar.io", "agarplay.com", "agarplay.io",
  "agarioplay.com", "agariogame.net", "agariogame.org",
  "unblockedagario.com", "agario-unblocked.com", "agariounblocked.com",
  "agarz.com", "agary.com", "agarx.com", "agar3.com", "agar3.io",
  "nazi.gg", "galx.io",
  "cellz.io", "eatcells.com", "cellwars.io", "mitosis.io",
  "agarwars.com", "agarbattle.com",
  "agariofree.com", "freeagar.io",
  "agario.mobi", "agar.mobi",
  "agarioplay.ru", "agarioru.ru", "ruagar.io",
  "agario.kz", "agar.kz", "agario.by", "agar.by",
  "agario.ua", "agar.ua", "agario.pl", "agar.pl",
  "client.agar.io", "m.agar.io",
  "eu-london-1.agar.io", "us-atlanta-1.agar.io",
  "live-arena-1.agar.io", "live-arena-2.agar.io",
  "hslo.io", "legendmod.ml",
  "agar.miniclip.com",
  "play.google.com",
];

const BASES = [
  "agar", "agario", "agar-io", "gota", "agma", "senpa", "tricksplit",
  "blob", "germs", "cellcraft", "vanis", "ogar", "slither", "slitherio",
  "wormate", "wormax", "agar2", "imsolo", "privateagario", "playagario",
  "agarioplay", "agarplay", "gagar", "cells", "cellz", "wagar", "cagar",
  "nazi", "galax", "agarx", "agarix", "agariox", "agarwars", "freeagar",
  "freeagario", "ruagar", "ruagario", "megasplit", "multiogar",
  "agarunblocked", "unblockedagario", "agariounblocked",
];

const TLDS = [
  "io", "com", "net", "org", "su", "ru", "fun", "live", "pro", "online",
  "gg", "xyz", "site", "club", "vip", "pw", "me", "co", "mobi", "info",
  "space", "world", "zone", "party", "cool", "red", "bio", "app", "game",
  "games", "top", "best", "today", "tv", "ws", "is", "to", "in", "us",
  "kz", "by", "ua", "pl", "dev", "tech",
];

const PREFIXES = ["", "www.", "play.", "m.", "ru.", "ffa.", "game."];

function normalizeHost(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^\*\./, "");
}

function buildCandidates() {
  const set = new Set();
  for (const s of SEED_GAMES) {
    const h = normalizeHost(s);
    if (h.includes(".")) set.add(h);
  }
  for (const b of BASES) {
    for (const t of TLDS) {
      for (const p of PREFIXES) set.add(`${p}${b}.${t}`);
    }
  }
  for (let i = 1; i <= 40; i++) {
    set.add(`agario${i}.com`);
    set.add(`agar${i}.com`);
    set.add(`agario-unblocked${i}.com`);
    set.add(`unblocked-agario${i}.com`);
    set.add(`agariounblocked${i}.com`);
    set.add(`agarunblocked${i}.com`);
  }
  // common unblocked school mirrors
  const mirrors = [
    "agario.school", "classroom.agario", "agarioclassroom.com",
    "agariok12.com", "agarioschool.com", "playagario.online",
    "agario.gg", "agario.nz", "agario.uk", "agario.ca",
    "agario.fr", "agario.de", "agario.br", "agario.es",
    "agario.jp", "agario.kr", "agario.cn", "agario.tw",
    "agario.sg", "agario.ph", "agario.my", "agario.id",
    "agario.vn", "agario.th", "agario.in", "agario.pk",
    "agario.mx", "agario.ar", "agario.cl", "agario.pe",
    "agario.za", "agario.ng", "agario.eg", "agario.sa",
    "agario.ae", "agario.il", "agario.tr", "agario.gr",
    "agario.pt", "agario.it", "agario.nl", "agario.be",
    "agario.se", "agario.no", "agario.fi", "agario.dk",
    "agario.cz", "agario.sk", "agario.hu", "agario.ro",
    "agario.bg", "agario.rs", "agario.hr", "agario.si",
    "agariomirror.com", "agariomirror.net", "agarioproxy.com",
    "agarioproxy.net", "agariocdn.com", "agarioclient.com",
    "agarioserver.com", "agarioservers.com", "agarservers.com",
    "agargate.com", "agarhub.com", "agarzone.com", "agararena.com",
    "agarworld.com", "agaruniverse.com", "agarplanet.com",
    "cell.io", "cells.io", "cellgame.io", "cellgame.com",
    "eat.io", "eater.io", "bigcells.io", "megacells.io",
    "superagar.io", "superagario.com", "ultragar.io",
    "hyperagar.io", "megaagar.io", "proagar.io", "proagario.com",
    "realagar.io", "realagario.com", "trueagar.io",
    "classicagar.io", "classicagario.com", "oldagar.io",
    "newagar.io", "newagario.com", "nextagar.io",
    "agar2015.com", "agar2016.com", "agar2020.com", "agar2024.com",
    "agar2025.com", "agar2026.com",
    "agario2015.com", "agario2016.com", "agario2024.com", "agario2025.com",
    "miniclip.com", "agar.io.miniclip.com",
    "iogameslist.org", "iogameslist.com", "bestiogames.com",
    "html5games.com", "crazygames.io", "silvergames.com",
    "gogy.com", "kizi.com", "frigamez.com",
    "agarioforever.com", "agarioforever.net",
    "skribbl.io", "cursors.io", "littlealchemy.com",
  ];
  for (const m of mirrors) set.add(normalizeHost(m));
  return [...set];
}

function httpGet(urlStr, ms = timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(e);
    }
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
        timeout: ms,
        rejectUnauthorized: false,
        servername: u.hostname,
      },
      (res) => {
        // follow one redirect manually for status awareness
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size < 350_000) chunks.push(c);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            location: res.headers.location || "",
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchFollow(host) {
  let url = `https://${host}/`;
  let last;
  for (let hop = 0; hop < 4; hop++) {
    try {
      last = await httpGet(url);
    } catch {
      if (hop === 0) {
        url = `http://${host}/`;
        continue;
      }
      throw new Error("fetch_fail");
    }
    if (last.status >= 300 && last.status < 400 && last.location) {
      try {
        url = new URL(last.location, url).href;
        continue;
      } catch {
        break;
      }
    }
    break;
  }
  return last;
}

function titleOf(body) {
  const m = (body || "").match(/<title[^>]*>([^<]{0,140})/i);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}

function scoreGame(body, host, title) {
  const text = `${title}\n${body}\n${host}`;
  for (const p of PARKING) {
    if (p.test(text)) return { score: -100, parking: true };
  }
  let score = 0;
  for (const { re, w } of GAME_POSITIVE) {
    if (re.test(text)) score += w;
  }
  // thin pages are usually parking even without keywords
  if ((body || "").length < 400 && score < 5) score -= 5;
  return { score, parking: false };
}

async function check(host) {
  const out = {
    domain: host,
    ok: false,
    ips: [],
    score: 0,
    title: "",
    reason: "",
  };
  try {
    out.ips = (await dns.lookup(host, { all: true })).map((x) => x.address);
  } catch {
    out.reason = "dns";
    return out;
  }
  if (!out.ips.length) {
    out.reason = "dns";
    return out;
  }

  let res;
  try {
    res = await fetchFollow(host);
  } catch (e) {
    out.reason = e.message;
    return out;
  }

  if (!res || res.status < 200 || res.status >= 400) {
    out.reason = `http_${res?.status || 0}`;
    return out;
  }

  out.title = titleOf(res.body);
  const { score, parking } = scoreGame(res.body || "", host, out.title);
  out.score = score;
  if (parking || score < 5) {
    out.reason = parking ? "parking" : `low_score_${score}`;
    return out;
  }

  out.ok = true;
  out.reason = "game";
  return out;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  console.log(`STRICT real games | RU IP | target=${target}`);
  let candidates = buildCandidates().filter(
    (h) => /^[a-z0-9.-]+$/i.test(h) && h.includes(".") && h.length < 60
  );
  // shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  // prioritize known seeds first
  const seedSet = new Set(SEED_GAMES.map(normalizeHost));
  candidates.sort((a, b) => Number(seedSet.has(b)) - Number(seedSet.has(a)));

  console.log(`Candidates: ${candidates.length}`);

  const working = [];
  const details = [];
  let done = 0;
  const t0 = Date.now();

  // Process in batches so we can stop early
  const batchSize = 200;
  for (let start = 0; start < candidates.length && working.length < target; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize);
    await mapPool(batch, concurrency, async (host) => {
      if (working.length >= target) return;
      const r = await check(host);
      done++;
      if (working.length >= target) return;
      if (r.ok) {
        // dedupe by registrable-ish host without www
        const key = r.domain.replace(/^www\./, "");
        if (working.some((w) => w.replace(/^www\./, "") === key)) return;
        working.push(r.domain);
        details.push(r);
        console.log(
          `✓ [${working.length}/${target}] ${r.domain}  score=${r.score}  ${r.title.slice(0, 60)}`
        );
        fs.writeFileSync(WORKING_FILE, working.join("\n") + "\n");
      }
      if (done % 80 === 0) {
        console.log(
          `… ${done} checked | working=${working.length} | ${((Date.now() - t0) / 1000) | 0}s`
        );
      }
    });
  }

  fs.writeFileSync(WORKING_FILE, working.join("\n") + "\n");
  fs.writeFileSync(JSON_FILE, JSON.stringify(details, null, 2));
  console.log(`\nDONE: ${working.length}/${target} real games`);
  console.log(WORKING_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
