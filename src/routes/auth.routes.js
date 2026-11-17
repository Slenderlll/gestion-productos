'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../controllers/auth.controller');
const { autenticar } = require('../middleware/auth');
const { reglasRegistro, reglasLogin } = require('../middleware/validaciones');

const router = Router();

// Frena los intentos de adivinar contraseñas: 10 intentos por IP cada 15 minutos
const limiteIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

// Públicas
router.post('/registro', limiteIntentos, reglasRegistro, auth.registrar);
router.post('/login', limiteIntentos, reglasLogin, auth.iniciarSesion);

// Protegidas
router.post('/logout', autenticar, auth.cerrarSesion);
router.get('/perfil', autenticar, auth.perfil);

module.exports = router;
