// JSON-Zugriff auf nuScoreLive, den Live-Ticker des Handballverbands.
//
// Gegenstück zu handballClient.js (HTML von nuLiga): holt eine Ressource,
// prüft Host und Antwortformat und gibt das geparste JSON zurück. Kein
// Caching (macht handballService), keine Feldlogik (macht nuScoreLiveMapper).
const axios = require('axios');

const {
  NUSCORE_BASE_URL,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  nuScoreGroupMeetingsUrl,
  nuScoreMeetingUrl,
  nuScoreEventsUrl,
  nuScorePlayersUrl,
  nuScoreOfficialsUrl,
  nuScoreFedOfficialsUrl,
} = require('../config/handball');
const { HandballUpstreamError } = require('./handballClient');

// Der einzige Host, mit dem dieses Modul sprechen darf.
const ERLAUBTER_HOST = new URL(NUSCORE_BASE_URL).host;

const HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json',
  'Accept-Language': 'de-DE,de;q=0.9',
};

/**
 * Holt eine nuScoreLive-Ressource als JSON.
 * @param {string} url absolute URL (aus config/handball.js)
 * @returns {Promise<object>}
 * @throws {HandballUpstreamError}
 */
async function loadJson(url) {
  let response;
  try {
    response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: HEADERS,
      // nuScoreLive leitet z. B. versionierte Spiel-URLs per 303 weiter –
      // aber nie auf einen anderen Host. Alles andere wird abgelehnt (siehe
      // handballClient.js zur Begründung).
      maxRedirects: 3,
      beforeRedirect: (options) => {
        if (options.host !== ERLAUBTER_HOST) {
          throw new HandballUpstreamError(
            `Weiterleitung auf fremden Host abgelehnt: ${options.host}`,
            { url }
          );
        }
      },
      maxContentLength: 2 * 1024 * 1024,
      responseType: 'text',
      transformResponse: [(data) => data],
      validateStatus: () => true,
    });
  } catch (err) {
    if (err?.code === 'ERR_FR_REDIRECTION_FAILURE') {
      throw new HandballUpstreamError(
        err.message.replace(/^Redirected request failed:\s*/, ''),
        { url, cause: err }
      );
    }
    const timedOut = err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT';
    throw new HandballUpstreamError(
      timedOut
        ? `nuScoreLive hat nicht innerhalb von ${REQUEST_TIMEOUT_MS} ms geantwortet.`
        : 'nuScoreLive ist nicht erreichbar.',
      { url, cause: err }
    );
  }

  if (response.status !== 200) {
    // 404 = Spiel/Staffel ist bei nuScoreLive nicht bekannt.
    throw new HandballUpstreamError(
      `nuScoreLive antwortete mit HTTP ${response.status}.`,
      { status: response.status, url }
    );
  }

  try {
    const data = JSON.parse(response.data);
    if (!data || typeof data !== 'object') throw new Error('kein Objekt');
    return data;
  } catch {
    throw new HandballUpstreamError('Antwort von nuScoreLive ist kein gültiges JSON.', {
      status: response.status,
      url,
    });
  }
}

/** Spiele einer Staffel (Fenster rund um heute). `meetingUuid` ist hier leer. */
const loadGroupMeetings = (group) => loadJson(nuScoreGroupMeetingsUrl(group));

/** Ein Spiel inkl. `live`, Stand und Halbzeitstand. */
const loadMeeting = (meeting) => loadJson(nuScoreMeetingUrl(meeting));

/**
 * Spielverlauf (unsortiert!).
 * @param {string} meeting
 * @param {string|null} versionUid `versionUid` aus loadMeeting() – ohne sie
 *        liefert das CDN womöglich einen bis zu einer Stunde alten Stand.
 */
const loadEvents = (meeting, versionUid = null) =>
  loadJson(nuScoreEventsUrl(meeting, versionUid));

/** Spielerliste mit Trikotnummern. */
const loadPlayers = (meeting) => loadJson(nuScorePlayersUrl(meeting));

/** Mannschaftsoffizielle (A, B, …) beider Teams. */
const loadOfficials = (meeting) => loadJson(nuScoreOfficialsUrl(meeting));

/** Schiedsrichter, Zeitnehmer, Sekretär. */
const loadFedOfficials = (meeting) => loadJson(nuScoreFedOfficialsUrl(meeting));

module.exports = {
  loadJson,
  loadOfficials,
  loadFedOfficials,
  loadGroupMeetings,
  loadMeeting,
  loadEvents,
  loadPlayers,
};
