'use strict';

// Pruebas unitarias del controlador de autenticación con los modelos simulados
jest.mock('../../src/models/Usuario');
jest.mock('../../src/models/TokenRevocado');

const jwt = require('jsonwebtoken');
const Usuario = require('../../src/models/Usuario');
const TokenRevocado = require('../../src/models/TokenRevocado');
const auth = require('../../src/controllers/auth.controller');
const { crearReq, crearRes } = require('../helpers/http');

const usuarioFalso = (extra = {}) => ({
  _id: '64b000000000000000000001',
  nombre: 'Ana',
  correo: 'ana@correo.mx',
  rol: 'usuario',
  compararPassword: jest.fn(),
  ...extra,
});

describe('auth.controller: firmarToken', () => {
  test('incluye sub, rol, jti y expiración, firmado con HS256', () => {
    const token = auth.firmarToken(usuarioFalso());
    const { header, payload } = jwt.decode(token, { complete: true });

    expect(header.alg).toBe('HS256');
    expect(payload.sub).toBe('64b000000000000000000001');
    expect(payload.rol).toBe('usuario');
    expect(payload.jti).toEqual(expect.any(String));
    expect(payload.exp - payload.iat).toBe(3600);
  });

  test('cada token tiene un jti distinto', () => {
    const a = jwt.decode(auth.firmarToken(usuarioFalso()));
    const b = jwt.decode(auth.firmarToken(usuarioFalso()));
    expect(a.jti).not.toBe(b.jti);
  });
});

describe('auth.controller: registrar', () => {
  test('crea el usuario sin aceptar el rol del cuerpo y responde 201 con token', async () => {
    const usuario = usuarioFalso();
    Usuario.create.mockResolvedValue(usuario);
    const req = crearReq({ body: { nombre: 'Ana', correo: 'ana@correo.mx', password: 'Secreta123', rol: 'admin' } });
    const res = crearRes();

    await auth.registrar(req, res);

    expect(Usuario.create).toHaveBeenCalledWith({ nombre: 'Ana', correo: 'ana@correo.mx', password: 'Secreta123' });
    expect(res.status).toHaveBeenCalledWith(201);
    const cuerpo = res.json.mock.calls[0][0];
    expect(cuerpo.usuario).toBe(usuario);
    expect(jwt.verify(cuerpo.token, process.env.JWT_SECRET).sub).toBe(usuario._id);
  });

  test('propaga el error de correo duplicado', async () => {
    const duplicado = Object.assign(new Error('dup'), { code: 11000, keyPattern: { correo: 1 } });
    Usuario.create.mockRejectedValue(duplicado);

    await expect(auth.registrar(crearReq({ body: {} }), crearRes())).rejects.toBe(duplicado);
  });
});

describe('auth.controller: iniciarSesion', () => {
  const mockFindOne = (usuario) => {
    Usuario.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(usuario) });
  };

  test('con credenciales correctas responde usuario y token', async () => {
    const usuario = usuarioFalso();
    usuario.compararPassword.mockResolvedValue(true);
    mockFindOne(usuario);
    const res = crearRes();

    await auth.iniciarSesion(crearReq({ body: { correo: 'ana@correo.mx', password: 'Secreta123' } }), res);

    expect(Usuario.findOne).toHaveBeenCalledWith({ correo: 'ana@correo.mx' });
    expect(usuario.compararPassword).toHaveBeenCalledWith('Secreta123');
    expect(res.json.mock.calls[0][0]).toMatchObject({ usuario, token: expect.any(String) });
  });

  test('contraseña incorrecta: 401 con mensaje genérico', async () => {
    const usuario = usuarioFalso();
    usuario.compararPassword.mockResolvedValue(false);
    mockFindOne(usuario);

    await expect(auth.iniciarSesion(crearReq({ body: { correo: 'ana@correo.mx', password: 'mala' } }), crearRes()))
      .rejects.toMatchObject({ status: 401, message: 'Correo o contraseña incorrectos.' });
  });

  test('correo inexistente: el mismo 401 (no revela si el correo existe)', async () => {
    mockFindOne(null);

    await expect(auth.iniciarSesion(crearReq({ body: { correo: 'x@y.mx', password: 'algo' } }), crearRes()))
      .rejects.toMatchObject({ status: 401, message: 'Correo o contraseña incorrectos.' });
  });
});

describe('auth.controller: cerrarSesion y perfil', () => {
  test('cerrarSesion guarda el jti hasta la expiración del token', async () => {
    TokenRevocado.updateOne.mockResolvedValue({});
    const exp = Math.floor(Date.now() / 1000) + 600;
    const req = crearReq({ usuario: usuarioFalso(), token: { jti: 'abc', exp } });
    const res = crearRes();

    await auth.cerrarSesion(req, res);

    expect(TokenRevocado.updateOne).toHaveBeenCalledWith(
      { jti: 'abc' },
      { $setOnInsert: { jti: 'abc', usuario: req.usuario._id, expiraEn: new Date(exp * 1000) } },
      { upsert: true },
    );
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Sesión cerrada correctamente.' });
  });

  test('perfil devuelve el usuario autenticado', () => {
    const usuario = usuarioFalso();
    const res = crearRes();

    auth.perfil(crearReq({ usuario }), res);

    expect(res.json).toHaveBeenCalledWith({ usuario });
  });
});
