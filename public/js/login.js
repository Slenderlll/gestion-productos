'use strict';

// Si ya hay sesión, no tiene caso mostrar el login
if (Sesion.leer()?.token) window.location.replace('/productos');

const mensaje = document.getElementById('mensaje');
const pestanas = {
  login: { tab: document.getElementById('tab-login'), form: document.getElementById('form-login') },
  registro: { tab: document.getElementById('tab-registro'), form: document.getElementById('form-registro') },
};

const mostrarMensaje = (texto, tipo = 'error') => {
  mensaje.className = `alerta alerta-${tipo}`;
  mensaje.textContent = texto;
};

const limpiarErrores = (form) => {
  mensaje.textContent = '';
  form.querySelectorAll('.error-campo').forEach((span) => { span.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
};

const marcarError = (form, campo, texto) => {
  const input = form.elements[campo];
  if (!input) return;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', `${input.id}-error`);
  document.getElementById(`${input.id}-error`).textContent = texto;
};

const cambiarPestana = (nombre) => {
  Object.entries(pestanas).forEach(([clave, { tab, form }]) => {
    const activa = clave === nombre;
    tab.setAttribute('aria-selected', String(activa));
    tab.tabIndex = activa ? 0 : -1;
    form.hidden = !activa;
    limpiarErrores(form);
  });
  pestanas[nombre].form.querySelector('input').focus();
  history.replaceState(null, '', nombre === 'registro' ? '#registro' : location.pathname);
};

Object.entries(pestanas).forEach(([clave, { tab }]) => {
  tab.addEventListener('click', () => cambiarPestana(clave));
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const otra = clave === 'login' ? 'registro' : 'login';
      cambiarPestana(otra);
      pestanas[otra].tab.focus();
    }
  });
});
document.querySelectorAll('[data-ir]').forEach((enlace) => {
  enlace.addEventListener('click', (e) => {
    e.preventDefault();
    cambiarPestana(enlace.dataset.ir);
  });
});

document.querySelectorAll('.ver-password').forEach((boton) => {
  boton.addEventListener('click', () => {
    const input = document.getElementById(boton.dataset.para);
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    boton.textContent = visible ? 'Ver' : 'Ocultar';
    boton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
});

// Validación en el navegador (la API vuelve a validar todo)
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validarCliente = (form, datos, esRegistro) => {
  let valido = true;
  const fallar = (campo, texto) => { marcarError(form, campo, texto); valido = false; };

  if (esRegistro && datos.nombre.trim().length < 2) fallar('nombre', 'Escribe tu nombre (mínimo 2 caracteres).');
  if (!CORREO.test(datos.correo.trim())) fallar('correo', 'Escribe un correo válido.');
  if (!datos.password) {
    fallar('password', 'Escribe tu contraseña.');
  } else if (esRegistro && (datos.password.length < 8 || !/[A-Za-z]/.test(datos.password) || !/\d/.test(datos.password))) {
    fallar('password', 'Usa al menos 8 caracteres, con una letra y un número.');
  }
  return valido;
};

const enviar = (esRegistro) => async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  limpiarErrores(form);

  const datos = Object.fromEntries(new FormData(form));
  if (!validarCliente(form, datos, esRegistro)) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  try {
    const respuesta = await conCarga(form.querySelector('[type="submit"]'), () => api(
      esRegistro ? '/auth/registro' : '/auth/login',
      { metodo: 'POST', datos, autenticado: false },
    ));
    Sesion.guardar(respuesta.token, respuesta.usuario);
    mostrarMensaje(respuesta.mensaje, 'exito');
    window.location.replace('/productos');
  } catch (err) {
    err.detalles.forEach(({ campo, mensaje: texto }) => marcarError(form, campo, texto));
    mostrarMensaje(err.message);
  }
};

pestanas.login.form.addEventListener('submit', enviar(false));
pestanas.registro.form.addEventListener('submit', enviar(true));

// Mensajes que llegan por la URL
const parametros = new URLSearchParams(location.search);
if (parametros.get('sesion') === 'expirada') mostrarMensaje('Tu sesión terminó. Inicia sesión de nuevo.', 'info');
if (parametros.get('sesion') === 'cerrada') mostrarMensaje('Cerraste sesión correctamente.', 'exito');
if (location.hash === '#registro') cambiarPestana('registro');
