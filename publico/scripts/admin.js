const $ = id => document.getElementById(id);
let candidatos = [];
let editando = null;
let logoActual = null;
let publicado = false;
let cerrada = false;
let vistaResultados = 'general';
let reloj = null;

function errorEn(id, texto) {
  $(id).textContent = texto || '';
  $(id).hidden = !texto;
}

/* ---------- Acceso ---------- */
const revisarAcceso = conectarValidacion([
  { input: $('a-nombre'), min: 3, max: 60, tipo: 'letras' },
  { input: $('a-clave'), min: 1, max: 200, tipo: 'texto' },
]);

$('form-acceso').addEventListener('submit', async e => {
  e.preventDefault();
  errorEn('acceso-error');
  if (!revisarAcceso()) return;
  try {
    const r = await conCarga($('btn-acceso'), 'Entrando…', () => pedir('/api/admin/ingresar', {
      cuerpo: { nombre: $('a-nombre').value, clave: $('a-clave').value },
    }));
    abrirPanel(r.nombre);
  } catch (err) {
    if (err.estado === 401 || err.estado === 429) {
      mostrarMensaje($('a-clave'), err.message);
      $('a-clave').select();
    } else if (err.estado === 400) {
      mostrarMensaje($('a-nombre'), err.message);
    } else {
      errorEn('acceso-error', err.message);
    }
  }
});

$('btn-salir-admin').addEventListener('click', async () => {
  const si = await preguntar({
    titulo: '¿Estás seguro de cerrar sesión?',
    texto: el('p', {}, 'Para volver a entrar tendrás que escribir la contraseña.'),
    si: 'Sí, cerrar sesión', claseSi: 'btn-rojo', no: 'No',
  });
  if (!si) return;
  await pedir('/api/admin/salir', { cuerpo: {} }).catch(() => {});
  location.reload();
});

async function abrirPanel(nombre) {
  $('vista-acceso').hidden = true;
  $('vista-panel').hidden = false;
  $('cabeza-titulo').textContent = 'Panel del administrador';
  $('nombre-admin').textContent = nombre;
  await cargarEstado();
  await cargarCandidatos();
}

// PC: la sección visible crece hasta llenar el alto; la entrada del administrador también.
function ajustarPanel() {
  const panel = $('vista-panel');
  if (!panel.hidden) ajustarAPantalla(panel.querySelector('.contenido'), { min: 1, max: 1.4, centrar: false, ancho: () => 1 });
  else ajustarAPantalla($('vista-acceso'), { ancho: v => (v.firstElementChild || v).getBoundingClientRect().width });
}
addEventListener('resize', ajustarPanel);
setInterval(ajustarPanel, 700);

function irA(seccion) {
  for (const s of ['inscribir', 'participantes', 'resultados', 'publicar']) $('sec-' + s).hidden = s !== seccion;
  document.querySelectorAll('.menu button[data-ir]').forEach(b => {
    b.classList.toggle('on', b.dataset.ir === seccion);
    b.setAttribute('aria-current', b.dataset.ir === seccion ? 'page' : 'false');
  });
  clearInterval(reloj);
  if (seccion === 'participantes') cargarPadron();
  // Resultados: se actualizan solos cada minuto y con el botón «Actualizar» cuando quiera.
  if (seccion === 'resultados') {
    actualizarResultados();
    reloj = setInterval(() => {
      if (Date.now() - horaResultados >= 60000) actualizarResultados();
      pintarHace();
    }, 1000);
  }
}
document.querySelector('.menu').addEventListener('click', e => {
  const b = e.target.closest('button[data-ir]');
  if (b) irA(b.dataset.ir);
});

async function cargarEstado() {
  ({ publicado, cerrada } = await pedir('/api/estado'));
  $('aviso-publicado').hidden = !cerrada;
  $('aviso-publicado').firstChild.textContent = publicado
    ? 'Los resultados ya están publicados. La votación está cerrada. '
    : 'La votación está cerrada y los resultados están ocultos. Para cambiar participantes, reábrala en «Publicar». ';
  $('aviso-publicado').querySelector('a').hidden = !publicado;
  $('estado-abierta').hidden = cerrada;
  $('estado-publicado').hidden = !publicado;
  $('estado-oculto').hidden = !cerrada || publicado;
  $('accion-publicar').hidden = publicado;
  $('accion-ocultar').hidden = !publicado;
  $('accion-reabrir').hidden = !cerrada;
  $('form-candidato').querySelectorAll('input, textarea, button').forEach(x => { x.disabled = cerrada; });
  $('vivo').textContent = cerrada ? 'CERRADA' : 'EN VIVO';
}

/* ---------- Inscribir ---------- */
const campos = { nombre: $('c-nombre'), apellido: $('c-apellido'), partido: $('c-partido'), descripcion: $('c-descripcion') };
const contadores = [
  conectarContador(campos.nombre, 10, 30),
  conectarContador(campos.apellido, 10, 30),
  conectarContador(campos.partido, 10, 40, true),
  conectarContador(campos.descripcion, 10, 50, true),
];
const revisarCandidato = conectarValidacion([
  { input: campos.nombre, min: 10, max: 30, tipo: 'letras' },
  { input: campos.apellido, min: 10, max: 30, tipo: 'letras' },
  { input: campos.partido, min: 10, max: 40, tipo: 'texto', opcional: true },
  { input: campos.descripcion, min: 10, max: 50, tipo: 'texto', opcional: true },
]);

async function cargarCandidatos() {
  candidatos = await pedir('/api/candidatos');
  const conteo = candidatos.length ? (await pedir('/api/admin/resultados')).partidos : [];
  const votosPor = Object.fromEntries(conteo.map(p => [p.id, p.votos]));
  votosInscritos = votosPor;
  $('tit-inscritos').textContent = `Inscritos (${candidatos.length})`;
  $('cuenta-inscripciones').textContent = candidatos.length;
  $('campo-buscar-inscrito').hidden = candidatos.length < 6;
  dibujarInscritos();
}

