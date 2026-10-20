const COLORES = ['#1d3a8a', '#c8102e', '#e39b00', '#1f8a4c', '#6b4fbb', '#0f7c8c', '#b5487a', '#5b6b2e'];

function colorDe(id) {
  return COLORES[(Number(id) - 1) % COLORES.length];
}

async function pedir(url, opciones = {}) {
  const config = { headers: {}, credentials: 'same-origin', ...opciones };
  if (opciones.cuerpo !== undefined) {
    config.method = config.method || 'POST';
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(opciones.cuerpo);
  }
  let r;
  try {
    r = await fetch(url, config);
  } catch {
    throw Object.assign(new Error('Sin conexión. Revise su internet e intente de nuevo.'), { estado: 0 });
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Ocurrió un problema.'), { estado: r.status, ...datos });
  return datos;
}

function el(etiqueta, atributos = {}, ...hijos) {
  const n = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h);
  return n;
}

function iniciales(partido) {
  const palabras = partido.replace(/<[^>]*>/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const letras = palabras.filter(p => p.length > 2 || /^\p{Lu}/u.test(p)).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  return letras || (palabras[0] || '?')[0].toUpperCase();
}

// Nombre que se muestra: el del partido o, si no tiene, el de la persona.
function nombreDe(c) {
  return c.partido || `${c.nombre} ${c.apellido}`;
}

function logoDe(c) {
  const caja = el('div', { class: 'logo', style: `background:${colorDe(c.id)}`, 'aria-hidden': 'true' });
  if (c.logo) caja.append(el('img', { src: c.logo, alt: '' }));
  else caja.textContent = iniciales(nombreDe(c));
  return caja;
}

function dibujarBarras(contenedor, filas) {
  contenedor.replaceChildren(...filas.map(f => el('div', { class: 'bar' },
    el('span', { class: 'nom', title: f.nombre }, f.nombre),
    el('div', { class: 'riel' }, el('div', { class: 'lleno', style: `width:${f.ancho}%;background:${f.color}` })),
    el('span', { class: 'num' }, f.texto),
  )));
}

function barrasDePartidos(contenedor, partidos) {
  dibujarBarras(contenedor, partidos.map(p => ({
    nombre: nombreDe(p), ancho: p.porcentaje, color: colorDe(p.id), texto: formatoPorc(p.porcentaje),
  })));
}

function formatoPorc(n) {
  return (Number.isInteger(n) ? n : n.toFixed(1)).toString().replace('.', ',') + '%';
}

function votosTexto(n) {
  return n === 1 ? '1 voto' : `${n} votos`;
}

// Puestos con empates: dos partidos con los mismos votos comparten número.
function conPuestos(partidos) {
  let puesto = 0, anterior = null;
  return partidos.map((p, i) => {
    if (p.votos !== anterior) { puesto = i + 1; anterior = p.votos; }
    return { ...p, puesto };
  });
}

function dibujarPuestos(contenedor, partidos) {
  contenedor.replaceChildren(...conPuestos(partidos).map(p => el('div', { class: 'puesto' + (p.puesto === 1 && p.votos > 0 ? ' p1' : '') },
    el('div', { class: 'n' }, `${p.puesto}.º`),
    el('b', {}, nombreDe(p)),
    el('small', {}, votosTexto(p.votos)),
  )));
}

// Contador de letras debajo de un campo.
// Va al lado del título del cuadro (opción C1).
function conectarContador(input, min, max, opcional = false) {
  const campo = input.closest('.campo');
  campo.querySelector('span.contador')?.remove();
  const contador = campo.querySelector('label small');
  const actualizar = () => {
    // El teléfono cambia de largo según el país elegido.
    if (input.reglaTel) ({ min, max } = input.reglaTel);
    const n = [...input.value.replace(/\s+/g, ' ').trim()].length;
    const bien = n >= min && n <= max;
    if (opcional && n === 0) contador.textContent = `opcional · ${min} a ${max}`;
    else if (bien) contador.textContent = `${n}/${max} ✓`;
    else contador.textContent = min === max ? `${n}/${max}` : `mín. ${min} · ${n}/${max}`;
    contador.className = 'contador' + (bien ? ' ok' : (n > max ? ' mal' : ''));
    if (opcional && n === 0) contador.className = 'contador';
  };
  input.addEventListener('input', actualizar);
  actualizar();
  return actualizar;
}

/* Avisos de error debajo de cada cuadro (opción E1) */
const LETRA_VALIDA = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/;

function plural(n, uno, varios) {
  return n === 1 ? `1 ${uno}` : `${n} ${varios}`;
}

function textoLimpio(input) {
  return input.value.replace(/\s+/g, ' ').trim();
}

// regla: { input, min, max, tipo: 'letras' | 'numeros' | 'texto', opcional, exacto, empiezaCon }
function mensajeDe(regla) {
  const v = textoLimpio(regla.input);
  const n = [...v].length;
  const unidad = regla.tipo === 'numeros' ? ['número', 'números'] : regla.tipo === 'letras' ? ['letra', 'letras'] : ['carácter', 'caracteres'];
  if (!n) return regla.opcional ? null : `Este dato es obligatorio. Escriba ${regla.exacto ? '' : 'mínimo '}${plural(regla.min, unidad[0], unidad[1])}.`;
  if (regla.tipo === 'letras') {
    const malos = [...new Set([...v].filter(ch => !LETRA_VALIDA.test(ch)))];
    if (malos.length) {
      const hayNumero = malos.some(ch => /\d/.test(ch));
      return `Aquí solo van letras. Quite ${hayNumero ? (malos.length > 1 ? 'los números o signos' : 'el número') : (malos.length > 1 ? 'los signos' : 'el signo')} ${malos.map(ch => `«${ch}»`).join(' ')}.`;
    }
  }
  if (n < regla.min) {
    const faltan = regla.min - n;
    const verbo = faltan === 1 ? 'Falta' : 'Faltan';
    if (regla.exacto) return `${verbo} ${plural(faltan, unidad[0], unidad[1])}. Debe tener ${regla.min}, ahora tiene ${n}.`;
    return `${verbo} ${plural(faltan, unidad[0], unidad[1])}. Mínimo ${regla.min}, ahora tiene ${n}.`;
  }
  if (n > regla.max) return `Sobran ${plural(n - regla.max, unidad[0], unidad[1])}. Máximo ${regla.max}.`;
  if (regla.empiezaCon && !v.startsWith(regla.empiezaCon)) return `El celular debe empezar con ${regla.empiezaCon}.`;
  return null;
}

function cajaMensaje(input) {
  const campo = input.closest('.campo');
  let caja = campo.querySelector('.msg-error');
  if (!caja) {
    caja = el('div', { class: 'msg-error', id: input.id + '-error', role: 'alert', hidden: true });
    campo.append(caja);
    input.setAttribute('aria-describedby', caja.id);
  }
  return caja;
}

function mostrarMensaje(input, texto) {
  const caja = cajaMensaje(input);
  caja.textContent = texto ? '⚠ ' + texto : '';
  caja.hidden = !texto;
  input.classList.toggle('mal', !!texto);
  input.setAttribute('aria-invalid', texto ? 'true' : 'false');
}

// Aviso verde debajo de un cuadro que está bien escrito.
function mostrarCorrecto(input, texto) {
  const campo = input.closest('.campo');
  let caja = campo.querySelector('.msg-bien');
  if (!caja) {
    caja = el('div', { class: 'msg-bien', hidden: true });
    campo.append(caja);
  }
  caja.textContent = texto ? '✓ ' + texto : '';
  caja.hidden = !texto;
  input.classList.toggle('bien', !!texto);
  if (texto) mostrarMensaje(input, null);
}

function conectarValidacion(reglas) {
  for (const r of reglas) {
    r.input.addEventListener('beforeinput', e => {
      // Tecla suelta que no es número: no se escribe. Si pega un texto mezclado, se limpia en 'input'.
      if (r.tipo === 'numeros' && e.data && !/\d/.test(e.data)) {
        e.preventDefault();
        mostrarMensaje(r.input, 'Aquí solo van números. Las letras y signos no se escriben.');
      }
    });
    r.input.addEventListener('input', () => {
      if (r.tipo === 'numeros') {
        const antes = r.input.value;
        r.input.value = antes.replace(/\D/g, '').slice(0, r.max);
        if (/\D/.test(antes)) return mostrarMensaje(r.input, 'Aquí solo van números. Se quitaron las letras y signos.');
      }
      const m = mensajeDe(r);
      const malCaracter = m && m.startsWith('Aquí solo');
      // Mientras escribe solo avisa si ya había error o si puso un carácter que no va.
      if (r.input.classList.contains('mal') || malCaracter) mostrarMensaje(r.input, m);
    });
    r.input.addEventListener('blur', () => {
      if (textoLimpio(r.input)) mostrarMensaje(r.input, mensajeDe(r));
    });
  }
  return function revisarTodo() {
    let primero = null;
    for (const r of reglas) {
      const m = mensajeDe(r);
      mostrarMensaje(r.input, m);
      if (m && !primero) primero = r.input;
    }
    primero?.focus();
    return !primero;
  };
}

function preguntar({ titulo, texto, si, claseSi = 'btn-pri', no = 'Volver' }) {
  return new Promise(resolver => {
    const anterior = document.activeElement;
    const botonNo = el('button', { class: 'btn btn-sec', type: 'button' }, no);
    const botonSi = el('button', { class: `btn ${claseSi}`, type: 'button' }, si);
    const fondo = el('div', { class: 'modal-fondo' },
      el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-titulo' },
        el('h3', { id: 'modal-titulo' }, titulo), texto,
        el('div', { class: 'fila-botones' }, botonNo, botonSi)));
    const cerrar = valor => {
      fondo.remove();
      document.removeEventListener('keydown', tecla);
      anterior?.focus?.();
      resolver(valor);
    };
    const tecla = e => { if (e.key === 'Escape') cerrar(false); };
    botonNo.onclick = () => cerrar(false);
    botonSi.onclick = () => cerrar(true);
    fondo.addEventListener('click', e => { if (e.target === fondo) cerrar(false); });
    document.addEventListener('keydown', tecla);
    document.body.append(fondo);
    botonSi.focus();
  });
}

