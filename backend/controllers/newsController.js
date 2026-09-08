// Controller für die Vereins-News (/api/news, /api/admin/news).
//
// Kein SQL in dieser Datei – Datenzugriff über newsRepository, Eingabe-Prüfung
// über utils/validation, Datei-Handling über config/uploads.
//
// Berechtigungen (durchgesetzt in den Routen):
//   - Lesen:              alle angemeldeten Mitglieder
//   - Anlegen & Löschen:  nur admin und sub_admin
const newsRepository = require('../repositories/newsRepository');
const { parseId, validateNewsPost } = require('../utils/validation');
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

    const news = await newsRepository.listAll({ limit });
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

// DELETE /api/admin/news/:id
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

module.exports = { listNews, createNews, deleteNews };
