'use strict';

// Protege la vista: sin token en la sesión, se envía al login antes de pintar la página.
// La protección real está en la API (cada petición se valida con el JWT); esto solo
// evita mostrar una pantalla vacía a quien no inició sesión.
if (!Sesion.leer()?.token) window.location.replace('/login');
