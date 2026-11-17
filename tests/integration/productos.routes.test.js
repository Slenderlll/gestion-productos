'use strict';

// Pruebas de las rutas CRUD de productos de punta a punta, con MongoDB en memoria
const request = require('supertest');
const app = require('../../src/app');
const Usuario = require('../../src/models/Usuario');
const Producto = require('../../src/models/Producto');
const { firmarToken } = require('../../src/controllers/auth.controller');
const db = require('../helpers/db');

let ana; let beto; let admin;
let tokenAna; let tokenBeto; let tokenAdmin;

const TAZA = { nombre: 'Taza de cerámica', sku: 'hog-001', precio: 129.9, stock: 12, categoria: 'Hogar' };

const como = (token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url, datos) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(datos),
  put: (url, datos) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(datos),
  delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
});

beforeAll(db.conectar);
afterAll(db.desconectar);

beforeEach(async () => {
  await db.limpiar();
  [ana, beto, admin] = await Usuario.create([
    { nombre: 'Ana', correo: 'ana@correo.mx', password: 'Secreta123' },
    { nombre: 'Beto', correo: 'beto@correo.mx', password: 'Secreta123' },
    { nombre: 'Admin', correo: 'admin@correo.mx', password: 'Secreta123', rol: 'admin' },
  ]);
  [tokenAna, tokenBeto, tokenAdmin] = [ana, beto, admin].map(firmarToken);
});

const crearTaza = async () => (await como(tokenAna).post('/api/productos', TAZA)).body;

