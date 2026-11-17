'use strict';

// Pruebas unitarias de los middlewares: autenticación JWT, roles, errores y solicitudes
jest.mock('../../src/models/Usuario');
jest.mock('../../src/models/TokenRevocado');

const jwt = require('jsonwebtoken');
const Usuario = require('../../src/models/Usuario');
const TokenRevocado = require('../../src/models/TokenRevocado');
const { autenticar, permitirRoles } = require('../../src/middleware/auth');
const {
  ErrorHttp, normalizarError, rutaNoEncontrada, manejadorErrores,
} = require('../../src/middleware/errores');
const { registrarSolicitudes, exigirJson } = require('../../src/middleware/solicitudes');
const { crearReq, crearRes } = require('../helpers/http');

const SECRETO = process.env.JWT_SECRET;
const firmar = (datos = {}, opciones = {}) => jwt.sign(
  { sub: '64b000000000000000000001', rol: 'usuario', ...datos },
  SECRETO,
  { expiresIn: '1h', jwtid: 'jti-1', ...opciones },
);
const conToken = (token) => crearReq({ headers: { authorization: `Bearer ${token}` } });

describe('middleware autenticar', () => {
  beforeEach(() => {
    TokenRevocado.exists.mockResolvedValue(null);
  });

  test('sin cabecera Authorization: 401', async () => {
    await expect(autenticar(crearReq(), {}, jest.fn())).rejects.toMatchObject({ status: 401 });
  });

  test('esquema distinto de Bearer: 401', async () => {
    const req = crearReq({ headers: { authorization: `Basic ${firmar()}` } });
    await expect(autenticar(req, {}, jest.fn())).rejects.toMatchObject({ status: 401 });
  });

  test('token con firma inválida: 401 "El token no es válido."', async () => {
    const falso = jwt.sign({ sub: 'x' }, 'otro-secreto-que-no-es-el-del-servidor-1234567890');
    await expect(autenticar(conToken(falso), {}, jest.fn()))
      .rejects.toMatchObject({ status: 401, message: 'El token no es válido.' });
  });

  test('token expirado: 401 con mensaje de sesión expirada', async () => {
    const vencido = firmar({ iat: Math.floor(Date.now() / 1000) - 7200 }, { expiresIn: '1h' });
    await expect(autenticar(conToken(vencido), {}, jest.fn()))
      .rejects.toMatchObject({ status: 401, message: 'Tu sesión expiró. Inicia sesión de nuevo.' });
  });

  test('rechaza tokens firmados con el algoritmo "none"', async () => {
    const sinFirma = jwt.sign({ sub: 'x' }, null, { algorithm: 'none' });
    await expect(autenticar(conToken(sinFirma), {}, jest.fn())).rejects.toMatchObject({ status: 401 });
  });

  test('token revocado (sesión cerrada): 401', async () => {
    TokenRevocado.exists.mockResolvedValue({ _id: 'r1' });
    await expect(autenticar(conToken(firmar()), {}, jest.fn()))
      .rejects.toMatchObject({ status: 401, message: 'La sesión fue cerrada. Inicia sesión de nuevo.' });
    expect(TokenRevocado.exists).toHaveBeenCalledWith({ jti: 'jti-1' });
  });

  test('usuario borrado: 401', async () => {
    Usuario.findById.mockResolvedValue(null);
    await expect(autenticar(conToken(firmar()), {}, jest.fn())).rejects.toMatchObject({ status: 401 });
  });

  test('token válido: deja req.usuario y req.token y llama a next', async () => {
    const usuario = { _id: '64b000000000000000000001', rol: 'usuario' };
    Usuario.findById.mockResolvedValue(usuario);
    const req = conToken(firmar());
    const next = jest.fn();

    await autenticar(req, {}, next);

    expect(req.usuario).toBe(usuario);
    expect(req.token.jti).toBe('jti-1');
    expect(next).toHaveBeenCalledWith();
  });
});

