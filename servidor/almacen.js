// Guarda candidatos y votos. Con DATABASE_URL usa Postgres; sin ella, un archivo JSON (para probar en el PC).
const fs = require('fs');
const path = require('path');

function falla(codigo) {
  const e = new Error(codigo);
  e.codigo = codigo;
  return e;
}

function ordenarConteo(lista) {
  return lista.sort((a, b) => b.votos - a.votos || a.partido.localeCompare(b.partido, 'es'));
}

/* ---------- Archivo JSON ---------- */
function almacenArchivo(carpeta) {
  const archivo = path.join(carpeta, 'datos.json');
  let datos = { siguienteId: 1, candidatos: [], votos: [], publicado: false, cerrada: false };
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
    },
    async estado() { return { publicado: !!datos.publicado, cerrada: !!cerrada() }; },
    async ponerEstado(e) { return enCola(() => { datos.publicado = e.publicado; datos.cerrada = e.cerrada; guardar(); }); },
    async listarCandidatos() { return datos.candidatos.map(c => ({ ...c })); },
    async crearCandidato(c) {
      return enCola(() => {
        if (cerrada()) throw falla('cerrada');
        if (datos.candidatos.some(x => x.partido.toLowerCase() === c.partido.toLowerCase())) throw falla('partido_repetido');
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
        if (datos.candidatos.some(x => x.id !== id && x.partido.toLowerCase() === c.partido.toLowerCase())) throw falla('partido_repetido');
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
    async yaVoto(dni) { return datos.votos.some(v => v.dni === dni); },
    async votar(v) {
      return enCola(() => {
        if (cerrada()) throw falla('cerrada');
        if (!datos.candidatos.some(x => x.id === v.candidatoId)) throw falla('no_existe');
        if (datos.votos.some(x => x.dni === v.dni)) throw falla('dni_repetido');
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
        .filter(v => v.candidatoId === id && (!q || v.dni.includes(q) || `${v.nombre} ${v.apellido}`.toLowerCase().includes(q)))
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      return {
        total: lista.length,
        filas: lista.slice(desde, desde + cuantos).map(({ nombre, apellido, dni, fecha }) => ({ nombre, apellido, dni, fecha })),
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
          dni CHAR(8) PRIMARY KEY,
          nombre TEXT NOT NULL, apellido TEXT NOT NULL,
          candidato_id INTEGER NOT NULL REFERENCES vot_candidatos(id),
          fecha TIMESTAMPTZ DEFAULT now());
        CREATE INDEX IF NOT EXISTS vot_votos_candidato ON vot_votos (candidato_id);
        CREATE TABLE IF NOT EXISTS vot_ajustes (clave TEXT PRIMARY KEY, valor TEXT);`);
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
    async yaVoto(dni) {
      const r = await pool.query('SELECT 1 FROM vot_votos WHERE dni=$1', [dni]);
      return r.rows.length > 0;
    },
    async votar(v) {
      await exigirAbierta();
      try {
        await pool.query('INSERT INTO vot_votos (dni, nombre, apellido, candidato_id) VALUES ($1,$2,$3,$4)',
          [v.dni, v.nombre, v.apellido, v.candidatoId]);
      } catch (e) {
        if (e.code === '23505') throw falla('dni_repetido');
        if (e.code === '23503') throw falla('no_existe');
        throw e;
      }
    },
    async conteo() {
      const r = await pool.query(`
        SELECT c.id, c.partido, c.nombre, c.apellido, COUNT(v.dni)::int AS votos
        FROM vot_candidatos c LEFT JOIN vot_votos v ON v.candidato_id = c.id
        GROUP BY c.id`);
      return ordenarConteo(r.rows);
    },
    async votantesDe(id, { buscar = '', desde = 0, cuantos = 25 } = {}) {
      const filtro = buscar ? "AND (dni LIKE $2 OR lower(nombre || ' ' || apellido) LIKE $2)" : '';
      const datosFiltro = buscar ? [id, `%${buscar.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`] : [id];
      const total = await pool.query(`SELECT COUNT(*)::int AS n FROM vot_votos WHERE candidato_id=$1 ${filtro}`, datosFiltro);
      const n = datosFiltro.length;
      const r = await pool.query(
        `SELECT nombre, apellido, dni, fecha FROM vot_votos WHERE candidato_id=$1 ${filtro} ORDER BY fecha DESC LIMIT $${n + 1} OFFSET $${n + 2}`,
        [...datosFiltro, cuantos, desde]);
      return { total: total.rows[0].n, filas: r.rows.map(x => ({ ...x, dni: x.dni.trim(), fecha: new Date(x.fecha).toISOString() })) };
    },
  };
}

function crearAlmacen() {
  if (process.env.DATABASE_URL) return almacenPostgres(process.env.DATABASE_URL);
  return almacenArchivo(process.env.CARPETA_DATOS || path.join(__dirname, '..', 'datos'));
}

module.exports = { crearAlmacen };
