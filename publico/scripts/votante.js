const vistas = ['registro', 'votar', 'gracias', 'final', 'despedida', 'cerrada'];
const pill = document.getElementById('pill-estado');
let votante = null;
let candidatos = [];

// Resultados en vivo: al lado del formulario (pestaña en el celular) y después de votar.
const vivoIngreso = montarEnVivo(document.getElementById('panel-resultados'));
const vivoGracias = montarEnVivo(document.getElementById('vivo-gracias'));

function mostrar(nombre) {
  for (const v of vistas) document.getElementById('vista-' + v).hidden = v !== nombre;
  if (nombre === 'registro') { vivoIngreso.empezar(); } else vivoIngreso.detener();
  if (nombre === 'gracias') { vivoGracias.empezar(); vivoGracias.actualizar(); } else vivoGracias.detener();
  pill.textContent = {
    registro: 'Votación abierta',
    votar: votante ? `Tel. ${telefonoBonito(votante.telefono)}` : 'Votación abierta',
    gracias: 'Voto guardado',
    final: 'Resultados oficiales',
    despedida: 'Votación terminada',
    cerrada: 'Votación cerrada',
  }[nombre];
  pill.hidden = nombre === 'final';
  document.getElementById('btn-salir-final').hidden = nombre !== 'final';
  window.scrollTo(0, 0);
}

function errorEn(id, texto) {
  const caja = document.getElementById(id);
  caja.textContent = texto || '';
  caja.hidden = !texto;
}

/* ---------- Pestañas «Votar» y «Resultados» (solo en el celular) ---------- */
const tabs = { votar: document.getElementById('tab-votar'), resultados: document.getElementById('tab-resultados') };
const paneles = { votar: document.getElementById('panel-votar'), resultados: document.getElementById('panel-resultados') };
function elegirPestana(cual) {
  for (const k of Object.keys(tabs)) {
    tabs[k].setAttribute('aria-selected', k === cual);
    paneles[k].hidden = k !== cual;
  }
  if (cual === 'resultados') vivoIngreso.actualizar();
}
tabs.votar.addEventListener('click', () => elegirPestana('votar'));
tabs.resultados.addEventListener('click', () => elegirPestana('resultados'));

/* ---------- Registro ---------- */
const form = document.getElementById('form-registro');
const campoNombre = document.getElementById('r-nombre');
const campoApellido = document.getElementById('r-apellido');
const campoTelefono = document.getElementById('r-telefono');
const reglaTelefono = campoTelefonoConPais(campoTelefono);
conectarContador(campoNombre, 3, 80);
conectarContador(campoApellido, 3, 80);
conectarContador(campoTelefono, 9, 9);

const revisarRegistro = conectarValidacion([
  { input: campoNombre, min: 3, max: 80, tipo: 'letras' },
  { input: campoApellido, min: 3, max: 80, tipo: 'letras' },
  reglaTelefono,
]);

const CAMPOS = { nombre: campoNombre, apellido: campoApellido, telefono: campoTelefono };
const TEXTO_CAMPO = {
  nombre: ['Nombre correcto', 'El nombre está mal escrito. Corríjalo.'],
  apellido: ['Apellido correcto', 'El apellido está mal escrito. Corríjalo.'],
  telefono: ['Teléfono correcto', 'Este teléfono no está en la lista de votantes.'],
};
// Al corregir un cuadro se borra el aviso verde que tenía.
for (const c of Object.values(CAMPOS)) c.addEventListener('input', () => mostrarCorrecto(c, null));

function avisoArriba(error) {
  const caja = document.getElementById('registro-error');
  const punto = error.indexOf('. ');
  caja.replaceChildren(punto > 0 ? el('b', {}, error.slice(0, punto + 1)) : error, punto > 0 ? error.slice(punto + 1) : '');
  caja.hidden = false;
}

