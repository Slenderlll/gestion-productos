'use strict';

const { Router } = require('express');
const productos = require('../controllers/productos.controller');
const { autenticar } = require('../middleware/auth');
const {
  reglasCrearProducto, reglasActualizarProducto, reglasId, reglasListado,
} = require('../middleware/validaciones');

const router = Router();

// Todas las rutas de productos requieren un JWT válido
router.use(autenticar);

router.get('/', reglasListado, productos.listar);
router.get('/resumen', productos.resumen);
router.get('/:id', reglasId, productos.obtener);
router.post('/', reglasCrearProducto, productos.crear);
router.put('/:id', reglasActualizarProducto, productos.actualizar);
router.delete('/:id', reglasId, productos.eliminar);

module.exports = router;
