// Controller für die Vereins-News (/api/news, /api/admin/news).
//
// Kein SQL in dieser Datei – Datenzugriff über newsRepository, Eingabe-Prüfung
// über utils/validation, Datei-Handling über config/uploads.
//
// Berechtigungen (durchgesetzt in den Routen):
//   - Lesen:                       alle angemeldeten Mitglieder
//   - Anlegen, Archivieren, Löschen: nur admin und sub_admin
//
// Zum Archiv: Beiträge werden nicht mehr gelöscht, sondern archiviert
// (`news.is_archived`). Sie verschwinden damit aus dem Feed, bleiben in der
// Verwaltung aber vollständig erhalten und lassen sich zurückholen – ein
// versehentliches „Löschen" kostet so nichts mehr. Das endgültige Löschen
// existiert weiterhin, ist aber eine getrennte Aktion aus dem Archiv heraus
// (nur so wird auch das hochgeladene Bild wieder frei).
const newsRepository = require('../repositories/newsRepository');
const {
  parseId,
  validateNewsPost,
  validateNewsArchivePatch,
} = require('../utils/validation');
const {
  relativePathFor,
  removeUpload,
  hasValidImageSignature,
} = require('../config/uploads');

// Obergrenze für ?limit= – schützt vor absurd großen Antworten.
const MAX_LIMIT = 100;

// GET /api/news?limit=10
async function listNews(req, res, next) {
  try {
    let limit;
    if (req.query.limit !== undefined) {
      limit = parseId(req.query.limit);
      if (!limit) {
        return res.status(400).json({ message: 'Ungültiger limit-Parameter.' });
      }
      limit = Math.min(limit, MAX_LIMIT);
    }

    // Der Feed zeigt ausschliesslich aktive Beiträge – das Archiv ist der
    // Verwaltung vorbehalten.
    const news = await newsRepository.listAll({ limit, status: 'active' });
    return res.json({ news });
  } catch (err) {
    return next(err);
  }
}

// POST /api/admin/news   multipart/form-data: title, content, image?
async function createNews(req, res, next) {
  // Multer hat ein hochgeladenes Bild bereits auf die Platte geschrieben.
  // Scheitert danach etwas, muss es wieder weg – sonst sammeln sich verwaiste
  // Dateien an. Sobald der Datensatz steht, gehört das Bild jedoch zu ihm und
  // darf NICHT mehr gelöscht werden (sonst bliebe ein Beitrag ohne Bild übrig).
  const imagePath = req.file ? relativePathFor(req.file) : null;
  let persisted = false;

  try {
    const check = validateNewsPost(req.body);
    if (!check.ok) {
      await removeUpload(imagePath);
      return res.status(check.status).json({ message: check.message });
    }

    // Der MIME-Typ kommt vom Client. Erst die Signatur beweist, dass die Datei
    // wirklich das behauptete Bildformat ist.
    if (imagePath && !(await hasValidImageSignature(imagePath, req.file.mimetype))) {
      await removeUpload(imagePath);
      return res.status(400).json({
        message:
          'Die Datei ist kein gültiges Bild (JPG, PNG, WEBP oder GIF). Bitte eine andere Datei wählen.',
      });
    }

    const id = await newsRepository.create({
      title: check.title,
      content: check.content,
      imagePath,
      authorId: req.userId,
    });
    persisted = true;

    const created = await newsRepository.findById(id);
    return res.status(201).json({
      message: 'Beitrag veröffentlicht.',
      news: created,
    });
  } catch (err) {
    if (!persisted) await removeUpload(imagePath);
    return next(err);
  }
}

// GET /api/admin/news?status=active|archived|all
//
// Verwaltungssicht auf die Beiträge. Anders als der Feed liefert sie auf
// Wunsch das Archiv und immer die Zählerstände beider Stapel – die stehen an
// den Umschaltern, auch wenn gerade der andere Stapel angezeigt wird.
async function listNewsForAdmin(req, res, next) {
  try {
    const status = req.query.status ?? 'active';
    if (!['active', 'archived', 'all'].includes(status)) {
      return res.status(400).json({
        message: 'Ungültiger Status. Erlaubt: active, archived, all.',
      });
    }

    const [news, counts] = await Promise.all([
      newsRepository.listAll({ status }),
      newsRepository.countByStatus(),
    ]);
    return res.json({ news, counts });
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/admin/news/:id   Body: { isArchived: boolean }
//
// Archiviert einen Beitrag oder holt ihn zurück. Das Bild bleibt liegen –
// der Beitrag kann jederzeit wieder aktiv werden.
async function archiveNews(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Ungültige Beitrags-ID.' });
    }

    const check = validateNewsArchivePatch(req.body);
    if (!check.ok) {
      return res.status(check.status).json({ message: check.message });
    }

    const changed = await newsRepository.setArchived(id, check.isArchived);
    if (changed === 0) {
      // Entweder unbekannt oder schon im gewünschten Zustand – beides
      // unterscheidet ein Blick auf den Beitrag.
      const existing = await newsRepository.findById(id);
      if (!existing) {
        return res.status(404).json({ message: 'Beitrag nicht gefunden.' });
      }
      return res.json({
        message: check.isArchived
          ? 'Beitrag war bereits archiviert.'
          : 'Beitrag ist bereits aktiv.',
        news: existing,
      });
    }

    const updated = await newsRepository.findById(id);
    return res.json({
      message: check.isArchived
        ? 'Beitrag archiviert. Er ist nicht mehr im Feed sichtbar.'
        : 'Beitrag zurückgeholt und wieder im Feed sichtbar.',
      news: updated,
    });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/admin/news/:id
//
// Endgültiges Löschen samt Bild. Die Oberfläche bietet es nur im Archiv an –
// der reguläre Weg ist das Archivieren (siehe archiveNews).
async function deleteNews(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'Ungültige Beitrags-ID.' });
    }

    // Bildpfad VOR dem Löschen merken, sonst ist er danach nicht mehr bekannt.
    const imagePath = await newsRepository.findImagePath(id);
    if (imagePath === undefined) {
      return res.status(404).json({ message: 'Beitrag nicht gefunden.' });
    }

    const removed = await newsRepository.remove(id);
    if (removed === 0) {
      return res.status(404).json({ message: 'Beitrag nicht gefunden.' });
    }

    // Erst wenn der Datensatz weg ist, die Datei aufräumen.
    await removeUpload(imagePath);

    return res.json({ message: 'Beitrag gelöscht.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listNews,
  listNewsForAdmin,
  createNews,
  archiveNews,
  deleteNews,
};
