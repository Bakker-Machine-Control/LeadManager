#!/usr/bin/env node
/* BMC website-tracker — service voor de Mac Studio.
 * Ontvangt events van de snippet op www.bmc-consultancy.com, verrijkt ze met
 * locatie- en browsergegevens en stuurt ze gebatched naar de Base44-functie
 * websiteTrack (authenticatie: header x-website-track-key uit config.json).
 * Draait op een lokale poort; de webserver proxyt /bmc-track naar /collect.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(HIER, 'config.json'), 'utf8'));
const { track_key, base44_url, poort } = config;

const WACHTRIJ = path.join(HIER, 'wachtrij.jsonl');
const GEOCACHE = path.join(HIER, 'geocache.json');

// ---------- caches en wachtrij ----------
let geoCache = {};
try { geoCache = JSON.parse(fs.readFileSync(GEOCACHE, 'utf8')); } catch {}
let wachtrij = [];
try {
  wachtrij = fs.readFileSync(WACHTRIJ, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
} catch {}

const bewaarWachtrij = () =>
  fs.writeFileSync(WACHTRIJ, wachtrij.length ? wachtrij.map((e) => JSON.stringify(e)).join('\n') + '\n' : '');
const bewaarGeoCache = () => fs.writeFileSync(GEOCACHE, JSON.stringify(geoCache));

// ---------- hulpjes ----------
function parseUA(ua) {
  ua = ua || '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'onbekend';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'onbekend';
  const mobiel = /Mobi|Android|iPhone/.test(ua);
  const tablet = /iPad|Tablet/.test(ua);
  return { browser, besturingssysteem: os, apparaat: mobiel ? 'mobiel' : tablet ? 'tablet' : 'desktop' };
}

// Laatste octet op 0 (IPv4) of eerste 3 groepen (IPv6) — alleen voor herkenning
function inkortIp(ip) {
  if (!ip) return '';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':');
  const d = ip.split('.');
  if (d.length === 4) { d[3] = '0'; return d.join('.'); }
  return ip;
}

function isInternIp(ip) {
  return (
    !ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') ||
    ip.startsWith('192.168.') || ip.startsWith('172.') || ip.startsWith('fc') || ip.startsWith('fd')
  );
}

async function geoLookup(ip) {
  if (isInternIp(ip)) return null;
  if (ip in geoCache) return geoCache[ip];
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,region,city,latitude,longitude`
    );
    const d = await res.json();
    const info =
      d && d.success
        ? {
            land: d.country || '',
            landcode: (d.country_code || '').toLowerCase(),
            provincie: d.region || '',
            plaats: d.city || '',
            lat: typeof d.latitude === 'number' ? d.latitude : null,
            lon: typeof d.longitude === 'number' ? d.longitude : null,
          }
        : null;
    geoCache[ip] = info;
    bewaarGeoCache();
    return info;
  } catch (e) {
    console.error('geo-lookup mislukt:', e.message);
    return null;
  }
}

// ---------- doorsturen naar Base44 ----------
let bezig = false;
async function flush() {
  if (bezig || wachtrij.length === 0) return;
  bezig = true;
  const batch = wachtrij.splice(0, 100);
  try {
    const res = await fetch(base44_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-website-track-key': track_key },
      body: JSON.stringify({ events: batch }),
    });
    if (res.ok) {
      console.log(new Date().toISOString(), batch.length, 'events doorgezet');
    } else {
      console.error('websiteTrack weigerde:', res.status, await res.text());
      wachtrij.unshift(...batch);
    }
  } catch (e) {
    console.error('netwerkfout richting Base44:', e.message);
    wachtrij.unshift(...batch);
  }
  bewaarWachtrij();
  bezig = false;
}
setInterval(flush, 10000);

// ---------- HTTP-server ----------
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url.startsWith('/collect')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const ontvangen = JSON.parse(body || '[]');
        const lijst = Array.isArray(ontvangen) ? ontvangen : ontvangen.events || [ontvangen];
        const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
          req.socket.remoteAddress || '').replace('::ffff:', '');
        const uaInfo = parseUA(req.headers['user-agent']);
        const geo = await geoLookup(ip);
        let toegevoegd = 0;
        for (const e of lijst) {
          if (!e || !e.type || !e.bezoeker_id || !e.bezoek_id || !e.weergave_id) continue;
          wachtrij.push({
            ...e,
            timestamp: e.timestamp || new Date().toISOString(),
            ip_adres: inkortIp(ip),
            browser: uaInfo.browser,
            besturingssysteem: uaInfo.besturingssysteem,
            apparaat: e.apparaat || uaInfo.apparaat,
            ...(geo || {}),
          });
          toegevoegd++;
        }
        bewaarWachtrij();
        res.writeHead(204);
        res.end();
        if (toegevoegd >= 25) flush();
      } catch (e) {
        console.error('ongeldige payload:', e.message);
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/status')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, in_wachtrij: wachtrij.length, sinds: new Date().toISOString() }));
  }

  res.writeHead(404);
  res.end();
});

server.listen(poort, '127.0.0.1', () => {
  console.log(`BMC website-tracker luistert op http://127.0.0.1:${poort}/collect`);
  flush(); // oude wachtrij eerst wegwerken
});