import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Link2Off, Plus, Shield, Users } from 'lucide-react';

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
 * Mannschaftsverwaltung: Übersicht aller Mannschaften mit ihren Stammdaten
 * und ein Formular zum Anlegen neuer.
 *
 * Die Kaderpflege (wer spielt mit, Rückennummern, Fotos, Sponsoren) bleibt
 * bewusst auf der jeweiligen Mannschaftsseite – dort arbeiten die
 * Trainer:innen, und dort steht der Zusammenhang. Hier geht es nur um die
 * Stammdaten, die eine Mannschaft überhaupt erst entstehen lassen.
 */
export default function TeamsSection() {
  const { teams, loading, error, setError, reload } = useAdminTeams();
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  return (
    <div className="space-y-4">
      {notice && <SuccessNote>{notice}</SuccessNote>}
      {error && <ErrorNote>{error}</ErrorNote>}

      <section className="admin-card">
        <div className="admin-card__header">
          <div className="min-w-0">
            <h2 className="section-title text-base">Mannschaften</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Stammdaten und Ligaanbindung. Kader und Fotos pflegt die
              Mannschaftsseite.
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
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Kürzel</th>
                  <th>Name</th>
                  <th>Altersklasse</th>
                  <th>Geschlecht</th>
                  <th>Sortierung</th>
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
                      <Link to={`/teams/${team.code}`} className="link" title="Mannschaftsseite öffnen">
                        {team.name}
                      </Link>
                    </td>
                    <td className="text-ink-soft">{team.ageGroup ?? '—'}</td>
                    <td className="text-ink-soft">
                      {team.gender ? GENDER_LABELS[team.gender] : '—'}
                    </td>
                    <td className="tabular-nums text-ink-muted">{team.sortOrder}</td>
                    <td>
                      {team.handballTeamId ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="status-dot bg-hsg-green" aria-hidden="true" />
                          <span className="tabular-nums text-ink-soft">
                            {team.handballTeamId}
                          </span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs text-ink-muted"
                          title="Ohne nuLiga-Nummer zeigt die Mannschaftsseite weder Tabelle noch Spielplan."
                        >
                          <Link2Off size={13} aria-hidden="true" />
                          nicht verknüpft
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                        <Users size={13} aria-hidden="true" className="text-ink-muted" />
                        {formatNumber(team.counts.player)} Spieler:innen
                        {team.counts.coach > 0 && ` · ${team.counts.coach} Trainer:in`}
                        {team.counts.pending > 0 && (
                          <span className="badge badge-pending ml-1">
                            {team.counts.pending} offen
                          </span>
                        )}
                      </span>
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
    </div>
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
          // Leer lassen -> das Backend hängt die Mannschaft hinten an.
          sortOrder: form.sortOrder === '' ? undefined : Number(form.sortOrder),
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
              : 'Steht in der Adresse der Mannschaftsseite und auf den Chips. Buchstaben, Ziffern und Bindestriche.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="team-age" className="field-label">
              Jugend / Altersklasse
            </label>
            <input
              id="team-age"
              className="field-control"
              list="team-age-suggestions"
              value={form.ageGroup}
              onChange={update('ageGroup')}
              maxLength={40}
              placeholder="z. B. C-Jugend"
              disabled={submitting}
            />
            <datalist id="team-age-suggestions">
              {AGE_GROUP_SUGGESTIONS.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor="team-gender" className="field-label">
              Geschlecht
            </label>
            <select
              id="team-gender"
              className="field-control"
              value={form.gender}
              onChange={update('gender')}
              disabled={submitting}
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
          <label htmlFor="team-sort" className="field-label">
            Sortierung
          </label>
          <input
            id="team-sort"
            type="number"
            min={0}
            max={65535}
            className="field-control"
            value={form.sortOrder}
            onChange={update('sortOrder')}
            placeholder="leer = ans Ende"
            disabled={submitting}
          />
          <p className="field-hint">
            Kleinste Zahl zuerst – überall dort, wo Mannschaften aufgelistet
            werden. Die bestehenden Mannschaften stehen in Zehnerschritten,
            damit sich etwas dazwischen schieben lässt.
          </p>
        </div>

        <div>
          <label htmlFor="team-nuliga" className="field-label">
            nuLiga-Mannschaftsnummer
          </label>
          <input
            id="team-nuliga"
            className="field-control"
            inputMode="numeric"
            value={form.handballTeamId}
            onChange={update('handballTeamId')}
            placeholder="z. B. 2086554"
            disabled={submitting}
          />
          <p className="field-hint">
            Die Zahl hinter <code>teamtable=</code> in der Adresse der
            Mannschaftsseite auf hhv-handball.liga.nu. Sobald sie hinterlegt
            ist, holen sich Tabelle, Spielplan und Live-Ticker ihre Daten von
            selbst.{' '}
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

function emptyForm() {
  return {
    name: '',
    code: '',
    ageGroup: '',
    gender: '',
    sortOrder: '',
    handballTeamId: '',
  };
}
