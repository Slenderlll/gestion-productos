'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { jwtSecret, jwtExpira } = require('../config/env');
const Usuario = require('../models/Usuario');
const TokenRevocado = require('../models/TokenRevocado');
const { ErrorHttp } = require('../middleware/errores');

// Firma un JWT con el id del usuario (sub), su rol y un identificador único (jti)
// que permite revocarlo al cerrar sesión
const firmarToken = (usuario) => jwt.sign(
  { sub: usuario._id.toString(), rol: usuario.rol },
  jwtSecret,
  { expiresIn: jwtExpira, jwtid: crypto.randomUUID(), algorithm: 'HS256' },
);

// POST /api/auth/registro
const registrar = async (req, res) => {
  const { nombre, correo, password } = req.body;

  // El rol no se toma del cuerpo: nadie puede registrarse como administrador
  const usuario = await Usuario.create({ nombre, correo, password });
  res.status(201).json({
    mensaje: 'Cuenta creada correctamente.',
    usuario,
    token: firmarToken(usuario),
  });
};

// POST /api/auth/login
const iniciarSesion = async (req, res) => {
  const { correo, password } = req.body;
  const usuario = await Usuario.findOne({ correo }).select('+password');

  // Mismo mensaje si el correo no existe o si la contraseña falla, para no revelar
  // qué correos están registrados
  if (!usuario || !(await usuario.compararPassword(password))) {
    throw new ErrorHttp(401, 'Correo o contraseña incorrectos.');
  }

  res.json({
    mensaje: `Bienvenido, ${usuario.nombre}.`,
    usuario,
    token: firmarToken(usuario),
  });
};

// POST /api/auth/logout (protegida)
const cerrarSesion = async (req, res) => {
  const { jti, exp } = req.token;
  await TokenRevocado.updateOne(
    { jti },
    { $setOnInsert: { jti, usuario: req.usuario._id, expiraEn: new Date(exp * 1000) } },
    { upsert: true },
  );
  res.json({ mensaje: 'Sesión cerrada correctamente.' });
};

// GET /api/auth/perfil (protegida)
const perfil = (req, res) => {
  res.json({ usuario: req.usuario });
};

module.exports = { firmarToken, registrar, iniciarSesion, cerrarSesion, perfil };
