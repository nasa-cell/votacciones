// Guarda candidatos y votos. Con DATABASE_URL usa Postgres; sin ella, un archivo JSON (para probar en el PC).
const fs = require('fs');
const path = require('path');
const { igualar } = require('./validar');

function falla(codigo) {
  const e = new Error(codigo);
  e.codigo = codigo;
  return e;
}

const FILTROS_PADRON = ['todos', 'votaron', 'faltan'];

// Nombre con que se muestra: el del partido o, si no tiene, el de la persona.
const nombreVisible = c => c.partido || `${c.nombre} ${c.apellido}`;

function ordenarConteo(lista) {
  return lista.sort((a, b) => b.votos - a.votos || nombreVisible(a).localeCompare(nombreVisible(b), 'es'));
}

// Dos partidos no pueden llamarse igual; los que no tienen nombre de partido no chocan.
const mismoPartido = (a, b) => !!a.partido && !!b.partido && a.partido.toLowerCase() === b.partido.toLowerCase();

/* ---------- Archivo JSON ---------- */
function almacenArchivo(carpeta) {
  const archivo = path.join(carpeta, 'datos.json');
  let datos = { siguienteId: 1, candidatos: [], votos: [], padron: [], publicado: false, cerrada: false };
  // Archivos viejos no tenían «cerrada»: publicado implicaba cerrada.
  const cerrada = () => datos.cerrada ?? datos.publicado;
  let cola = Promise.resolve();

  function escribir() {
    pendiente = null;
    const temporal = archivo + '.tmp';
    fs.writeFileSync(temporal, JSON.stringify(datos));
    fs.renameSync(temporal, archivo);
  }
  // Agrupa las escrituras: con muchos votos seguidos se escribe el archivo como máximo cada 200 ms.
  let pendiente = null;
  function guardar() {
    if (!pendiente) pendiente = setTimeout(escribir, 200);
  }
  const alCerrar = () => {
    if (pendiente) { clearTimeout(pendiente); escribir(); }
  };
  process.on('exit', alCerrar);
  for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => { alCerrar(); process.exit(0); });
  // Las escrituras van de a una para que dos votos a la vez no se pisen.
  function enCola(tarea) {
    const r = cola.then(tarea);
    cola = r.catch(() => {});
    return r;
  }

  return {
    async iniciar() {
      fs.mkdirSync(carpeta, { recursive: true });
      if (fs.existsSync(archivo)) datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
      datos.padron ??= [];
      // Antes se votaba con DNI: esas personas y sus votos ya no sirven (ahora es con teléfono).
      if (datos.padron.some(p => !p.telefono) || datos.votos.some(v => !v.telefono)) {
        datos.padron = datos.padron.filter(p => p.telefono);
        datos.votos = datos.votos.filter(v => v.telefono);
        escribir();
      }
    },
    async estado() { return { publicado: !!datos.publicado, cerrada: !!cerrada() }; },
    async ponerEstado(e) { return enCola(() => { datos.publicado = e.publicado; datos.cerrada = e.cerrada; guardar(); }); },
    async listarCandidatos() { return datos.candidatos.map(c => ({ ...c })); },
    async crearCandidato(c) {
      return enCola(() => {
        if (cerrada()) throw falla('cerrada');
        if (datos.candidatos.some(x => mismoPartido(x, c))) throw falla('partido_repetido');
        const nuevo = { id: datos.siguienteId++, ...c };
        datos.candidatos.push(nuevo);
        guardar();
        return nuevo;
      });
    },
    async editarCandidato(id, c) {
      return enCola(() => {
        if (cerrada()) throw falla('cerrada');
        const actual = datos.candidatos.find(x => x.id === id);
        if (!actual) throw falla('no_existe');
        if (datos.candidatos.some(x => x.id !== id && mismoPartido(x, c))) throw falla('partido_repetido');
        Object.assign(actual, c);
        guardar();
        return actual;
      });
    },
    async quitarCandidato(id) {
      return enCola(() => {
        if (cerrada()) throw falla('cerrada');
        if (!datos.candidatos.some(x => x.id === id)) throw falla('no_existe');
        // Los votos de ese partido se borran: esas personas pueden registrarse y votar de nuevo.
        const antes = datos.votos.length;
        datos.votos = datos.votos.filter(v => v.candidatoId !== id);
        datos.candidatos = datos.candidatos.filter(x => x.id !== id);
        guardar();
        return { votosLiberados: antes - datos.votos.length };
      });
    },
    async yaVoto(telefono) { return datos.votos.some(v => v.telefono === telefono); },
    async buscarParticipante(telefono) {
      const p = datos.padron.find(x => x.telefono === telefono);
      return p ? { nombre: p.nombre, apellido: p.apellido, telefono: p.telefono } : null;
    },
    async agregarParticipante(p) {
      return enCola(() => {
        if (datos.padron.some(x => x.telefono === p.telefono)) throw falla('telefono_en_lista');
        const nuevo = { nombre: p.nombre, apellido: p.apellido, telefono: p.telefono, creado: new Date().toISOString() };
        datos.padron.push(nuevo);
        guardar();
        return { nombre: nuevo.nombre, apellido: nuevo.apellido, telefono: nuevo.telefono, voto: false };
      });
    },
    async editarParticipante(telefonoAnterior, p) {
      return enCola(() => {
        const actual = datos.padron.find(x => x.telefono === telefonoAnterior);
        if (!actual) throw falla('no_en_lista');
        const voto = datos.votos.find(v => v.telefono === telefonoAnterior);
        if (p.telefono !== telefonoAnterior) {
          if (voto) throw falla('participante_voto_telefono');
          if (datos.padron.some(x => x.telefono === p.telefono)) throw falla('telefono_en_lista');
        }
        Object.assign(actual, { nombre: p.nombre, apellido: p.apellido, telefono: p.telefono });
        if (voto) Object.assign(voto, { nombre: p.nombre, apellido: p.apellido });
        guardar();
        return { nombre: actual.nombre, apellido: actual.apellido, telefono: actual.telefono, voto: !!voto };
      });
    },
    async borrarVoto(telefono) {
      return enCola(() => {
        if (cerrada()) throw falla('cerrada');
        const antes = datos.votos.length;
        datos.votos = datos.votos.filter(v => v.telefono !== telefono);
        if (datos.votos.length === antes) throw falla('sin_voto');
        guardar();
      });
    },
    async quitarParticipante(telefono) {
      return enCola(() => {
        if (!datos.padron.some(x => x.telefono === telefono)) throw falla('no_en_lista');
        if (datos.votos.some(v => v.telefono === telefono)) throw falla('participante_voto');
        datos.padron = datos.padron.filter(x => x.telefono !== telefono);
        guardar();
      });
    },
    async listarPadron({ filtro = 'todos', buscar = '', desde = 0, cuantos = 10 } = {}) {
      const votaron = new Set(datos.votos.map(v => v.telefono));
      const todos = datos.padron.map(p => ({ nombre: p.nombre, apellido: p.apellido, telefono: p.telefono, creado: p.creado, voto: votaron.has(p.telefono) }));
      const q = igualar(buscar), cifras = String(buscar).replace(/\D/g, '');
      const lista = todos
        .filter(p => filtro === 'todos' || (filtro === 'votaron') === p.voto)
        .filter(p => !q || (cifras && p.telefono.includes(cifras)) || igualar(`${p.nombre} ${p.apellido}`).includes(q))
        .sort((a, b) => b.creado.localeCompare(a.creado) || a.telefono.localeCompare(b.telefono));
      const n = todos.filter(p => p.voto).length;
      return {
        total: lista.length,
        conteo: { todos: todos.length, votaron: n, faltan: todos.length - n },
        filas: lista.slice(desde, desde + cuantos).map(({ nombre, apellido, telefono, voto }) => ({ nombre, apellido, telefono, voto })),
      };
    },
    async votar(v) {
      return enCola(() => {
        if (cerrada()) throw falla('cerrada');
        if (!datos.candidatos.some(x => x.id === v.candidatoId)) throw falla('no_existe');
        if (datos.votos.some(x => x.telefono === v.telefono)) throw falla('telefono_repetido');
        datos.votos.push({ ...v, fecha: new Date().toISOString() });
        guardar();
      });
    },
    async conteo() {
      const votos = new Map();
      for (const v of datos.votos) votos.set(v.candidatoId, (votos.get(v.candidatoId) || 0) + 1);
      return ordenarConteo(datos.candidatos.map(c => ({
        id: c.id, partido: c.partido, nombre: c.nombre, apellido: c.apellido, votos: votos.get(c.id) || 0,
      })));
    },
    async votantesDe(id, { buscar = '', desde = 0, cuantos = 25 } = {}) {
      const q = buscar.toLowerCase();
      const lista = datos.votos
        .filter(v => v.candidatoId === id && (!q || (q.replace(/\D/g, '') && v.telefono.includes(q.replace(/\D/g, ''))) || `${v.nombre} ${v.apellido}`.toLowerCase().includes(q)))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      return {
        total: lista.length,
        filas: lista.slice(desde, desde + cuantos).map(({ nombre, apellido, telefono, fecha }) => ({ nombre, apellido, telefono, fecha })),
      };
    },
  };
}

