'use strict';

// Levanta un MongoDB real en esta computadora sin instalarlo (útil para desarrollar sin
// Atlas): la primera vez descarga el binario y guarda los datos en .data/.
// Déjalo corriendo en su propia terminal. Uso: npm run db:local
const fs = require('node:fs');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PUERTO = Number(process.env.DB_LOCAL_PUERTO) || 27017;
const CARPETA_DATOS = path.join(__dirname, '..', '.data');

const iniciar = async () => {
  fs.mkdirSync(CARPETA_DATOS, { recursive: true });
  const servidor = await MongoMemoryServer.create({
    instance: { port: PUERTO, dbPath: CARPETA_DATOS, storageEngine: 'wiredTiger' },
  });
  console.log(`MongoDB local en ${servidor.getUri()} (datos en .data/). Ctrl+C para detenerlo.`);

  const cerrar = async () => {
    await servidor.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
};

iniciar().catch((err) => {
  console.error('No se pudo iniciar MongoDB local:', err.message);
  process.exit(1);
});
