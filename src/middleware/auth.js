'use strict';

const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const Usuario = require('../models/Usuario');
const TokenRevocado = require('../models/TokenRevocado');
const { ErrorHttp } = require('./errores');

// Autenticación: exige "Authorization: Bearer <token>" válido y no revocado, y deja
// en req.usuario al usuario y en req.token los datos del token. El usuario se busca
// en cada petición para que una cuenta borrada o un rol cambiado tengan efecto de
// inmediato, sin esperar a que el token expire.
const autenticar = async (req, _res, next) => {
  const [esquema, token] = (req.headers.authorization || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    throw new ErrorHttp(401, 'Debes iniciar sesión para realizar esta acción.');
  }

  let datos;
  try {
    datos = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    const mensaje = err.name === 'TokenExpiredError'
      ? 'Tu sesión expiró. Inicia sesión de nuevo.'
      : 'El token no es válido.';
    throw new ErrorHttp(401, mensaje);
  }

  if (await TokenRevocado.exists({ jti: datos.jti })) {
    throw new ErrorHttp(401, 'La sesión fue cerrada. Inicia sesión de nuevo.');
  }

  const usuario = await Usuario.findById(datos.sub);
  if (!usuario) throw new ErrorHttp(401, 'El token no es válido.');

  req.usuario = usuario;
  req.token = datos;
  next();
};

// Autorización por rol; se usa siempre después de autenticar
const permitirRoles = (...roles) => (req, _res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    throw new ErrorHttp(403, 'No tienes permiso para realizar esta acción.');
  }
  next();
};

module.exports = { autenticar, permitirRoles };
