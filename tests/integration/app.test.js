'use strict';

// Pruebas de la configuración general del servidor: salud, vistas estáticas,
// cabeceras de seguridad, CORS y manejo de rutas inexistentes
const request = require('supertest');
const app = require('../../src/app');
const db = require('../helpers/db');

describe('sin base de datos conectada', () => {
  test('GET /api/salud responde 503', async () => {
    const res = await request(app).get('/api/salud');
    expect(res.status).toBe(503);
    expect(res.body.estado).toBe('sin base de datos');
  });
});

describe('con base de datos', () => {
  beforeAll(db.conectar);
  afterAll(db.desconectar);

  test('GET /api/salud responde 200 y el nombre de la base', async () => {
    const res = await request(app).get('/api/salud');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ estado: 'ok', baseDeDatos: 'pruebas' });
  });

  test('GET / redirige al login', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  test.each(['/login', '/productos'])('sirve la vista estática %s', async (ruta) => {
    const res = await request(app).get(ruta);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  test('envía cabeceras de seguridad y X-Request-Id', async () => {
    const res = await request(app).get('/login');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  test('ruta de API inexistente: 404 en JSON', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No existe la ruta GET /api/no-existe');
  });

  test('página inexistente: 404', async () => {
    const res = await request(app).get('/pagina-que-no-existe');
    expect(res.status).toBe(404);
  });

  test('CORS: permite un origen configurado', async () => {
    const res = await request(app).get('/api/salud').set('Origin', 'https://permitido.example');
    expect(res.headers['access-control-allow-origin']).toBe('https://permitido.example');
  });

  test('CORS: rechaza un origen desconocido con 403', async () => {
    const res = await request(app).get('/api/salud').set('Origin', 'https://malicioso.example');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Origen no permitido por CORS');
  });

  test('cuerpo demasiado grande: 413', async () => {
    const res = await request(app).post('/api/auth/login').send({ correo: 'a@b.mx', password: 'x'.repeat(25_000) });
    expect(res.status).toBe(413);
  });
});
