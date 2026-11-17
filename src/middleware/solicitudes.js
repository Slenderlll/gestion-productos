'use strict';

const crypto = require('node:crypto');
const { ErrorHttp } = require('./errores');

// Asigna un identificador a cada solicitud (útil para rastrear un error en los logs
// de Vercel) y registra método, ruta, código de respuesta y duración.
const registrarSolicitudes = (req, res, next) => {
  const inicio = process.hrtime.bigint();
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)} ms [${req.id}]`);
  });
  next();
};

// Las rutas que reciben datos solo aceptan JSON
const exigirJson = (req, _res, next) => {
  const conCuerpo = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const longitud = Number(req.headers['content-length'] || 0);
  if (conCuerpo && longitud > 0 && !req.is('application/json')) {
    return next(new ErrorHttp(415, 'El contenido debe enviarse como application/json.'));
  }
  return next();
};

module.exports = { registrarSolicitudes, exigirJson };
