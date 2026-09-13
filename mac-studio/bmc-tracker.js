/* BMC website-tracker — snippet voor www.bmc-consultancy.com
 * Verstuurt pageview-, hartslag- en afsluit-events naar /bmc-track
 * (pad dat via de webserver naar de tracker-service op de Mac Studio proxyt).
 * Inbouw: <script src="/bmc-tracker.js" defer></script> in de <head>.
 */
(function () {
  var EINDPUNT = '/bmc-track';
  var V_ID = 'bmc_vid';
  var S_ID = 'bmc_sid';

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function leesCookie(naam) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + naam + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function zetCookie(naam, waarde, minuten) {
    document.cookie =
      naam + '=' + encodeURIComponent(waarde) + ';path=/;max-age=' + minuten * 60 + ';SameSite=Lax';
  }

  // Bezoeker-id: first-party cookie, 2 jaar geldig
  var bezoekerId = leesCookie(V_ID);
  if (!bezoekerId) {
    bezoekerId = uuid();
    zetCookie(V_ID, bezoekerId, 60 * 24 * 365 * 2);
  }
  // Bezoek-id (sessie): schuivend 30 minuten zonder activiteit
  var bezoekId = leesCookie(S_ID);
  if (!bezoekId) bezoekId = uuid();
  zetCookie(S_ID, bezoekId, 30);

  var utm = {};
  try { new URLSearchParams(location.search).forEach(function (v, k) { utm[k] = v; }); } catch (e) {}
  var referrer = document.referrer || '';

  function afleidenBron() {
    if (utm.utm_source) {
      var s = String(utm.utm_source).toLowerCase();
      if (s.indexOf('google') > -1) return 'google';
      if (s.indexOf('facebook') > -1 || s === 'fb') return 'facebook';
      if (s.indexOf('instagram') > -1 || s === 'ig') return 'instagram';
      if (s.indexOf('linkedin') > -1 || s === 'li') return 'linkedin';
      if (s.indexOf('mail') > -1) return 'email';
      return 'overig';
    }
    var r = referrer.toLowerCase();
    if (!r || r.indexOf('bmc-consultancy.com') > -1) return 'direct';
    if (r.indexOf('google.') > -1) return 'google';
    if (r.indexOf('facebook.') > -1 || r.indexOf('fb.com') > -1) return 'facebook';
    if (r.indexOf('instagram.') > -1) return 'instagram';
    if (r.indexOf('linkedin.') > -1) return 'linkedin';
    if (r.indexOf('mail.') > -1 || r.indexOf('outlook.') > -1) return 'email';
    return 'overig';
  }

  var start = Date.now();
  var weergaveId = uuid();
  var weg = false;

  function stuur(type, extra) {
    if (weg && type !== 'leave') return;
    var event = {
      type: type,
      bezoeker_id: bezoekerId,
      bezoek_id: bezoekId,
      weergave_id: weergaveId,
      timestamp: new Date().toISOString(),
      url: location.href,
      pad: location.pathname,
      titel: document.title || '',
      referrer: referrer,
      utm_source: utm.utm_source || '',
      utm_medium: utm.utm_medium || '',
      utm_campaign: utm.utm_campaign || '',
      utm_content: utm.utm_content || '',
      taal: navigator.language || '',
      bron: afleidenBron(),
    };
    if (extra) for (var k in extra) event[k] = extra[k];
    var blob = new Blob([JSON.stringify(event)], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon && navigator.sendBeacon(EINDPUNT, blob)) return;
    try {
      fetch(EINDPUNT, {
        method: 'POST',
        body: JSON.stringify(event),
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
      }).catch(function () {});
    } catch (e) {}
  }

  stuur('pageview');
  var hartslag = setInterval(function () {
    stuur('heartbeat', { duur: Math.round((Date.now() - start) / 1000) });
  }, 15000);
  window.addEventListener('pagehide', function () {
    weg = true;
    clearInterval(hartslag);
    stuur('leave', { duur: Math.round((Date.now() - start) / 1000) });
  });
})();