async function conCarga(boton, textoCarga, tarea) {
  const texto = boton.textContent;
  boton.classList.add('cargando');
  boton.disabled = true;
  boton.textContent = textoCarga;
  try {
    return await tarea();
  } finally {
    boton.classList.remove('cargando');
    boton.disabled = false;
    boton.textContent = texto;
  }
}

const esCelular = () => window.matchMedia('(max-width: 640px)').matches;
/* Teléfono con bandera y código de país (opción A): Perú viene elegido. */
const sinTildes = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function campoTelefonoConPais(input) {
  // La regla se actualiza al cambiar de país; la usan los avisos y el contador.
  const regla = { input, tipo: 'numeros', min: 9, max: 9, exacto: true, empiezaCon: '9' };
  input.reglaTel = regla;
  const fila = el('div', { class: 'tel-fila' });
  input.before(fila);
  const boton = el('button', { type: 'button', class: 'tel-pais', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  fila.append(boton, input);
  const buscar = el('input', { class: 'tel-buscar', type: 'search', placeholder: '🔍 Buscar país', 'aria-label': 'Buscar país', autocomplete: 'off' });
  const opciones = el('div', { class: 'tel-opciones', role: 'listbox', 'aria-label': 'Países' });
  const lista = el('div', { class: 'tel-lista', hidden: true }, buscar, opciones);
  fila.after(lista);
  let pais = PAISES[0];
  const bandera = p => el('img', { class: 'tel-bandera', src: `banderas/${p.iso}.png`, alt: '', width: '26', height: '18' });

  function cerrar() { lista.hidden = true; boton.setAttribute('aria-expanded', 'false'); }
  function elegir(p, enfocar) {
    pais = p;
    Object.assign(regla, reglaPais(p));
    boton.replaceChildren(bandera(p), el('span', {}, '+' + p.codigo));
    boton.setAttribute('aria-label', `País: ${p.nombre}, +${p.codigo}. Tocar para cambiar`);
    boton.title = p.nombre;
    input.maxLength = regla.max;
    input.placeholder = p.iso === 'pe' ? 'Ej.: 987654321' : `De ${regla.min} a ${regla.max} números`;
    input.value = input.value.replace(/\D/g, '').slice(0, regla.max);
    cerrar();
    input.dispatchEvent(new Event('input'));
    if (enfocar) input.focus();
  }
  function pintar() {
    const q = sinTildes(buscar.value).replace(/^\+/, '');
    const vistos = PAISES.filter(p => !q || sinTildes(p.nombre).includes(q) || p.codigo.startsWith(q));
    opciones.replaceChildren(...(vistos.length ? vistos.map(p => el('button', {
      type: 'button', class: 'tel-opcion' + (p === pais ? ' sel' : ''), role: 'option', 'aria-selected': String(p === pais),
      onclick: () => elegir(p, true),
    }, bandera(p), el('span', {}, p.nombre), el('b', {}, '+' + p.codigo))) : [el('p', { class: 'tel-nada' }, 'No hay ningún país con ese nombre.')]));
  }
  boton.addEventListener('click', () => {
    if (!lista.hidden) return cerrar();
    lista.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    buscar.value = '';
    pintar();
    if (!esCelular()) buscar.focus();
  });
  buscar.addEventListener('input', pintar);
  buscar.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cerrar(); boton.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); opciones.querySelector('.tel-opcion')?.click(); }
  });
  lista.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrar(); boton.focus(); } });
  document.addEventListener('click', e => { if (!lista.hidden && !lista.contains(e.target) && !boton.contains(e.target)) cerrar(); });
  elegir(PAISES[0]);
  input.telefono = {
    // «+51987654321», como lo guarda el servidor.
    valor: () => '+' + pais.codigo + input.value.replace(/\D/g, ''),
    poner(texto) {
      const t = separarTelefono(texto);
      elegir(t ? t.pais : PAISES[0]);
      input.value = t ? t.numero : '';
      input.dispatchEvent(new Event('input'));
    },
    desactivar(si) { input.disabled = si; boton.disabled = si; if (si) cerrar(); },
    reiniciar() { input.value = ''; elegir(PAISES[0]); },
  };
  return regla;
}