/* Cuadro «Ver inscripciones» (opción V1): tabla en PC, fichas en celular */
function abrirInscripciones() {
  const anterior = document.activeElement;
  const buscar = el('input', { class: 'input', type: 'search', placeholder: '🔍 Buscar por partido o nombre', 'aria-label': 'Buscar inscripción' });
  const cuerpo = el('tbody');
  const cuenta = el('span');
  const cerrarX = el('button', { type: 'button', class: 'btn btn-sec btn-chico boton-x', 'aria-label': 'Cerrar' }, '✕');
  const cerrar = el('button', { type: 'button', class: 'btn btn-pri btn-chico' }, 'Cerrar');
  const fondo = el('div', { class: 'modal-fondo' },
    el('div', { class: 'modal modal-tabla', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tit-ins' },
      el('div', { class: 'modal-cab' }, el('h3', { id: 'tit-ins' }, `Inscripciones (${candidatos.length})`), cerrarX),
      el('div', { class: 'modal-buscar' }, buscar),
      el('div', { class: 'modal-lista' },
        el('table', { class: 'tabla-inscripciones' },
          el('thead', {}, el('tr', {}, ...['N.º', 'Logo', 'Partido', 'Nombre', 'Apellido', 'Descripción'].map(x => el('th', {}, x)))),
          cuerpo)),
      el('div', { class: 'modal-pie' }, cuenta, cerrar)));

  function dibujar() {
    const q = buscar.value.trim().toLowerCase();
    const filas = candidatos
      .map((c, i) => ({ c, n: i + 1 }))
      .filter(({ c }) => !q || `${c.partido || ''} ${c.nombre} ${c.apellido} ${c.descripcion || ''}`.toLowerCase().includes(q));
    cuenta.textContent = q ? `${filas.length} de ${candidatos.length} participantes` : `${candidatos.length} ${candidatos.length === 1 ? 'participante' : 'participantes'}`;
    if (!filas.length) {
      cuerpo.replaceChildren(el('tr', { class: 'vacia' }, el('td', { colspan: '6' }, candidatos.length ? 'Ninguna inscripción coincide con la búsqueda.' : 'Todavía no hay participantes inscritos.')));
      return;
    }
    cuerpo.replaceChildren(...filas.map(({ c, n }) => el('tr', {},
      el('td', { class: 'c-num' }, String(n)),
      el('td', { class: 'c-logo' }, logoDe(c)),
      el('td', { class: 'c-partido' }, el('b', {}, el('span', { class: 'solo-cel' }, `${n} · `), c.partido || 'Sin partido')),
      el('td', { class: 'c-nombre', 'data-dato': 'Nombre' }, c.nombre),
      el('td', { class: 'c-apellido', 'data-dato': 'Apellido' }, c.apellido),
      el('td', { class: 'c-desc' + (c.descripcion ? '' : ' sin') }, c.descripcion || 'Sin descripción'),
    )));
  }
  const salir = () => {
    fondo.remove();
    document.removeEventListener('keydown', tecla);
    anterior?.focus?.();
  };
  const tecla = e => { if (e.key === 'Escape') salir(); };
  cerrarX.onclick = salir;
  cerrar.onclick = salir;
  fondo.addEventListener('click', e => { if (e.target === fondo) salir(); });
  document.addEventListener('keydown', tecla);
  buscar.addEventListener('input', dibujar);
  dibujar();
  document.body.append(fondo);
  (esCelular() ? cerrarX : buscar).focus();
}
$('btn-ver-inscripciones').addEventListener('click', abrirInscripciones);

let votosInscritos = {};
$('buscar-inscrito').addEventListener('input', () => dibujarInscritos());
function dibujarInscritos() {
  const votosPor = votosInscritos;
  if (!candidatos.length) {
    $('lista-inscritos').replaceChildren(el('p', { class: 'vacio' }, 'Todavía no hay participantes inscritos.'));
    return;
  }
  const q = $('buscar-inscrito').value.trim().toLowerCase();
  const lista = candidatos.filter(c => !q || `${c.partido || ''} ${c.nombre} ${c.apellido}`.toLowerCase().includes(q));
  if (!lista.length) {
    $('lista-inscritos').replaceChildren(el('p', { class: 'vacio' }, 'Ningún inscrito coincide con la búsqueda.'));
    return;
  }
  $('lista-inscritos').replaceChildren(...lista.map(c => el('div', { class: 'cand' },
    logoDe(c),
    el('div', { class: 'datos' }, el('b', {}, nombreDe(c)), el('br'), el('small', {}, (c.partido ? `${c.nombre} ${c.apellido}` : 'Sin partido') + (votosPor[c.id] ? ` · ${votosTexto(votosPor[c.id])}` : ''))),
    cerrada ? null : el('span', { class: 'acc' },
      el('button', { class: 'btn btn-sec btn-chico', type: 'button', onclick: () => editar(c) }, '✎ Editar'),
      el('button', { class: 'btn btn-rojo btn-chico', type: 'button', onclick: () => quitar(c) }, 'Quitar')),
  )));
}

$('form-candidato').addEventListener('submit', async e => {
  e.preventDefault();
  errorEn('inscribir-error');
  errorEn('inscribir-ok');
  if (!revisarCandidato()) return;
  const lineas = [
    ['Nombre', campos.nombre.value], ['Apellido', campos.apellido.value], ['Partido', campos.partido.value || '(sin partido)'],
    ['Descripción', campos.descripcion.value || '(sin descripción)'], ['Logo', logoActual ? 'sí' : '(sin logo)'],
  ];
  const si = await preguntar({
    titulo: '¿Estás seguro o quieres corregir algo?',
    texto: el('div', { class: 'resumen-datos' }, ...lineas.map(([k, val]) => el('p', {}, el('span', {}, k + ': '), el('b', {}, val.replace(/\s+/g, ' ').trim())))),
    si: editando ? 'Sí, guardar' : 'Sí, inscribir', claseSi: 'btn-pri', no: 'Corregir',
  });
  if (!si) return;
  const cuerpo = {
    nombre: campos.nombre.value, apellido: campos.apellido.value, partido: campos.partido.value,
    descripcion: campos.descripcion.value, logo: logoActual,
  };
  try {
    const guardado = await conCarga($('btn-inscribir'), 'Guardando…', () => editando
      ? pedir('/api/admin/candidatos/' + editando, { method: 'PUT', cuerpo })
      : pedir('/api/admin/candidatos', { cuerpo }));
    errorEn('inscribir-ok', (editando ? 'Cambios guardados: ' : 'Inscrito: ') + nombreDe(guardado));
    limpiarFormulario();
    await cargarCandidatos();
  } catch (err) {
    if (err.codigo === 'partido_repetido') {
      mostrarMensaje(campos.partido, `Ya hay un partido inscrito con el nombre «${campos.partido.value.trim()}». Use otro nombre.`);
      campos.partido.focus();
    } else {
      errorEn('inscribir-error', err.message);
    }
  }
});

function limpiarFormulario() {
  editando = null;
  $('form-candidato').reset();
  logoOriginal = null;
  ponerLogo(null);
  contadores.forEach(f => f());
  Object.values(campos).forEach(c => mostrarMensaje(c, null));
  $('btn-inscribir').textContent = '➕ Inscribir participante';
  $('tit-inscribir').textContent = 'Inscribir participante';
  $('btn-cancelar-edicion').hidden = true;
}

function editar(c) {
  errorEn('inscribir-error');
  errorEn('inscribir-ok');
  editando = c.id;
  campos.nombre.value = c.nombre;
  campos.apellido.value = c.apellido;
  campos.partido.value = c.partido || '';
  campos.descripcion.value = c.descripcion || '';
  logoOriginal = c.logo;
  ponerLogo(c.logo);
  if (c.logo || c.descripcion) $('det-opcional').open = true;
  Object.values(campos).forEach(x => mostrarMensaje(x, null));
  contadores.forEach(f => f());
  $('btn-inscribir').textContent = '💾 Guardar cambios';
  $('tit-inscribir').textContent = 'Editar participante';
  $('btn-cancelar-edicion').hidden = false;
  $('sec-inscribir').scrollIntoView({ behavior: 'smooth' });
  campos.nombre.focus({ preventScroll: true });
}
$('btn-cancelar-edicion').addEventListener('click', () => { limpiarFormulario(); errorEn('inscribir-error'); });

async function quitar(c) {
  // Conteo al momento: los votos pueden haber llegado después de abrir el panel.
  const actual = await pedir('/api/admin/resultados').catch(() => null);
  const votos = actual ? (actual.partidos.find(p => p.id === c.id)?.votos || 0) : (votosInscritos[c.id] || 0);
  const si = await preguntar({
    titulo: '¿Estás seguro de quitar este participante?',
    texto: votos
      ? el('p', {}, 'Se quitará ', el('b', {}, nombreDe(c)), '. Tiene ', el('b', {}, votosTexto(votos)), ': esos votos se borran y ',
        votos === 1 ? 'esa persona podrá' : `esas ${votos} personas podrán`, ' registrarse y votar de nuevo.')
      : el('p', {}, 'Se quitará ', el('b', {}, nombreDe(c)), ' de la lista.'),
    si: 'Sí, quitar', claseSi: 'btn-rojo', no: 'Cancelar',
  });
  if (!si) return;
  errorEn('inscribir-ok');
  try {
    const r = await pedir('/api/admin/candidatos/' + c.id, { method: 'DELETE' });
    errorEn('inscribir-ok', `Se quitó ${nombreDe(c)}.` + (r.votosLiberados ? ` ${votosTexto(r.votosLiberados)} borrados: esas personas pueden votar de nuevo.` : ''));
    if (editando === c.id) limpiarFormulario();
    errorEn('inscribir-error');
    await cargarCandidatos();
  } catch (err) {
    errorEn('inscribir-error', err.message);
  }
}

/* Logo: el admin lo acomoda (arrastrar, dos dedos, rueda o barra) y se guarda un cuadrado de 256 px */
let logoOriginal = null;

function ponerLogo(dato) {
  logoActual = dato;
  $('vista-logo').hidden = !dato;
  $('zona-logo').hidden = !!dato;
  if (dato) $('img-logo').src = dato;
  else $('img-logo').removeAttribute('src');
}

function cargarImagen(src) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('No se pudo abrir esa imagen.'));
    img.src = src;
  });
}

