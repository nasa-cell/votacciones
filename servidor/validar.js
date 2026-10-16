const LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;

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

function validarDni(dni) {
  const limpio = limpiar(dni);
  if (!/^\d{8}$/.test(limpio)) return { error: 'El DNI debe tener 8 números.' };
  return { dni: limpio };
}

const LOGO_VALIDO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function validarCandidato(cuerpo) {
  const persona = validarPersona(cuerpo);
  if (persona.error) return persona;
  const partido = limpiar(cuerpo.partido);
  if (!largo(partido, 10, 40)) return { error: 'El nombre del partido debe tener entre 10 y 40 caracteres.' };
  const descripcion = limpiar(cuerpo.descripcion);
  if (descripcion && !largo(descripcion, 10, 50)) return { error: 'La descripción debe tener entre 10 y 50 caracteres.' };
  let logo = cuerpo.logo ? String(cuerpo.logo) : null;
  if (logo) {
    if (!LOGO_VALIDO.test(logo)) return { error: 'El logo debe ser una imagen PNG, JPG o WEBP.' };
    if (logo.length > 400000) return { error: 'El logo es muy pesado. Use una imagen más chica.' };
  }
  return { datos: { ...persona.datos, partido, descripcion: descripcion || null, logo } };
}

module.exports = { validarPersona, validarDni, validarCandidato, limpiar };
