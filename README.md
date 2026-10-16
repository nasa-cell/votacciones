# Votaciones

Página de elecciones: los votantes se registran con nombre, apellido y DNI, eligen un partido y votan una sola vez. El administrador inscribe a los participantes, mira los resultados en vivo y los publica.

## Páginas

- `/` — registro del votante, votación y, cuando el admin publica, la pantalla final con ganadores (1.º a 4.º) y gráfico de barras.
- `/admin.html` — acceso del administrador (nombre y contraseña), inscribir participantes, resultados en vivo (general y por partido, con la tabla de quién votó) y botón para publicar.

## Reglas

- Votante: nombre y apellido de 10 a 30 letras, DNI de 8 números. Un DNI vota una sola vez.
- Participante: nombre y apellido de 10 a 30, partido de 10 a 40 (no se repite). Logo y descripción (10 a 50) son opcionales.
- Los votantes no ven porcentajes hasta que el admin publica. Al publicar se cierra la votación.
- No se puede quitar un partido que ya tiene votos.

## Probar en la PC

```
npm install
npm start
```

Abrir http://localhost:3000. Sin base de datos, los datos se guardan en `datos/datos.json`.

Pruebas del servidor: `npm run prueba`. Hay pruebas de pantallas, carga (60 partidos y 1000 votos) y seguridad aparte, con Playwright.

## Publicar en Render

1. Crear un **Web Service** de Node con este repositorio.
2. Comando de inicio: `npm start`.
3. Variables de entorno:
   - `DATABASE_URL`: base Postgres (por ejemplo Neon, plan gratis). Sin ella, Render borra los votos al reiniciarse.
   - `ADMIN_CLAVE`: contraseña del administrador (si no se pone, es `1234`; en internet conviene una más larga).
   - `VOTOS_POR_MINUTO` (opcional): tope de registros y votos por minuto desde un mismo equipo o wifi. Por defecto 120.

## Seguridad

- Contraseña del admin solo en el servidor; tras 5 intentos fallidos hace esperar. Sesión con galleta HttpOnly y SameSite=Strict.
- Un DNI vota una sola vez (lo controla la base de datos, aunque lleguen varios votos a la vez).
- Los nombres y textos se muestran siempre como texto: no se puede meter código en la página. El logo solo acepta PNG, JPG o WEBP.
- Cabeceras de seguridad (CSP, nosniff, sin marcos) y tope de pedidos por equipo.
- La página no comprueba que el DNI sea de quien lo escribe (no hay conexión con RENIEC).
