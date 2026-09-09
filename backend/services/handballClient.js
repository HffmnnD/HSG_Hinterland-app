// HTML-Zugriff auf das nuLiga-Portal des HHV.
//
// Einzige Aufgabe: eine Seite holen und als geladenes cheerio-Dokument
// zurückgeben – mit Timeout und einheitlichem Fehlertyp. Kein Caching (das
// macht handballService), keine Feldlogik (das macht handballMapper).
const axios = require('axios');
const cheerio = require('cheerio');

const {
  BASE_URL,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  teamPortraitUrl,
  groupPageUrl,
  meetingReportUrl,
} = require('../config/handball');

// Der einzige Host, mit dem dieses Modul sprechen darf.
const ERLAUBTER_HOST = new URL(BASE_URL).host;

/**
 * Fehler beim Upstream (nuLiga). `status` ist der HTTP-Code des Verbands oder
 * 0 bei Netzwerkfehler/Timeout.
 */
class HandballUpstreamError extends Error {
  constructor(message, { status = 0, url = null, cause = null } = {}) {
    super(message);
    this.name = 'HandballUpstreamError';
    this.status = status;
    this.url = url;
    if (cause) this.cause = cause;
  }
}

// nuLiga antwortet auf Requests mit knappem oder fehlendem User-Agent teils
// mit 403. Diese Kopfzeilen entsprechen einem normalen Browser-Aufruf.
const HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9',
};

/**
 * Holt eine nuLiga-Seite und lädt sie in cheerio.
 *
 * @param {string} url absolute URL
 * @returns {Promise<{ $: import('cheerio').CheerioAPI, url: string }>}
 * @throws {HandballUpstreamError} bei Timeout, Netzwerkfehler, HTTP-Fehler
 *         oder einer Antwort, die kein brauchbares HTML ist
 */
async function loadPage(url) {
  let response;
  try {
    response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: HEADERS,
      maxRedirects: 5,
      // Weiterleitungen dürfen den Host NICHT wechseln.
      //
      // Ohne diese Prüfung wäre eine Weiterleitung des Verbandsservers (oder
      // ein DNS-/MITM-Angriff darauf) ein Einfallstor: sie könnte uns auf
      // 127.0.0.1, auf das interne Netz oder auf 169.254.169.254
      // (Cloud-Metadaten) lenken. Die IDs selbst sind zwar streng validiert,
      // aber ab dem ersten Redirect bestimmt nicht mehr unsere Prüfung das
      // Ziel, sondern die Gegenseite.
      beforeRedirect: (options) => {
        if (options.host !== ERLAUBTER_HOST) {
          throw new HandballUpstreamError(
            `Weiterleitung auf fremden Host abgelehnt: ${options.host}`,
            { url }
          );
        }
      },
      // Antworttext immer selbst auswerten – nicht axios raten lassen.
      responseType: 'text',
      transformResponse: [(data) => data],
      // 4xx/5xx nicht als Exception, damit unten eine einheitliche Meldung
      // mit Statuscode entsteht.
      validateStatus: () => true,
    });
  } catch (err) {
    // `follow-redirects` (unter axios) fängt den Wurf aus beforeRedirect ab und
    // verpackt ihn als ERR_FR_REDIRECTION_FAILURE. Die abgelehnte Weiterleitung
    // ist ein sicherheitsrelevanter Vorgang und soll deshalb als solcher im Log
    // stehen und nicht als allgemeines „nicht erreichbar".
    if (err?.code === 'ERR_FR_REDIRECTION_FAILURE') {
      throw new HandballUpstreamError(
        err.message.replace(/^Redirected request failed:\s*/, ''),
        { url, cause: err }
      );
    }

    const timedOut = err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT';
    throw new HandballUpstreamError(
      timedOut
        ? `nuLiga hat nicht innerhalb von ${REQUEST_TIMEOUT_MS} ms geantwortet.`
        : 'nuLiga ist nicht erreichbar.',
      { url, cause: err }
    );
  }

  if (response.status !== 200) {
    // 404 heißt bei nuLiga in der Praxis fast immer: ID unbekannt oder ein
    // Pflichtparameter fehlt (der Spielbericht braucht alle drei).
    throw new HandballUpstreamError(
      `nuLiga antwortete mit HTTP ${response.status}.`,
      { status: response.status, url }
    );
  }

  const html = typeof response.data === 'string' ? response.data : '';
  // Wartungs- und Fehlerseiten sind kurz und enthalten keine Datentabelle.
  // Lieber hier abbrechen (-> Notreserve greift), als dem Mapper eine leere
  // Seite unterzuschieben, die er als „Liga ohne Spiele" auslegen müsste.
  if (html.length < 500 || !/<table/i.test(html)) {
    throw new HandballUpstreamError(
      'Antwort von nuLiga enthält keine Datentabelle (Wartungs- oder Fehlerseite?).',
      { status: response.status, url }
    );
  }

  return { $: cheerio.load(html), url };
}

/**
 * Mannschaftsseite: enthält den Spielplan der Mannschaft und den Verweis auf
 * ihre Staffel (daraus werden championship und group gelesen).
 * @param {string} teamId nuLiga-`teamtable`-ID
 */
function loadTeamPortrait(teamId) {
  return loadPage(teamPortraitUrl(teamId));
}

/**
 * Staffelseite: enthält die Tabelle und den Gesamtspielplan der Staffel.
 * @param {string} championship z. B. "HHV 25/26"
 * @param {string} group z. B. "421558"
 */
function loadGroupPage(championship, group) {
  return loadPage(groupPageUrl(championship, group));
}

/**
 * Spielbericht: Ergebnis, Halbzeitstand und der Spielverlauf, aus dem der
 * Ticker gebaut wird.
 * @param {{ meeting:string, championship:string, group:string }} parts
 */
function loadMeetingReport(parts) {
  return loadPage(meetingReportUrl(parts));
}

module.exports = {
  loadPage,
  loadTeamPortrait,
  loadGroupPage,
  loadMeetingReport,
  HandballUpstreamError,
};
