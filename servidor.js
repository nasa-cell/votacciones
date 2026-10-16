const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { crearAlmacen } = require('./servidor/almacen');
const { validarPersona, validarDni, validarCandidato, limpiar } = require('./servidor/validar');

const PUERTO = process.env.PORT || 3000;
const CLAVE_ADMIN = process.env.ADMIN_CLAVE || '1234';
const DURACION_SESION = 12 * 60 * 60 * 1000;

const almacen = crearAlmacen();
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '600kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
});

// Tope de pedidos por IP para registrarse y votar (evita que un programa vote miles de veces seguidas).
// Es alto para que una clase entera conectada al mismo wifi pueda votar sin problema.
const TOPE_POR_MINUTO = Number(process.env.VOTOS_POR_MINUTO) || 120;
const conteoIp = new Map();
function topePorIp(req, res, next) {
  const ahora = Date.now();
  const reg = conteoIp.get(req.ip);
  if (!reg || ahora - reg.inicio > 60000) {
    conteoIp.set(req.ip, { inicio: ahora, n: 1 });
    return next();
  }
  reg.n += 1;
  if (reg.n > TOPE_POR_MINUTO) return res.status(429).json({ error: 'Demasiados intentos seguidos. Espere un minuto e intente de nuevo.' });
  next();
}

const idValido = valor => {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n < 2147483647 ? n : null;
};
app.use(express.static(path.join(__dirname, 'publico'), { extensions: ['html'] }));

const MENSAJES = {
  cerrada: [409, 'La votación ya terminó.'],
  partido_repetido: [409, 'Ese partido ya está inscrito.'],
  no_existe: [404, 'Ese partido no existe.'],
  dni_repetido: [409, 'Este DNI ya votó. Cada persona puede votar una sola vez.'],
};

function responderFalla(res, e) {
  const m = MENSAJES[e.codigo];
  if (m) return res.status(m[0]).json({ error: m[1], codigo: e.codigo });
  console.error(e);
  res.status(500).json({ error: 'Ocurrió un problema en el servidor. Intente de nuevo.' });
}

const envolver = fn => (req, res) => fn(req, res).catch(e => responderFalla(res, e));

/* ---------- Sesión del administrador ---------- */
const sesiones = new Map();
const intentos = new Map();

function leerCookie(req, nombre) {
  const par = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(nombre + '='));
  return par ? decodeURIComponent(par.slice(nombre.length + 1)) : null;
}

function sesionAdmin(req) {
  const ficha = leerCookie(req, 'vot_admin');
  const s = ficha && sesiones.get(ficha);
  if (!s) return null;
  if (s.vence < Date.now()) { sesiones.delete(ficha); return null; }
  return s;
}

function soloAdmin(req, res, next) {
  if (!sesionAdmin(req)) return res.status(401).json({ error: 'Debe ingresar como administrador.' });
  next();
}

function claveCorrecta(clave) {
  const a = crypto.createHash('sha256').update(String(clave)).digest();
  const b = crypto.createHash('sha256').update(CLAVE_ADMIN).digest();
  return crypto.timingSafeEqual(a, b);
}

app.post('/api/admin/ingresar', (req, res) => {
  const ip = req.ip;
  const reg = intentos.get(ip) || { fallos: 0, hasta: 0 };
  if (reg.hasta > Date.now()) {
    const seg = Math.ceil((reg.hasta - Date.now()) / 1000);
    return res.status(429).json({ error: `Demasiados intentos. Espere ${seg} segundos.` });
  }
  const nombre = limpiar(req.body?.nombre);
  if (nombre.length < 3) return res.status(400).json({ error: 'Escriba su nombre y apellido.' });
  const clave = req.body?.clave;
  if (typeof clave !== 'string' || !claveCorrecta(clave)) {
    reg.fallos += 1;
    if (reg.fallos >= 5) reg.hasta = Date.now() + Math.min(60, 10 * (reg.fallos - 4)) * 1000;
    intentos.set(ip, reg);
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  intentos.delete(ip);
  const ficha = crypto.randomBytes(32).toString('hex');
  sesiones.set(ficha, { nombre, vence: Date.now() + DURACION_SESION });
  res.cookie('vot_admin', ficha, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: DURACION_SESION, path: '/' });
  res.json({ nombre });
});