async function acomodarLogo(src) {
  const img = await cargarImagen(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  return new Promise(resolver => {
    const foto = el('img', { src, alt: '', draggable: 'false' });
    const marco = el('div', { class: 'marco-logo', tabindex: '0', 'aria-label': 'Logo: arrastre para mover, flechas para mover, + y − para acercar' }, foto);
    const barra = el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Acercar o alejar' });
    const menos = el('button', { type: 'button', class: 'btn btn-sec btn-chico', 'aria-label': 'Alejar' }, '−');
    const mas = el('button', { type: 'button', class: 'btn btn-sec btn-chico', 'aria-label': 'Acercar' }, '+');
    const centrar = el('button', { type: 'button', class: 'btn btn-sec btn-chico' }, '⟲ Centrar');
    const cancelar = el('button', { type: 'button', class: 'btn btn-sec' }, 'Cancelar');
    const listo = el('button', { type: 'button', class: 'btn btn-pri' }, '✓ Usar logo');
    const fondo = el('div', { class: 'modal-fondo' },
      el('div', { class: 'modal modal-logo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tit-acomodar' },
        el('h3', { id: 'tit-acomodar' }, 'Acomode el logo'),
        el('p', {}, 'Arrastre para mover. Con dos dedos (o la rueda del ratón) agranda o achica.'),
        marco,
        el('div', { class: 'zoom-fila' }, menos, barra, mas),
        el('div', { class: 'zoom-fila' }, centrar),
        el('div', { class: 'fila-botones' }, cancelar, listo)));
    document.body.append(fondo);

    const F = () => marco.clientWidth;
    let s, x, y;
    const minimo = () => (F() / Math.max(W, H)) * 0.5;
    const maximo = () => (F() / Math.min(W, H)) * 5;

    function limitar() {
      const f = F();
      x = Math.min(f / 2, Math.max(f / 2 - W * s, x));
      y = Math.min(f / 2, Math.max(f / 2 - H * s, y));
    }
    function pintar() {
      limitar();
      foto.style.width = W * s + 'px';
      foto.style.height = H * s + 'px';
      foto.style.transform = `translate(${x}px, ${y}px)`;
      barra.value = Math.round(100 * Math.log(s / minimo()) / Math.log(maximo() / minimo()));
    }
    function escalaEn(nueva, px, py) {
      nueva = Math.min(maximo(), Math.max(minimo(), nueva));
      x = px - (px - x) * (nueva / s);
      y = py - (py - y) * (nueva / s);
      s = nueva;
      pintar();
    }
    function inicial() {
      const f = F();
      s = f / Math.max(W, H);
      x = (f - W * s) / 2;
      y = (f - H * s) / 2;
      pintar();
    }
    inicial();

    // Dedos y ratón
    const punteros = new Map();
    let previo = null;
    const datosGesto = () => {
      const [a, b] = [...punteros.values()];
      const r = marco.getBoundingClientRect();
      return b
        ? { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top }
        : { d: 0, cx: a.x - r.left, cy: a.y - r.top };
    };
    marco.addEventListener('pointerdown', e => {
      marco.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      previo = datosGesto();
    });
    marco.addEventListener('pointermove', e => {
      if (!punteros.has(e.pointerId)) return;
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = datosGesto();
      x += g.cx - previo.cx;
      y += g.cy - previo.cy;
      if (g.d && previo.d) escalaEn(s * (g.d / previo.d), g.cx, g.cy);
      else pintar();
      previo = g;
    });
    const soltar = e => {
      punteros.delete(e.pointerId);
      previo = punteros.size ? datosGesto() : null;
    };
    marco.addEventListener('pointerup', soltar);
    marco.addEventListener('pointercancel', soltar);
    marco.addEventListener('wheel', e => {
      e.preventDefault();
      const r = marco.getBoundingClientRect();
      escalaEn(s * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    marco.addEventListener('keydown', e => {
      const paso = 10;
      const mov = { ArrowLeft: [paso, 0], ArrowRight: [-paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] }[e.key];
      if (mov) { e.preventDefault(); x += mov[0]; y += mov[1]; pintar(); }
      if (e.key === '+' || e.key === '=') escalaEn(s * 1.15, F() / 2, F() / 2);
      if (e.key === '-') escalaEn(s / 1.15, F() / 2, F() / 2);
    });
    barra.addEventListener('input', () => {
      const nueva = minimo() * Math.pow(maximo() / minimo(), barra.value / 100);
      escalaEn(nueva, F() / 2, F() / 2);
    });
    menos.onclick = () => escalaEn(s / 1.2, F() / 2, F() / 2);
    mas.onclick = () => escalaEn(s * 1.2, F() / 2, F() / 2);
    centrar.onclick = inicial;

    const cerrar = valor => {
      fondo.remove();
      document.removeEventListener('keydown', tecla);
      resolver(valor);
    };
    const tecla = e => { if (e.key === 'Escape') cerrar(null); };
    document.addEventListener('keydown', tecla);
    cancelar.onclick = () => cerrar(null);
    listo.onclick = () => {
      const lado = 256, k = lado / F();
      const lienzo = document.createElement('canvas');
      lienzo.width = lienzo.height = lado;
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lado, lado);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x * k, y * k, W * s * k, H * s * k);
      let dato = lienzo.toDataURL('image/webp', 0.9);
      if (!dato.startsWith('data:image/webp')) dato = lienzo.toDataURL('image/png');
      cerrar(dato);
    };
    marco.focus();
  });
}

async function recibirArchivo(archivo) {
  if (!archivo) return;
  errorEn('inscribir-error');
  if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) {
    errorEn('inscribir-error', 'El logo debe ser una imagen PNG, JPG o WEBP.');
    return;
  }
  const src = URL.createObjectURL(archivo);
  try {
    const dato = await acomodarLogo(src);
    if (dato) {
      if (logoOriginal?.startsWith('blob:')) URL.revokeObjectURL(logoOriginal);
      logoOriginal = src;
      ponerLogo(dato);
    } else {
      URL.revokeObjectURL(src);
    }
  } catch (err) {
    URL.revokeObjectURL(src);
    errorEn('inscribir-error', err.message);
  }
  $('c-logo').value = '';
}

$('btn-acomodar-logo').addEventListener('click', async () => {
  try {
    const dato = await acomodarLogo(logoOriginal || logoActual);
    if (dato) ponerLogo(dato);
  } catch (err) {
    errorEn('inscribir-error', err.message);
  }
});
$('c-logo').addEventListener('change', e => recibirArchivo(e.target.files[0]));
const zona = $('zona-logo');
zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('encima'); });
zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
zona.addEventListener('drop', e => {
  e.preventDefault();
  zona.classList.remove('encima');
  recibirArchivo(e.dataTransfer.files[0]);
});
$('btn-quitar-logo').addEventListener('click', () => { logoOriginal = null; ponerLogo(null); $('c-logo').value = ''; });

