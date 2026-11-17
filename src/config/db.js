'use strict';

const mongoose = require('mongoose');

// Modo estricto en consultas: los filtros con campos que no existen en el esquema se
// descartan, lo que evita inyecciones del tipo { "precio": { "$gt": "" } } desde la URL
mongoose.set('strictQuery', true);

const conectarDB = async (uri) => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  if (process.env.NODE_ENV !== 'test') {
    console.log(`MongoDB conectado: ${mongoose.connection.host}/${mongoose.connection.name}`);
  }
};

const desconectarDB = () => mongoose.disconnect();

// Para entornos sin servidor (Vercel): las invocaciones comparten una sola conexión
// y, si el intento falla, la siguiente petición vuelve a intentarlo
let conexion;
const conectarUnaVez = (uri) => {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  conexion ??= conectarDB(uri).catch((err) => {
    conexion = undefined;
    throw err;
  });
  return conexion;
};

module.exports = { conectarDB, conectarUnaVez, desconectarDB };
