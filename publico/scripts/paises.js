// Países para el teléfono: código, nombre y bandera (publico/banderas/<iso>.png).
// Lo usan la página y el servidor, así las dos listas son siempre iguales.
const PAISES = [
  { iso: 'pe', nombre: 'Perú', codigo: '51' },
  { iso: 'ar', nombre: 'Argentina', codigo: '54' },
  { iso: 'bo', nombre: 'Bolivia', codigo: '591' },
  { iso: 'br', nombre: 'Brasil', codigo: '55' },
  { iso: 'cl', nombre: 'Chile', codigo: '56' },
  { iso: 'co', nombre: 'Colombia', codigo: '57' },
  { iso: 'cr', nombre: 'Costa Rica', codigo: '506' },
  { iso: 'cu', nombre: 'Cuba', codigo: '53' },
  { iso: 'ec', nombre: 'Ecuador', codigo: '593' },
  { iso: 'sv', nombre: 'El Salvador', codigo: '503' },
  { iso: 'es', nombre: 'España', codigo: '34' },
  { iso: 'us', nombre: 'Estados Unidos', codigo: '1' },
  { iso: 'gt', nombre: 'Guatemala', codigo: '502' },
  { iso: 'hn', nombre: 'Honduras', codigo: '504' },
  { iso: 'it', nombre: 'Italia', codigo: '39' },
  { iso: 'jp', nombre: 'Japón', codigo: '81' },
  { iso: 'mx', nombre: 'México', codigo: '52' },
  { iso: 'ni', nombre: 'Nicaragua', codigo: '505' },
  { iso: 'pa', nombre: 'Panamá', codigo: '507' },
  { iso: 'py', nombre: 'Paraguay', codigo: '595' },
  { iso: 'uy', nombre: 'Uruguay', codigo: '598' },
  { iso: 've', nombre: 'Venezuela', codigo: '58' },
];

// Cuántas cifras lleva el número sin el código del país.
// Perú: celular de 9 que empieza con 9. Otros: de 6 hasta completar 15 cifras con el código.
function reglaPais(pais) {
  if (pais.iso === 'pe') return { min: 9, max: 9, exacto: true, empiezaCon: '9' };
  return { min: 6, max: 15 - pais.codigo.length, exacto: false, empiezaCon: '' };
}

// Separa «+51987654321» en país y número. Sin «+» y con 9 cifras que empiezan con 9, es de Perú.
function separarTelefono(texto) {
  const limpio = String(texto ?? '').replace(/[\s().-]/g, '');
  if (/^9\d{8}$/.test(limpio)) return { pais: PAISES[0], numero: limpio };
  const m = limpio.match(/^\+(\d+)$/);
  if (!m) return null;
  const pais = PAISES.find(p => m[1].startsWith(p.codigo));
  return pais ? { pais, numero: m[1].slice(pais.codigo.length) } : null;
}

// Para mostrar: «+51 987 654 321».
function telefonoBonito(texto) {
  const t = separarTelefono(texto);
  if (!t) return String(texto ?? '');
  return `+${t.pais.codigo} ${t.numero.replace(/(\d{3})(?=\d{3,})/g, '$1 ')}`;
}

if (typeof module !== 'undefined') module.exports = { PAISES, reglaPais, separarTelefono, telefonoBonito };
