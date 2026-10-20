// Resultados en vivo: barras que crecen hasta su porcentaje, ordenadas de mayor a menor,
// con ▲▼ de cuánto cambió cada partido. Las usan el votante y el administrador.
const quieto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Un número que cuenta desde el valor que tenía hasta el nuevo.
function contarHasta(nodo, valor, formato) {
  const desde = Number(nodo.dataset.valor || 0);
  nodo.dataset.valor = valor;
  if (quieto() || desde === valor) { nodo.textContent = formato(valor); return; }
  const inicio = performance.now(), dura = 900;
  const paso = ahora => {
    const k = Math.min(1, (ahora - inicio) / dura), suave = 1 - Math.pow(1 - k, 3);
    nodo.textContent = formato(desde + (valor - desde) * suave);
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// partidos: [{ id, partido, nombre, apellido, votos, porcentaje }] ya ordenados por votos.
// antes: los mismos datos de la vez anterior (para mostrar ▲▼), o null.
function pintarBarrasVivo(caja, partidos, antes) {
  const previos = new Map((antes || []).map(p => [p.id, p.porcentaje]));
  const lider = partidos[0] && partidos[0].votos > 0 ? partidos[0].votos : -1;
  const quedan = new Set(partidos.map(p => String(p.id)));
  for (const fila of [...caja.children]) if (!quedan.has(fila.dataset.id)) fila.remove();
  for (const p of partidos) {
    let fila = caja.querySelector(`.barra-vivo[data-id="${p.id}"]`);
    if (!fila) {
      fila = el('div', { class: 'barra-vivo', 'data-id': p.id },
        el('div', { class: 'bv-arriba' },
          el('span', { class: 'bv-nom' }, el('span', { class: 'bv-texto' }), el('span', { class: 'bv-corona', hidden: true }, '👑 Va ganando')),
          el('span', { class: 'bv-num' }, el('span', { class: 'bv-cambio' }), el('b', { class: 'bv-porc' }, '0%'))),
        el('div', { class: 'bv-riel' }, el('div', { class: 'bv-lleno', style: `background:${colorDe(p.id)}` })),
        el('small', { class: 'bv-votos' }));
    }
    caja.append(fila);   // deja las filas en el orden nuevo
    fila.querySelector('.bv-texto').textContent = nombreDe(p);
    fila.querySelector('.bv-texto').title = nombreDe(p);
    fila.querySelector('.bv-corona').hidden = p.votos !== lider;
    fila.querySelector('.bv-votos').textContent = votosTexto(p.votos);
    contarHasta(fila.querySelector('.bv-porc'), p.porcentaje, n => formatoPorc(Math.round(n * 10) / 10));
    const lleno = fila.querySelector('.bv-lleno');
    requestAnimationFrame(() => { lleno.style.width = p.porcentaje + '%'; });
    const cambio = fila.querySelector('.bv-cambio');
    const antesP = previos.get(p.id);
    if (antesP !== undefined && Math.abs(p.porcentaje - antesP) >= 0.1) {
      const d = Math.round((p.porcentaje - antesP) * 10) / 10;
      cambio.textContent = (d > 0 ? '▲ ' : '▼ ') + formatoPorc(Math.abs(d)).replace('%', '');
      cambio.className = 'bv-cambio ver ' + (d > 0 ? 'sube' : 'baja');
      clearTimeout(cambio._espera);
      cambio._espera = setTimeout(() => cambio.classList.remove('ver'), 4000);
      lleno.classList.remove('brilla'); void lleno.offsetWidth; lleno.classList.add('brilla');
    }
  }
}

// Cuadro completo para el votante: título, barras, anillo que cuenta el minuto y botón «Actualizar».
function montarEnVivo(contenedor) {
  const SEGUNDOS = 60;
  const total = el('span', {}, '…');
  const barras = el('div', { class: 'barras-vivo', 'aria-live': 'polite' });
  const aviso = el('p', { class: 'vacio', hidden: true });
  const verTodos = el('button', { type: 'button', class: 'enlace', hidden: true });
  const cuenta = el('b', {}, SEGUNDOS + ' s');
  const arco = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arco.setAttribute('viewBox', '0 0 40 40');
  arco.setAttribute('class', 'anillo');
  arco.setAttribute('aria-hidden', 'true');
  arco.innerHTML = '<circle class="anillo-fondo" cx="20" cy="20" r="16"/><circle class="anillo-paso" cx="20" cy="20" r="16" stroke-dasharray="100.5" stroke-dashoffset="0"/>';
  const boton = el('button', { type: 'button', class: 'btn btn-pri btn-chico btn-actualizar' }, el('span', { class: 'giro', 'aria-hidden': 'true' }, '↻'), ' Actualizar');
  const pie = el('div', { class: 'vivo-pie' }, el('div', { class: 'vivo-cuenta' }, arco, el('span', {}, 'Se actualiza en ', cuenta)), boton);
  contenedor.replaceChildren(el('section', { class: 'seccion tarjeta-vivo' },
    el('div', { class: 'vivo-cab' }, el('h2', {}, '📊 Así van, en vivo'), el('span', { class: 'vivo' }, 'EN VIVO · ', total)),
    el('div', { class: 'sec-cuerpo' }, aviso, barras, verTodos, pie)));

  let ultimos = [], todos = false, quedan = SEGUNDOS, reloj = null, pidiendo = false;
  const primeros = () => (esCelular() ? 4 : 10);
  function dibujar(antes = null) {
    pintarBarrasVivo(barras, todos ? ultimos : ultimos.slice(0, primeros()), antes);
    verTodos.hidden = ultimos.length <= primeros();
    verTodos.textContent = todos ? `Ver solo los ${primeros()} primeros ▴` : `Ver los ${ultimos.length} partidos ▾`;
  }
  verTodos.addEventListener('click', () => { todos = !todos; dibujar(); });

  async function actualizar() {
    if (pidiendo) return;
    pidiendo = true;
    boton.classList.add('girando');
    try {
      const r = await pedir('/api/en-vivo');
      aviso.hidden = true; barras.hidden = false; pie.hidden = false;
      const previos = ultimos;
      ultimos = r.partidos;
      contarHasta(total, r.total, n => votosTexto(Math.round(n)));
      if (!ultimos.length) { aviso.textContent = 'Todavía no hay partidos inscritos.'; aviso.hidden = false; }
      dibujar(previos.length ? previos : null);
    } catch (err) {
      if (err.codigo === 'oculto') { barras.hidden = true; verTodos.hidden = true; pie.hidden = true; total.textContent = '—'; }
      aviso.textContent = err.message; aviso.hidden = false;
    } finally {
      pidiendo = false;
      quedan = SEGUNDOS;
      setTimeout(() => boton.classList.remove('girando'), 500);
      pintarCuenta();
    }
  }
  function pintarCuenta() {
    cuenta.textContent = quedan + ' s';
    arco.querySelector('.anillo-paso').style.strokeDashoffset = 100.5 * (1 - quedan / SEGUNDOS);
  }
  boton.addEventListener('click', actualizar);
  // Solo cuenta y pide mientras el cuadro se ve y la pestaña del navegador está abierta.
  const seVe = () => contenedor.offsetParent !== null && document.visibilityState === 'visible';
  function empezar() {
    if (reloj) return;
    actualizar();
    reloj = setInterval(() => {
      if (!seVe()) return;
      quedan--;
      if (quedan <= 0) actualizar(); else pintarCuenta();
    }, 1000);
  }
  function detener() { clearInterval(reloj); reloj = null; }
  document.addEventListener('visibilitychange', () => { if (reloj && seVe() && quedan < SEGUNDOS - 5) actualizar(); });
  return { empezar, detener, actualizar };
}
