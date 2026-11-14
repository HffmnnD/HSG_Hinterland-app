// Zielgruppe, Link und Anhänge eines Beitrags – Helfer für das Formular
// (components/news/NewsExtras.jsx, components/admin/NewsSection.jsx).
export const EMPTY_NEWS_EXTRAS = { audience: 'club', teamIds: [], linkUrl: '', linkKind: 'link', files: [] };

/** Zielgruppe, Verweis und Anhänge an das FormData des Beitrags hängen. */
export function appendNewsExtras(body, extras) {
  body.append('audience', extras.audience);
  if (extras.audience === 'teams') body.append('teamIds', extras.teamIds.join(','));
  if (extras.linkUrl.trim()) {
    body.append('linkUrl', extras.linkUrl.trim());
    body.append('linkKind', extras.linkKind);
  }
}

/** Dokumente und Videos als FormData für den zweiten Schritt (null = keine). */
export function newsFilesBody(extras) {
  if (extras.files.length === 0) return null;
  const body = new FormData();
  extras.files.forEach((file) => body.append('files', file));
  return body;
}
