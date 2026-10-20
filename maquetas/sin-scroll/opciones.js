// Tres formas de que ninguna pantalla de Votaciones necesite scroll en el celular.
// Se ponen encima de la página real (solo en pantallas de hasta 640 px) para sacar las fotos de la maqueta.
(() => {
  const op = window.__OPCION_SIN_SCROLL;
  if (!op || op === 'hoy') return;
  const COMUN = `
  .cuerpo,.contenido{padding:10px 12px 12px}
  .titulo-pant,.fila-tit h1{font-size:20px !important;margin-bottom:2px}
  .bajada{font-size:12.5px;margin:0 0 8px;line-height:1.35}
  .seccion{margin-bottom:10px}
  .sec-tit{padding:9px 12px 0;font-size:11.5px}
  .sec-cuerpo{padding:8px 12px 10px}
  .campo{margin-bottom:7px}
  .campo label{font-size:12.5px;margin-bottom:3px}
  .input{padding:8px 10px;font-size:15px}
  .btn{min-height:42px;padding:8px 12px;font-size:15px}
  .btn-chico{min-height:32px;padding:5px 10px;font-size:12.5px}
  .enlace{margin-top:8px;font-size:13.5px}
  .caja-error{padding:8px 10px;font-size:13px;margin-bottom:8px}
  .aviso-mal,.msg-bien{font-size:12px !important;margin-top:2px !important}
  .tabs-ingreso button{padding:7px 6px;font-size:13px}
  .ingreso-dos{gap:10px}
  /* «¡Gracias por votar!» en una franja */
  #vista-gracias .s-res .sec-cuerpo{display:grid;grid-template-columns:auto 1fr;column-gap:12px;align-items:center;text-align:left;padding:10px 12px}#vista-gracias .s-res .grande{grid-row:1/3}
  #vista-gracias .grande{font-size:30px}
  #vista-gracias .s-res h1{font-size:17px !important;margin:0 !important}
  #vista-gracias .s-res p{font-size:12.5px !important}
  /* Barras: nombre, votos y % en una línea y barra fina */
  .barra-vivo{display:grid;grid-template-columns:minmax(0,1fr) auto auto;column-gap:8px;row-gap:3px;align-items:baseline}
  .barra-vivo .bv-arriba{display:contents}
  .bv-nom{grid-column:1;grid-row:1;font-size:13px;font-weight:700}
  .bv-votos{grid-column:2;grid-row:1;margin:0 !important;font-size:11px}
  .bv-num{grid-column:3;grid-row:1;font-size:13px}
  .bv-riel{grid-column:1/-1;grid-row:2;height:8px}
  .barras-vivo,#barras-general{gap:8px}
  .vivo-cab{padding:10px 12px 0}.vivo-cab h2{font-size:15px}
  .vivo-pie{margin-top:8px;padding-top:8px}
  .tarjeta-vivo{margin:8px 0}
  /* Partidos para votar */
  .partidos{gap:6px}
  .partido{padding:7px 10px}
  .partido .logo{width:34px;height:34px;font-size:13px}
  .partido b{font-size:14px}.partido .quien{font-size:11.5px;margin-top:0}
  .votar-fijo{padding:6px 0 8px}
  /* Administrador */
  .menu{padding:6px}.menu button{padding:4px 2px;font-size:11.5px}.menu button i{width:22px;height:22px;font-size:12px}
  .fila-tit{margin-bottom:6px}
  .acciones-vivo{gap:6px}.acciones-vivo .hace{font-size:11px}
  .porc-grande{font-size:30px}
  .puesto{padding:6px 4px}.puesto .n{font-size:16px}
  /* Final */
  .fin .sello{font-size:13px;margin-bottom:4px}.fin h1{font-size:21px}
  .podio{margin:10px 0}.escalon b{font-size:11.5px;margin-bottom:2px}.escalon small{font-size:11px}`;

  const CSS = {
    // A: todo igual, pero más apretado
    a: COMUN,
    // B: tamaños de hoy; lo largo va en una caja con su propio scroll y los botones quedan a la vista
    b: `#vista-gracias .s-res .sec-cuerpo{display:grid;grid-template-columns:auto 1fr;column-gap:12px;align-items:center;text-align:left;padding:10px 12px}#vista-gracias .s-res .grande{grid-row:1/3}
      #vista-gracias .grande{font-size:30px}#vista-gracias .s-res h1{font-size:17px !important;margin:0 !important}
      .caja-propia{overflow-y:auto !important;overscroll-behavior:contain;border-radius:10px;box-shadow:inset 0 -14px 12px -12px rgba(14,27,61,.25)}`,
    // C: lo justo a la vista y el resto en «Ver más»
    c: COMUN + `
      .bajada{display:none}
      #res-general .s-res{display:none}
      #vista-registro .enlace{display:none}
      .barras-vivo:not(.todos) .barra-vivo:nth-child(n+5){display:none}
      .ver-mas-maqueta{display:block;margin:6px auto 0;border:0;background:none;color:var(--marca);font:inherit;font-weight:700;font-size:13px;text-decoration:underline}
      .msg-bien{display:none !important}
      #registro-error{display:none !important}
      .contenido .fila-tit .hace{display:none}`,
  };
  const estilo = document.createElement('style');
  estilo.textContent = `@media (max-width:640px){${CSS[op]}}`;

  function cabeEnPantalla() {
    if (innerWidth > 640) return;
    const sobra = () => document.documentElement.scrollHeight - innerHeight;
    if (op === 'b') {
      // La caja más alta que se ve recibe su propio scroll, justo para que la página quepa.
      document.querySelectorAll('.caja-propia').forEach(c => { c.classList.remove('caja-propia'); c.style.maxHeight = ''; });
      if (sobra() <= 0) return;
      const cajas = [...document.querySelectorAll('.barras-vivo, #barras-general, #lista-partidos, .tabla-caja, #lista-padron, main .sec-cuerpo, .contenido .sec-cuerpo')]
        .filter(c => c.offsetParent && !c.closest('[hidden]'))
        .sort((x, y) => y.getBoundingClientRect().height - x.getBoundingClientRect().height);
      const c = cajas[0];
      if (!c) return;
      const alto = c.getBoundingClientRect().height - sobra() - 2;
      c.classList.add('caja-propia');
      c.style.maxHeight = Math.max(120, alto) + 'px';
    }
    if (op === 'a' || op === 'c') {
      // La lista de quiénes votaron y la de participantes muestran solo las filas que caben.
      for (const sel of ['#tabla-votantes tr', '#lista-padron .fila-padron']) {
        const filas = [...document.querySelectorAll(sel)].filter(f => !f.closest('[hidden]'));
        filas.forEach(f => (f.style.display = ''));
        for (let i = filas.length - 1; i > 2 && sobra() > 0; i--) filas[i].style.display = 'none';
      }
    }
    if (op === 'c') {
      document.querySelectorAll('.barras-vivo').forEach(caja => {
        if (caja.nextElementSibling?.classList.contains('ver-mas-maqueta') || caja.children.length <= 4) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ver-mas-maqueta'; b.textContent = `Ver los ${caja.children.length} partidos ▾`;
        b.addEventListener('click', () => { const t = caja.classList.toggle('todos'); b.textContent = t ? 'Ver solo los 4 primeros ▴' : `Ver los ${caja.children.length} partidos ▾`; });
        caja.after(b);
      });
    }
  }
  document.addEventListener('DOMContentLoaded', () => { document.head.append(estilo); setInterval(cabeEnPantalla, 400); });
})();
