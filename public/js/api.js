'use strict';

// Cliente de la API compartido por las vistas. Guarda la sesión en sessionStorage
// (se borra al cerrar la pestaña) y agrega el JWT en la cabecera Authorization.
const Sesion = {
  CLAVE: 'inventa.sesion',

  guardar(token, usuario) {
    sessionStorage.setItem(this.CLAVE, JSON.stringify({ token, usuario }));
  },

  leer() {
    try {
      return JSON.parse(sessionStorage.getItem(this.CLAVE)) || null;
    } catch {
      return null;
    }
  },

  borrar() {
    sessionStorage.removeItem(this.CLAVE);
  },
};

class ErrorApi extends Error {
  constructor(status, cuerpo) {
    super(cuerpo?.error || 'Ocurrió un error inesperado.');
    this.status = status;
    this.detalles = cuerpo?.detalles || [];
  }
}

const api = async (ruta, { metodo = 'GET', datos, autenticado = true } = {}) => {
  const cabeceras = { Accept: 'application/json' };
  if (datos !== undefined) cabeceras['Content-Type'] = 'application/json';

  const sesion = Sesion.leer();
  if (autenticado && sesion?.token) cabeceras.Authorization = `Bearer ${sesion.token}`;

  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
    });
  } catch {
    throw new ErrorApi(0, { error: 'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.' });
  }

  const cuerpo = await respuesta.json().catch(() => null);

  // Token vencido o revocado en una ruta protegida: de vuelta al login
  if (respuesta.status === 401 && autenticado) {
    Sesion.borrar();
    window.location.replace('/login?sesion=expirada');
    throw new ErrorApi(401, cuerpo);
  }
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, cuerpo);
  return cuerpo;
};

// Muestra un aviso flotante breve
const avisar = (texto, tipo = 'info') => {
  let contenedor = document.querySelector('.avisos');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.className = 'avisos';
    contenedor.setAttribute('aria-live', 'polite');
    document.body.append(contenedor);
  }
  const aviso = document.createElement('div');
  aviso.className = `aviso ${tipo}`;
  aviso.textContent = texto;
  contenedor.append(aviso);
  setTimeout(() => aviso.remove(), 3800);
};

// Pone un botón en estado "cargando" mientras dura una promesa
const conCarga = async (boton, tarea) => {
  boton.disabled = true;
  boton.classList.add('cargando');
  try {
    return await tarea();
  } finally {
    boton.disabled = false;
    boton.classList.remove('cargando');
  }
};
