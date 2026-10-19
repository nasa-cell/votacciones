const LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
const { separarTelefono, reglaPais, telefonoBonito } = require('../publico/scripts/paises');

function limpiar(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

function largo(texto, min, max) {
  const n = [...texto].length;
  return n >= min && n <= max;
}

function validarPersona({ nombre, apellido }) {
  const datos = { nombre: limpiar(nombre), apellido: limpiar(apellido) };
  if (!largo(datos.nombre, 10, 30)) return { error: 'El nombre debe tener entre 10 y 30 letras.' };
  if (!LETRAS.test(datos.nombre)) return { error: 'El nombre solo puede tener letras y espacios.' };
  if (!largo(datos.apellido, 10, 30)) return { error: 'El apellido debe tener entre 10 y 30 letras.' };
  if (!LETRAS.test(datos.apellido)) return { error: 'El apellido solo puede tener letras y espacios.' };
  return { datos };
}

// Datos de quien vota o de quien se agrega a la lista de participantes: de 3 a 80 letras.
function validarVotante({ nombre, apellido }) {
  const datos = { nombre: limpiar(nombre), apellido: limpiar(apellido) };
  if (!largo(datos.nombre, 3, 80)) return { error: 'El nombre debe tener entre 3 y 80 letras.', campo: 'nombre' };
  if (!LETRAS.test(datos.nombre)) return { error: 'El nombre solo puede tener letras y espacios.', campo: 'nombre' };
  if (!largo(datos.apellido, 3, 80)) return { error: 'El apellido debe tener entre 3 y 80 letras.', campo: 'apellido' };
  if (!LETRAS.test(datos.apellido)) return { error: 'El apellido solo puede tener letras y espacios.', campo: 'apellido' };
  return { datos };
}

// Para comparar nombres: sin importar mayúsculas, tildes ni espacios de más.
function igualar(texto) {
  return limpiar(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// El teléfono se guarda con el código del país: «+51987654321».
function validarTelefono(telefono) {
  const t = separarTelefono(telefono);
  if (!t) return { error: 'Elija el país y escriba el teléfono solo con números.' };
  const regla = reglaPais(t.pais);
  if (t.pais.iso === 'pe' && !/^9\d{8}$/.test(t.numero)) return { error: 'El celular de Perú debe tener 9 números y empezar con 9.' };
  if (t.numero.length < regla.min || t.numero.length > regla.max) {
    return { error: `El teléfono de ${t.pais.nombre} debe tener de ${regla.min} a ${regla.max} números.` };
  }
  return { telefono: `+${t.pais.codigo}${t.numero}` };
}

const LOGO_VALIDO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function validarCandidato(cuerpo) {
  const persona = validarPersona(cuerpo);
  if (persona.error) return persona;
  // El nombre del partido, la descripción y el logo son opcionales.
  const partido = limpiar(cuerpo.partido);
  if (partido && !largo(partido, 10, 40)) return { error: 'El nombre del partido debe tener entre 10 y 40 caracteres.' };
  const descripcion = limpiar(cuerpo.descripcion);
  if (descripcion && !largo(descripcion, 10, 50)) return { error: 'La descripción debe tener entre 10 y 50 caracteres.' };
  let logo = cuerpo.logo ? String(cuerpo.logo) : null;
  if (logo) {
    if (!LOGO_VALIDO.test(logo)) return { error: 'El logo debe ser una imagen PNG, JPG o WEBP.' };
    if (logo.length > 400000) return { error: 'El logo es muy pesado. Use una imagen más chica.' };
  }
  return { datos: { ...persona.datos, partido: partido || null, descripcion: descripcion || null, logo } };
}

module.exports = { validarPersona, validarVotante, validarTelefono, validarCandidato, limpiar, igualar, telefonoBonito };
