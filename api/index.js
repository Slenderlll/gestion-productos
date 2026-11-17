'use strict';

// Punto de entrada en Vercel. Aquí no hay un servidor encendido como en src/server.js:
// Vercel invoca esta función por cada petición y puede reutilizarla entre llamadas,
// por eso la conexión a MongoDB Atlas se abre una sola vez y se comparte.
const { mongoUri } = require('../src/config/env');
const { conectarUnaVez } = require('../src/config/db');
const app = require('../src/app');

module.exports = async (req, res) => {
  try {
    await conectarUnaVez(mongoUri);
  } catch (err) {
    console.error('No se pudo conectar a MongoDB:', err.message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Base de datos no disponible. Intenta de nuevo.' }));
  }
  return app(req, res);
};
