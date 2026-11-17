'use strict';

const Producto = require('../models/Producto');
const { ErrorHttp } = require('../middleware/errores');

const CAMPOS_EDITABLES = ['nombre', 'sku', 'descripcion', 'precio', 'stock', 'categoria'];
const LIMITE_POR_DEFECTO = 10;

const ORDENES = {
  recientes: { createdAt: -1 },
  nombre: { nombre: 1 },
  'precio-asc': { precio: 1 },
  'precio-desc': { precio: -1 },
  stock: { stock: 1 },
};

const AUTOR = { path: 'creadoPor', select: 'nombre correo' };

// Toma del cuerpo solo los campos permitidos; así no se puede cambiar creadoPor,
// _id o las fechas desde la petición
const tomarCampos = (cuerpo) => Object.fromEntries(
  CAMPOS_EDITABLES.filter((campo) => cuerpo[campo] !== undefined).map((campo) => [campo, cuerpo[campo]]),
);

// Evita que la búsqueda se interprete como expresión regular (p. ej. ".*")
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Autorización a nivel de recurso: solo el autor del producto o un administrador
// pueden modificarlo o eliminarlo
const puedeModificar = (producto, usuario) => usuario.rol === 'admin'
  || String(producto.creadoPor?._id ?? producto.creadoPor) === String(usuario._id);

const buscarOFallar = async (id) => {
  const producto = await Producto.findById(id);
  if (!producto) throw new ErrorHttp(404, 'Producto no encontrado.');
  return producto;
};

// GET /api/productos?buscar=&categoria=&orden=&pagina=&limite=
const listar = async (req, res) => {
  // En Express 5 req.query es de solo lectura, así que los valores ya validados
  // se convierten aquí a su tipo
  const { categoria, orden = 'recientes' } = req.query;
  const buscar = String(req.query.buscar ?? '').trim();
  const pagina = Number(req.query.pagina) || 1;
  const limite = Number(req.query.limite) || LIMITE_POR_DEFECTO;

  const filtro = {};
  if (categoria) filtro.categoria = categoria;
  if (buscar) {
    const patron = new RegExp(escaparRegex(buscar), 'i');
    filtro.$or = [{ nombre: patron }, { sku: patron }, { descripcion: patron }];
  }

  const [datos, total] = await Promise.all([
    Producto.find(filtro)
      // Collation en español: ordena "Café" antes que "Cafetera" e ignora acentos y mayúsculas
      .collation({ locale: 'es', strength: 1 })
      .sort(ORDENES[orden] || ORDENES.recientes)
      .skip((pagina - 1) * limite)
      .limit(limite)
      .populate(AUTOR)
      .lean(),
    Producto.countDocuments(filtro),
  ]);

  res.json({ datos, total, pagina, paginas: Math.max(1, Math.ceil(total / limite)) });
};

// GET /api/productos/:id
const obtener = async (req, res) => {
  const producto = await Producto.findById(req.params.id).populate(AUTOR);
  if (!producto) throw new ErrorHttp(404, 'Producto no encontrado.');
  res.json(producto);
};

// POST /api/productos
const crear = async (req, res) => {
  const producto = await Producto.create({ ...tomarCampos(req.body), creadoPor: req.usuario._id });
  await producto.populate(AUTOR);
  res.status(201).location(`/api/productos/${producto._id}`).json(producto);
};

// PUT /api/productos/:id
const actualizar = async (req, res) => {
  const producto = await buscarOFallar(req.params.id);
  if (!puedeModificar(producto, req.usuario)) {
    throw new ErrorHttp(403, 'Solo quien registró el producto o un administrador puede modificarlo.');
  }

  producto.set(tomarCampos(req.body));
  await producto.save();
  await producto.populate(AUTOR);
  res.json(producto);
};

// DELETE /api/productos/:id
const eliminar = async (req, res) => {
  const producto = await buscarOFallar(req.params.id);
  if (!puedeModificar(producto, req.usuario)) {
    throw new ErrorHttp(403, 'Solo quien registró el producto o un administrador puede eliminarlo.');
  }

  await producto.deleteOne();
  res.json({ mensaje: 'Producto eliminado correctamente.', id: producto._id });
};

// GET /api/productos/resumen: totales para las tarjetas del panel
const resumen = async (_req, res) => {
  const [totales] = await Producto.aggregate([
    {
      $group: {
        _id: null,
        productos: { $sum: 1 },
        unidades: { $sum: '$stock' },
        valorInventario: { $sum: { $multiply: ['$precio', '$stock'] } },
        sinStock: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
      },
    },
  ]);
  const { _id, ...resto } = totales || { productos: 0, unidades: 0, valorInventario: 0, sinStock: 0 };
  res.json(resto);
};

module.exports = {
  listar, obtener, crear, actualizar, eliminar, resumen, puedeModificar, tomarCampos, escaparRegex,
};
