'use strict';

const CATEGORIAS = ['Electrónica', 'Hogar', 'Alimentos', 'Ropa', 'Papelería', 'Otros'];
const STOCK_BAJO = 10;

const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const entero = new Intl.NumberFormat('es-MX');

const sesion = Sesion.leer();
const estado = { pagina: 1, paginas: 1, productos: [], editando: null, eliminando: null };

const $ = (id) => document.getElementById(id);
const filas = $('filas');
const filtros = $('filtros');
const dlgProducto = $('dlg-producto');
const formProducto = $('form-producto');
const dlgEliminar = $('dlg-eliminar');

// Crea un elemento con texto seguro (nunca se usa innerHTML con datos del usuario)
const el = (etiqueta, atributos = {}, ...hijos) => {
  const nodo = document.createElement(etiqueta);
  Object.entries(atributos).forEach(([clave, valor]) => {
    if (clave === 'className') nodo.className = valor;
    else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
    else nodo.setAttribute(clave, valor);
  });
  nodo.append(...hijos.filter((h) => h !== null && h !== undefined));
  return nodo;
};

const ICONOS = {
  editar: 'M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5zm11.7-6.8a.7.7 0 0 0 0-1l-1.4-1.4a.7.7 0 0 0-1 0l-1.2 1.2 2.5 2.5 1.1-1.3z',
  eliminar: 'M6 6h8l-.7 10H6.7L6 6zm2-3h4l.5 1H16v1.5H4V4h3.5L8 3z',
};
const icono = (nombre) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONOS[nombre]);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
};

// Misma regla que la API: el autor o un administrador pueden modificar
const puedeModificar = (producto) => sesion.usuario.rol === 'admin'
  || producto.creadoPor?._id === sesion.usuario._id;

const claseStock = (stock) => {
  if (stock === 0) return 'stock-cero';
  if (stock < STOCK_BAJO) return 'stock-bajo';
  return 'stock-ok';
};

// ---------- Cabecera ----------
$('usuario-nombre').textContent = sesion.usuario.nombre;
$('usuario-rol').textContent = sesion.usuario.rol === 'admin' ? 'Administrador' : 'Usuario';
if (sesion.usuario.rol === 'admin') $('usuario-rol').classList.add('chip-admin');

$('btn-salir').addEventListener('click', async (e) => {
  try {
    await conCarga(e.currentTarget, () => api('/auth/logout', { metodo: 'POST' }));
  } catch {
    // Aunque falle la revocación en el servidor, la sesión local se cierra igual
  }
  Sesion.borrar();
  window.location.replace('/login?sesion=cerrada');
});

// ---------- Listado ----------
const pintarCargando = () => {
  filas.replaceChildren(...Array.from({ length: 4 }, () => el('tr', { className: 'fila-cargando' },
    el('td', { colspan: '6' }, el('div', { className: 'esqueleto' })))));
};

const filaProducto = (p) => {
  const editable = puedeModificar(p);
  const botonEditar = el('button', {
    className: 'btn btn-icono', type: 'button', 'aria-label': `Editar ${p.nombre}`, title: 'Editar', dataset: { accion: 'editar', id: p._id },
  }, icono('editar'));
  const botonEliminar = el('button', {
    className: 'btn btn-icono eliminar', type: 'button', 'aria-label': `Eliminar ${p.nombre}`, title: 'Eliminar', dataset: { accion: 'eliminar', id: p._id },
  }, icono('eliminar'));
  botonEditar.disabled = !editable;
  botonEliminar.disabled = !editable;

  return el('tr', {},
    el('td', { className: 'celda-producto' },
      el('div', { className: 'producto-nombre' }, p.nombre),
      el('div', { className: 'producto-sku' }, p.sku),
      p.descripcion ? el('div', { className: 'producto-desc', title: p.descripcion }, p.descripcion) : null),
    el('td', { 'data-etiqueta': 'Categoría' }, el('span', { className: 'chip' }, p.categoria)),
    el('td', { className: 'num', 'data-etiqueta': 'Precio' }, moneda.format(p.precio)),
    el('td', { className: 'num', 'data-etiqueta': 'Stock' }, el('span', { className: `stock ${claseStock(p.stock)}` }, entero.format(p.stock))),
    el('td', { className: 'autor', 'data-etiqueta': 'Registró' }, p.creadoPor?.nombre ?? '—'),
    el('td', { className: 'celda-acciones' }, el('div', { className: 'acciones' }, botonEditar, botonEliminar)));
};

const cargarResumen = async () => {
  try {
    const r = await api('/productos/resumen');
    $('m-productos').textContent = entero.format(r.productos);
    $('m-unidades').textContent = entero.format(r.unidades);
    $('m-valor').textContent = moneda.format(r.valorInventario);
    $('m-sin-stock').textContent = entero.format(r.sinStock);
  } catch (err) {
    if (err.status !== 401) avisar(err.message, 'error');
  }
};

