'use strict';

const { body, param, query, validationResult } = require('express-validator');
const { CATEGORIAS } = require('../models/Producto');
const { ErrorHttp } = require('./errores');

// Ejecuta las reglas y, si alguna falla, responde 400 con la lista de errores por campo
const validar = (reglas) => [
  ...reglas,
  (req, _res, next) => {
    const errores = validationResult(req);
    if (errores.isEmpty()) return next();
    const detalles = errores.array({ onlyFirstError: true }).map((e) => ({ campo: e.path, mensaje: e.msg }));
    return next(new ErrorHttp(400, 'Los datos enviados no son válidos.', detalles));
  },
];

const correo = () => body('correo')
  .isString().withMessage('El correo es obligatorio.')
  .bail()
  .trim()
  .isEmail().withMessage('El correo no tiene un formato válido.')
  .toLowerCase();

const reglasRegistro = validar([
  body('nombre')
    .isString().withMessage('El nombre es obligatorio.')
    .bail()
    .trim()
    .isLength({ min: 2, max: 60 }).withMessage('El nombre debe tener entre 2 y 60 caracteres.'),
  correo(),
  body('password')
    .isString().withMessage('La contraseña es obligatoria.')
    .bail()
    .isLength({ min: 8, max: 72 }).withMessage('La contraseña debe tener entre 8 y 72 caracteres.')
    .matches(/[A-Za-z]/).withMessage('La contraseña debe incluir al menos una letra.')
    .matches(/\d/).withMessage('La contraseña debe incluir al menos un número.'),
]);

const reglasLogin = validar([
  correo(),
  body('password').isString().notEmpty().withMessage('La contraseña es obligatoria.'),
]);

const idValido = param('id').isMongoId().withMessage('El identificador del producto no es válido.');

// En la creación los campos principales son obligatorios; en la edición, opcionales
const camposProducto = (esEdicion) => {
  const campo = (nombre) => (esEdicion ? body(nombre).optional() : body(nombre));
  return [
    campo('nombre')
      .isString().withMessage('El nombre es obligatorio.')
      .bail()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres.'),
    campo('sku')
      .isString().withMessage('El SKU es obligatorio.')
      .bail()
      .trim()
      .toUpperCase()
      .matches(/^[A-Z0-9-]{3,20}$/).withMessage('El SKU debe tener de 3 a 20 letras, números o guiones.'),
    campo('precio')
      .isFloat({ min: 0, max: 10_000_000 }).withMessage('El precio debe ser un número entre 0 y 10,000,000.')
      .toFloat(),
    body('stock').optional()
      .isInt({ min: 0, max: 1_000_000 }).withMessage('El stock debe ser un entero entre 0 y 1,000,000.')
      .toInt(),
    body('descripcion').optional()
      .isString().withMessage('La descripción debe ser texto.')
      .bail()
      .trim()
      .isLength({ max: 500 }).withMessage('La descripción no puede exceder 500 caracteres.'),
    body('categoria').optional()
      .isIn(CATEGORIAS).withMessage(`La categoría debe ser una de: ${CATEGORIAS.join(', ')}.`),
  ];
};

const reglasCrearProducto = validar(camposProducto(false));

const reglasActualizarProducto = validar([
  idValido,
  ...camposProducto(true),
  body().custom((datos) => {
    const editables = ['nombre', 'sku', 'precio', 'stock', 'descripcion', 'categoria'];
    if (!datos || !editables.some((c) => datos[c] !== undefined)) {
      throw new Error('Envía al menos un campo para actualizar.');
    }
    return true;
  }),
]);

const reglasId = validar([idValido]);

const reglasListado = validar([
  query('pagina').optional().isInt({ min: 1 }).withMessage('La página debe ser un entero mayor a 0.').toInt(),
  query('limite').optional().isInt({ min: 1, max: 50 }).withMessage('El límite debe estar entre 1 y 50.').toInt(),
  query('buscar').optional().isString().trim().isLength({ max: 60 }).withMessage('La búsqueda es demasiado larga.'),
  query('categoria').optional().isIn(CATEGORIAS).withMessage('La categoría no es válida.'),
  query('orden').optional()
    .isIn(['recientes', 'nombre', 'precio-asc', 'precio-desc', 'stock'])
    .withMessage('El orden no es válido.'),
]);

module.exports = {
  validar,
  reglasRegistro,
  reglasLogin,
  reglasCrearProducto,
  reglasActualizarProducto,
  reglasId,
  reglasListado,
};