describe('protección de las rutas', () => {
  test.each([
    ['get', '/api/productos'],
    ['get', '/api/productos/resumen'],
    ['get', '/api/productos/64b000000000000000000001'],
    ['post', '/api/productos'],
    ['put', '/api/productos/64b000000000000000000001'],
    ['delete', '/api/productos/64b000000000000000000001'],
  ])('%s %s sin token responde 401', async (metodo, url) => {
    const res = await request(app)[metodo](url);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Debes iniciar sesión para realizar esta acción.');
  });

  test('token alterado: 401', async () => {
    const res = await como(`${tokenAna.slice(0, -2)}xx`).get('/api/productos');
    expect(res.status).toBe(401);
  });

  test('token de un usuario que ya no existe: 401', async () => {
    await Usuario.deleteOne({ _id: beto._id });
    const res = await como(tokenBeto).get('/api/productos');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/productos', () => {
  test('crea el producto (201), normaliza el SKU y registra al autor', async () => {
    const res = await como(tokenAna).post('/api/productos', { ...TAZA, creadoPor: beto._id.toString() });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/productos/${res.body._id}`);
    expect(res.body).toMatchObject({ nombre: 'Taza de cerámica', sku: 'HOG-001', precio: 129.9, stock: 12 });
    expect(res.body.creadoPor).toMatchObject({ _id: ana._id.toString(), nombre: 'Ana' });
    expect(await Producto.countDocuments()).toBe(1);
  });

  test('aplica valores por defecto (stock 0, categoría Otros)', async () => {
    const res = await como(tokenAna).post('/api/productos', { nombre: 'Lápiz', sku: 'PAP-1', precio: 5 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ stock: 0, categoria: 'Otros', descripcion: '' });
  });

  test('SKU duplicado: 409 con mensaje claro', async () => {
    await crearTaza();
    const res = await como(tokenBeto).post('/api/productos', { ...TAZA, sku: 'HOG-001' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ya existe un producto con ese SKU.');
  });

  test.each([
    [{ sku: 'X-001', precio: 10 }, 'nombre'],
    [{ ...TAZA, precio: -1 }, 'precio'],
    [{ ...TAZA, precio: 'gratis' }, 'precio'],
    [{ ...TAZA, stock: 1.5 }, 'stock'],
    [{ ...TAZA, stock: -3 }, 'stock'],
    [{ ...TAZA, sku: 'a' }, 'sku'],
    [{ ...TAZA, sku: 'con espacio' }, 'sku'],
    [{ ...TAZA, categoria: 'Juguetes' }, 'categoria'],
    [{ ...TAZA, descripcion: 'x'.repeat(501) }, 'descripcion'],
  ])('datos inválidos %#: 400 indicando el campo', async (datos, campo) => {
    const res = await como(tokenAna).post('/api/productos', datos);
    expect(res.status).toBe(400);
    expect(res.body.detalles.map((d) => d.campo)).toContain(campo);
    expect(await Producto.countDocuments()).toBe(0);
  });
});

describe('GET /api/productos', () => {
  beforeEach(async () => {
    await Producto.create([
      { nombre: 'Audífonos', sku: 'ELE-1', precio: 900, stock: 3, categoria: 'Electrónica', creadoPor: ana._id },
      { nombre: 'Cafetera', sku: 'HOG-1', precio: 1200, stock: 0, categoria: 'Hogar', creadoPor: ana._id },
      { nombre: 'Café 500 g', sku: 'ALI-1', precio: 180, stock: 40, categoria: 'Alimentos', creadoPor: beto._id },
    ]);
  });

  test('lista todos los productos con su autor y datos de paginación', async () => {
    const res = await como(tokenBeto).get('/api/productos');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, pagina: 1, paginas: 1 });
    expect(res.body.datos).toHaveLength(3);
    expect(res.body.datos[0].creadoPor.nombre).toEqual(expect.any(String));
    expect(res.body.datos[0].creadoPor.password).toBeUndefined();
  });

  test('busca por nombre sin distinguir mayúsculas', async () => {
    const res = await como(tokenAna).get('/api/productos?buscar=CAFÉ');
    expect(res.body.datos.map((p) => p.nombre)).toEqual(['Café 500 g']);
  });

  test('busca por SKU', async () => {
    const res = await como(tokenAna).get('/api/productos?buscar=ele-1');
    expect(res.body.total).toBe(1);
  });

  test('filtra por categoría', async () => {
    const res = await como(tokenAna).get('/api/productos?categoria=Hogar');
    expect(res.body.datos.map((p) => p.sku)).toEqual(['HOG-1']);
  });

  test('ordena por precio ascendente', async () => {
    const res = await como(tokenAna).get('/api/productos?orden=precio-asc');
    expect(res.body.datos.map((p) => p.precio)).toEqual([180, 900, 1200]);
  });

  test('pagina los resultados', async () => {
    const res = await como(tokenAna).get('/api/productos?limite=2&pagina=2&orden=nombre');
    expect(res.body).toMatchObject({ total: 3, pagina: 2, paginas: 2 });
    expect(res.body.datos.map((p) => p.nombre)).toEqual(['Cafetera']);
  });

  test.each([
    'pagina=0', 'limite=500', 'orden=hackeo', 'categoria=Juguetes', 'buscar=a&buscar=b',
  ])('parámetro inválido "%s": 400', async (query) => {
    const res = await como(tokenAna).get(`/api/productos?${query}`);
    expect(res.status).toBe(400);
  });

  test('operadores de MongoDB en la URL no se interpretan (sin inyección NoSQL)', async () => {
    // Express 5 usa el parser "simple": buscar[$ne] es solo un nombre de parámetro
    // desconocido, no un objeto { $ne: 'x' }, así que no altera el filtro
    const res = await como(tokenAna).get('/api/productos?buscar[$ne]=x&precio[$gt]=0');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  test('ordena por nombre según el español (acentos y espacios)', async () => {
    const res = await como(tokenAna).get('/api/productos?orden=nombre');
    expect(res.body.datos.map((p) => p.nombre)).toEqual(['Audífonos', 'Café 500 g', 'Cafetera']);
  });

  test('GET /resumen calcula productos, unidades, valor y sin stock', async () => {
    const res = await como(tokenAna).get('/api/productos/resumen');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ productos: 3, unidades: 43, valorInventario: 900 * 3 + 180 * 40, sinStock: 1 });
  });
});

describe('GET /api/productos/:id', () => {
  test('devuelve el producto', async () => {
    const taza = await crearTaza();
    const res = await como(tokenBeto).get(`/api/productos/${taza._id}`);
    expect(res.status).toBe(200);
    expect(res.body.sku).toBe('HOG-001');
  });

  test('id inexistente: 404', async () => {
    const res = await como(tokenAna).get('/api/productos/64b000000000000000000099');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Producto no encontrado.');
  });

  test('id con formato inválido: 400', async () => {
    const res = await como(tokenAna).get('/api/productos/123');
    expect(res.status).toBe(400);
    expect(res.body.detalles[0].campo).toBe('id');
  });
});

describe('PUT /api/productos/:id', () => {
  test('el autor actualiza parcialmente', async () => {
    const taza = await crearTaza();
    const res = await como(tokenAna).put(`/api/productos/${taza._id}`, { precio: 99.5, stock: 0 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ precio: 99.5, stock: 0, nombre: TAZA.nombre });
    expect((await Producto.findById(taza._id)).precio).toBe(99.5);
  });

  test('no permite cambiar el autor desde el cuerpo', async () => {
    const taza = await crearTaza();
    await como(tokenAna).put(`/api/productos/${taza._id}`, { nombre: 'Taza grande', creadoPor: beto._id.toString() });
    const guardado = await Producto.findById(taza._id);
    expect(guardado.creadoPor.toString()).toBe(ana._id.toString());
  });

  test('otro usuario no puede modificarlo: 403', async () => {
    const taza = await crearTaza();
    const res = await como(tokenBeto).put(`/api/productos/${taza._id}`, { precio: 1 });

    expect(res.status).toBe(403);
    expect((await Producto.findById(taza._id)).precio).toBe(129.9);
  });

  test('un administrador sí puede modificarlo', async () => {
    const taza = await crearTaza();
    const res = await como(tokenAdmin).put(`/api/productos/${taza._id}`, { stock: 50 });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(50);
  });

  test('cuerpo vacío: 400', async () => {
    const taza = await crearTaza();
    const res = await como(tokenAna).put(`/api/productos/${taza._id}`, {});
    expect(res.status).toBe(400);
  });

  test('valor inválido: 400', async () => {
    const taza = await crearTaza();
    const res = await como(tokenAna).put(`/api/productos/${taza._id}`, { precio: -5 });
    expect(res.status).toBe(400);
  });

  test('SKU que ya usa otro producto: 409', async () => {
    const taza = await crearTaza();
    await como(tokenAna).post('/api/productos', { ...TAZA, sku: 'HOG-002' });
    const res = await como(tokenAna).put(`/api/productos/${taza._id}`, { sku: 'HOG-002' });
    expect(res.status).toBe(409);
  });

  test('producto inexistente: 404', async () => {
    const res = await como(tokenAna).put('/api/productos/64b000000000000000000099', { precio: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/productos/:id', () => {
  test('el autor elimina: 200 y ya no existe', async () => {
    const taza = await crearTaza();
    const res = await como(tokenAna).delete(`/api/productos/${taza._id}`);

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe('Producto eliminado correctamente.');
    expect(await Producto.findById(taza._id)).toBeNull();
  });

  test('otro usuario no puede eliminarlo: 403', async () => {
    const taza = await crearTaza();
    const res = await como(tokenBeto).delete(`/api/productos/${taza._id}`);
    expect(res.status).toBe(403);
    expect(await Producto.countDocuments()).toBe(1);
  });

  test('un administrador puede eliminarlo', async () => {
    const taza = await crearTaza();
    const res = await como(tokenAdmin).delete(`/api/productos/${taza._id}`);
    expect(res.status).toBe(200);
  });

  test('eliminar dos veces: la segunda da 404', async () => {
    const taza = await crearTaza();
    await como(tokenAna).delete(`/api/productos/${taza._id}`);
    const res = await como(tokenAna).delete(`/api/productos/${taza._id}`);
    expect(res.status).toBe(404);
  });
});