function marcarCampos(campos) {
  let primero = null;
  for (const [k, bien] of Object.entries(campos)) {
    if (bien) mostrarCorrecto(CAMPOS[k], TEXTO_CAMPO[k][0]);
    else {
      mostrarCorrecto(CAMPOS[k], null);
      mostrarMensaje(CAMPOS[k], TEXTO_CAMPO[k][1]);
      primero ??= CAMPOS[k];
    }
  }
  primero?.focus();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorEn('registro-error');
  for (const c of Object.values(CAMPOS)) mostrarCorrecto(c, null);
  if (!revisarRegistro()) return;
  const boton = document.getElementById('btn-ingresar');
  try {
    const r = await conCarga(boton, 'Revisando…', () => pedir('/api/ingresar', {
      cuerpo: { nombre: campoNombre.value, apellido: campoApellido.value, telefono: campoTelefono.telefono.valor() },
    }));
    if (r.publicado) return mostrarFinal();
    votante = { nombre: campoNombre.value, apellido: campoApellido.value, telefono: r.telefono, nombreLista: r.nombre };
    await abrirVotar();
  } catch (err) {
    if (err.codigo === 'cerrada') return revisarEstado();
    if (err.campos) {
      avisoArriba(err.message);
      marcarCampos(err.campos);
    } else if (err.campo && CAMPOS[err.campo]) {
      mostrarMensaje(CAMPOS[err.campo], err.message);
      CAMPOS[err.campo].focus();
    } else {
      errorEn('registro-error', err.message);
    }
  }
});

/* ---------- Votar ---------- */
const lista = document.getElementById('lista-partidos');
const botonVotar = document.getElementById('btn-votar');

async function abrirVotar() {
  candidatos = await pedir('/api/candidatos');
  errorEn('votar-error');
  botonVotar.disabled = true;
  botonVotar.textContent = 'Elija un partido para votar';
  if (!candidatos.length) {
    lista.replaceChildren(el('p', { class: 'vacio' }, 'Todavía no hay partidos inscritos. Vuelva más tarde.'));
  } else {
    lista.replaceChildren(...candidatos.map(c => el('label', { class: 'partido' },
      el('input', { type: 'radio', name: 'partido', value: c.id }),
      logoDe(c),
      el('b', {}, nombreDe(c)),
      el('span', { class: 'quien' }, c.partido ? `${c.nombre} ${c.apellido}` : 'Sin partido'),
      c.descripcion ? el('em', {}, c.descripcion) : null,
    )));
  }
  buscarPartido.value = '';
  document.getElementById('campo-buscar-partido').hidden = candidatos.length <= 8;
  filtrarPartidos();
  document.querySelector('header span').textContent = `Hola, ${votante.nombreLista}`;
  mostrar('votar');
}

const buscarPartido = document.getElementById('buscar-partido');
function filtrarPartidos() {
  const q = buscarPartido.value.trim().toLowerCase();
  let visibles = 0;
  lista.querySelectorAll('.partido').forEach((tarjeta, i) => {
    const c = candidatos[i];
    const ve = !q || `${c.partido || ''} ${c.nombre} ${c.apellido}`.toLowerCase().includes(q);
    tarjeta.hidden = !ve;
    if (ve) visibles++;
  });
  document.getElementById('cuenta-partidos').textContent = q ? `${visibles} de ${candidatos.length} partidos` : `${candidatos.length} partidos`;
}
buscarPartido.addEventListener('input', filtrarPartidos);

lista.addEventListener('change', () => {
  const elegido = elegidoActual();
  botonVotar.disabled = !elegido;
  botonVotar.textContent = elegido ? `Votar por ${nombreDe(elegido)}` : 'Elija un partido para votar';
});

function elegidoActual() {
  const marcado = lista.querySelector('input:checked');
  return marcado && candidatos.find(c => c.id === Number(marcado.value));
}

document.getElementById('form-votar').addEventListener('submit', async e => {
  e.preventDefault();
  const elegido = elegidoActual();
  if (!elegido) return;
  const si = await preguntar({
    titulo: '¿Estás seguro?',
    texto: el('p', {}, 'Vas a votar por ', el('b', {}, nombreDe(elegido)), '. Después no se puede cambiar.'),
    si: 'Sí, votar', claseSi: 'btn-verde', no: 'Cancelar',
  });
  if (!si) return;
  try {
    const { nombre, apellido, telefono } = votante;
    await conCarga(botonVotar, 'Guardando voto…', () => pedir('/api/votar', { cuerpo: { nombre, apellido, telefono, candidatoId: elegido.id } }));
    mostrar('gracias');
  } catch (err) {
    if (err.codigo === 'cerrada') return revisarEstado();
    errorEn('votar-error', err.message);
  }
});

