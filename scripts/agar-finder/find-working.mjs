#!/usr/bin/env node
/**
 * Agar.io clone finder — checks domains from THIS machine (RU IP).
 * Marks a domain "working" if HTTPS answers and page looks like an agar/io cell game
 * (or known clone host answers 200).
 *
 * Usage:
 *   node find-working.mjs              # find until 100 working
 *   node find-working.mjs --target 50
 *   node find-working.mjs --concurrency 40
 */

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const WORKING_FILE = path.join(OUT_DIR, "working-domains.txt");
const FAIL_FILE = path.join(OUT_DIR, "failed-domains.txt");
const JSON_FILE = path.join(OUT_DIR, "results.json");

const args = process.argv.slice(2);
const target = Number(argVal("--target", "100"));
const concurrency = Number(argVal("--concurrency", "32"));
const timeoutMs = Number(argVal("--timeout", "8000"));

function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const SEED = [
  // originals / big clones
  "agar.io", "agario.com", "agar.su", "agar.ru", "agar.live", "agar.fun",
  "agar.bio", "agar.red", "agar.cool", "agar.cx", "agar.gg", "agar.party",
  "agar.pro", "agar.online", "agar.game", "agar.world", "agar.space",
  "agario.fun", "agario.live", "agario.pro", "agario.online", "agario.org",
  "agario.net", "agario.su", "agario.ru", "agario.io", "playagar.io",
  "playagario.org", "playagario.com", "agarplay.com", "agarplay.io",
  "gagar.io", "cellcraft.io", "cells.io", "cell.io", "blob.io", "gota.io",
  "agma.io", "senpa.io", "tricksplit.io", "germs.io", "agar2.com",
  "expanding.land", "imsolo.pro", "vanis.io", "ogar.pw", "ogar.mobi",
  "cagar.io", "wagar.io", "nazi.gg", "nazi.io", "galx.io", "galax.io",
  "bubbles.io", "bubbleshooter.io", "diep.io", "slither.io", "slither.su",
  "wormate.io", "wormax.io", "littlebigsnake.com", "evoworld.io",
  "flyordie.io", "paper-io.com", "hole-io.com", "surviv.io",
  // RU / CIS mirrors & private
  "ffa.agar.su", "api.agar.su", "sixz.ru", "slither.su", "agar.su",
  "play.agar.su", "megasplit.ru", "agariohub.github.io",
  "agario.city", "agario.zone", "agario.vip", "agario.club", "agario.site",
  "agario.top", "agario.best", "agario.today", "agario.pw", "agario.me",
  "agario.us", "agario.co", "agario.tv", "agario.ws", "agario.xyz",
  "unblockedagario.com", "agario-unblocked.com", "agariounblocked.com",
  "agario.school", "agario.classroom", "agariogame.com", "agariogame.net",
  "agariogame.org", "agariogame.io", "agarioplay.com", "agarioplay.org",
  "agarioplay.net", "agarioreal.com", "agario2.com", "agario2.io",
  "agar2.io", "agar3.com", "agar3.io", "agar4.com", "agarx.com",
  "agary.com", "agary.io", "agarz.com", "agaryou.com", "agaryou.io",
  "agarix.com", "agarix.io", "agariox.com", "agariox.io",
  "privateagario.com", "privateagario.net", "ogar.io", "ogar.live",
  "multiogar.com", "multiogar.org", "cursors.io", "skribbl.io",
  "florr.io", "mope.io", "deeeep.io", "starve.io", "krunker.io",
  "zombsroyale.io", "shellshock.io", "1v1.lol", "bapbap.gg",
  "territorial.io", "armywarfare.io", "arras.io", "diepio.com",
  "agariomods.com", "jimboyz.com", "legendmod.ml", "hslo.io",
  "delta.io", "deltatouch.com", "lm.agario", // may fail DNS — ok
  "agar.yt", "agar.gl", "agar.to", "agar.yt", "agar.is",
  "agario.is", "agario.to", "agario.gl", "agario.yt",
  "cellz.io", "cellz.com", "blobgame.io", "blobgame.com",
  "eatcells.com", "eatcells.io", "cellwars.io", "cellwars.com",
  "mitosis.io", "mitosis.online", "viruses.io", "virus.io",
  "agarwars.com", "agarwars.io", "agarwar.com", "agarbattle.com",
  "agariofree.com", "agariofree.io", "freeagario.com", "freeagar.io",
  "agarioonline.com", "agarioonline.org", "onlineagario.com",
  "agarioplay.ru", "agario-play.ru", "играть-в-агарио.рф",
  "agario.mobi", "agar.mobi", "agarioapp.com", "agarapp.com",
  "agariofr.com", "agarfr.com", "agariode.com", "agarde.com",
  "agariobr.com", "agarbr.com", "agariouk.com", "agaruk.com",
  "agarioca.com", "agarca.com", "agariorus.com", "agarrus.com",
  "ruagar.io", "ruagario.com", "agarioru.com", "agarioru.ru",
  "agario.kz", "agar.kz", "agario.by", "agar.by", "agario.ua", "agar.ua",
  "agario.pl", "agar.pl", "agario.tr", "agar.tr",
  "agar.io.vn", "agario.vn", "agar.io.id", "agario.id",
  "agar.miniclip.com", "www.agar.io", "www.agario.com",
  "client.agar.io", "m.agar.io", "mobile.agar.io",
  "eu.agar.io", "us.agar.io", "asia.agar.io", "sa.agar.io",
  "ffa.agar.io", "party.agar.io", "teams.agar.io", "experimental.agar.io",
  "agar.yttrium.me", "agar.nal.ru", "nal.ru",
  "agario.nal.ru", "cell.nal.ru",
  // more .io cell-likes
  "splix.io", "splix.com", "bonk.io", "bonk.io", "wormate.com",
  "snake.io", "slitherio.com", "slitherio.org", "slitherio.net",
  "slitherio.online", "slitherio.ru", "slitherio.su",
  "wormax.com", "worms.io", "snakeis.io",
  "agar.one", "agar.two", "agario.one", "agario.game",
  "play.google.com", // will fail agar check
  "y8.com", "poki.com", "crazygames.com", "armorgames.com",
  "io-games.io", "iogames.space", "iogames.fun", "titancodes.com",
  "agarioskins.com", "agarioskins.net", "agariomods.net",
  "agariocheat.com", "agarcheat.com", "agariobots.com",
  "botagar.io", "agarbot.com", "agarbots.com",
  "server.agar.io", "live-arena.agar.io", "live-arena-1.agar.io",
  "live-arena-2.agar.io", "live-arena-eu.agar.io",
  "cfx.re", // unrelated — filtered
];