/* ---------- Postgres ---------- */
function almacenPostgres(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 5 });
  const fila = r => r && ({ id: r.id, nombre: r.nombre, apellido: r.apellido, partido: r.partido, descripcion: r.descripcion, logo: r.logo });

  async function estado() {
    const r = await pool.query("SELECT clave, valor FROM vot_ajustes WHERE clave IN ('publicado', 'cerrada')");
    const v = Object.fromEntries(r.rows.map(x => [x.clave, x.valor === 'si']));
    return { publicado: !!v.publicado, cerrada: v.cerrada ?? !!v.publicado };
  }
  async function exigirAbierta() {
    if ((await estado()).cerrada) throw falla('cerrada');
  }

  return {
    async iniciar() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS vot_candidatos (
          id SERIAL PRIMARY KEY,
          nombre TEXT NOT NULL, apellido TEXT NOT NULL, partido TEXT NOT NULL,
          descripcion TEXT, logo TEXT, creado TIMESTAMPTZ DEFAULT now());
        CREATE UNIQUE INDEX IF NOT EXISTS vot_partido_unico ON vot_candidatos (lower(partido));
        CREATE TABLE IF NOT EXISTS vot_votos (
          telefono VARCHAR(20) PRIMARY KEY,
          nombre TEXT NOT NULL, apellido TEXT NOT NULL,
          candidato_id INTEGER NOT NULL REFERENCES vot_candidatos(id),
          fecha TIMESTAMPTZ DEFAULT now());
        CREATE INDEX IF NOT EXISTS vot_votos_candidato ON vot_votos (candidato_id);
        CREATE TABLE IF NOT EXISTS vot_ajustes (clave TEXT PRIMARY KEY, valor TEXT);
        CREATE TABLE IF NOT EXISTS vot_padron (
          telefono VARCHAR(20) PRIMARY KEY,
          nombre TEXT NOT NULL, apellido TEXT NOT NULL,
          creado TIMESTAMPTZ DEFAULT clock_timestamp());
        ALTER TABLE vot_candidatos ALTER COLUMN partido DROP NOT NULL;`);
      // Antes se votaba con DNI: se borran esas personas y sus votos y la columna pasa a ser el teléfono.
      const viejas = await pool.query(
        "SELECT table_name FROM information_schema.columns WHERE table_name IN ('vot_votos', 'vot_padron') AND column_name = 'dni'");
      if (viejas.rowCount) {
        const cliente = await pool.connect();
        try {
          await cliente.query('BEGIN');
          for (const { table_name: tabla } of viejas.rows) {
            await cliente.query(`DELETE FROM ${tabla}`);
            await cliente.query(`ALTER TABLE ${tabla} RENAME COLUMN dni TO telefono`);
            await cliente.query(`ALTER TABLE ${tabla} ALTER COLUMN telefono TYPE VARCHAR(20)`);
          }
          await cliente.query('COMMIT');
        } catch (e) {
          await cliente.query('ROLLBACK');
          throw e;
        } finally {
          cliente.release();
        }
      }
      // El teléfono lleva el código del país («+51…»): la columna debe ser más larga.
      const cortas = await pool.query(
        "SELECT table_name FROM information_schema.columns WHERE table_name IN ('vot_votos', 'vot_padron') AND column_name = 'telefono' AND character_maximum_length < 20");
      for (const { table_name: tabla } of cortas.rows) await pool.query(`ALTER TABLE ${tabla} ALTER COLUMN telefono TYPE VARCHAR(20)`);
    },
    estado,
    async ponerEstado(e) {
      await pool.query(
        "INSERT INTO vot_ajustes VALUES ('publicado', $1), ('cerrada', $2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor",
        [e.publicado ? 'si' : 'no', e.cerrada ? 'si' : 'no']);
    },
    async listarCandidatos() {
      const r = await pool.query('SELECT * FROM vot_candidatos ORDER BY id');
      return r.rows.map(fila);
    },
    async crearCandidato(c) {
      await exigirAbierta();
      try {
        const r = await pool.query(
          'INSERT INTO vot_candidatos (nombre, apellido, partido, descripcion, logo) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [c.nombre, c.apellido, c.partido, c.descripcion, c.logo]);
        return fila(r.rows[0]);
      } catch (e) {
        if (e.code === '23505') throw falla('partido_repetido');
        throw e;
      }
    },
    async editarCandidato(id, c) {
      await exigirAbierta();
      try {
        const r = await pool.query(
          'UPDATE vot_candidatos SET nombre=$1, apellido=$2, partido=$3, descripcion=$4, logo=$5 WHERE id=$6 RETURNING *',
          [c.nombre, c.apellido, c.partido, c.descripcion, c.logo, id]);
        if (!r.rows[0]) throw falla('no_existe');
        return fila(r.rows[0]);
      } catch (e) {
        if (e.code === '23505') throw falla('partido_repetido');
        throw e;
      }
    },
    async quitarCandidato(id) {
      await exigirAbierta();
      // Los votos de ese partido se borran: esas personas pueden registrarse y votar de nuevo.
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const v = await cliente.query('DELETE FROM vot_votos WHERE candidato_id=$1', [id]);
        const r = await cliente.query('DELETE FROM vot_candidatos WHERE id=$1', [id]);
        if (!r.rowCount) throw falla('no_existe');
        await cliente.query('COMMIT');
        return { votosLiberados: v.rowCount };
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw e;
      } finally {
        cliente.release();
      }
    },
    async yaVoto(telefono) {
      const r = await pool.query('SELECT 1 FROM vot_votos WHERE telefono=$1', [telefono]);
      return r.rows.length > 0;
    },
    async buscarParticipante(telefono) {
      const r = await pool.query('SELECT nombre, apellido, telefono FROM vot_padron WHERE telefono=$1', [telefono]);
      return r.rows[0] ? { ...r.rows[0], telefono: r.rows[0].telefono.trim() } : null;
    },
    async agregarParticipante(p) {
      try {
        await pool.query('INSERT INTO vot_padron (telefono, nombre, apellido) VALUES ($1,$2,$3)', [p.telefono, p.nombre, p.apellido]);
        return { nombre: p.nombre, apellido: p.apellido, telefono: p.telefono, voto: false };
      } catch (e) {
        if (e.code === '23505') throw falla('telefono_en_lista');
        throw e;
      }
    },
    async editarParticipante(telefonoAnterior, p) {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const voto = (await cliente.query('SELECT 1 FROM vot_votos WHERE telefono=$1 FOR UPDATE', [telefonoAnterior])).rowCount > 0;
        if (voto && p.telefono !== telefonoAnterior) throw falla('participante_voto_telefono');
        const r = await cliente.query('UPDATE vot_padron SET telefono=$1, nombre=$2, apellido=$3 WHERE telefono=$4', [p.telefono, p.nombre, p.apellido, telefonoAnterior]);
        if (!r.rowCount) throw falla('no_en_lista');
        if (voto) await cliente.query('UPDATE vot_votos SET nombre=$1, apellido=$2 WHERE telefono=$3', [p.nombre, p.apellido, telefonoAnterior]);
        await cliente.query('COMMIT');
        return { nombre: p.nombre, apellido: p.apellido, telefono: p.telefono, voto };
      } catch (e) {
        await cliente.query('ROLLBACK');
        if (e.code === '23505') throw falla('telefono_en_lista');
        throw e;
      } finally {
        cliente.release();
      }
    },
    async borrarVoto(telefono) {
      await exigirAbierta();
      const r = await pool.query('DELETE FROM vot_votos WHERE telefono=$1', [telefono]);
      if (!r.rowCount) throw falla('sin_voto');
    },
    async quitarParticipante(telefono) {
      const r = await pool.query(
        'DELETE FROM vot_padron WHERE telefono=$1 AND NOT EXISTS (SELECT 1 FROM vot_votos WHERE telefono=$1) RETURNING telefono', [telefono]);
      if (r.rowCount) return;
      if (await this.buscarParticipante(telefono)) throw falla('participante_voto');
      throw falla('no_en_lista');
    },
    async listarPadron({ filtro = 'todos', buscar = '', desde = 0, cuantos = 10 } = {}) {
      const condiciones = [];
      const valores = [];
      if (filtro === 'votaron') condiciones.push('v.telefono IS NOT NULL');
      if (filtro === 'faltan') condiciones.push('v.telefono IS NULL');
      const q = igualar(buscar);
      if (q) {
        valores.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
        valores.push(`%${String(buscar).replace(/\D/g, '') || '-'}%`);
        condiciones.push(`(p.telefono LIKE $2 OR translate(lower(p.nombre || ' ' || p.apellido), 'áéíóúüàèìòùñ', 'aeiouuaeioun') LIKE $1)`);
      }
      const donde = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
      const desdeTabla = 'FROM vot_padron p LEFT JOIN vot_votos v ON v.telefono = p.telefono';
      const [total, conteo, filas] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS n ${desdeTabla} ${donde}`, valores),
        pool.query(`SELECT COUNT(*)::int AS todos, COUNT(v.telefono)::int AS votaron ${desdeTabla}`),
        pool.query(
          `SELECT p.nombre, p.apellido, p.telefono, (v.telefono IS NOT NULL) AS voto ${desdeTabla} ${donde}
           ORDER BY p.creado DESC, p.telefono LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
          [...valores, cuantos, desde]),
      ]);
      const c = conteo.rows[0];
      return {
        total: total.rows[0].n,
        conteo: { todos: c.todos, votaron: c.votaron, faltan: c.todos - c.votaron },
        filas: filas.rows.map(x => ({ ...x, telefono: x.telefono.trim() })),
      };
    },
    async votar(v) {
      await exigirAbierta();
      try {
        await pool.query('INSERT INTO vot_votos (telefono, nombre, apellido, candidato_id) VALUES ($1,$2,$3,$4)',
          [v.telefono, v.nombre, v.apellido, v.candidatoId]);
      } catch (e) {
        if (e.code === '23505') throw falla('telefono_repetido');
        if (e.code === '23503') throw falla('no_existe');
        throw e;
      }
    },
    async conteo() {
      const r = await pool.query(`
        SELECT c.id, c.partido, c.nombre, c.apellido, COUNT(v.telefono)::int AS votos
        FROM vot_candidatos c LEFT JOIN vot_votos v ON v.candidato_id = c.id
        GROUP BY c.id`);
      return ordenarConteo(r.rows);
    },
    async votantesDe(id, { buscar = '', desde = 0, cuantos = 25 } = {}) {
      const filtro = buscar ? "AND (telefono LIKE $3 OR lower(nombre || ' ' || apellido) LIKE $2)" : '';
      const datosFiltro = buscar ? [id, `%${buscar.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`, `%${buscar.replace(/\D/g, '') || '-'}%`] : [id];
      const total = await pool.query(`SELECT COUNT(*)::int AS n FROM vot_votos WHERE candidato_id=$1 ${filtro}`, datosFiltro);
      const n = datosFiltro.length;
      const r = await pool.query(
        `SELECT nombre, apellido, telefono, fecha FROM vot_votos WHERE candidato_id=$1 ${filtro} ORDER BY fecha DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
        [...datosFiltro, cuantos, desde]);
      return { total: total.rows[0].n, filas: r.rows.map(x => ({ ...x, telefono: x.telefono.trim(), fecha: new Date(x.fecha).toISOString() })) };
    },
  };
}

function crearAlmacen() {
  if (process.env.DATABASE_URL) return almacenPostgres(process.env.DATABASE_URL);
  return almacenArchivo(process.env.CARPETA_DATOS || path.join(__dirname, '..', 'datos'));
}

module.exports = { crearAlmacen, FILTROS_PADRON };
