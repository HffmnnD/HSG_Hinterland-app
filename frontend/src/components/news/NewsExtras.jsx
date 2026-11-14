import { ExternalLink, Radio, Video } from 'lucide-react';

import { useTeams } from '../../hooks/useTeams';
import FileList, { FilePicker } from '../ui/FileList';

const LINK_KINDS = {
  link: { label: 'Link öffnen', icon: ExternalLink },
  livestream: { label: 'Zum Livestream', icon: Radio },
  video: { label: 'Video ansehen', icon: Video },
};

/**
 * Felder im Beitragsformular: Für wen ist der Beitrag, gibt es einen Link
 * (z. B. Livestream), hängen Dokumente oder Videos an?
 */
export function NewsExtrasFields({ value, onChange, disabled = false }) {
  const { teams } = useTeams();
  const set = (patch) => onChange({ ...value, ...patch });
  const toggleTeam = (id) =>
    set({ teamIds: value.teamIds.includes(id) ? value.teamIds.filter((t) => t !== id) : [...value.teamIds, id] });

  return (
    <>
      <fieldset className="fieldset space-y-3" disabled={disabled}>
        <legend>Für wen?</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`chip ${value.audience === 'club' ? 'chip-active' : ''}`} onClick={() => set({ audience: 'club' })}>Ganzer Verein</button>
          <button type="button" className={`chip ${value.audience === 'teams' ? 'chip-active' : ''}`} onClick={() => set({ audience: 'teams' })}>Bestimmte Mannschaften</button>
        </div>
        {value.audience === 'teams' && (
          <div className="flex flex-wrap gap-1.5">
            {teams.map((team) => (
              <button key={team.id} type="button" aria-pressed={value.teamIds.includes(team.id)} className={`chip chip-sm ${value.teamIds.includes(team.id) ? 'chip-active' : ''}`} onClick={() => toggleTeam(team.id)}>
                {team.name}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <div>
          <label htmlFor="news-link" className="field-label">Link</label>
          <input id="news-link" className="field-control" value={value.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} maxLength={500} placeholder="https://…" inputMode="url" disabled={disabled} />
        </div>
        <div>
          <label htmlFor="news-link-kind" className="field-label">Art</label>
          <select id="news-link-kind" className="field-control" value={value.linkKind} onChange={(e) => set({ linkKind: e.target.value })} disabled={disabled}>
            <option value="link">Link</option>
            <option value="livestream">Livestream</option>
            <option value="video">Video</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="news-files" className="field-label">Dokumente und Videos</label>
        <FilePicker id="news-files" files={value.files} onChange={(files) => set({ files })} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.txt,.csv,.mp4,.mov,.webm" />
      </div>
    </>
  );
}

/** Anzeige im Beitrag: Mannschaften, Link-Knopf, Anhänge. */
export function NewsExtrasView({ item }) {
  const kind = LINK_KINDS[item.link?.kind] ?? LINK_KINDS.link;
  const Icon = kind.icon;
  const hasTeams = item.audience === 'teams' && item.teams?.length > 0;
  if (!hasTeams && !item.link && !(item.files?.length > 0)) return null;

  return (
    <div className="mt-3 space-y-3">
      {hasTeams && (
        <p className="flex flex-wrap gap-1.5">
          {item.teams.map((team) => (
            <span key={team.id} className="badge badge-neutral">{team.name}</span>
          ))}
        </p>
      )}
      {item.link && (
        <a href={item.link.url} target="_blank" rel="noopener noreferrer" className={`btn btn-sm ${item.link.kind === 'livestream' ? 'btn-primary' : 'btn-outline'}`}>
          <Icon size={14} aria-hidden="true" /> {kind.label}
        </a>
      )}
      <FileList files={item.files} />
    </div>
  );
}
