# Pruebas generadas con IA y ajustes manuales

## Herramienta y proceso

1. Se configuró Jest (`jest.config.js`) con Supertest y `mongodb-memory-server`, más un umbral mínimo de cobertura (90 % de líneas y funciones, 80 % de ramas) para que el pipeline falle si la cobertura baja.
2. Se pidió a un asistente de IA de código que generara pruebas iniciales a partir de los controladores (`src/controllers`) y las rutas (`src/routes`): casos felices de registro, login y CRUD de productos.
3. Se revisaron, corrieron y ajustaron a mano hasta cubrir los requisitos del proyecto.

## Qué se ajustó a mano

| Ajuste | Por qué |
|---|---|
| Separar **unitarias** (con `jest.mock` de los modelos) de **integración** (Express + MongoDB en memoria) | Las generadas mezclaban ambas y dependían de una base real. |
| Conexión de pruebas con `runtimeAdapters: { os }` | El driver de MongoDB 7.8 carga `os` con `import()` dinámico, que Jest no admite; todas las pruebas de integración fallaban con *"Missing required sub-document 'driver'"*. |
| Casos de **autorización por recurso**: otro usuario recibe 403 al editar o borrar; el administrador sí puede | Las pruebas iniciales solo probaban al autor. |
| **Cierre de sesión**: el token revocado deja de servir, cerrar sesión dos veces y volver a entrar | Requisito de la actividad no cubierto. |
| Tokens **expirados**, **alterados**, con algoritmo `none` y de usuarios borrados | Seguridad del flujo JWT. |
| Validaciones con `test.each`: precio negativo o no numérico, stock decimal, SKU inválido, categoría inexistente, descripción larga | Cubrir todas las reglas de `validaciones.js`. |
| **SKU y correo duplicados** → 409 con mensaje claro | Antes devolvía *"Ya existe un registro con ese sku"*; se mejoró el mensaje y se agregó la prueba. |
| **Inyección NoSQL** en login (`{ "$ne": null }`) y en la URL (`buscar[$ne]=x`) | La IA esperaba 400 en la URL, pero Express 5 usa el parser *simple* y lo ignora; se corrigió la expectativa a "no altera el filtro" (200, total sin cambios). |
| **Orden por nombre en español** | La prueba de paginación falló: MongoDB ordenaba "Cafetera" antes que "Café 500 g". Se agregó `collation({ locale: 'es' })` al controlador. Un bug real encontrado por las pruebas. |
| Mensaje genérico en login (mismo 401 si el correo no existe) | Evitar enumeración de usuarios. |
| Configuración general: CORS, cabeceras de Helmet, 404, 413, 415, `/api/salud` con y sin BD | Middlewares de manejo de solicitudes. |

## Resultado

- 6 archivos de prueba, **135 pruebas**, todas pasan.
- Cobertura: ~98 % de líneas, 100 % de funciones, ~92 % de ramas.
- Se ejecutan en cada push y pull request en GitHub Actions (`npm run test:ci`).