const PREFIXES = [
  "", "www.", "play.", "game.", "games.", "m.", "mobile.", "client.",
  "ru.", "eu.", "us.", "asia.", "ffa.", "party.", "teams.", "beta.",
  "new.", "old.", "cdn.", "api.", "ws.", "wss.", "proxy.", "mirror.",
  "unblocked.", "proxy-", "mirror-",
];

const BASES = [
  "agar", "agario", "agar-io", "agario-unblocked", "unblocked-agario",
  "agarioplay", "agarioplay", "agarplay", "cellcraft", "gota", "agma",
  "senpa", "tricksplit", "blob", "germs", "cells", "cellz", "wagar",
  "cagar", "gagar", "nazi", "vanis", "ogar", "multiogar", "megasplit",
  "agar2", "agar3", "agarx", "agarix", "agariox", "agaryou",
  "privateagar", "privateagario", "freeagar", "freeagario",
  "ruagar", "ruagario", "playagar", "playagario",
  "agarwars", "agarbattle", "eatcells", "cellwars", "mitosis",
  "slither", "slitherio", "wormate", "wormax", "littlebigsnake",
];

const TLDS = [
  "io", "com", "net", "org", "su", "ru", "fun", "live", "pro", "online",
  "game", "games", "gg", "xyz", "site", "club", "vip", "top", "best",
  "today", "pw", "me", "co", "tv", "ws", "mobi", "info", "biz",
  "space", "world", "zone", "city", "party", "cool", "red", "bio",
  "cx", "is", "to", "gl", "kz", "by", "ua", "pl", "in", "us",
  "app", "dev", "tech", "cloud", "host", "store", "shop",
];

