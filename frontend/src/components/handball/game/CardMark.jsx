// Kleine Karte (Gelb/Rot/Blau) als farbiges Rechteck – statt eines Emojis,
// das auf jedem Gerät anders aussähe. Hochkant wie eine echte Karte.
const CARD_CLASS = {
  yellow: 'bg-[#f2c200]',
  red: 'bg-[#d32f2f]',
  blue: 'bg-[#1e63d6]',
};

const CARD_LABEL = {
  yellow: 'Gelbe Karte',
  red: 'Rote Karte',
  blue: 'Blaue Karte',
};

/**
 * @param {{ color: 'yellow'|'red'|'blue', label?: boolean, className?: string }} props
 *   `label` = true -> für Vorlesehilfen benannt (sonst rein dekorativ).
 */
export default function CardMark({ color, label = false, className = '' }) {
  if (!CARD_CLASS[color]) return null;
  return (
    <span
      className={`inline-block h-3.5 w-2.5 shrink-0 rounded-[2px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] ${CARD_CLASS[color]} ${className}`}
      {...(label ? { role: 'img', 'aria-label': CARD_LABEL[color] } : { 'aria-hidden': true })}
    />
  );
}
