'use strict';

const { puerto, mongoUri } = require('./config/env');
const { conectarDB, desconectarDB } = require('./config/db');
const app = require('./app');

const iniciar = async () => {
  try {
    await conectarDB(mongoUri);
  } catch (err) {
    console.error('No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  }

  const servidor = app.listen(puerto, () => {
    console.log(`Servidor escuchando en http://localhost:${puerto}`);
  });

  // Cierre ordenado con Ctrl+C o cuando la plataforma detiene el proceso
  const apagar = async (senal) => {
    console.log(`${senal} recibido, cerrando...`);
    servidor.close();
    await desconectarDB();
    process.exit(0);
  };
  process.on('SIGINT', apagar);
  process.on('SIGTERM', apagar);
};

iniciar();
