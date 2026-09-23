import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ExternalLink,
  Link2Off,
  Pencil,
  Plus,
  Shield,
  Users,
} from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { useAdminTeams } from '../../hooks/useAdminTeams';
import { formatNumber } from '../../lib/format';
import Modal from './ui/Modal';
import { EmptyState, ErrorNote, Loading, SuccessNote } from './ui/Feedback';

// Muss zum ENUM `teams.gender` passen.
const GENDER_OPTIONS = [
  { value: '', label: 'Keine Angabe' },
  { value: 'male', label: 'Männlich' },
  { value: 'female', label: 'Weiblich' },
  { value: 'mixed', label: 'Gemischt' },
];

const GENDER_LABELS = {
  male: 'Männlich',
  female: 'Weiblich',
  mixed: 'Gemischt',
};

// Vorschläge für die Altersklasse. Bewusst ein <datalist> und kein <select>:
// die Verbände benennen Altersklassen regelmäßig um, und wer eine „E-Jugend
// gemischt" braucht, soll sie eintippen können.
const AGE_GROUP_SUGGESTIONS = [
  'Minis',
  'F-Jugend',
  'E-Jugend',
  'D-Jugend',
  'C-Jugend',
  'B-Jugend',
  'A-Jugend',
  'Erwachsene',
  'Senioren',
];

/**
 * Mannschaftsverwaltung: Übersicht aller Mannschaften mit ihren Stammdaten,
 * ein Formular zum Anlegen neuer und ein Dialog zum Nachbearbeiten.
 *
 * Die Tabelle ist zugleich Navigation: die Spalte „nuLiga" öffnet die
 * Stammdaten dieser Mannschaft, die Spalte „Kader" springt in ihre
 * Kaderverwaltung. Beides sind die zwei Wege, die man von hier aus überhaupt
 * gehen will – sie als Klickziele dort anzubieten, wo der Wert steht, spart
 * eine Spalte voller Knöpfe.
 *
 * Die Kaderpflege selbst (wer spielt mit, Rückennummern, Fotos, Sponsoren)
 * bleibt bewusst auf der Mannschaftsseite – dort arbeiten die Trainer:innen,
 * und dort steht der Zusammenhang.
 */
export default function TeamsSection() {
  const { teams, loading, error, setError, reload } = useAdminTeams();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen] = useState(false);
  // Mannschaft, deren Stammdaten gerade bearbeitet werden (null = keine).
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);

  const openEditor = (team) => {
    setNotice(null);
    setError(null);
    setEditing(team);
  };

  /** In die Kaderverwaltung der Mannschaft springen. */
  const openRoster = (team) => navigate(`/teams/${team.code}?tab=verwaltung`);

  return (
    <div className="space-y-4">
      {notice && <SuccessNote>{notice}</SuccessNote>}
      {error && <ErrorNote>{error}</ErrorNote>}

      <section className="admin-card">
        <div className="admin-card__header">
          <div className="min-w-0">
            <h2 className="section-title text-base">Mannschaften</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              nuLiga anklicken öffnet die Stammdaten, Kader anklicken die
              Kaderverwaltung.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setCreateOpen(true);
            }}
            className="btn btn-primary btn-sm"
          >
            <Plus size={15} aria-hidden="true" />
            Neue Mannschaft
          </button>
        </div>

        {loading ? (
          <Loading>Mannschaften werden geladen …</Loading>
        ) : teams.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="Noch keine Mannschaft"
            hint="Lege die erste Mannschaft an – danach können sich Mitglieder ihr zuordnen."
          >
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="btn btn-primary btn-sm mt-2"
            >
              <Plus size={15} aria-hidden="true" />
              Neue Mannschaft
            </button>
          </EmptyState>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Kürzel</th>
                  <th>Name</th>
                  <th>Altersklasse</th>
                  <th>Geschlecht</th>
                  <th>nuLiga</th>
                  <th>Kader</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.id}>
                    <td>
                      <span className="badge badge-trainer">{team.code}</span>
                    </td>
                    <td>
                      <Link
                        to={`/teams/${team.code}`}
                        className="link"
                        title="Mannschaftsseite öffnen"
                      >
                        {team.name}
                      </Link>
                    </td>
                    <td className="text-ink-soft">{team.ageGroup ?? '—'}</td>
                    <td className="text-ink-soft">
                      {team.gender ? GENDER_LABELS[team.gender] : '—'}
                    </td>

                    {/* nuLiga -> Stammdaten bearbeiten */}
                    <td className="p-0">
                      <CellButton
                        onClick={() => openEditor(team)}
                        title={`Stammdaten von ${team.name} bearbeiten`}
                      >
                        {team.handballTeamId ? (
                          <>
                            <span
                              className="status-dot bg-hsg-green"
                              aria-hidden="true"
                            />
                            <span className="tabular-nums">
                              {team.handballTeamId}
                            </span>
                          </>
                        ) : (
                          <>
                            <Link2Off
                              size={13}
                              aria-hidden="true"
                              className="text-ink-muted"
                            />
                            <span className="text-ink-muted">nicht verknüpft</span>
                          </>
                        )}
                        <Pencil
                          size={12}
                          aria-hidden="true"
                          className="ml-auto shrink-0 text-ink-muted"
                        />
                      </CellButton>
                    </td>

                    {/* Kader -> Kaderverwaltung dieser Mannschaft */}
                    <td className="p-0">
                      <CellButton
                        onClick={() => openRoster(team)}
                        title={`Kader von ${team.name} verwalten`}
                      >
                        <Users
                          size={13}
                          aria-hidden="true"
                          className="shrink-0 text-ink-muted"
                        />
                        <span>
                          {formatNumber(team.counts.player)}
                          {team.counts.coach > 0 && ` · ${team.counts.coach} Tr.`}
                        </span>
                        {team.counts.pending > 0 && (
                          <span className="badge badge-pending">
                            {team.counts.pending} offen
                          </span>
                        )}
                        <ChevronRight
                          size={13}
                          aria-hidden="true"
                          className="ml-auto shrink-0 text-ink-muted"
                        />
                      </CellButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <TeamComposer
        open={createOpen}
        existingTeams={teams}
        onClose={() => setCreateOpen(false)}
        onCreated={async (message) => {
          setCreateOpen(false);
          setError(null);
          await reload();
          setNotice(message);
        }}
      />

      <TeamEditor
        team={editing}
        onClose={() => setEditing(null)}
        onSaved={async (message) => {
          setEditing(null);
          setError(null);
          await reload();
          setNotice(message);
        }}
      />
    </div>
  );
}