function volverAlRegistro() {
  votante = null;
  form.reset();
  for (const c of [campoNombre, campoApellido, campoTelefono]) { mostrarMensaje(c, null); mostrarCorrecto(c, null); c.dispatchEvent(new Event('input')); }
  document.querySelector('header span').textContent = 'Elecciones 2026';
  errorEn('registro-error');
  mostrar('registro');
}
async function seguroDeSalir(texto) {
  return preguntar({ titulo: '¿Estás seguro de salir?', texto: el('p', {}, texto), si: 'Sí, salir', claseSi: 'btn-rojo', no: 'No' });
}
document.getElementById('btn-salir').addEventListener('click', async () => {
  if (await seguroDeSalir('Tu voto ya quedó guardado.')) volverAlRegistro();
});
document.getElementById('btn-cancelar-voto').addEventListener('click', async () => {
  if (await seguroDeSalir('Todavía no votaste. Si sales, tendrás que escribir tus datos otra vez para votar.')) volverAlRegistro();
});

/* ---------- Resultados finales ---------- */
async function mostrarFinal() {
  const r = await pedir('/api/resultados');
  const partidos = conPuestos(r.partidos);
  const ganadores = partidos.filter(p => p.puesto === 1);
  const titulo = document.getElementById('final-ganador');
  const detalle = document.getElementById('final-detalle');
  if (!r.total) {
    titulo.textContent = 'No hubo votos';
    detalle.textContent = '';
  } else if (ganadores.length > 1) {
    titulo.textContent = 'Empate: ' + ganadores.map(g => nombreDe(g)).join(' y ');
    detalle.textContent = `${formatoPorc(ganadores[0].porcentaje)} cada uno · ${votosTexto(r.total)} en total`;
  } else {
    const g = ganadores[0];
    titulo.textContent = `Ganó ${nombreDe(g)}`;
    detalle.textContent = `${g.nombre} ${g.apellido} · ${formatoPorc(g.porcentaje)} de ${votosTexto(r.total)}`;
  }
  const cuatro = partidos.slice(0, 4);
  const orden = [1, 0, 2, 3].map(i => cuatro[i]).filter(Boolean);
  const alturas = esCelular() ? { 1: 84, 2: 60, 3: 44, 4: 30 } : { 1: 140, 2: 100, 3: 72, 4: 48 };
  document.getElementById('final-podio').replaceChildren(...orden.map(p => el('div', { class: 'escalon' + (p.puesto === 1 && r.total ? ' e1' : '') },
    el('b', {}, nombreDe(p)),
    el('small', {}, votosTexto(p.votos)),
    el('div', { class: 'caja', style: `height:${alturas[Math.min(p.puesto, 4)]}px` }, String(p.puesto)),
  )));
  ultimoFinal = r.partidos;
  verTodosFinal = false;
  dibujarBarrasFinal();
  document.querySelector('header span').textContent = 'Elecciones 2026';
  mostrar('final');
}

const primerosFinal = () => (esCelular() ? 5 : 10);
let ultimoFinal = [];
let verTodosFinal = false;
const botonTodos = document.getElementById('btn-final-todos');
function dibujarBarrasFinal() {
  barrasDePartidos(document.getElementById('final-barras'), verTodosFinal ? ultimoFinal : ultimoFinal.slice(0, primerosFinal()));
  const n = primerosFinal();
  botonTodos.hidden = ultimoFinal.length <= n;
  botonTodos.textContent = verTodosFinal ? `Ver solo los ${n} primeros ▴` : `Ver los ${ultimoFinal.length} partidos ▾`;
}
botonTodos.addEventListener('click', () => { verTodosFinal = !verTodosFinal; dibujarBarrasFinal(); });

document.getElementById('btn-salir-final').addEventListener('click', async () => {
  if (await seguroDeSalir('Ya viste los resultados de la votación.')) mostrar('despedida');
});
document.getElementById('btn-ver-otra-vez').addEventListener('click', mostrarFinal);

/* ---------- Inicio ---------- */
// Publicada: resultados. Cerrada sin publicar: aviso. Abierta: registro.
async function revisarEstado() {
  try {
    const estado = await pedir('/api/estado');
    if (estado.publicado) return mostrarFinal();
    if (estado.cerrada) {
      document.querySelector('header span').textContent = 'Elecciones 2026';
      return mostrar('cerrada');
    }
    if (!document.getElementById('vista-votar').hidden || !document.getElementById('vista-gracias').hidden) return;
    mostrar('registro');
  } catch (err) {
    mostrar('registro');
    errorEn('registro-error', err.message);
  }
}
document.getElementById('btn-revisar').addEventListener('click', revisarEstado);
revisarEstado();