/* ---------- Resultados en vivo ---------- */
let ultimo = null;
let anterior = null;
let horaResultados = 0;
let nuevosTexto = '';
let verTodos = false;
let paginaVotantes = 1;
let claveOpciones = '';
const primeros = () => (esCelular() ? 4 : 10);

function pintarHace() {
  const seg = Math.round((Date.now() - horaResultados) / 1000);
  const falta = Math.max(0, 60 - seg);
  $('hace-resultados').textContent = (seg < 3 ? 'Actualizado ahora' : `Actualizado hace ${seg} s`) + (nuevosTexto && seg < 6 ? ` · ${nuevosTexto}` : ` · sola en ${falta} s`);
}

async function actualizarResultados(manual = false) {
  const boton = $('btn-actualizar');
  boton.classList.add('girando');
  const totalAntes = ultimo ? ultimo.total : null;
  try {
    const nuevo = await pedir('/api/admin/resultados');
    anterior = ultimo;
    ultimo = nuevo;
  } catch (err) {
    if (err.estado === 401) location.reload();
    return;
  } finally {
    setTimeout(() => boton.classList.remove('girando'), 500);
  }
  horaResultados = Date.now();
  const n = totalAntes === null ? 0 : ultimo.total - totalAntes;
  nuevosTexto = n > 0 ? `+${votosTexto(n)} ${n === 1 ? 'nuevo' : 'nuevos'}` : (manual ? 'sin votos nuevos' : '');
  pintarHace();
  if (vistaResultados !== 'general' && !ultimo.partidos.some(p => p.id === vistaResultados)) vistaResultados = 'general';
  llenarDesplegable();
  if (vistaResultados === 'general') dibujarGeneral();
  else await dibujarPartido(vistaResultados);
}

