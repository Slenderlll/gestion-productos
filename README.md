# Inventa · Gestión de productos

Aplicación web para gestionar productos (alta, consulta, edición y baja) con registro, inicio y cierre de sesión de usuarios. Las rutas de productos están protegidas con **JWT**.

Actividad 4 de *Desarrollo Full Stack* (Universidad Tecmilenio).

- **Backend:** Node.js 22, Express 5, MongoDB con Mongoose 9, JSON Web Tokens, bcryptjs
- **Vistas:** HTML, CSS y JavaScript sin frameworks (`/login` y `/productos`)
- **Pruebas:** Jest + Supertest + MongoDB en memoria (135 pruebas, ~98 % de cobertura)
- **Despliegue:** Vercel + MongoDB Atlas, automatizado con GitHub Actions

## Estructura

```
gestion-productos/
├── api/index.js                  # Punto de entrada en Vercel (función serverless)
├── public/                       # Vistas estáticas
│   ├── login.html                # Login y registro
│   ├── productos.html            # Panel CRUD (protegido)
│   ├── css/  js/  img/
├── src/
│   ├── app.js                    # Express: middlewares, rutas y manejo de errores
│   ├── server.js                 # Arranque local (app.listen)
│   ├── config/  env.js  db.js    # Variables de entorno y conexión a MongoDB
│   ├── models/                   # Usuario, Producto, TokenRevocado (Mongoose)
│   ├── controllers/              # auth.controller.js, productos.controller.js
│   ├── middleware/               # auth (JWT), validaciones, errores, solicitudes
│   └── routes/                   # auth.routes.js, productos.routes.js
├── tests/
│   ├── unit/                     # Controladores y middlewares con mocks
│   ├── integration/              # Rutas de punta a punta con MongoDB en memoria
│   └── helpers/
├── scripts/  seed.js  db-local.js
├── docs/                         # Diagrama E-R, pruebas con IA, peticiones de ejemplo
├── .github/workflows/ci-cd.yml   # Pipeline CI/CD
├── vercel.json
└── .env.example
```

## Ejecutar en local

Requisitos: Node.js 22 y una base de MongoDB (local o Atlas).

```bash
git clone https://github.com/Slenderlll/gestion-productos.git
cd gestion-productos
npm install
cp .env.example .env      # y llena JWT_SECRET, MONGODB_URI y ADMIN_PASSWORD
```

Si no tienes MongoDB instalado, en otra terminal:

```bash
npm run db:local          # MongoDB local en el puerto 27017, datos en .data/
```

Luego:

```bash
npm run seed              # crea el administrador y 5 productos de ejemplo
npm run dev               # http://localhost:3000
```

Para generar un `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Pruebas

```bash
npm test                  # todas las pruebas
npm run test:ci           # con reporte de cobertura (carpeta coverage/)
```

Las pruebas de integración levantan su propio MongoDB en memoria, así que no tocan tu base de datos ni Atlas. La primera ejecución descarga el binario de MongoDB.

## API

Todas las respuestas son JSON. Los errores tienen la forma `{ "error": "mensaje", "detalles": [{ "campo", "mensaje" }] }`.

| Método | Ruta | Protegida | Descripción |
|---|---|---|---|
| GET | `/api/salud` | No | Estado del servidor y de la conexión a MongoDB |
| POST | `/api/auth/registro` | No | Crea una cuenta y devuelve `{ usuario, token }` |
| POST | `/api/auth/login` | No | Inicia sesión y devuelve `{ usuario, token }` |
| POST | `/api/auth/logout` | Sí | Cierra la sesión (revoca el token) |
| GET | `/api/auth/perfil` | Sí | Datos del usuario autenticado |
| GET | `/api/productos` | Sí | Lista con `buscar`, `categoria`, `orden`, `pagina`, `limite` |
| GET | `/api/productos/resumen` | Sí | Totales del inventario |
| GET | `/api/productos/:id` | Sí | Un producto |
| POST | `/api/productos` | Sí | Crea un producto |
| PUT | `/api/productos/:id` | Sí (autor o admin) | Actualiza un producto |
| DELETE | `/api/productos/:id` | Sí (autor o admin) | Elimina un producto |

Las rutas protegidas requieren la cabecera `Authorization: Bearer <token>`. Hay ejemplos listos en [`docs/peticiones.http`](docs/peticiones.http).

**Códigos usados:** 200, 201 (creado), 400 (validación), 401 (sin sesión o token inválido/revocado), 403 (sin permiso), 404, 409 (correo o SKU duplicado), 413, 415, 429 (demasiados intentos de login), 500, 503 (sin base de datos).

## Seguridad

- Contraseñas cifradas con bcrypt; nunca se devuelven en las respuestas.
- JWT firmado con HS256, con vencimiento y un `jti` que se revoca al cerrar sesión (colección con índice TTL).
- Autorización por recurso: solo el autor de un producto o un administrador pueden editarlo o borrarlo.
- Validación de entrada con express-validator; `strictQuery` y lista blanca de campos contra inyección NoSQL y asignación masiva.
- Helmet (CSP, HSTS, nosniff), CORS restringido, límite de tamaño de cuerpo y de intentos de login.
- Credenciales solo en variables de entorno (`.env` local, Environment Variables en Vercel, Secrets en GitHub).

## Despliegue (Vercel + MongoDB Atlas + GitHub Actions)

1. **MongoDB Atlas:** crea un clúster M0, un usuario de base de datos y permite el acceso desde `0.0.0.0/0` (Vercel no tiene IP fija). Copia la cadena `mongodb+srv://.../gestion_productos`.
2. **Vercel:** `npx vercel link` para crear el proyecto. En *Settings → Environment Variables* (Production) agrega `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRA` y `NODE_ENV=production`.
3. **GitHub:** en *Settings → Secrets and variables → Actions* agrega `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` (los dos últimos están en `.vercel/project.json`). Como variable, `URL_PRODUCCION` con el dominio de producción.
4. Cada push a `main` ejecuta el pipeline: **pruebas → build → deploy → prueba de humo** contra `/api/salud`. Los pull requests solo corren las pruebas.
5. Para crear el administrador en Atlas: `MONGODB_URI=<uri de Atlas> npm run seed`.

`vercel.json` desactiva los despliegues automáticos de la integración Git de Vercel para que el único camino a producción sea el pipeline (que antes exige que pasen las pruebas).
