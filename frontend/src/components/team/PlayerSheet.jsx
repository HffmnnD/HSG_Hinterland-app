import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Mail, MapPin, Phone, Repeat, TrendingUp } from 'lucide-react';

import { apiFetch } from '../../lib/api';
import { positionLabelLong, relationLabel } from '../../lib/participation';
import { eventTypeLabel, formatClock, formatEventDay } from '../../lib/schedule';
import Modal from '../ui/Modal';
import Avatar from '../ui/Avatar';
import { ErrorNote, Loading } from '../admin/ui/Feedback';

const WEEKDAYS = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const STATUS = {
  ATTENDING: { label: 'Zugesagt', cls: 'badge-confirmed' },
  DECLINED: { label: 'Abgesagt', cls: 'badge-declined' },
};

/**
 * Spieler-Ansicht: öffnet sich beim Tippen auf ein Mitglied im Kader.
 * Trainingszeiten, nächste Termine mit Rückmeldung, Beteiligung, Kontakt.
 * Trainer:innen springen von hier direkt in Teamplaner oder schreiben
 * eine Nachricht.
 *
 * @param {{ code: string, member: object, onClose: () => void, onOpenTraining?: () => void }} props
 */
export default function PlayerSheet({ code, member, onClose, onOpenTraining }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/teams/${encodeURIComponent(code)}/members/${member.id}/profile`)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [code, member.id]);

  const person = data?.person ?? member;
  const rate = data?.participation?.rate;

  return (
    <Modal onClose={onClose} title={`${member.firstName} ${member.lastName}`} size="md">
      <div className="space-y-5">
        <header className="flex items-center gap-4">
          <span className="relative">
            <Avatar person={person} size="xl" />
            {person.jerseyNumber !== null && person.jerseyNumber !== undefined && (
              <span className="absolute -bottom-1 -right-1 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-paper bg-hsg-green px-1 font-display text-xs font-bold text-white">
                {person.jerseyNumber}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">
              {person.isCoach ? person.staffTitle ?? relationLabel('coach') : relationLabel('player')}
              {person.position ? ` · ${positionLabelLong(person.position)}` : ''}
            </p>
            {data?.otherTeams?.length > 0 && (
              <p className="text-xs text-ink-muted">
                Auch in:{' '}
                {data.otherTeams.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ', '}
                    <Link to={`/teams/${t.code}`} className="link" onClick={onClose}>
                      {t.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {person.email && (
                <a href={`mailto:${person.email}`} className="link inline-flex items-center gap-1 text-xs">
                  <Mail size={12} aria-hidden="true" /> E-Mail
                </a>
              )}
              {person.phone && (
                <a href={`tel:${person.phone.replace(/[^0-9+]/g, '')}`} className="link inline-flex items-center gap-1 text-xs">
                  <Phone size={12} aria-hidden="true" /> {person.phone}
                </a>
              )}
            </div>
          </div>
        </header>

        {error && <ErrorNote>{error}</ErrorNote>}
        {!data && !error && <Loading />}

        {data && (
          <>
            {data.participation && (
              <section className="grid grid-cols-3 gap-2 text-center">
                <Stat icon={TrendingUp} label="Beteiligung" value={rate === null ? '–' : `${rate} %`} />
                <Stat label="Dabei" value={data.participation.attending} />
                <Stat label="Termine" value={data.participation.total} hint={`${data.participation.days} Tage`} />
              </section>
            )}

            <section>
              <h3 className="eyebrow flex items-center gap-1.5">
                <Repeat size={12} aria-hidden="true" /> Trainingszeiten
              </h3>
              {data.trainingTimes.length === 0 ? (
                <p className="mt-1 text-sm text-ink-muted">Keine festen Trainingszeiten.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {data.trainingTimes.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-3 rounded-md border border-line px-3 py-2 text-sm">
                      <span className="font-bold text-ink">{t.weekdays.map((d) => WEEKDAYS[d]).join(', ')}</span>
                      <span className="text-ink-soft">
                        {t.startTime}–{t.endTime} Uhr
                      </span>
                      {t.location && (
                        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                          <MapPin size={12} aria-hidden="true" /> {t.location}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="eyebrow flex items-center gap-1.5">
                <CalendarClock size={12} aria-hidden="true" /> Nächste Termine
              </h3>
              {data.upcoming.length === 0 ? (
                <p className="mt-1 text-sm text-ink-muted">Keine Termine in den nächsten vier Wochen.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                  {data.upcoming.map((event) => (
                    <li key={event.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">
                          {event.title}
                          {eventTypeLabel(event.type) !== event.title && (
                            <span className="ml-1.5 text-xs font-normal text-ink-muted">{eventTypeLabel(event.type)}</span>
                          )}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {formatEventDay(event.startTime)} · {formatClock(event.startTime)} Uhr
                        </span>
                      </span>
                      {event.status && <span className={`badge ${STATUS[event.status]?.cls ?? ''}`}>{STATUS[event.status]?.label}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex flex-wrap gap-2">
              {onOpenTraining && (data.viewer.canManage || data.viewer.isSelf) && (
                <button type="button" className="btn btn-primary btn-sm" onClick={onOpenTraining}>
                  Teamplaner öffnen
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-md border border-line bg-surface px-2 py-2.5">
      <p className="flex items-center justify-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
        {Icon && <Icon size={12} aria-hidden="true" />}
        {label}
      </p>
      <p className="font-display text-xl font-bold text-ink">{value}</p>
      {hint && <p className="text-[0.625rem] text-ink-muted">{hint}</p>}
    </div>
  );
}
