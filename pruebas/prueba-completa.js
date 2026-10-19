// Prueba del servidor con datos de prueba en una carpeta temporal (no toca datos reales).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PUERTO = 3471;
const BASE = `http://localhost:${PUERTO}`;
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'votaciones-prueba-'));
let bien = 0, mal = 0, cookie = '';

function revisar(condicion, texto) {
  if (condicion) { bien++; console.log('  OK  ', texto); }
  else { mal++; console.log('  FALLA', texto); }
}

async function api(ruta, { metodo = 'GET', cuerpo, admin = false } = {}) {
  const r = await fetch(BASE + ruta, {
    method: cuerpo && metodo === 'GET' ? 'POST' : metodo,
    headers: { 'Content-Type': 'application/json', ...(admin && cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const galleta = r.headers.get('set-cookie');
  if (galleta) cookie = galleta.split(';')[0];
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
}

const telefono = n => '+51' + (900000000 + n);
const votante = n => ({ nombre: 'Votante Prueba', apellido: 'Apellido Numero', telefono: telefono(n) });

async function principal() {
  console.log('Votaciones · prueba completa');

  // Votante no ve resultados antes de publicar
  revisar((await api('/api/resultados')).estado === 403, 'resultados ocultos antes de publicar');
  revisar((await api('/api/admin/resultados')).estado === 401, 'panel admin sin sesión responde 401');

  // Admin
  revisar((await api('/api/admin/ingresar', { cuerpo: { nombre: 'Administrador', clave: 'mala' } })).estado === 401, 'contraseña mala rechazada');
  revisar((await api('/api/admin/ingresar', { cuerpo: { nombre: 'Administrador General', clave: '1234' } })).estado === 200, 'admin entra con 1234');

  // Lista de participantes (quiénes pueden votar)
  revisar((await api('/api/admin/padron', { cuerpo: votante(1) })).estado === 401, 'agregar participante sin sesión rechazado');
  revisar((await api('/api/ingresar', { cuerpo: votante(1) })).datos.codigo === 'no_registrado', 'Teléfono que no está en la lista: no está registrado');
  revisar((await api('/api/votar', { cuerpo: { ...votante(1), candidatoId: 1 } })).estado === 404, 'quien no está en la lista no puede votar');
  revisar((await api('/api/admin/padron', { cuerpo: { ...votante(1), nombre: 'Lu' }, admin: true })).estado === 400, 'participante con nombre de 2 letras rechazado');
  revisar((await api('/api/admin/padron', { cuerpo: { ...votante(1), apellido: 'x'.repeat(81) }, admin: true })).estado === 400, 'participante con apellido de 81 letras rechazado');
  revisar((await api('/api/admin/padron', { cuerpo: { ...votante(1), telefono: '1234' }, admin: true })).estado === 400, 'participante con teléfono de 4 números rechazado');
  revisar((await api('/api/admin/padron', { cuerpo: { ...votante(1), telefono: '812345678' }, admin: true })).estado === 400, 'teléfono que no empieza con 9 rechazado');
  const argentino = await api('/api/admin/padron', { cuerpo: { nombre: 'Lucía', apellido: 'Gómez', telefono: '+54 911 2345 6789' }, admin: true });
  revisar(argentino.estado === 200 && argentino.datos.telefono === '+5491123456789', 'acepta un teléfono de Argentina (+54) y lo guarda sin espacios');
  revisar((await api('/api/admin/padron', { cuerpo: { nombre: 'Lucía', apellido: 'Gómez', telefono: '+999123456' }, admin: true })).estado === 400, 'código de país desconocido rechazado');
  revisar((await api('/api/admin/padron', { cuerpo: { nombre: 'Lucía', apellido: 'Gómez', telefono: '+5412' }, admin: true })).estado === 400, 'teléfono de otro país muy corto rechazado');
  revisar((await api('/api/ingresar', { cuerpo: { nombre: 'Lucía', apellido: 'Gómez', telefono: '+51911234567' } })).datos.codigo === 'no_registrado', 'mismo número con otro país (+51) no entra');
  revisar((await api('/api/ingresar', { cuerpo: { nombre: 'Lucía', apellido: 'Gómez', telefono: '+5491123456789' } })).estado === 200, 'con el mismo país y número sí entra');
  revisar((await api('/api/admin/padron/' + encodeURIComponent('+5491123456789'), { metodo: 'DELETE', admin: true })).estado === 200, 'quita al participante de Argentina');
  const numeros = [...Array.from({ length: 90 }, (_, i) => i + 1), 500, 900];
  const agregados = [];
  for (const n of numeros) agregados.push(await api('/api/admin/padron', { cuerpo: votante(n), admin: true }));
  revisar(agregados.every(a => a.estado === 200), `agrega ${numeros.length} participantes`);
  revisar((await api('/api/admin/padron', { cuerpo: votante(1), admin: true })).datos.codigo === 'telefono_en_lista', 'teléfono repetido en la lista rechazado');
  const largo = { nombre: 'María de los Ángeles ' + 'a'.repeat(55), apellido: 'Fernández', telefono: '930000001' };
  revisar((await api('/api/admin/padron', { cuerpo: largo, admin: true })).estado === 200, 'acepta un nombre de 76 letras');
  const pag = (await api('/api/admin/padron?pagina=2&por=5', { admin: true })).datos;
  revisar(pag.conteo.todos === 93 && pag.filas.length === 5 && pag.paginas === 19, `lista en páginas de 5 (${pag.conteo.todos} personas, ${pag.paginas} páginas)`);
  revisar((await api('/api/admin/padron?buscar=angeles', { admin: true })).datos.total === 1, 'buscar sin tilde encuentra «Ángeles»');
  revisar((await api('/api/admin/padron/930000001', { metodo: 'PUT', cuerpo: { ...largo, nombre: 'Ma' }, admin: true })).estado === 400, 'editar participante: nombre de 2 letras rechazado');
  revisar((await api('/api/admin/padron/930000001', { metodo: 'PUT', cuerpo: { ...largo, apellido: 'y'.repeat(81) }, admin: true })).estado === 400, 'editar participante: apellido de 81 letras rechazado');
  revisar((await api('/api/admin/padron/930000001', { metodo: 'PUT', cuerpo: { ...largo, telefono: '123' }, admin: true })).estado === 400, 'editar participante: teléfono de 3 números rechazado');
  revisar((await api('/api/admin/padron/930000001', { metodo: 'PUT', cuerpo: { ...largo, telefono: telefono(2) }, admin: true })).datos.codigo === 'telefono_en_lista', 'editar participante: teléfono de otra persona rechazado');
  const editado = await api('/api/admin/padron/930000001', { metodo: 'PUT', cuerpo: { nombre: 'María', apellido: 'Fernández Ruiz', telefono: '930000002' }, admin: true });
  revisar(editado.estado === 200 && editado.datos.telefono === '+51930000002', 'editar participante: cambia nombre, apellido y teléfono');
  revisar((await api('/api/ingresar', { cuerpo: { nombre: 'maria', apellido: 'fernandez ruiz', telefono: '930000002' } })).estado === 200, 'con los datos editados puede ingresar');
  revisar((await api('/api/ingresar', { cuerpo: { nombre: 'María', apellido: 'Fernández Ruiz', telefono: '930000001' } })).datos.codigo === 'no_registrado', 'el teléfono anterior ya no está');

  // Validaciones al inscribir
  const base = { nombre: 'Rosa Elena', apellido: 'Paredes Salas', partido: 'Renovación Verde' };
  revisar((await api('/api/admin/candidatos', { cuerpo: { ...base, nombre: 'Rosa' }, admin: true })).estado === 400, 'nombre de 4 letras rechazado');
  revisar((await api('/api/admin/candidatos', { cuerpo: { ...base, partido: 'Corto' }, admin: true })).estado === 400, 'partido de 5 letras rechazado');
  revisar((await api('/api/admin/candidatos', { cuerpo: { ...base, partido: 'x'.repeat(41) }, admin: true })).estado === 400, 'partido de 41 letras rechazado');
  revisar((await api('/api/admin/candidatos', { cuerpo: { ...base, descripcion: 'corta' }, admin: true })).estado === 400, 'descripción de 5 letras rechazada');
  revisar((await api('/api/admin/candidatos', { cuerpo: { ...base, logo: 'data:text/html;base64,AAAA' }, admin: true })).estado === 400, 'logo que no es imagen rechazado');

  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const a = await api('/api/admin/candidatos', { cuerpo: { ...base, descripcion: 'Por un distrito limpio', logo }, admin: true });
  revisar(a.estado === 200 && a.datos.id, 'inscribe Renovación Verde con logo y descripción');
  const b = await api('/api/admin/candidatos', { cuerpo: { nombre: 'Juan Carlos', apellido: 'Mendoza Ruiz', partido: 'Partido Sol Naciente' }, admin: true });
  const c = await api('/api/admin/candidatos', { cuerpo: { nombre: 'Luis Alberto', apellido: 'Torres Vega', partido: 'Unidad del Pueblo' }, admin: true });
  const d = await api('/api/admin/candidatos', { cuerpo: { nombre: 'Carmen Lucía', apellido: 'Rojas Flores', partido: 'Fuerza Andina Unida' }, admin: true });
  revisar(b.estado === 200 && c.estado === 200 && d.estado === 200, 'inscribe 3 partidos más sin logo');
  const sinPartido1 = await api('/api/admin/candidatos', { cuerpo: { nombre: 'Andrea Sofía', apellido: 'Quispe Mamani' }, admin: true });
  const sinPartido2 = await api('/api/admin/candidatos', { cuerpo: { nombre: 'Miguel Ángel', apellido: 'Huamán Torres', partido: '', descripcion: '' }, admin: true });
  revisar(sinPartido1.estado === 200 && sinPartido1.datos.partido === null && sinPartido2.estado === 200, 'inscribe sin nombre de partido, descripción ni foto (dos a la vez)');
  revisar((await api(`/api/admin/candidatos/${sinPartido1.datos.id}`, { metodo: 'DELETE', admin: true })).estado === 200
    && (await api(`/api/admin/candidatos/${sinPartido2.datos.id}`, { metodo: 'DELETE', admin: true })).estado === 200, 'quita a los inscritos sin partido');
  revisar((await api('/api/admin/candidatos', { cuerpo: { ...base, partido: 'renovación verde' }, admin: true })).estado === 409, 'partido repetido rechazado');
  const e = await api(`/api/admin/candidatos/${d.datos.id}`, { metodo: 'PUT', cuerpo: { nombre: 'Carmen Lucía', apellido: 'Rojas Flores', partido: 'Fuerza Andina Unida', descripcion: 'Agua para todos los pueblos' }, admin: true });
  revisar(e.estado === 200 && e.datos.descripcion === 'Agua para todos los pueblos', 'edita un participante');
  const editarPartido = cambio => api(`/api/admin/candidatos/${d.datos.id}`, { metodo: 'PUT', cuerpo: { nombre: 'Carmen Lucía', apellido: 'Rojas Flores', partido: 'Fuerza Andina Unida', ...cambio }, admin: true });
  revisar((await editarPartido({ nombre: 'Carmen' })).estado === 400, 'editar partido: nombre de 6 letras rechazado (mínimo 10)');
  revisar((await editarPartido({ apellido: 'x'.repeat(31) })).estado === 400, 'editar partido: apellido de 31 letras rechazado (máximo 30)');
  revisar((await editarPartido({ partido: 'Corto' })).estado === 400, 'editar partido: partido de 5 letras rechazado');
  revisar((await editarPartido({ partido: 'x'.repeat(41) })).estado === 400, 'editar partido: partido de 41 letras rechazado');
  revisar((await editarPartido({ descripcion: 'corta' })).estado === 400, 'editar partido: descripción de 5 letras rechazada');
  revisar((await editarPartido({ nombre: 'Carmen 123 Lucía' })).estado === 400, 'editar partido: nombre con números rechazado');

  // Registro del votante
  revisar((await api('/api/ingresar', { cuerpo: { ...votante(1), telefono: '123' } })).estado === 400, 'teléfono de 3 números rechazado');
  revisar((await api('/api/ingresar', { cuerpo: { ...votante(1), nombre: 'An' } })).estado === 400, 'nombre de votante de 2 letras rechazado');
  revisar((await api('/api/ingresar', { cuerpo: votante(1) })).estado === 200, 'votante de la lista ingresa');
  revisar((await api('/api/ingresar', { cuerpo: { nombre: 'VOTANTE PRUEBA', apellido: 'apellido número', telefono: telefono(1) } })).estado === 200, 'acepta mayúsculas, minúsculas y tilde de más');
  const malNombre = (await api('/api/ingresar', { cuerpo: { ...votante(1), nombre: 'Votante Pruebo' } })).datos;
  revisar(malNombre.codigo === 'no_coincide' && malNombre.campos.nombre === false && malNombre.campos.apellido === true && malNombre.campos.telefono === true, 'nombre mal escrito: marca solo el nombre');
  const malApellido = (await api('/api/ingresar', { cuerpo: { ...votante(1), apellido: 'Apellido Numerito' } })).datos;
  revisar(malApellido.campos.nombre === true && malApellido.campos.apellido === false, 'apellido mal escrito: marca solo el apellido');
  revisar((await api('/api/votar', { cuerpo: { ...votante(1), nombre: 'Votante Pruebo', candidatoId: 1 } })).estado === 409, 'con el nombre mal escrito no puede votar');
  revisar(!JSON.stringify(malNombre).includes('Votante Prueba'), 'el aviso no muestra el nombre correcto');
  revisar((await api('/api/candidatos')).datos.length === 4, 'votante ve 4 partidos');

  // Votos: 40 a la vez
  const ids = [a.datos.id, a.datos.id, a.datos.id, a.datos.id, b.datos.id, b.datos.id, b.datos.id, c.datos.id, c.datos.id, d.datos.id];
  const tandas = await Promise.all(Array.from({ length: 40 }, (_, i) => api('/api/votar', { cuerpo: { ...votante(i + 1), candidatoId: ids[i % 10] } })));
  revisar(tandas.every(t => t.estado === 200), '40 votos a la vez guardados');

  // Mismo teléfono 20 veces a la vez: solo se acepta una
  const repetidos = await Promise.all(Array.from({ length: 20 }, () => api('/api/votar', { cuerpo: { ...votante(500), candidatoId: b.datos.id } })));
  revisar(repetidos.filter(t => t.estado === 200).length === 1, 'mismo teléfono 20 veces a la vez: solo 1 voto');
  const yaVoto = (await api('/api/ingresar', { cuerpo: votante(1) })).datos;
  revisar(yaVoto.codigo === 'telefono_repetido' && /ya votó/.test(yaVoto.error), 'quien ya votó ve «Usted ya votó»');
  const conVotos = (await api('/api/admin/padron?filtro=votaron&por=25', { admin: true })).datos;
  revisar(conVotos.conteo.votaron === 41 && conVotos.total === 41 && conVotos.filas.every(f => f.voto), `filtro «Ya votaron» (${conVotos.conteo.votaron})`);
  const faltan = (await api('/api/admin/padron?filtro=faltan', { admin: true })).datos;
  revisar(faltan.total === 52 && faltan.filas.every(f => !f.voto), `filtro «Faltan» (${faltan.total})`);
  revisar((await api('/api/admin/padron/' + telefono(1), { metodo: 'DELETE', admin: true })).datos.codigo === 'participante_voto', 'no se quita a quien ya votó');
  revisar((await api('/api/admin/padron/' + telefono(1), { metodo: 'PUT', cuerpo: { ...votante(1), telefono: telefono(95) }, admin: true })).datos.codigo === 'participante_voto_telefono', 'quien ya votó no puede cambiar su teléfono');
  revisar((await api('/api/admin/padron/' + telefono(1), { metodo: 'PUT', cuerpo: { ...votante(1), nombre: 'Votante Corregido' }, admin: true })).estado === 200, 'quien ya votó sí puede corregir su nombre');
  await api('/api/admin/padron/' + telefono(1), { metodo: 'PUT', cuerpo: votante(1), admin: true });
  revisar((await api('/api/admin/padron/' + telefono(90), { metodo: 'DELETE', admin: true })).estado === 200, 'quita a quien no votó');
  revisar((await api('/api/ingresar', { cuerpo: votante(90) })).datos.codigo === 'no_registrado', 'quien fue quitado ya no puede votar');
  revisar((await api('/api/votar', { cuerpo: { ...votante(1), candidatoId: b.datos.id } })).estado === 409, 'Teléfono que ya votó no puede votar de nuevo');
  revisar((await api('/api/votar', { cuerpo: { ...votante(900), candidatoId: 9999 } })).estado === 404, 'voto a partido que no existe rechazado');

  // Resultados del admin
  const r = (await api('/api/admin/resultados', { admin: true })).datos;
  revisar(r.total === 41, `total de votos 41 (dio ${r.total})`);
  revisar(r.partidos[0].partido === 'Renovación Verde' && r.partidos[0].votos === 16, 'Renovación Verde va primero con 16');
  revisar(Math.abs(r.partidos.reduce((s, p) => s + p.porcentaje, 0) - 100) < 0.5, 'porcentajes suman 100');
  const v = (await api(`/api/admin/votantes/${a.datos.id}`, { admin: true })).datos;
  revisar(v.total === 16 && v.filas.length === 16 && v.filas[0].telefono && v.filas[0].nombre && v.paginas === 1, 'tabla de votantes de un partido con teléfono');
  const busca = (await api(`/api/admin/votantes/${a.datos.id}?buscar=${telefono(1)}`, { admin: true })).datos;
  revisar(busca.total === 1 && busca.filas[0].telefono === telefono(1), 'buscar votante por teléfono');
  const quita = await api(`/api/admin/candidatos/${d.datos.id}`, { metodo: 'DELETE', admin: true });
  revisar(quita.estado === 200 && quita.datos.votosLiberados === 4, `quitar partido con 4 votos los libera (${quita.datos.votosLiberados})`);
  revisar((await api('/api/ingresar', { cuerpo: votante(10) })).estado === 200, 'quien votó por el partido quitado puede registrarse otra vez');
  revisar((await api('/api/votar', { cuerpo: { ...votante(10), candidatoId: b.datos.id } })).estado === 200, 'y puede votar de nuevo');
  revisar((await api('/api/admin/resultados', { admin: true })).datos.total === 38, 'total queda en 38 (41 − 4 + 1)');
  const sinVotos = await api('/api/admin/candidatos', { cuerpo: { nombre: 'Pedro Pablo', apellido: 'Gutiérrez Paz', partido: 'Partido de Prueba Uno' }, admin: true });
  revisar((await api(`/api/admin/candidatos/${sinVotos.datos.id}`, { metodo: 'DELETE', admin: true })).estado === 200, 'quita partido sin votos');

  // Eliminar el voto de una persona: puede votar de nuevo
  revisar((await api('/api/admin/votos/' + telefono(1), { metodo: 'DELETE' })).estado === 401, 'eliminar voto sin sesión rechazado');
  revisar((await api('/api/admin/votos/' + telefono(85), { metodo: 'DELETE', admin: true })).datos.codigo === 'sin_voto', 'eliminar voto de quien no votó: avisa');
  revisar((await api('/api/admin/votos/' + telefono(1), { metodo: 'DELETE', admin: true })).estado === 200, 'admin elimina el voto de una persona');
  revisar((await api('/api/admin/resultados', { admin: true })).datos.total === 37, 'los resultados bajan en 1 voto (37)');
  revisar((await api('/api/admin/padron?filtro=votaron&buscar=' + telefono(1), { admin: true })).datos.total === 0, 'en la lista vuelve a «Falta»');
  revisar((await api('/api/ingresar', { cuerpo: votante(1) })).estado === 200, 'con el voto eliminado puede ingresar otra vez');
  revisar((await api('/api/votar', { cuerpo: { ...votante(1), candidatoId: c.datos.id } })).estado === 200, 'y vuelve a votar');
  revisar((await api('/api/admin/resultados', { admin: true })).datos.total === 38, 'total vuelve a 38');

  // Publicar
  revisar((await api('/api/admin/publicar', { cuerpo: {} })).estado === 401, 'publicar sin sesión rechazado');
  revisar((await api('/api/admin/publicar', { cuerpo: {}, admin: true })).estado === 200, 'admin publica');
  revisar((await api('/api/ingresar', { cuerpo: votante(77) })).datos.publicado === true, 'tras publicar, al ingresar va a resultados');
  revisar((await api('/api/votar', { cuerpo: { ...votante(78), candidatoId: b.datos.id } })).estado === 409, 'tras publicar no se puede votar');
  const pub = await api('/api/resultados');
  revisar(pub.estado === 200 && pub.datos.partidos.length === 3, 'resultados públicos visibles');
  revisar(!JSON.stringify(pub.datos).includes(telefono(1)), 'resultados públicos sin teléfono de votantes');
  revisar((await api('/api/admin/candidatos', { cuerpo: { nombre: 'Pedro Pablo', apellido: 'Gutiérrez Paz', partido: 'Partido de Prueba Dos' }, admin: true })).estado === 409, 'tras publicar no se inscribe');
  revisar((await api('/api/admin/votos/' + telefono(1), { metodo: 'DELETE', admin: true })).estado === 409, 'tras publicar no se elimina ningún voto');

  // Ocultar y reabrir
  revisar((await api('/api/admin/ocultar', { cuerpo: {} })).estado === 401, 'ocultar sin sesión rechazado');
  revisar((await api('/api/admin/ocultar', { cuerpo: {}, admin: true })).estado === 200, 'admin oculta resultados');
  revisar((await api('/api/resultados')).estado === 403, 'ocultos: nadie ve resultados');
  revisar((await api('/api/ingresar', { cuerpo: votante(80) })).datos.codigo === 'cerrada', 'ocultos: la votación sigue cerrada al ingresar');
  revisar((await api('/api/votar', { cuerpo: { ...votante(80), candidatoId: b.datos.id } })).estado === 409, 'ocultos: no se puede votar');
  revisar((await api('/api/admin/reabrir', { cuerpo: {}, admin: true })).estado === 200, 'admin reabre la votación');
  revisar((await api('/api/estado')).datos.cerrada === false, 'reabierta: estado abierto');
  revisar((await api('/api/votar', { cuerpo: { ...votante(80), candidatoId: b.datos.id } })).estado === 200, 'reabierta: se puede votar');
  revisar((await api('/api/admin/resultados', { admin: true })).datos.total === 39, 'reabierta: los votos anteriores se mantienen (39)');
  revisar((await api('/api/resultados')).estado === 403, 'reabierta: resultados ocultos');
  revisar((await api('/api/admin/publicar', { cuerpo: {}, admin: true })).estado === 200 && (await api('/api/resultados')).estado === 200, 'se puede publicar otra vez');

  // Límite de intentos de contraseña
  let ultimo;
  for (let i = 0; i < 6; i++) ultimo = await api('/api/admin/ingresar', { cuerpo: { nombre: 'Intruso Prueba', clave: 'x' + i } });
  revisar(ultimo.estado === 429, 'tras 5 contraseñas malas pide esperar');
}

const servidor = spawn(process.execPath, [path.join(__dirname, '..', 'servidor.js')], {
  env: { ...process.env, PORT: PUERTO, CARPETA_DATOS: carpeta, DATABASE_URL: process.env.PRUEBA_DATABASE_URL || '' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
servidor.stdout.once('data', async () => {
  try { await principal(); } catch (e) { mal++; console.error(e); }
  servidor.kill();
  fs.rmSync(carpeta, { recursive: true, force: true });
  console.log(`\nResultado: ${bien} bien, ${mal} mal`);
  process.exit(mal ? 1 : 0);
});
