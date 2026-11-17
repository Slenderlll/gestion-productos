'use strict';

// Pruebas unitarias del controlador de productos. El modelo de Mongoose se reemplaza
// por un mock, así se prueba solo la lógica del controlador, sin base de datos.
jest.mock('../../src/models/Producto');

const Producto = require('../../src/models/Producto');
const controlador = require('../../src/controllers/productos.controller');
const { ErrorHttp } = require('../../src/middleware/errores');
const { crearReq, crearRes } = require('../helpers/http');

const ID_AUTOR = '64b000000000000000000001';
const ID_OTRO = '64b000000000000000000002';
const autor = { _id: ID_AUTOR, rol: 'usuario' };
const otro = { _id: ID_OTRO, rol: 'usuario' };
const admin = { _id: '64b0000000000000000000aa', rol: 'admin' };

// Simula la cadena find().sort().skip().limit().populate().lean()
const mockCadenaFind = (resultado) => {
  const cadena = {};
  ['collation', 'sort', 'skip', 'limit', 'populate'].forEach((m) => { cadena[m] = jest.fn(() => cadena); });
  cadena.lean = jest.fn().mockResolvedValue(resultado);
  Producto.find.mockReturnValue(cadena);
  return cadena;
};

const productoFalso = (extra = {}) => ({
  _id: '64b0000000000000000000f1',
  nombre: 'Taza',
  creadoPor: ID_AUTOR,
  set: jest.fn(),
  save: jest.fn().mockResolvedValue(),
  populate: jest.fn().mockResolvedValue(),
  deleteOne: jest.fn().mockResolvedValue(),
  ...extra,
});

describe('productos.controller: listar', () => {
  test('usa página 1 y límite 10 por defecto y calcula las páginas', async () => {
    const cadena = mockCadenaFind([{ nombre: 'A' }]);
    Producto.countDocuments.mockResolvedValue(25);
    const res = crearRes();

    await controlador.listar(crearReq(), res);

    expect(Producto.find).toHaveBeenCalledWith({});
    expect(cadena.collation).toHaveBeenCalledWith({ locale: 'es', strength: 1 });
    expect(cadena.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(cadena.skip).toHaveBeenCalledWith(0);
    expect(cadena.limit).toHaveBeenCalledWith(10);
    expect(res.json).toHaveBeenCalledWith({ datos: [{ nombre: 'A' }], total: 25, pagina: 1, paginas: 3 });
  });

  test('aplica búsqueda, categoría, orden y paginación de la query', async () => {
    const cadena = mockCadenaFind([]);
    Producto.countDocuments.mockResolvedValue(0);
    const req = crearReq({
      query: { buscar: '  taza ', categoria: 'Hogar', orden: 'precio-desc', pagina: '3', limite: '5' },
    });

    await controlador.listar(req, crearRes());

    const filtro = Producto.find.mock.calls[0][0];
    expect(filtro.categoria).toBe('Hogar');
    expect(filtro.$or).toHaveLength(3);
    expect(filtro.$or[0].nombre.test('TAZA grande')).toBe(true);
    expect(cadena.sort).toHaveBeenCalledWith({ precio: -1 });
    expect(cadena.skip).toHaveBeenCalledWith(10);
    expect(cadena.limit).toHaveBeenCalledWith(5);
  });

  test('escapa caracteres especiales de la búsqueda (no se interpreta como regex)', async () => {
    mockCadenaFind([]);
    Producto.countDocuments.mockResolvedValue(0);

    await controlador.listar(crearReq({ query: { buscar: '.*' } }), crearRes());

    const patron = Producto.find.mock.calls[0][0].$or[0].nombre;
    expect(patron.test('cualquier cosa')).toBe(false);
    expect(patron.test('texto .* literal')).toBe(true);
  });

  test('responde al menos 1 página aunque no haya productos', async () => {
    mockCadenaFind([]);
    Producto.countDocuments.mockResolvedValue(0);
    const res = crearRes();

    await controlador.listar(crearReq(), res);

    expect(res.json.mock.calls[0][0].paginas).toBe(1);
  });
});

describe('productos.controller: obtener', () => {
  test('devuelve el producto con su autor', async () => {
    const producto = { nombre: 'Taza' };
    Producto.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(producto) });
    const res = crearRes();

    await controlador.obtener(crearReq({ params: { id: 'abc' } }), res);

    expect(Producto.findById).toHaveBeenCalledWith('abc');
    expect(res.json).toHaveBeenCalledWith(producto);
  });

  test('lanza 404 si no existe', async () => {
    Producto.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

    await expect(controlador.obtener(crearReq({ params: { id: 'abc' } }), crearRes()))
      .rejects.toMatchObject({ status: 404, message: 'Producto no encontrado.' });
  });
});