const AGAR_HINTS = [
  /agar\.?io/i, /agario/i, /cell\s*craft/i, /\bgota\.io\b/i, /\bagma\.io\b/i,
  /\bsenpa\.io\b/i, /tricksplit/i, /blob\.io/i, /germs\.io/i,
  /split\s*kill/i, /mass\s*boost/i, /eject\s*mass/i, /w\s*key/i,
  /canvas/i, /websocket/i, /WebSocket/i, /play\s*now/i,
  /nickname/i, /nick\s*name/i, /skin\s*select/i, /spectate/i,
  /ffa\b/i, /party\s*mode/i, /experimental/i, /leaderboard/i,
  /cells?\b/i, /virus(es)?\b/i, /pellet/i, /eat\s*(cells|players)/i,
  /slither/i, /wormate/i, /wormax/i, /expanding\.land/i,
  /ogar/i, /multiogar/i, /vanis\.io/i, /diep\.io/i,
  /io.?games/i, /\.io\b.*game/i, /browser\s*game/i,
];

const STRICT_HOST = /^(?:[\w-]+\.)*(?:agar|agario|cellcraft|gota|agma|senpa|tricksplit|blob|germs|cells?|ogar|vanis|slither|wormate|wormax|expanding|imsolo|agar2|nazi|wagar|cagar|gagar)(?:[\w-]*)\./i;

function normalizeHost(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^\*\./, "")
    .replace(/^www\./, "");
}

function buildCandidates() {
  const set = new Set();
  for (const s of SEED) {
    const h = normalizeHost(s);
    if (h && h.includes(".")) set.add(h);
  }
  for (const base of BASES) {
    for (const tld of TLDS) {
      set.add(`${base}.${tld}`);
      for (const p of ["www.", "play.", "m.", "ru.", "ffa."]) {
        set.add(`${p}${base}.${tld}`);
      }
    }
  }
  // numbered mirrors often used by unblocked sites
  for (let i = 1; i <= 30; i++) {
    set.add(`agar${i}.com`);
    set.add(`agario${i}.com`);
    set.add(`agar${i}.io`);
    set.add(`agario${i}.io`);
    set.add(`agario-unblocked${i}.com`);
    set.add(`unblockedagario${i}.com`);
  }
  return [...set];
}

async function fetchCrt(query) {
  const url = `https://crt.sh/?q=${encodeURIComponent(query)}&output=json`;
  try {
    const body = await httpGet(url, 25000);
    const data = JSON.parse(body);
    const hosts = new Set();
    for (const row of data.slice(0, 2000)) {
      const raw = `${row.common_name || ""}\n${row.name_value || ""}`;
      for (const line of raw.split(/\n+/)) {
        const h = normalizeHost(line);
        if (!h || h.includes(" ") || h.length > 80) continue;
        if (!h.includes(".")) continue;
        if (/wildixin|email|mail\.|cdn\.cloudflare|invalid/i.test(h)) continue;
        if (/agar|agario|gota|agma|senpa|ogar|cellcraft|blob\.io|vanis/i.test(h)) {
          hosts.add(h);
        }
      }
    }
    return [...hosts];
  } catch (e) {
    console.warn(`[crt.sh] ${query}: ${e.message}`);
    return [];
  }
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
          Accept: "text/html,application/json,*/*",
          "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
        timeout: ms,
        rejectUnauthorized: false,
        servername: u.hostname,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size < 200_000) chunks.push(c);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            finalUrl: urlStr,
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

async function resolveHost(host) {
  try {
    const r = await dns.lookup(host, { all: true });
    return r.map((x) => x.address);
  } catch {
    return [];
  }
}