const cargarProductos = async () => {
  pintarCargando();
  const datos = new FormData(filtros);
  const params = new URLSearchParams({ pagina: estado.pagina, limite: 8 });
  for (const [clave, valor] of datos) if (String(valor).trim()) params.set(clave, String(valor).trim());

  try {
    const r = await api(`/productos?${params}`);
    estado.productos = r.datos;
    estado.paginas = r.paginas;

    filas.replaceChildren(...r.datos.map(filaProducto));
    const hayFiltros = params.has('buscar') || params.has('categoria');
    $('vacio').hidden = r.datos.length > 0;
    $('vacio-texto').textContent = hayFiltros
      ? 'Prueba con otra búsqueda o categoría.'
      : 'Agrega el primero con “Nuevo producto”.';

    const desde = r.total === 0 ? 0 : (r.pagina - 1) * 8 + 1;
    const hasta = Math.min(r.pagina * 8, r.total);
    $('pag-info').textContent = `${desde}–${hasta} de ${entero.format(r.total)} productos`;
    $('pag-anterior').disabled = r.pagina <= 1;
    $('pag-siguiente').disabled = r.pagina >= r.paginas;
  } catch (err) {
    filas.replaceChildren();
    if (err.status !== 401) avisar(err.message, 'error');
  }
};

const recargar = () => Promise.all([cargarProductos(), cargarResumen()]);

// Filtros: la búsqueda espera a que se deje de escribir
let temporizador;
filtros.addEventListener('input', (e) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    estado.pagina = 1;
    cargarProductos();
  }, e.target.type === 'search' ? 300 : 0);
});
filtros.addEventListener('submit', (e) => e.preventDefault());

$('pag-anterior').addEventListener('click', () => { estado.pagina -= 1; cargarProductos(); });
$('pag-siguiente').addEventListener('click', () => { estado.pagina += 1; cargarProductos(); });

// ---------- Alta y edición ----------
const limpiarErrores = () => {
  $('form-mensaje').textContent = '';
  formProducto.querySelectorAll('.error-campo').forEach((s) => { s.textContent = ''; });
  formProducto.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
};

const marcarError = (campo, texto) => {
  const input = formProducto.elements[campo];
  if (!input) return false;
  input.setAttribute('aria-invalid', 'true');
  $(`${input.id}-error`).textContent = texto;
  return true;
};

const abrirFormulario = (producto = null) => {
  estado.editando = producto;
  formProducto.reset();
  limpiarErrores();
  $('dlg-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
  $('btn-guardar').textContent = producto ? 'Guardar cambios' : 'Crear producto';
  if (producto) {
    ['nombre', 'sku', 'categoria', 'precio', 'stock', 'descripcion'].forEach((campo) => {
      formProducto.elements[campo].value = producto[campo] ?? '';
    });
  } else {
    formProducto.elements.categoria.value = 'Otros';
  }
  dlgProducto.showModal();
  formProducto.elements.nombre.focus();
};

const leerFormulario = () => {
  const f = formProducto.elements;
  return {
    nombre: f.nombre.value.trim(),
    sku: f.sku.value.trim().toUpperCase(),
    categoria: f.categoria.value,
    precio: f.precio.value === '' ? undefined : Number(f.precio.value),
    stock: f.stock.value === '' ? 0 : Number(f.stock.value),
    descripcion: f.descripcion.value.trim(),
  };
};

const validarCliente = (d) => {
  const errores = [];
  if (d.nombre.length < 2) errores.push(['nombre', 'Escribe un nombre de al menos 2 caracteres.']);
  if (!/^[A-Z0-9-]{3,20}$/.test(d.sku)) errores.push(['sku', 'De 3 a 20 letras, números o guiones.']);
  if (d.precio === undefined || Number.isNaN(d.precio) || d.precio < 0) errores.push(['precio', 'Escribe un precio válido (0 o más).']);
  if (!Number.isInteger(d.stock) || d.stock < 0) errores.push(['stock', 'El stock debe ser un entero de 0 o más.']);
  errores.forEach(([campo, texto]) => marcarError(campo, texto));
  return errores.length === 0;
};

formProducto.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarErrores();
  const datos = leerFormulario();
  if (!validarCliente(datos)) {
    formProducto.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const editando = estado.editando;
  try {
    await conCarga($('btn-guardar'), () => api(
      editando ? `/productos/${editando._id}` : '/productos',
      { metodo: editando ? 'PUT' : 'POST', datos },
    ));
    dlgProducto.close();
    avisar(editando ? 'Producto actualizado.' : 'Producto creado.');
    if (!editando) estado.pagina = 1;
    recargar();
  } catch (err) {
    const sinCampo = err.detalles.filter(({ campo, mensaje }) => !marcarError(campo, mensaje));
    $('form-mensaje').textContent = sinCampo.length || !err.detalles.length ? err.message : '';
  }
});

dlgProducto.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => dlgProducto.close()));
$('btn-nuevo').addEventListener('click', () => abrirFormulario());

// ---------- Acciones por fila ----------
filas.addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;
  const producto = estado.productos.find((p) => p._id === boton.dataset.id);
  if (!producto) return;

  if (boton.dataset.accion === 'editar') abrirFormulario(producto);
  if (boton.dataset.accion === 'eliminar') {
    estado.eliminando = producto;
    $('eliminar-nombre').textContent = producto.nombre;
    dlgEliminar.showModal();
  }
});

dlgEliminar.addEventListener('close', async () => {
  const producto = estado.eliminando;
  estado.eliminando = null;
  if (dlgEliminar.returnValue !== 'confirmar' || !producto) return;
  try {
    await api(`/productos/${producto._id}`, { metodo: 'DELETE' });
    avisar('Producto eliminado.');
    if (estado.productos.length === 1 && estado.pagina > 1) estado.pagina -= 1;
    recargar();
  } catch (err) {
    if (err.status !== 401) avisar(err.message, 'error');
  }
});

// ---------- Inicio ----------
const llenarCategorias = (select) => select.append(...CATEGORIAS.map((c) => el('option', { value: c }, c)));
llenarCategorias($('f-categoria'));
llenarCategorias(formProducto.elements.categoria);
recargar();
