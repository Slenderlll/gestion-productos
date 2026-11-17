'use strict';

// Pruebas de las rutas de autenticación de punta a punta: Express + Mongoose + MongoDB en memoria
const request = require('supertest');
const app = require('../../src/app');
const Usuario = require('../../src/models/Usuario');
const db = require('../helpers/db');

const NUEVO = { nombre: 'Ana López', correo: 'Ana@Correo.mx', password: 'Secreta123' };

beforeAll(db.conectar);
afterEach(db.limpiar);
afterAll(db.desconectar);

const registrar = (datos = NUEVO) => request(app).post('/api/auth/registro').send(datos);

describe('POST /api/auth/registro', () => {
  test('crea la cuenta (201), guarda la contraseña cifrada y no la devuelve', async () => {
    const res = await registrar();

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.usuario).toMatchObject({ nombre: 'Ana López', correo: 'ana@correo.mx', rol: 'usuario' });
    expect(res.body.usuario.password).toBeUndefined();

    const guardado = await Usuario.findOne({ correo: 'ana@correo.mx' }).select('+password');
    expect(guardado.password).not.toBe(NUEVO.password);
    expect(guardado.password).toMatch(/^\$2[aby]\$/);
  });

  test('ignora un rol enviado en el cuerpo (nadie se registra como admin)', async () => {
    const res = await registrar({ ...NUEVO, rol: 'admin' });
    expect(res.body.usuario.rol).toBe('usuario');
  });

  test('correo duplicado (sin importar mayúsculas): 409', async () => {
    await registrar();
    const res = await registrar({ ...NUEVO, correo: 'ANA@correo.mx' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Ya existe una cuenta con ese correo.');
  });

  test.each([
    [{ ...NUEVO, correo: 'no-es-correo' }, 'correo'],
    [{ ...NUEVO, password: 'corta1' }, 'password'],
    [{ ...NUEVO, password: 'sinnumeros' }, 'password'],
    [{ ...NUEVO, nombre: 'A' }, 'nombre'],
    [{ correo: NUEVO.correo, password: NUEVO.password }, 'nombre'],
  ])('datos inválidos %#: 400 con el detalle del campo', async (datos, campo) => {
    const res = await registrar(datos);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Los datos enviados no son válidos.');
    expect(res.body.detalles.map((d) => d.campo)).toContain(campo);
  });

  test('JSON mal formado: 400', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .set('Content-Type', 'application/json')
      .send('{"nombre": ');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('El cuerpo de la petición no es JSON válido.');
  });

  test('cuerpo que no es JSON: 415', async () => {
    const res = await request(app).post('/api/auth/registro').type('form').send('nombre=Ana');
    expect(res.status).toBe(415);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => registrar());

  test('credenciales correctas: 200 con token', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: 'ana@correo.mx', password: 'Secreta123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.usuario.correo).toBe('ana@correo.mx');
  });

  test('el correo no distingue mayúsculas', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: 'ANA@CORREO.MX', password: 'Secreta123' });
    expect(res.status).toBe(200);
  });

  test('contraseña incorrecta: 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: 'ana@correo.mx', password: 'Otra12345' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Correo o contraseña incorrectos.');
  });

  test('correo no registrado: mismo 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: 'nadie@correo.mx', password: 'Secreta123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Correo o contraseña incorrectos.');
  });

  test('intento de inyección NoSQL en el correo: 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: { $ne: null }, password: 'x' });
    expect(res.status).toBe(400);
  });

  test('sin contraseña: 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: 'ana@correo.mx' });
    expect(res.status).toBe(400);
  });
});

describe('perfil y cierre de sesión', () => {
  test('GET /perfil con token: 200; sin token: 401', async () => {
    const { body } = await registrar();

    const conToken = await request(app).get('/api/auth/perfil').set('Authorization', `Bearer ${body.token}`);
    const sinToken = await request(app).get('/api/auth/perfil');

    expect(conToken.status).toBe(200);
    expect(conToken.body.usuario.correo).toBe('ana@correo.mx');
    expect(sinToken.status).toBe(401);
  });

  test('POST /logout revoca el token: después ya no sirve', async () => {
    const { body } = await registrar();
    const auth = `Bearer ${body.token}`;

    const salida = await request(app).post('/api/auth/logout').set('Authorization', auth);
    expect(salida.status).toBe(200);
    expect(salida.body.mensaje).toBe('Sesión cerrada correctamente.');

    const despues = await request(app).get('/api/productos').set('Authorization', auth);
    expect(despues.status).toBe(401);
    expect(despues.body.error).toBe('La sesión fue cerrada. Inicia sesión de nuevo.');
  });

  test('cerrar sesión dos veces con el mismo token: la segunda da 401', async () => {
    const { body } = await registrar();
    const auth = `Bearer ${body.token}`;
    await request(app).post('/api/auth/logout').set('Authorization', auth);
    const otra = await request(app).post('/api/auth/logout').set('Authorization', auth);
    expect(otra.status).toBe(401);
  });

  test('un nuevo login después del logout entrega un token válido', async () => {
    const { body } = await registrar();
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${body.token}`);

    const login = await request(app).post('/api/auth/login').send({ correo: 'ana@correo.mx', password: 'Secreta123' });
    const res = await request(app).get('/api/productos').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });
});