app.post('/api/admin/salir', (req, res) => {
  const ficha = leerCookie(req, 'vot_admin');
  if (ficha) sesiones.delete(ficha);
  res.clearCookie('vot_admin', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/sesion', (req, res) => {
  const s = sesionAdmin(req);
  if (!s) return res.status(401).json({ error: 'Sin sesión.' });
  res.json({ nombre: s.nombre });
});

/* ---------- Público ---------- */
app.get('/api/estado', envolver(async (req, res) => {
  res.json(await almacen.estado());
}));

app.get('/api/candidatos', envolver(async (req, res) => {
  res.json(await almacen.listarCandidatos());
}));

app.post('/api/ingresar', topePorIp, envolver(async (req, res) => {
  const estado = await almacen.estado();
  if (estado.publicado) return res.json({ publicado: true });
  if (estado.cerrada) return res.status(409).json({ error: 'La votación está cerrada. Los resultados todavía no se publican.', codigo: 'cerrada' });
  const persona = validarPersona(req.body || {});
  if (persona.error) return res.status(400).json({ error: persona.error });
  const d = validarDni(req.body?.dni);
  if (d.error) return res.status(400).json({ error: d.error, campo: 'dni' });
  if (await almacen.yaVoto(d.dni)) {
    return res.status(409).json({ error: `El DNI ${d.dni} ya votó. Cada persona puede votar una sola vez.`, codigo: 'dni_repetido', campo: 'dni' });
  }
  res.json({ publicado: false, ...persona.datos, dni: d.dni });
}));

app.post('/api/votar', topePorIp, envolver(async (req, res) => {
  const persona = validarPersona(req.body || {});
  if (persona.error) return res.status(400).json({ error: persona.error });
  const d = validarDni(req.body?.dni);
  if (d.error) return res.status(400).json({ error: d.error });
  const candidatoId = idValido(req.body?.candidatoId);
  if (!candidatoId) return res.status(400).json({ error: 'Elija un partido.' });
  await almacen.votar({ ...persona.datos, dni: d.dni, candidatoId });
  res.json({ ok: true });
}));

// Resultados para todos: solo después de publicar y sin datos de los votantes.
app.get('/api/resultados', envolver(async (req, res) => {
  if (!(await almacen.estado()).publicado) return res.status(403).json({ error: 'Los resultados aún no se publican.' });
  res.json(await resumen());
}));

async function resumen() {
  const conteo = await almacen.conteo();
  const total = conteo.reduce((s, c) => s + c.votos, 0);
  return {
    total,
    ...(await almacen.estado()),
    partidos: conteo.map(c => ({ ...c, porcentaje: total ? Math.round((c.votos / total) * 1000) / 10 : 0 })),
  };
}

/* ---------- Administrador ---------- */
app.get('/api/admin/resultados', soloAdmin, envolver(async (req, res) => {
  res.json(await resumen());
}));

app.get('/api/admin/votantes/:id', soloAdmin, envolver(async (req, res) => {
  const porPagina = 25;
  const pagina = Math.max(1, Math.floor(Number(req.query.pagina)) || 1);
  const buscar = limpiar(req.query.buscar).slice(0, 60);
  const id = idValido(req.params.id);
  if (!id) return res.status(404).json({ error: 'Ese partido no existe.' });
  const r = await almacen.votantesDe(id, { buscar, desde: (pagina - 1) * porPagina, cuantos: porPagina });
  res.json({ ...r, pagina, paginas: Math.max(1, Math.ceil(r.total / porPagina)), porPagina });
}));

app.post('/api/admin/candidatos', soloAdmin, envolver(async (req, res) => {
  const v = validarCandidato(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
  res.json(await almacen.crearCandidato(v.datos));
}));

app.put('/api/admin/candidatos/:id', soloAdmin, envolver(async (req, res) => {
  const v = validarCandidato(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
  const id = idValido(req.params.id);
  if (!id) return res.status(404).json({ error: 'Ese partido no existe.' });
  res.json(await almacen.editarCandidato(id, v.datos));
}));

app.delete('/api/admin/candidatos/:id', soloAdmin, envolver(async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(404).json({ error: 'Ese partido no existe.' });
  res.json({ ok: true, ...(await almacen.quitarCandidato(id)) });
}));

// Publicar: cierra y muestra resultados. Ocultar: esconde resultados, sigue cerrada. Reabrir: se puede votar otra vez.
const ESTADOS = {
  publicar: { publicado: true, cerrada: true },
  ocultar: { publicado: false, cerrada: true },
  reabrir: { publicado: false, cerrada: false },
};
for (const [accion, estado] of Object.entries(ESTADOS)) {
  app.post('/api/admin/' + accion, soloAdmin, envolver(async (req, res) => {
    await almacen.ponerEstado(estado);
    res.json({ ok: true, ...estado });
  }));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es muy pesado.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal enviados.' });
  next(err);
});

// Limpieza de registros viejos para que la memoria no crezca.
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, r] of conteoIp) if (ahora - r.inicio > 60000) conteoIp.delete(ip);
  for (const [ip, r] of intentos) if (r.hasta < ahora - 15 * 60000) intentos.delete(ip);
  for (const [ficha, s] of sesiones) if (s.vence < ahora) sesiones.delete(ficha);
}, 60000).unref();

if (!process.env.ADMIN_CLAVE) console.warn('Aviso: no hay ADMIN_CLAVE; la contraseña del administrador es 1234. En internet conviene poner una más segura.');

almacen.iniciar().then(() => {
  // Fila de espera grande: muchas personas pueden conectarse al mismo tiempo.
  app.listen({ port: Number(PUERTO), backlog: 4096 }, () => console.log(`Votaciones en http://localhost:${PUERTO}`));
}).catch(e => {
  console.error('No se pudo abrir la base de datos:', e.message);
  process.exit(1);
});