describe('productos.controller: crear', () => {
  test('crea con los campos permitidos, asigna al autor y responde 201', async () => {
    const creado = productoFalso();
    Producto.create.mockResolvedValue(creado);
    const req = crearReq({
      usuario: autor,
      body: { nombre: 'Taza', sku: 'HOG-1', precio: 50, creadoPor: ID_OTRO, _id: 'x', rol: 'admin' },
    });
    const res = crearRes();

    await controlador.crear(req, res);

    // creadoPor viene del token, no del cuerpo; _id y otros campos se ignoran
    expect(Producto.create).toHaveBeenCalledWith({ nombre: 'Taza', sku: 'HOG-1', precio: 50, creadoPor: ID_AUTOR });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.location).toHaveBeenCalledWith(`/api/productos/${creado._id}`);
    expect(res.json).toHaveBeenCalledWith(creado);
  });

  test('propaga los errores de validación de Mongoose', async () => {
    const error = Object.assign(new Error('x'), { name: 'ValidationError', errors: {} });
    Producto.create.mockRejectedValue(error);

    await expect(controlador.crear(crearReq({ usuario: autor, body: {} }), crearRes())).rejects.toBe(error);
  });
});

describe('productos.controller: actualizar', () => {
  test('el autor puede actualizar; solo se aplican campos editables', async () => {
    const producto = productoFalso();
    Producto.findById.mockResolvedValue(producto);
    const res = crearRes();

    await controlador.actualizar(
      crearReq({ usuario: autor, params: { id: producto._id }, body: { precio: 80, creadoPor: ID_OTRO } }),
      res,
    );

    expect(producto.set).toHaveBeenCalledWith({ precio: 80 });
    expect(producto.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(producto);
  });

  test('un administrador puede actualizar productos de otros', async () => {
    const producto = productoFalso();
    Producto.findById.mockResolvedValue(producto);

    await controlador.actualizar(crearReq({ usuario: admin, params: { id: '1' }, body: { stock: 3 } }), crearRes());

    expect(producto.save).toHaveBeenCalled();
  });

  test('otro usuario recibe 403 y no se guarda nada', async () => {
    const producto = productoFalso();
    Producto.findById.mockResolvedValue(producto);

    await expect(controlador.actualizar(crearReq({ usuario: otro, params: { id: '1' }, body: { stock: 3 } }), crearRes()))
      .rejects.toMatchObject({ status: 403 });
    expect(producto.save).not.toHaveBeenCalled();
  });

  test('lanza 404 si el producto no existe', async () => {
    Producto.findById.mockResolvedValue(null);

    await expect(controlador.actualizar(crearReq({ usuario: autor, params: { id: '1' }, body: {} }), crearRes()))
      .rejects.toBeInstanceOf(ErrorHttp);
  });
});

describe('productos.controller: eliminar', () => {
  test('el autor elimina y recibe confirmación', async () => {
    const producto = productoFalso();
    Producto.findById.mockResolvedValue(producto);
    const res = crearRes();

    await controlador.eliminar(crearReq({ usuario: autor, params: { id: producto._id } }), res);

    expect(producto.deleteOne).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Producto eliminado correctamente.', id: producto._id });
  });

  test('otro usuario recibe 403', async () => {
    const producto = productoFalso();
    Producto.findById.mockResolvedValue(producto);

    await expect(controlador.eliminar(crearReq({ usuario: otro, params: { id: '1' } }), crearRes()))
      .rejects.toMatchObject({ status: 403 });
    expect(producto.deleteOne).not.toHaveBeenCalled();
  });

  test('lanza 404 si no existe', async () => {
    Producto.findById.mockResolvedValue(null);

    await expect(controlador.eliminar(crearReq({ usuario: autor, params: { id: '1' } }), crearRes()))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('productos.controller: resumen', () => {
  test('devuelve los totales de la agregación sin el _id', async () => {
    Producto.aggregate.mockResolvedValue([{ _id: null, productos: 2, unidades: 7, valorInventario: 120, sinStock: 1 }]);
    const res = crearRes();

    await controlador.resumen(crearReq(), res);

    expect(res.json).toHaveBeenCalledWith({ productos: 2, unidades: 7, valorInventario: 120, sinStock: 1 });
  });

  test('devuelve ceros si no hay productos', async () => {
    Producto.aggregate.mockResolvedValue([]);
    const res = crearRes();

    await controlador.resumen(crearReq(), res);

    expect(res.json).toHaveBeenCalledWith({ productos: 0, unidades: 0, valorInventario: 0, sinStock: 0 });
  });
});

describe('productos.controller: utilidades', () => {
  test('puedeModificar acepta creadoPor como id o como documento poblado', () => {
    expect(controlador.puedeModificar({ creadoPor: ID_AUTOR }, autor)).toBe(true);
    expect(controlador.puedeModificar({ creadoPor: { _id: ID_AUTOR } }, autor)).toBe(true);
    expect(controlador.puedeModificar({ creadoPor: ID_AUTOR }, otro)).toBe(false);
    expect(controlador.puedeModificar({ creadoPor: ID_AUTOR }, admin)).toBe(true);
  });

  test('tomarCampos descarta campos no editables', () => {
    expect(controlador.tomarCampos({ nombre: 'A', _id: 1, creadoPor: 2, createdAt: 3 })).toEqual({ nombre: 'A' });
  });
});
