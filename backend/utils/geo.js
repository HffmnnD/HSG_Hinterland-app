// Herkunftsland eines Requests bestimmen – für die Verkehrs-Statistik der
// Verwaltung (/admin -> System-Status).
//
// WICHTIG, damit die Zahlen richtig gelesen werden:
// Node kann aus einer IP-Adresse allein KEIN Land ableiten. Dafür bräuchte es
// eine GeoIP-Datenbank (MaxMind o. ä.) – eine mehrere Megabyte große Datei,
// die monatlich aktualisiert werden muss. Für eine Vereins-App wäre das ein
// unverhältnismäßiger Klotz.
//
// Stattdessen wird der Wert genommen, den der vorgelagerte Reverse-Proxy bzw.
// das CDN ohnehin schon kennt und als Header mitschickt:
//
//   Cloudflare      CF-IPCountry
//   Vercel          x-vercel-ip-country
//   Google AppEngine X-AppEngine-Country
//   nginx + GeoIP2  z. B. X-Geo-Country (selbst gesetzt, siehe unten)
//   Fastly          Fastly-Geo-Country
//
// nginx-Beispiel (Modul ngx_http_geoip2_module):
//
//     geoip2 /etc/nginx/GeoLite2-Country.mmdb {
//       $geoip2_country_code country iso_code;
//     }
//     proxy_set_header X-Geo-Country $geoip2_country_code;
//
// Ohne solchen Proxy bleibt das Land unbekannt – dann wird ehrlich
// "Unbekannt" gezählt statt geraten. Requests aus dem lokalen Netz (Entwicklung,
// LAN-Tests vom Handy) werden getrennt als "Lokales Netz" ausgewiesen, damit
// sie die Statistik nicht als Phantom-Land verunreinigen.

// Reihenfolge = Priorität. Alle liefern einen ISO-3166-1-alpha-2-Code.
const COUNTRY_HEADERS = [
  'cf-ipcountry',
  'x-vercel-ip-country',
  'x-appengine-country',
  'fastly-geo-country',
  'x-geo-country',
  'x-country-code',
];

// Pseudo-Codes für Fälle, die kein echtes Land sind. Bewusst nicht im
// ISO-Raum (zwei Buchstaben), damit sie nie mit einem Land kollidieren.
const UNKNOWN = 'XX';
const LOCAL = 'LOCAL';

// Deutsche Anzeigenamen. Bewusst nur die Länder, die für einen hessischen
// Handballverein realistisch auftauchen – alles andere übersetzt
// Intl.DisplayNames zur Laufzeit (in Node seit v14 eingebaut, keine
// zusätzliche Abhängigkeit).
const SPECIAL_LABELS = {
  [UNKNOWN]: 'Unbekannt',
  [LOCAL]: 'Lokales Netz',
};

let displayNames = null;
try {
  displayNames = new Intl.DisplayNames(['de'], { type: 'region' });
} catch {
  // Node ohne volle ICU-Daten -> es bleibt beim reinen Ländercode.
}

/**
 * Anzeigename zu einem Ländercode, z. B. 'DE' -> 'Deutschland'.
 * @param {string} code
 * @returns {string}
 */
function countryLabel(code) {
  if (SPECIAL_LABELS[code]) return SPECIAL_LABELS[code];
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Gehört die IP zum lokalen Netz (Loopback, RFC1918, CGNAT, link-local)?
 * @param {string} ip
 */
function isPrivateAddress(ip) {
  if (!ip) return true;

  // Express liefert IPv4-Adressen hinter IPv6 gern als "::ffff:192.168.0.5".
  const plain = ip.replace(/^::ffff:/i, '').trim().toLowerCase();

  if (plain === '::1' || plain === '127.0.0.1' || plain === 'localhost') return true;
  // IPv6: Unique Local (fc00::/7) und Link-Local (fe80::/10)
  if (/^f[cd]/.test(plain) || plain.startsWith('fe80')) return true;

  const parts = plain.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;

  return (
    a === 10 || // 10.0.0.0/8
    a === 127 || // Loopback
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) // Link-Local
  );
}

/**
 * Ländercode eines Requests.
 *
 * @param {import('express').Request} req
 * @returns {string} ISO-Code ('DE'), 'LOCAL' oder 'XX'
 */
function countryOf(req) {
  for (const header of COUNTRY_HEADERS) {
    const value = req.headers?.[header];
    if (typeof value !== 'string') continue;

    const code = value.trim().toUpperCase();
    // Cloudflare setzt bei anonymisierten Anfragen 'XX' bzw. 'T1' (Tor).
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') return code;
  }

  return isPrivateAddress(req.ip) ? LOCAL : UNKNOWN;
}

module.exports = {
  UNKNOWN,
  LOCAL,
  COUNTRY_HEADERS,
  countryOf,
  countryLabel,
  isPrivateAddress,
};