// El desplegable se rehace solo si cambian los partidos, para no cerrarlo mientras se usa.
function llenarDesplegable() {
  const ordenados = [...ultimo.partidos].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'));
  const clave = ordenados.map(p => p.id + ':' + nombreDe(p)).join('|');
  const sel = $('elegir-partido');
  if (clave !== claveOpciones) {
    claveOpciones = clave;
    sel.replaceChildren(
      el('option', { value: 'general' }, `📊 General (${ultimo.partidos.length} ${ultimo.partidos.length === 1 ? 'partido' : 'partidos'})`),
      ...ordenados.map(p => el('option', { value: String(p.id) }, nombreDe(p))),
    );
  }
  sel.value = String(vistaResultados);
}

$('elegir-partido').addEventListener('change', e => {
  elegirVista(e.target.value === 'general' ? 'general' : Number(e.target.value));
});
$('btn-volver-general').addEventListener('click', () => elegirVista('general'));

function elegirVista(v) {
  vistaResultados = v;
  paginaVotantes = 1;
  tamPagina = null;
  $('buscar').value = '';
  actualizarResultados();
  window.scrollTo({ top: 0 });
}

function dibujarGeneral() {
  $('res-general').hidden = false;
  $('res-partido').hidden = true;
  $('tit-resultados').textContent = 'Resultados';
  $('vivo').textContent = (cerrada ? 'CERRADA · ' : 'EN VIVO · ') + votosTexto(ultimo.total);
  if (!ultimo.partidos.length) {
    $('barras-general').replaceChildren(el('p', { class: 'vacio' }, 'Inscriba participantes para ver resultados.'));
    $('puestos').replaceChildren();
    $('btn-ver-todos').hidden = true;
    return;
  }
  const total = ultimo.partidos.length;
  pintarBarrasVivo($('barras-general'), verTodos ? ultimo.partidos : ultimo.partidos.slice(0, primeros()), anterior && anterior.partidos);
  $('btn-ver-todos').hidden = total <= primeros();
  $('btn-ver-todos').textContent = verTodos ? `Ver solo los ${primeros()} primeros ▴` : `Ver los ${total} partidos ▾`;
  dibujarPuestos($('puestos'), ultimo.partidos.slice(0, 4));
}
$('btn-ver-todos').addEventListener('click', () => { verTodos = !verTodos; dibujarGeneral(); });
$('btn-actualizar').addEventListener('click', () => actualizarResultados(true));

async function dibujarPartido(id) {
  const p = conPuestos(ultimo.partidos).find(x => x.id === id);
  $('res-general').hidden = true;
  $('res-partido').hidden = false;
  $('tit-resultados').textContent = nombreDe(p);
  $('tit-partido-sec').textContent = nombreDe(p);
  $('vivo').textContent = cerrada ? 'CERRADA' : 'EN VIVO';
  $('porc-partido').textContent = formatoPorc(p.porcentaje);
  $('porc-partido').style.color = colorDe(p.id);
  $('detalle-partido').textContent = `${votosTexto(p.votos)} de ${ultimo.total} · ${p.puesto}.º lugar · ${p.nombre} ${p.apellido}`;
  const demas = ultimo.total - p.votos;
  dibujarBarras($('barras-partido'), [
    { nombre: 'Este partido', ancho: ultimo.total ? (p.votos / ultimo.total) * 100 : 0, color: colorDe(p.id), texto: String(p.votos) },
    { nombre: 'Los demás', ancho: ultimo.total ? (demas / ultimo.total) * 100 : 0, color: '#8f9bb8', texto: String(demas) },
  ]);
  await cargarVotantes();
}