describe('middleware permitirRoles', () => {
  test('deja pasar a un rol permitido', () => {
    const next = jest.fn();
    permitirRoles('admin')({ usuario: { rol: 'admin' } }, {}, next);
    expect(next).toHaveBeenCalled();
  });

  test('rechaza con 403 a un rol no permitido', () => {
    expect(() => permitirRoles('admin')({ usuario: { rol: 'usuario' } }, {}, jest.fn()))
      .toThrow(expect.objectContaining({ status: 403 }));
  });

  test('rechaza con 403 si no hay usuario autenticado', () => {
    expect(() => permitirRoles('admin')({}, {}, jest.fn())).toThrow(ErrorHttp);
  });
});

describe('middleware de errores', () => {
  test.each([
    [{ code: 11000, keyPattern: { sku: 1 } }, 409, 'Ya existe un producto con ese SKU.'],
    [{ code: 11000, keyPattern: { correo: 1 } }, 409, 'Ya existe una cuenta con ese correo.'],
    [{ code: 11000, keyPattern: { otro: 1 } }, 409, 'Ya existe un registro con ese otro.'],
    [{ code: 11000 }, 409, 'Ya existe un registro con ese valor.'],
    [{ name: 'CastError', path: '_id' }, 400, 'Valor no válido para _id.'],
    [{ type: 'entity.parse.failed' }, 400, 'El cuerpo de la petición no es JSON válido.'],
    [{ type: 'entity.too.large' }, 413, 'El cuerpo de la petición es demasiado grande.'],
    [{ message: 'Origen no permitido por CORS' }, 403, 'Origen no permitido por CORS'],
  ])('normaliza %o a %i', (error, status, mensaje) => {
    expect(normalizarError(error)).toMatchObject({ status, message: mensaje });
  });

  test('normaliza ValidationError de Mongoose con detalles por campo', () => {
    const err = { name: 'ValidationError', errors: { precio: { path: 'precio', message: 'Negativo' } } };
    expect(normalizarError(err)).toMatchObject({
      status: 400, detalles: [{ campo: 'precio', mensaje: 'Negativo' }],
    });
  });

  test('error desconocido: 500 sin filtrar detalles internos', () => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = crearRes();

    manejadorErrores(new Error('detalle secreto de la BD'), {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error interno del servidor.' });
    expect(espia).toHaveBeenCalled();
  });

  test('error conocido: responde su estado, mensaje y detalles', () => {
    const res = crearRes();
    manejadorErrores(new ErrorHttp(400, 'Malo', [{ campo: 'x', mensaje: 'y' }]), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Malo', detalles: [{ campo: 'x', mensaje: 'y' }] });
  });

  test('si la respuesta ya se envió, delega a Express', () => {
    const res = { ...crearRes(), headersSent: true };
    const next = jest.fn();
    const err = new Error('tarde');
    manejadorErrores(err, {}, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  test('rutaNoEncontrada genera un 404 con método y ruta', () => {
    const next = jest.fn();
    rutaNoEncontrada({ method: 'GET', originalUrl: '/api/nada' }, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'No existe la ruta GET /api/nada' });
  });
});

describe('middlewares de solicitudes', () => {
  test('registrarSolicitudes asigna X-Request-Id', () => {
    const res = { setHeader: jest.fn(), on: jest.fn() };
    const req = {};
    const next = jest.fn();

    registrarSolicitudes(req, res, next);

    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.id);
    expect(next).toHaveBeenCalled();
  });

  test('exigirJson rechaza con 415 un POST con cuerpo que no es JSON', () => {
    const next = jest.fn();
    const req = { method: 'POST', headers: { 'content-length': '5' }, is: () => false };
    exigirJson(req, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ status: 415 });
  });

  test('exigirJson deja pasar GET y POST con JSON', () => {
    const next = jest.fn();
    exigirJson({ method: 'GET', headers: {} }, {}, next);
    exigirJson({ method: 'POST', headers: { 'content-length': '5' }, is: () => true }, {}, next);
    expect(next).toHaveBeenNthCalledWith(1);
    expect(next).toHaveBeenNthCalledWith(2);
  });
});
