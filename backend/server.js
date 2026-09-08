const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config({ quiet: true });

// Initialisiert den Connection-Pool und prüft die DB-Verbindung.
require('./config/db');

const authRoutes = require('./routes/authRoutes');

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// credentials: true, damit der Browser den HttpOnly-Cookie mitsendet.
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Test-Endpunkt
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend verbindung steht!' });
});

// Auth-Routen
app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`Backend-Server läuft auf Port ${PORT}`);
});