function scoreBody(body, host) {
  let score = 0;
  const hits = [];
  for (const re of AGAR_HINTS) {
    if (re.test(body) || re.test(host)) {
      score += 1;
      hits.push(String(re));
    }
  }
  if (/<canvas/i.test(body)) score += 2;
  if (/new\s+WebSocket|wss?:\/\//i.test(body)) score += 2;
  if (STRICT_HOST.test(host + "/")) score += 2;
  return { score, hits };
}

async function checkDomain(host) {
  const result = {
    domain: host,
    ok: false,
    ips: [],
    https: null,
    http: null,
    score: 0,
    reason: "",
    title: "",
  };

  result.ips = await resolveHost(host);
  if (!result.ips.length) {
    result.reason = "dns_fail";
    return result;
  }

  for (const proto of ["https", "http"]) {
    try {
      const res = await httpGet(`${proto}://${host}/`);
      result[proto] = res.status;
      const { score } = scoreBody(res.body || "", host);
      const titleMatch = (res.body || "").match(/<title[^>]*>([^<]{0,120})/i);
      if (titleMatch) result.title = titleMatch[1].trim().replace(/\s+/g, " ");

      // Accept: 2xx/3xx with agar-ish content OR strong host match + any response
      const softOk =
        res.status >= 200 &&
        res.status < 500 &&
        (score >= 3 || (STRICT_HOST.test(host + "/") && score >= 1));

      const hardKnown =
        res.status >= 200 &&
        res.status < 400 &&
        STRICT_HOST.test(host + "/") &&
        (res.body || "").length > 200;

      if (softOk || hardKnown) {
        result.ok = true;
        result.score = Math.max(result.score, score);
        result.reason = proto;
        return result;
      }

      // Known io-game portals that host agar
      if (
        res.status >= 200 &&
        res.status < 400 &&
        /agar\.io|play\s*agar|cell\s*game|io\s*games/i.test(res.body || "") &&
        score >= 2
      ) {
        result.ok = true;
        result.score = score;
        result.reason = proto + "+portal";
        return result;
      }

      result.score = Math.max(result.score, score);
    } catch (e) {
      result.reason = result.reason || `${proto}:${e.message}`;
    }
  }

  if (!result.ok) result.reason = result.reason || "no_match";
  return result;
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
  console.log(`RU check from this PC | target=${target} concurrency=${concurrency}`);
  console.log(`Out: ${WORKING_FILE}`);

  let candidates = buildCandidates();
  console.log(`Seed candidates: ${candidates.length}`);

  console.log("Pulling crt.sh (agar%, agario%)…");
  const crt = [
    ...(await fetchCrt("%.agar.%")),
    ...(await fetchCrt("%.agario.%")),
    ...(await fetchCrt("agar.io")),
    ...(await fetchCrt("agario")),
  ];
  for (const h of crt) candidates.push(h);
  candidates = [...new Set(candidates.map(normalizeHost).filter(Boolean))];
  // drop nonsense
  candidates = candidates.filter(
    (h) =>
      /^[a-z0-9._-]+$/i.test(h) &&
      h.split(".").length >= 2 &&
      !h.endsWith(".local") &&
      h.length < 70
  );
  console.log(`Total unique candidates: ${candidates.length} (crt +${crt.length})`);

  const working = [];
  const failed = [];
  const details = [];

  // shuffle lightly so we don't only hit agar.* first
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  let done = 0;
  const started = Date.now();

  await mapPool(candidates, concurrency, async (host) => {
    if (working.length >= target) return;
    const r = await checkDomain(host);
    done++;
    if (working.length >= target) return;

    if (r.ok) {
      working.push(r.domain);
      details.push(r);
      console.log(
        `✓ [${working.length}/${target}] ${r.domain}  score=${r.score}  ips=${r.ips.join(",")}  ${r.title.slice(0, 50)}`
      );
      fs.writeFileSync(WORKING_FILE, working.join("\n") + "\n");
    } else {
      failed.push(`${r.domain}\t${r.reason}`);
    }

    if (done % 50 === 0) {
      const sec = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        `… checked ${done}/${candidates.length} | working=${working.length} | ${sec}s`
      );
    }
  });

  fs.writeFileSync(WORKING_FILE, working.join("\n") + "\n");
  fs.writeFileSync(FAIL_FILE, failed.join("\n") + "\n");
  fs.writeFileSync(JSON_FILE, JSON.stringify(details, null, 2));

  console.log("\n======== DONE ========");
  console.log(`Working: ${working.length} / target ${target}`);
  console.log(`Saved: ${WORKING_FILE}`);
  if (working.length < target) {
    console.log(
      `Недобрали до ${target}. Добавь сиды или перезапусти — многие agar-домены мертвы.`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
