const vistas = ['registro', 'votar', 'gracias', 'final', 'despedida', 'cerrada'];
const pill = document.getElementById('pill-estado');
let votante = null;
let candidatos = [];

function mostrar(nombre) {
  for (const v of vistas) document.getElementById('vista-' + v).hidden = v !== nombre;
  pill.textContent = {
    registro: 'Votación abierta',
    votar: votante ? `DNI ${votante.dni}` : 'Votación abierta',
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

/* ---------- Registro ---------- */
const form = document.getElementById('form-registro');
const campoNombre = document.getElementById('r-nombre');
const campoApellido = document.getElementById('r-apellido');
const campoDni = document.getElementById('r-dni');
conectarContador(campoNombre, 10, 30);
conectarContador(campoApellido, 10, 30);
conectarContador(campoDni, 8, 8);

const revisarRegistro = conectarValidacion([
  { input: campoNombre, min: 10, max: 30, tipo: 'letras' },
  { input: campoApellido, min: 10, max: 30, tipo: 'letras' },
  { input: campoDni, min: 8, max: 8, tipo: 'numeros', exacto: true },
]);

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorEn('registro-error');
  if (!revisarRegistro()) return;
  const boton = document.getElementById('btn-ingresar');
  try {
    const r = await conCarga(boton, 'Revisando…', () => pedir('/api/ingresar', {
      cuerpo: { nombre: campoNombre.value, apellido: campoApellido.value, dni: campoDni.value },
    }));
    if (r.publicado) return mostrarFinal();
    votante = { nombre: r.nombre, apellido: r.apellido, dni: r.dni };
    await abrirVotar();
  } catch (err) {
    if (err.codigo === 'cerrada') return revisarEstado();
    if (err.campo === 'dni') {
      mostrarMensaje(campoDni, err.codigo === 'dni_repetido' ? `El DNI ${campoDni.value} ya votó. Cada persona vota una sola vez.` : err.error);
      campoDni.focus();
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
      el('b', {}, c.partido),
      el('span', { class: 'quien' }, `${c.nombre} ${c.apellido}`),
      c.descripcion ? el('em', {}, c.descripcion) : null,
    )));
  }
  buscarPartido.value = '';
  document.getElementById('campo-buscar-partido').hidden = candidatos.length <= 8;
  filtrarPartidos();
  document.querySelector('header span').textContent = `Hola, ${votante.nombre}`;
  mostrar('votar');
}

const buscarPartido = document.getElementById('buscar-partido');
function filtrarPartidos() {
  const q = buscarPartido.value.trim().toLowerCase();
  let visibles = 0;
  lista.querySelectorAll('.partido').forEach((tarjeta, i) => {
    const c = candidatos[i];
    const ve = !q || `${c.partido} ${c.nombre} ${c.apellido}`.toLowerCase().includes(q);
    tarjeta.hidden = !ve;
    if (ve) visibles++;
  });
  document.getElementById('cuenta-partidos').textContent = q ? `${visibles} de ${candidatos.length} partidos` : `${candidatos.length} partidos`;
}
buscarPartido.addEventListener('input', filtrarPartidos);

lista.addEventListener('change', () => {
  const elegido = elegidoActual();
  botonVotar.disabled = !elegido;
  botonVotar.textContent = elegido ? `Votar por ${elegido.partido}` : 'Elija un partido para votar';
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
    texto: el('p', {}, 'Vas a votar por ', el('b', {}, elegido.partido), '. Después no se puede cambiar.'),
    si: 'Sí, votar', claseSi: 'btn-verde', no: 'Cancelar',
  });
  if (!si) return;
  try {
    await conCarga(botonVotar, 'Guardando voto…', () => pedir('/api/votar', { cuerpo: { ...votante, candidatoId: elegido.id } }));
    mostrar('gracias');
  } catch (err) {
    if (err.codigo === 'cerrada') return revisarEstado();
    errorEn('votar-error', err.message);
  }
});

function volverAlRegistro() {
  votante = null;
  form.reset();
  for (const c of [campoNombre, campoApellido, campoDni]) { mostrarMensaje(c, null); c.dispatchEvent(new Event('input')); }
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
  if (await seguroDeSalir('Todavía no votaste. Si sales, tendrás que registrarte otra vez para votar.')) volverAlRegistro();
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
    titulo.textContent = 'Empate: ' + ganadores.map(g => g.partido).join(' y ');
    detalle.textContent = `${formatoPorc(ganadores[0].porcentaje)} cada uno · ${votosTexto(r.total)} en total`;
  } else {
    const g = ganadores[0];
    titulo.textContent = `Ganó ${g.partido}`;
    detalle.textContent = `${g.nombre} ${g.apellido} · ${formatoPorc(g.porcentaje)} de ${votosTexto(r.total)}`;
  }
  const cuatro = partidos.slice(0, 4);
  const orden = [1, 0, 2, 3].map(i => cuatro[i]).filter(Boolean);
  const alturas = esCelular() ? { 1: 84, 2: 60, 3: 44, 4: 30 } : { 1: 140, 2: 100, 3: 72, 4: 48 };
  document.getElementById('final-podio').replaceChildren(...orden.map(p => el('div', { class: 'escalon' + (p.puesto === 1 && r.total ? ' e1' : '') },
    el('b', {}, p.partido),
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