let pedidoVotantes = 0;
// Si en el celular la página todavía se pasa de la pantalla, se quitan filas y se vuelve a pedir la lista.
const recorte = { padron: 0 };
// Filas por página de «Quiénes votaron» en el celular: se calcula una vez y queda igual al pasar de página.
let tamPagina = null;
addEventListener('resize', () => { recorte.padron = 0; tamPagina = null; });
function sobraEnCelular() {
  return esCelular() ? document.documentElement.scrollHeight - window.innerHeight : 0;
}
function filasDeMas(selFila) {
  const sobra = sobraEnCelular();
  const fila = document.querySelector(selFila);
  if (sobra <= 0 || !fila) return 0;
  return Math.ceil(sobra / Math.max(20, fila.getBoundingClientRect().height));
}
// En el celular la lista trae solo las filas que caben en la pantalla, para no tener que bajar.
function filasQueCaben() {
  if (!esCelular()) return 25;
  if (tamPagina) return tamPagina;
  const caja = document.querySelector('#res-partido .tabla-caja');
  if (!caja || !caja.offsetParent) return 8;
  const arriba = caja.getBoundingClientRect().top + window.scrollY;
  const filaAlto = document.querySelector('#tabla-votantes tr td')?.parentElement.getBoundingClientRect().height || 37;
  const titulo = caja.querySelector('thead')?.getBoundingClientRect().height || 34;
  tamPagina = Math.max(2, Math.min(25, Math.floor((window.innerHeight - arriba - titulo - 24) / filaAlto)));
  return tamPagina;
}
const vistoHasta = {};
const horaDe = fecha => new Date(fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
async function cargarVotantes() {
  const id = vistaResultados;
  const numero = ++pedidoVotantes;
  const q = $('buscar').value.trim();
  const r = await pedir(`/api/admin/votantes/${id}?pagina=${paginaVotantes}&buscar=${encodeURIComponent(q)}&porPagina=${filasQueCaben()}`);
  if (numero !== pedidoVotantes) return;
  if (paginaVotantes > r.paginas) {
    paginaVotantes = r.paginas;
    return cargarVotantes();
  }
  $('tit-votantes').textContent = `Quiénes votaron (${r.total})`;
  // Las filas que llegaron desde la última vez que se miró este partido se marcan «Nuevo».
  const visto = vistoHasta[id];
  const nuevaFila = v => visto !== undefined && v.fecha > visto;
  for (const v of r.filas) if (vistoHasta[id] === undefined || v.fecha > vistoHasta[id]) vistoHasta[id] = v.fecha;
  if (vistoHasta[id] === undefined) vistoHasta[id] = '';
  if (!r.filas.length) {
    $('tabla-votantes').replaceChildren(el('tr', {}, el('td', { colspan: '5', style: 'color:var(--suave)' }, q ? 'Nadie coincide con la búsqueda.' : 'Todavía nadie votó por este partido.')));
  } else {
    const desde = (r.pagina - 1) * r.porPagina;
    $('tabla-votantes').replaceChildren(...r.filas.map((v, i) => el('tr', { class: nuevaFila(v) ? 'nuevo' : null },
      el('td', { class: 'num-fila' }, String(desde + i + 1)),
      el('td', {}, v.nombre, nuevaFila(v) ? el('span', { class: 'eti-nuevo' }, 'Nuevo') : null),
      el('td', {}, v.apellido), el('td', {}, telefonoBonito(v.telefono)), el('td', {}, horaDe(v.fecha)))));
  }
  // Arriba de la tabla, siempre a la vista: «1–25 de 40» con ‹ Atrás y Siguiente ›.
  const desdeN = r.total ? (r.pagina - 1) * r.porPagina + 1 : 0;
  const hastaN = (r.pagina - 1) * r.porPagina + r.filas.length;
  $('pag-texto').textContent = `${desdeN}–${hastaN} de ${r.total}`;
  $('pag-anterior').disabled = r.pagina <= 1;
  $('pag-siguiente').disabled = r.pagina >= r.paginas;
  const deMas = filasDeMas('#tabla-votantes tr');
  if (deMas && r.filas.length > 2 && tamPagina > 2) { tamPagina = Math.max(2, tamPagina - deMas); return cargarVotantes(); }
}

let esperaBuscar = null;
$('buscar').addEventListener('input', () => {
  clearTimeout(esperaBuscar);
  esperaBuscar = setTimeout(() => { paginaVotantes = 1; cargarVotantes(); }, 250);
});
$('pag-anterior').addEventListener('click', () => { paginaVotantes--; cargarVotantes(); });
$('pag-siguiente').addEventListener('click', () => { paginaVotantes++; cargarVotantes(); });

/* ---------- Participantes: quiénes pueden votar ---------- */
let paginaPadron = 1;
let filtroPadron = 'todos';
let esperaPadron = null;
let editandoTelefono = null;
// En celular entran tantas filas como quepan en la pantalla (entre 3 y 8) para no hacer scroll.
const porPaginaPadron = () => (esCelular() ? Math.min(8, Math.max(2, Math.floor((window.innerHeight - 475) / 53) - recorte.padron)) : 10);
const camposPadron = { nombre: $('p-nombre'), apellido: $('p-apellido'), telefono: $('p-telefono') };
const reglaTelPadron = campoTelefonoConPais(camposPadron.telefono);
const contadoresPadron = [
  conectarContador(camposPadron.nombre, 3, 80),
  conectarContador(camposPadron.apellido, 3, 80),
  conectarContador(camposPadron.telefono, 9, 9),
];
const revisarPadron = conectarValidacion([
  { input: camposPadron.nombre, min: 3, max: 80, tipo: 'letras' },
  { input: camposPadron.apellido, min: 3, max: 80, tipo: 'letras' },
  reglaTelPadron,
]);

function elegirPestana(nombre) {
  document.querySelectorAll('.pestanas-padron button').forEach(b => {
    b.classList.toggle('on', b.dataset.pestana === nombre);
    b.setAttribute('aria-selected', b.dataset.pestana === nombre ? 'true' : 'false');
  });
  document.querySelectorAll('.padron-panel').forEach(p => { p.hidden = p.dataset.panel !== nombre; });
}
document.querySelector('.pestanas-padron').addEventListener('click', e => {
  const b = e.target.closest('button[data-pestana]');
  if (b) elegirPestana(b.dataset.pestana);
});

const inicialesPersona = p => ((p.nombre[0] || '') + (p.apellido[0] || '')).toUpperCase();

async function cargarPadron() {
  const q = $('buscar-padron').value.trim();
  let r;
  try {
    r = await pedir(`/api/admin/padron?pagina=${paginaPadron}&por=${porPaginaPadron()}&filtro=${filtroPadron}&buscar=${encodeURIComponent(q)}`);
  } catch (err) {
    $('lista-padron').replaceChildren(el('p', { class: 'vacio-padron' }, err.message));
    return;
  }
  paginaPadron = r.pagina;
  $('n-todos').textContent = r.conteo.todos;
  $('n-votaron').textContent = r.conteo.votaron;
  $('n-faltan').textContent = r.conteo.faltan;
  $('cuenta-padron').textContent = r.conteo.todos;
  $('resumen-padron').textContent = `${r.conteo.todos} en la lista · ${r.conteo.votaron} votaron`;
  document.querySelectorAll('.filtros-padron button').forEach(b => b.classList.toggle('on', b.dataset.filtro === filtroPadron));
  const vacio = !r.conteo.todos ? 'Todavía no hay nadie en la lista. Agregue a los participantes que pueden votar.'
    : q ? 'No hay nadie con esa búsqueda.' : 'No hay nadie en este grupo.';
  $('lista-padron').replaceChildren(...(r.filas.length ? r.filas.map(p => el('div', { class: 'fila-padron' + (p.voto ? ' voto' : '') },
    el('span', { class: 'ini', 'aria-hidden': 'true' }, inicialesPersona(p)),
    el('span', {}, el('b', { title: `${p.nombre} ${p.apellido}` }, `${p.nombre} ${p.apellido}`), el('small', {}, `Tel. ${telefonoBonito(p.telefono)}`)),
    el('span', { class: 'etiqueta-voto' }, p.voto ? 'Votó' : 'Falta'),
    el('button', { type: 'button', class: 'editar-padron', title: 'Editar', 'aria-label': `Editar a ${p.nombre} ${p.apellido}`, onclick: () => editarParticipante(p) }, '✎'),
    p.voto
      ? el('button', { type: 'button', class: 'borrar-voto', title: 'Eliminar voto', 'aria-label': `Eliminar el voto de ${p.nombre} ${p.apellido}`, onclick: () => borrarVoto(p) }, '↺')
      : el('button', { type: 'button', class: 'quitar-padron', title: 'Eliminar de la lista', 'aria-label': `Eliminar a ${p.nombre} ${p.apellido}`, onclick: () => quitarParticipante(p) }, '✕'),
  )) : [el('p', { class: 'vacio-padron' }, vacio)]));
  $('padron-pagina').textContent = `Página ${r.pagina} de ${r.paginas}`;
  $('padron-anterior').disabled = r.pagina <= 1;
  $('padron-siguiente').disabled = r.pagina >= r.paginas;
  const deMas = !$('lista-padron').closest('[hidden]') && filasDeMas('#lista-padron .fila-padron');
  if (deMas && r.filas.length > 2 && recorte.padron < 8) { recorte.padron += deMas; return cargarPadron(); }
}

function modoAgregar() {
  editandoTelefono = null;
  $('form-padron').reset();
  camposPadron.telefono.telefono.reiniciar();
  camposPadron.telefono.telefono.desactivar(false);
  contadoresPadron.forEach(f => f());
  Object.values(camposPadron).forEach(c => mostrarMensaje(c, null));
  $('tit-padron').textContent = 'Agregar participante';
  $('sec-tit-padron').textContent = 'Agregar a la lista';
  $('btn-agregar-participante').textContent = '➕ Agregar a la lista';
  $('btn-cancelar-participante').hidden = true;
}

function editarParticipante(p) {
  errorEn('padron-error');
  errorEn('padron-ok');
  editandoTelefono = p.telefono;
  camposPadron.nombre.value = p.nombre;
  camposPadron.apellido.value = p.apellido;
  camposPadron.telefono.telefono.poner(p.telefono);
  // Quien ya votó puede corregir su nombre, pero su teléfono queda fijo.
  camposPadron.telefono.telefono.desactivar(p.voto);
  Object.values(camposPadron).forEach(c => mostrarMensaje(c, null));
  contadoresPadron.forEach(f => f());
  $('tit-padron').textContent = 'Editar participante';
  $('sec-tit-padron').textContent = p.voto ? 'Editar datos (ya votó: el teléfono no cambia)' : 'Editar datos';
  $('btn-agregar-participante').textContent = '💾 Guardar cambios';
  $('btn-cancelar-participante').hidden = false;
  if (esCelular()) elegirPestana('agregar');
  camposPadron.nombre.focus();
}
$('btn-cancelar-participante').addEventListener('click', () => { modoAgregar(); errorEn('padron-error'); });

$('form-padron').addEventListener('submit', async e => {
  e.preventDefault();
  errorEn('padron-error');
  errorEn('padron-ok');
  if (!revisarPadron()) return;
  const cuerpo = { nombre: camposPadron.nombre.value, apellido: camposPadron.apellido.value, telefono: camposPadron.telefono.telefono.valor() };
  const editando = editandoTelefono;
  const limpio = t => t.replace(/\s+/g, ' ').trim();
  const si = await preguntar({
    titulo: editando ? '¿Estás seguro de guardar los cambios?' : '¿Estás seguro o quieres corregir algo?',
    texto: el('div', {},
      el('p', {}, editando ? 'Así quedará en la lista:' : 'Se agregará a la lista de votantes:'),
      el('div', { class: 'resumen-datos' }, ...[['Nombre', cuerpo.nombre], ['Apellido', cuerpo.apellido], ['Teléfono', telefonoBonito(cuerpo.telefono)]]
        .map(([k, v]) => el('p', {}, el('span', {}, k + ': '), el('b', {}, limpio(v)))))),
    si: editando ? 'Sí, guardar' : 'Sí, agregar', claseSi: 'btn-pri', no: 'Corregir',
  });
  if (!si) return;
  try {
    const p = await conCarga($('btn-agregar-participante'), 'Guardando…', () => editando
      ? pedir('/api/admin/padron/' + encodeURIComponent(editando), { method: 'PUT', cuerpo })
      : pedir('/api/admin/padron', { cuerpo }));
    modoAgregar();
    errorEn('padron-ok', editando ? `✓ Cambios guardados: ${p.nombre} ${p.apellido}.` : `✓ ${p.nombre} ${p.apellido} quedó en la lista.`);
    camposPadron.nombre.focus();
    if (!editando) paginaPadron = 1;
    await cargarPadron();
  } catch (err) {
    if (err.codigo === 'telefono_en_lista') mostrarMensaje(camposPadron.telefono, 'Ese teléfono ya está en la lista.');
    else if (err.campo && camposPadron[err.campo]) mostrarMensaje(camposPadron[err.campo], err.message);
    else errorEn('padron-error', err.message);
  }
});

async function borrarVoto(p) {
  const si = await preguntar({
    titulo: '¿Estás seguro de eliminar el voto?',
    texto: el('div', {},
      el('p', {}, 'Se borrará el voto de ', el('b', {}, `${p.nombre} ${p.apellido}`), ` (teléfono ${telefonoBonito(p.telefono)}).`),
      el('p', { class: 'aviso-voto' }, 'Los resultados bajarán en 1 voto y esta persona ', el('b', {}, 'podrá votar de nuevo'), '.')),
    si: 'Sí, eliminar voto', claseSi: 'btn-rojo', no: 'Cancelar',
  });
  if (!si) return;
  errorEn('padron-error');
  errorEn('padron-ok');
  try {
    await pedir('/api/admin/votos/' + encodeURIComponent(p.telefono), { method: 'DELETE' });
    errorEn('padron-ok', `✓ Se eliminó el voto de ${p.nombre} ${p.apellido}. Ya puede votar de nuevo.`);
  } catch (err) {
    await preguntar({ titulo: 'No se pudo eliminar el voto', texto: el('p', {}, err.message), si: 'Entendido', no: 'Cerrar' });
  }
  await cargarPadron();
}

async function quitarParticipante(p) {
  const si = await preguntar({
    titulo: '¿Estás seguro de eliminar?',
    texto: el('p', {}, el('b', {}, `${p.nombre} ${p.apellido}`), ` (teléfono ${telefonoBonito(p.telefono)}) saldrá de la lista y ya no podrá votar.`),
    si: 'Sí, eliminar', claseSi: 'btn-rojo', no: 'Cancelar',
  });
  if (!si) return;
  try {
    await pedir('/api/admin/padron/' + encodeURIComponent(p.telefono), { method: 'DELETE' });
    if (editandoTelefono === p.telefono) modoAgregar();
  } catch (err) {
    await preguntar({ titulo: 'No se pudo quitar', texto: el('p', {}, err.message), si: 'Entendido', no: 'Cerrar' });
  }
  await cargarPadron();
}

document.querySelector('.filtros-padron').addEventListener('click', e => {
  const b = e.target.closest('button[data-filtro]');
  if (!b) return;
  filtroPadron = b.dataset.filtro;
  paginaPadron = 1;
  cargarPadron();
});
$('buscar-padron').addEventListener('input', () => {
  clearTimeout(esperaPadron);
  esperaPadron = setTimeout(() => { paginaPadron = 1; cargarPadron(); }, 250);
});
$('padron-anterior').addEventListener('click', () => { paginaPadron--; cargarPadron(); });
$('padron-siguiente').addEventListener('click', () => { paginaPadron++; cargarPadron(); });

/* ---------- Publicar ---------- */
$('btn-publicar').addEventListener('click', async () => {
  const total = (await pedir('/api/admin/resultados').catch(() => ({ total: 0 }))).total;
  const si = await preguntar({
    titulo: '¿Estás seguro de publicar?',
    texto: el('p', {}, `Se cierra la votación con ${votosTexto(total)} y todos verán los ganadores.`),
    si: 'Sí, publicar', claseSi: 'btn-rojo', no: 'Cancelar',
  });
  if (!si) return;
  if (await cambiarEstado('publicar', $('btn-publicar'), 'Publicando…')) irA('resultados');
});

$('btn-ocultar').addEventListener('click', async () => {
  const si = await preguntar({
    titulo: '¿Estás seguro de ocultar los resultados?',
    texto: el('p', {}, 'Nadie verá los resultados. La votación sigue cerrada: no se podrá votar.'),
    si: 'Sí, ocultar', claseSi: 'btn-pri', no: 'No',
  });
  if (si) await cambiarEstado('ocultar', $('btn-ocultar'), 'Ocultando…');
});

$('btn-reabrir').addEventListener('click', async () => {
  const total = (await pedir('/api/admin/resultados').catch(() => ({ total: 0 }))).total;
  const si = await preguntar({
    titulo: '¿Estás seguro de reabrir la votación?',
    texto: el('p', {}, `Los resultados se ocultan y se podrá volver a votar. Los ${votosTexto(total)} guardados se mantienen.`),
    si: 'Sí, reabrir', claseSi: 'btn-rojo', no: 'No',
  });
  if (si) await cambiarEstado('reabrir', $('btn-reabrir'), 'Reabriendo…');
});

async function cambiarEstado(accion, boton, texto) {
  errorEn('publicar-error');
  try {
    await conCarga(boton, texto, () => pedir('/api/admin/' + accion, { cuerpo: {} }));
    await cargarEstado();
    await cargarCandidatos();
    return true;
  } catch (err) {
    errorEn('publicar-error', err.message);
    return false;
  }
}

// En celular lo opcional y la lista de inscritos empiezan cerrados (opción C1).
if (esCelular()) { $('det-opcional').open = false; $('det-inscritos').open = false; }

/* ---------- Inicio ---------- */
(async () => {
  try {
    const s = await pedir('/api/admin/sesion');
    await abrirPanel(s.nombre);
  } catch {
    $('vista-acceso').hidden = false;
  }
})();
