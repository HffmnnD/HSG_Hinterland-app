import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Settings, Users } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import Avatar from '../ui/Avatar';

/**
 * Personen-Wechsler in der Kopfzeile – nur für Eltern mit verknüpften Kindern.
 *
 * Statt nur des eigenen Bildes steht oben rechts immer die Person, für die
 * gerade gehandelt wird. Ein Tipp öffnet die Liste „Ich + Kinder"; die aktive
 * Person ist markiert. So ist auch mit mehreren Kindern jederzeit klar, in
 * wessen Namen eine Zusage oder Abmeldung gespeichert wird.
 *
 * Ohne Kinder rendert die Komponente den bisherigen Link zu „Mein Konto".
 */
export default function PersonSwitcher() {
  const { user, actingAs, family, switchAccount } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'mousedown' && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!actingAs && family.length === 0) {
    return (
      <Link
        to="/konto"
        className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-hsg-green"
        aria-label="Mein Konto"
        title="Mein Konto"
      >
        <Avatar person={user} size="sm" />
      </Link>
    );
  }

  const self = actingAs
    ? { id: null, firstName: actingAs.actorFirstName, lastName: actingAs.actorLastName, photoUrl: actingAs.actorPhotoUrl }
    : { id: null, firstName: user.firstName, lastName: user.lastName, photoUrl: user.photoUrl };
  const activeId = actingAs ? user.id : null;

  const choose = async (id) => {
    setOpen(false);
    if (id === activeId) return;
    setBusy(true);
    setError(null);
    const result = await switchAccount(id);
    setBusy(false);
    if (!result.success) setError(result.message);
    else navigate('/');
  };

  const people = [{ ...self, label: 'Ich' }, ...family.map((child) => ({ ...child, label: child.firstName }))];

  return (
    <div ref={rootRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={actingAs ? `Du handelst für ${user.firstName}. Person wechseln` : 'Person wechseln'}
        title="Person wechseln"
        className={`flex items-center gap-1 rounded-full p-0.5 pr-1.5 outline-none focus-visible:ring-2 focus-visible:ring-hsg-green ${
          actingAs ? 'bg-hsg-green-soft ring-2 ring-hsg-green' : 'border border-line'
        }`}
      >
        <Avatar person={user} size="sm" />
        {actingAs && <span className="max-w-[6rem] truncate text-xs font-bold text-ink">{user.firstName}</span>}
        <ChevronDown size={14} aria-hidden="true" className="text-ink-muted" />
      </button>

      {error && (
        <p role="alert" className="absolute right-0 top-full mt-1 w-56 rounded-md border border-line bg-paper p-2 text-xs text-ink shadow-lg">
          {error}
        </p>
      )}

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md border border-line bg-paper p-1.5 shadow-lg">
          <p className="eyebrow px-2 pb-1 pt-1">Handeln für</p>
          {people.map((person) => {
            const active = person.id === activeId;
            return (
              <button
                key={person.id ?? 'self'}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(person.id)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${
                  active ? 'bg-hsg-green-soft' : 'hover:bg-surface'
                }`}
              >
                <Avatar person={person} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">
                    {person.id === null ? `${person.firstName ?? ''} (ich)` : `${person.firstName} ${person.lastName}`}
                  </span>
                  {person.id !== null && (
                    <span className="block truncate text-xs text-ink-muted">
                      {person.teams?.length ? person.teams.map((t) => t.name).join(', ') : 'Noch keine Mannschaft'}
                    </span>
                  )}
                </span>
                {active && <Check size={16} aria-hidden="true" className="shrink-0 text-hsg-green" />}
              </button>
            );
          })}
          <div className="mt-1 border-t border-line pt-1">
            <Link
              to="/konto"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-surface"
            >
              <Settings size={15} aria-hidden="true" /> {actingAs ? `Konto von ${user.firstName}` : 'Mein Konto'}
            </Link>
            {!actingAs && (
              <Link
                to="/konto?bereich=familie"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-surface"
              >
                <Users size={15} aria-hidden="true" /> Familie verwalten
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
