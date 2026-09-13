# Website-tracking — installatie op de Mac Studio

Deze map bevat de volledige tracking-keten voor www.bmc-consultancy.com:

| Bestand | Wat het doet |
|---|---|
| `bmc-tracker.js` | Snippet voor de website: registreert bezoeker (cookie), sessie (30 min), pageviews, hartslagen en afsluit-events |
| `bmc-web-tracker.mjs` | Service op de Mac Studio: verrijkt events met locatie (via IP) en browsergegevens en stuurt ze gebatched naar Base44 |
| `config.json` | Track-sleutel + Base44-URL + poort (sleutel staat er al in) |
| `com.bmc.websitetracker.plist` | launchd-configuratie zodat de service altijd draait |

## Stappen op de Mac Studio

1. **Bestanden kopiëren** naar `~/leadbridge/` (naast het bestaande leadbridge-script):
   ```bash
   cp bmc-web-tracker.mjs config.json ~/leadbridge/
   mkdir -p ~/leadbridge/logs
   ```

2. **launchd-taak instellen** — pas in de plist `/usr/local/bin/node` aan naar het pad dat `which node` geeft, en `GEBRUIKSNAAM` naar de inlognaam op de Mac. Dan:
   ```bash
   cp com.bmc.websitetracker.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.bmc.websitetracker.plist
   launchctl list | grep websitetracker   # controleer dat hij draait
   ```

3. **Webserver-proxy** — laat het pad `/bmc-track` op www.bmc-consultancy.com doorsturen naar `http://127.0.0.1:8787/collect` (als de website op de Mac Studio draait). Voor nginx:
   ```nginx
   location = /bmc-track {
     proxy_pass http://127.0.0.1:8787/collect;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }
   ```
   Draait de website elders, zorg dan dat `/bmc-track` (of een eigen subdomein met HTTPS) naar de Mac Studio proxiet.

4. **Snippet op de website** — zet `bmc-tracker.js` in de webroot en voeg in de `<head>` van elke pagina toe:
   ```html
   <script src="/bmc-tracker.js" defer></script>
   ```

5. **Testen**:
   ```bash
   # handmatig een pageview aanleveren (verwacht: geen output, 204)
   curl -i -X POST http://127.0.0.1:8787/collect \
     -H 'Content-Type: text/plain' \
     -d '{"type":"pageview","bezoeker_id":"test-bzoeker","bezoek_id":"test-bezoek","weergave_id":"test-weergave","url":"https://www.bmc-consultancy.com/","pad":"/","titel":"Test","timestamp":"2026-09-13T12:00:00.000Z"}'

   # wachtrij en status bekijken
   curl http://127.0.0.1:8787/status
   tail -f ~/leadbridge/logs/websitetracker.log
   ```

## Hoe het werkt

- Elke pagina stuurt bij het laden een **pageview**, daarna elke 15 seconden een **heartbeat** met de leestijd, en bij het verlaten een **leave**-event.
- De service verrijkt elk event met plaats, provincie, land, coördinaten (op basis van het IP, met cache), browser, besturingssysteem en apparaat.
- Elke 10 seconden (of bij 25+ events) gaat de batch naar de Base44-functie `websiteTrack`, met de geheime sleutel als `x-website-track-key`-header.
- Lukt het doorsturen niet (bijv. internetstoring), dan blijven events in `wachtrij.jsonl` staan en worden later alsnog verstuurd.
- Daarna verschijnen de bezoekers automatisch op de **Website**-pagina in de BMC Sales tool (tabbladen Overzicht, Bezoekers en Kaart).