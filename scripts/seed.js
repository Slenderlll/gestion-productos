'use strict';

// Crea (o actualiza) el usuario administrador y unos productos de ejemplo.
// Uso: npm run seed   (lee MONGODB_URI, ADMIN_CORREO y ADMIN_PASSWORD del .env)
const { mongoUri } = require('../src/config/env');
const { conectarDB, desconectarDB } = require('../src/config/db');
const Usuario = require('../src/models/Usuario');
const Producto = require('../src/models/Producto');

const EJEMPLOS = [
  { nombre: 'Audífonos inalámbricos', sku: 'ELE-001', precio: 899, stock: 25, categoria: 'Electrónica', descripcion: 'Bluetooth 5.3, 30 h de batería.' },
  { nombre: 'Cafetera de goteo', sku: 'HOG-010', precio: 1249.5, stock: 8, categoria: 'Hogar', descripcion: 'Capacidad de 12 tazas.' },
  { nombre: 'Café de altura 500 g', sku: 'ALI-100', precio: 189, stock: 60, categoria: 'Alimentos', descripcion: 'Grano entero, tueste medio.' },
  { nombre: 'Sudadera básica', sku: 'ROP-021', precio: 459, stock: 0, categoria: 'Ropa', descripcion: 'Algodón, talla M.' },
  { nombre: 'Cuaderno profesional', sku: 'PAP-305', precio: 65, stock: 120, categoria: 'Papelería', descripcion: '100 hojas, cuadro chico.' },
];

const sembrar = async () => {
  const { ADMIN_NOMBRE = 'Administrador', ADMIN_CORREO, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_CORREO || !ADMIN_PASSWORD) {
    throw new Error('Define ADMIN_CORREO y ADMIN_PASSWORD en el .env para crear el administrador.');
  }

  await conectarDB(mongoUri);

  let admin = await Usuario.findOne({ correo: ADMIN_CORREO.toLowerCase() });
  if (admin) {
    admin.set({ nombre: ADMIN_NOMBRE, rol: 'admin', password: ADMIN_PASSWORD });
  } else {
    admin = new Usuario({ nombre: ADMIN_NOMBRE, correo: ADMIN_CORREO, password: ADMIN_PASSWORD, rol: 'admin' });
  }
  await admin.save();
  console.log(`Administrador listo: ${admin.correo}`);

  if ((await Producto.estimatedDocumentCount()) === 0) {
    await Producto.insertMany(EJEMPLOS.map((p) => ({ ...p, creadoPor: admin._id })));
    console.log(`${EJEMPLOS.length} productos de ejemplo creados.`);
  }
};

sembrar()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(desconectarDB);