/**
 * Eine Tabellenzelle, die sich anklicken lässt.
 *
 * Füllt die Zelle vollständig aus (`p-0` an der `td`), damit die ganze Fläche
 * das Ziel ist und nicht nur der Text. Ein echtes `<button>` statt eines
 * `onClick` an der Zelle: nur so ist es per Tastatur erreichbar und wird als
 * Bedienelement angesagt.
 */
function CellButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex min-h-11 w-full items-center gap-1.5 px-4 py-3 text-left text-xs
        text-ink-soft transition-colors hover:bg-hsg-green-soft hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Formular „Neue Mannschaft anlegen". */
function TeamComposer({ open, existingTeams, onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setFormError(null);
  };

  const close = () => {
    if (submitting) return;
    setForm(emptyForm());
    setFormError(null);
    onClose();
  };

  // Doppeltes Kürzel schon beim Tippen melden – das Backend lehnt es ohnehin
  // ab (UNIQUE-Index), aber vor dem Absenden Bescheid zu wissen ist besser.
  const code = form.code.trim().toUpperCase();
  const codeTaken = existingTeams.some((team) => team.code === code);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (!form.name.trim() || !code) {
      setFormError('Name und Kürzel sind Pflichtfelder.');
      return;
    }
    if (codeTaken) {
      setFormError(`Das Kürzel „${code}“ ist bereits vergeben.`);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const result = await apiFetch('/api/admin/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          code,
          ageGroup: form.ageGroup.trim(),
          gender: form.gender,
          handballTeamId: form.handballTeamId.trim(),
        }),
      });
      setForm(emptyForm());
      await onCreated(result?.message ?? 'Mannschaft angelegt.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Neue Mannschaft anlegen"
      description="Nur Name und Kürzel sind Pflicht – alles andere lässt sich nachtragen."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && <ErrorNote>{formError}</ErrorNote>}

        <div>
          <label htmlFor="team-name" className="field-label">
            Teamname
          </label>
          <input
            id="team-name"
            className="field-control"
            value={form.name}
            onChange={update('name')}
            maxLength={100}
            placeholder="z. B. Weibliche Jugend C"
            disabled={submitting}
            required
          />
        </div>

        <div>
          <label htmlFor="team-code" className="field-label">
            Kürzel
          </label>
          <input
            id="team-code"
            className="field-control uppercase"
            value={form.code}
            onChange={update('code')}
            maxLength={20}
            placeholder="z. B. WJC"
            disabled={submitting}
            required
          />
          <p className={`field-hint ${codeTaken ? 'text-danger' : ''}`}>
            {codeTaken
              ? `„${code}“ ist bereits vergeben – bitte ein anderes Kürzel wählen.`
              : 'Steht in der Adresse der Mannschaftsseite und auf den Chips. Später nicht mehr änderbar.'}
          </p>
        </div>

        <StammdatenFelder form={form} update={update} disabled={submitting} />

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="btn btn-outline"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={submitting || codeTaken}
            className="btn btn-primary"
          >
            {submitting ? 'Wird angelegt …' : 'Mannschaft anlegen'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Stammdaten einer bestehenden Mannschaft ändern.
 *
 * `key={team.code}` beim Aufruf sorgt dafür, dass der Formularzustand für jede
 * Mannschaft frisch aus deren Daten entsteht – ohne setState im Effekt.
 */
function TeamEditor({ team, onClose, onSaved }) {
  return (
    <Modal
      open={Boolean(team)}
      onClose={onClose}
      title={team ? `${team.name} bearbeiten` : 'Mannschaft bearbeiten'}
      description="Kader, Foto und Sponsoren pflegt die Mannschaftsseite."
    >
      {team && <TeamEditorForm key={team.code} team={team} onSaved={onSaved} onClose={onClose} />}
    </Modal>
  );
}

function TeamEditorForm({ team, onSaved, onClose }) {
  const [form, setForm] = useState(() => ({
    name: team.name ?? '',
    code: team.code,
    ageGroup: team.ageGroup ?? '',
    gender: team.gender ?? '',
    handballTeamId: team.handballTeamId ?? '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setFormError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (!form.name.trim()) {
      setFormError('Der Name darf nicht leer sein.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      // Immer alle Felder senden: das Backend nimmt jedes einzeln entgegen,
      // und ein geleertes Feld (Altersklasse gelöscht) muss auch als
      // „geleert" ankommen – nicht als „nicht angefasst".
      const result = await apiFetch(`/api/teams/${encodeURIComponent(team.code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          ageGroup: form.ageGroup.trim(),
          gender: form.gender,
          handballTeamId: form.handballTeamId.trim(),
        }),
      });
      await onSaved(result?.message ?? 'Stammdaten gespeichert.');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && <ErrorNote>{formError}</ErrorNote>}

      <div>
        <label htmlFor="edit-team-name" className="field-label">
          Teamname
        </label>
        <input
          id="edit-team-name"
          className="field-control"
          value={form.name}
          onChange={update('name')}
          maxLength={100}
          disabled={submitting}
          required
        />
      </div>

      <div>
        <span className="field-label">Kürzel</span>
        <p className="flex min-h-11 items-center gap-2 rounded-sm border border-line bg-surface px-3.5 text-sm">
          <span className="badge badge-trainer">{team.code}</span>
          <span className="text-xs text-ink-muted">
            Nicht änderbar – steht in Links und Lesezeichen.
          </span>
        </p>
      </div>

      <StammdatenFelder form={form} update={update} disabled={submitting} idPrefix="edit-" />

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="btn btn-outline"
        >
          Abbrechen
        </button>
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? 'Wird gespeichert …' : 'Speichern'}
        </button>
      </div>
    </form>
  );
}

/**
 * Die Felder, die beim Anlegen UND beim Bearbeiten gleich sind: Altersklasse,
 * Geschlecht, nuLiga-Nummer. Einmal beschrieben, damit die beiden Dialoge
 * nicht auseinanderlaufen.
 */
function StammdatenFelder({ form, update, disabled, idPrefix = '' }) {
  const ageId = `${idPrefix}team-age`;
  const genderId = `${idPrefix}team-gender`;
  const nuligaId = `${idPrefix}team-nuliga`;
  const listId = `${idPrefix}team-age-suggestions`;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ageId} className="field-label">
            Jugend / Altersklasse
          </label>
          <input
            id={ageId}
            className="field-control"
            list={listId}
            value={form.ageGroup}
            onChange={update('ageGroup')}
            maxLength={40}
            placeholder="z. B. C-Jugend"
            disabled={disabled}
          />
          <datalist id={listId}>
            {AGE_GROUP_SUGGESTIONS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor={genderId} className="field-label">
            Geschlecht
          </label>
          <select
            id={genderId}
            className="field-control"
            value={form.gender}
            onChange={update('gender')}
            disabled={disabled}
          >
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={nuligaId} className="field-label">
          nuLiga-Mannschaftsnummer
        </label>
        <input
          id={nuligaId}
          className="field-control"
          inputMode="numeric"
          value={form.handballTeamId}
          onChange={update('handballTeamId')}
          placeholder="z. B. 2086554"
          disabled={disabled}
        />
        <p className="field-hint">
          Die Zahl hinter <code>teamtable=</code> in der Adresse der
          Mannschaftsseite auf hhv-handball.liga.nu. Sobald sie hinterlegt ist,
          holen sich Tabelle, Spielplan und Live-Ticker ihre Daten von selbst;
          leer lassen hebt die Verknüpfung wieder auf.{' '}
          <a
            href="https://hhv-handball.liga.nu"
            target="_blank"
            rel="noreferrer noopener"
            className="link inline-flex items-center gap-1"
          >
            nuLiga öffnen
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        </p>
      </div>
    </>
  );
}

function emptyForm() {
  return {
    name: '',
    code: '',
    ageGroup: '',
    gender: '',
    handballTeamId: '',
  };
}