/* ---------- PC: cada pantalla llena el espacio, sin huecos ni scroll ---------- */
// En pantallas de más de 640 px la vista visible se agranda (o se achica un poco) para ocupar
// el alto disponible. Se mide sin el ajuste y luego se pone, todo en el mismo cuadro: no parpadea.
function ajustarAPantalla(nodo, { min = 0.82, max = 1.9, anchoUtil = 0.94, ancho = null, centrar = true } = {}) {
  if (!nodo) return;
  if (window.innerWidth <= 640 || nodo.offsetParent === null) { nodo.style.zoom = ''; nodo.style.paddingTop = ''; return; }
  const antes = nodo.style.zoom + '|' + nodo.style.paddingTop;
  nodo.style.zoom = ''; nodo.style.paddingTop = '';
  const caja = nodo.getBoundingClientRect();
  const disponible = window.innerHeight - (caja.top + window.scrollY) - 8;
  const anchoContenido = ancho ? ancho(nodo) : caja.width;
  const alto = Math.max(1, nodo.scrollHeight);
  let z = Math.min(max, disponible / alto, (window.innerWidth * anchoUtil) / Math.max(1, anchoContenido));
  z = Math.max(min, z);
  if (Math.abs(z - 1) < 0.03) z = 1;
  nodo.style.zoom = z === 1 ? '' : z.toFixed(3);
  // Si aún sobra alto (pantalla muy grande y poco contenido), queda centrado de arriba a abajo.
  const sobra = disponible - alto * z;
  if (centrar && sobra > 24) nodo.style.paddingTop = `calc(${parseFloat(getComputedStyle(nodo).paddingTop) || 0}px + ${(sobra / 2 / z).toFixed(1)}px)`;
  if (antes !== nodo.style.zoom + '|' + nodo.style.paddingTop) window.dispatchEvent(new Event('ajuste-pantalla'));
}
