'use strict';

// Variables de entorno de prueba. Se definen antes de cargar src/config/env.js, así
// las pruebas nunca leen el .env real ni tocan la base de datos de desarrollo o Atlas.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres-0123456789';
process.env.JWT_EXPIRA = '1h';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/se-reemplaza-en-cada-prueba';
process.env.CORS_ORIGENES = 'https://permitido.example';
