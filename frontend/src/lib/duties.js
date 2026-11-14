// Dienstplan: Vorlage für Dienstserien und Darstellungs-Helfer.

const pad = (value) => String(value).padStart(2, '0');

/** `HH:MM` -> Minuten seit Mitternacht. null bei ungültiger Eingabe. */
function clockToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** `YYYY-MM-DD` + Minuten (auch über Mitternacht) -> `YYYY-MM-DDTHH:MM`. */
function atMinutes(date, minutes) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day, 0, minutes);
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
}

const clockOf = (iso) => iso.slice(11, 16);

/**
 * Titel eines Dienstes aus der Vorlage: „Kuchenverkauf 10:00–11:30". Bei
 * „Nummern" stattdessen „Kuchenverkauf 1/6".
 */
function seriesTitle(base, startTime, endTime, { naming, index, count }) {
  const name = base.trim();
  if (naming === 'number') return `${name} ${index + 1}/${count}`;
  return `${name} ${clockOf(startTime)}–${clockOf(endTime)}`;
}

/**
 * Vorlage -> Dienste. Hintereinander am selben Tag: Beginn, Dauer, Anzahl,
 * optional Pause dazwischen.
 *
 * @param {{ title:string, date:string, start:string, duration:number,
 *           count:number, gap:number, capacity:number, category:string,
 *           naming:'time'|'number' }} template
 * @returns {{ duties: object[], error: string|null }}
 */
export function buildSeries(template) {
  const { title, date, start, duration, count, gap = 0, capacity, category, naming } = template;
  if (!title.trim()) return { duties: [], error: 'Titel fehlt.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return { duties: [], error: 'Datum fehlt.' };
  const startMinutes = clockToMinutes(start);
  if (startMinutes === null) return { duties: [], error: 'Beginn fehlt.' };
  if (!(duration >= 5 && duration <= 1440)) return { duties: [], error: 'Dauer: 5 bis 1440 Minuten.' };
  if (!(count >= 1 && count <= 100)) return { duties: [], error: 'Anzahl: 1 bis 100.' };
  if (!(gap >= 0 && gap <= 600)) return { duties: [], error: 'Pause: 0 bis 600 Minuten.' };

  const duties = [];
  for (let index = 0; index < count; index += 1) {
    const from = startMinutes + index * (duration + gap);
    const startTime = atMinutes(date, from);
    const endTime = atMinutes(date, from + duration);
    duties.push({
      key: `${index}-${startTime}`,
      title: seriesTitle(title, startTime, endTime, { naming, index, count }),
      startTime,
      endTime,
      capacity,
      category,
    });
  }
  return { duties, error: null };
}

/** Wert für <input type="datetime-local"> aus `YYYY-MM-DDTHH:MM:SS`. */
export const toLocalInput = (iso) => (iso ? iso.slice(0, 16) : '');

/** „2 von 3" */
export function slotsLabel(duty) {
  return `${duty.taken} von ${duty.capacity}`;
}

/** Freie Plätze. */
export const freeSlots = (duty) => Math.max(0, duty.capacity - duty.taken);

/** Vorschau -> Anfrage an den Server. */
export function draftsToPayload(drafts) {
  return drafts.map((draft) => ({
    title: draft.title,
    category: draft.category,
    startTime: draft.startTime,
    endTime: draft.endTime,
    capacity: Number(draft.capacity) || 1,
  }));
}
