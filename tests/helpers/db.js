'use strict';

const os = require('node:os');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// MongoDB real pero en memoria: cada archivo de pruebas de integración arranca el suyo,
// así las pruebas son independientes y no dependen de Atlas ni de una instalación local.
let servidor;

const conectar = async () => {
  servidor = await MongoMemoryServer.create();
  // runtimeAdapters: el driver 7.x carga "os" con import() dinámico, que Jest no admite
  // sin módulos ESM experimentales; sin esto el handshake sale sin metadatos y falla
  await mongoose.connect(servidor.getUri(), { dbName: 'pruebas', runtimeAdapters: { os } });
  // Se crean los índices únicos (correo, sku) antes de probar duplicados
  await Promise.all(Object.values(mongoose.models).map((modelo) => modelo.init()));
};

const limpiar = async () => {
  const colecciones = await mongoose.connection.db.collections();
  await Promise.all(colecciones.map((c) => c.deleteMany({})));
};

const desconectar = async () => {
  await mongoose.disconnect();
  await servidor?.stop();
};

module.exports = { conectar, limpiar, desconectar };
