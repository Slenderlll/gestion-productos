'use strict';

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const { corsOrigenes } = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const productosRoutes = require('./routes/productos.routes');
const { registrarSolicitudes, exigirJson } = require('./middleware/solicitudes');
const { rutaNoEncontrada, manejadorErrores } = require('./middleware/errores');

const CARPETA_PUBLICA = path.join(__dirname, '..', 'public');
const ESTADO_CONECTADO = 1;

const app = express();

// Vercel atiende detrás de un proxy; sin esto el límite de intentos vería a todos
// los clientes con la misma IP
app.set('trust proxy', 1);
app.disable('x-powered-by');

// 1. Registro de cada solicitud
app.use(registrarSolicitudes);

// 2. Cabeceras de seguridad (CSP, HSTS, noSniff...)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      // Sin esto Helmet fuerza HTTPS, y el servidor local corre en http://localhost
      upgradeInsecureRequests: null,
    },
  },
}));

// 3. CORS: el mismo origen siempre se permite; otros, solo si están en CORS_ORIGENES
const esMismoOrigen = (origen, host) => {
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
};
app.use(cors((req, responder) => {
  const { origin: origen, host } = req.headers;
  if (!origen || esMismoOrigen(origen, host) || corsOrigenes.includes(origen)) {
    return responder(null, { origin: true });
  }
  return responder(new Error('Origen no permitido por CORS'));
}));

// 4. Cuerpo JSON con tamaño limitado
app.use('/api', exigirJson);
app.use(express.json({ limit: '20kb' }));

// API
app.get('/api/salud', (_req, res) => {
  const conectada = mongoose.connection.readyState === ESTADO_CONECTADO;
  res.status(conectada ? 200 : 503).json({
    estado: conectada ? 'ok' : 'sin base de datos',
    baseDeDatos: conectada ? mongoose.connection.name : null,
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api', rutaNoEncontrada);

// Vistas estáticas
app.get('/', (_req, res) => res.redirect('/login'));
app.use(express.static(CARPETA_PUBLICA, { extensions: ['html'] }));
app.use(rutaNoEncontrada);

// Siempre al final de la pila
app.use(manejadorErrores);

module.exports = app;
