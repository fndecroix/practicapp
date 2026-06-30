# 🎻 PracticApp

App **web mobile-first** para trackear tus sesiones de práctica de cello.
Calendario por día, timer en vivo, carga manual de sesiones pasadas y conteo de
tiempo total (hoy / semana / acumulado).

Construida con **Vite + React + TypeScript**. Los datos se guardan localmente en
el navegador (`localStorage`), así que funciona offline y sin cuentas. Incluye
manifest PWA para "agregar a la pantalla de inicio" en el celular.

## Desarrollo

```bash
npm install
npm run dev        # servidor local (abrí la URL que imprime, p.ej. http://localhost:5173)
```

Para probarla en el celular en la misma red, corré `npm run dev -- --host` y
abrí la IP de tu compu desde el navegador del teléfono.

## Build de producción

```bash
npm run build      # genera dist/ (estático)
npm run preview    # sirve dist/ localmente para verificar
```

## Deploy

`dist/` es 100% estático, así que sirve cualquier hosting estático:

- **Vercel / Netlify**: import del repo, build command `npm run build`, output
  `dist`. Listo.
- **GitHub Pages**: subí el contenido de `dist/`. La app usa rutas con hash
  (`/#/...`) y `base: './'`, así que funciona en un subpath sin configuración
  extra del servidor.

## Funcionalidades

- **Calendario** — vista mensual con un punto en cada día con sesiones. Arriba,
  totales de **hoy**, **esta semana** y **acumulado total**.
- **Practicar ahora** — timer en vivo con Empezar / Pausa / Seguir. Al guardar,
  registra la sesión del día con foco y notas opcionales.
- **Carga manual** — tocá cualquier día pasado para cargar una sesión con su
  duración (atajos 15m / 30m / 45m / 1h / 1h30) más foco y notas.
- **Detalle del día** — lista de sesiones, total del día y borrado.

## Estructura

```
index.html                   Entry HTML + meta PWA
public/manifest.webmanifest  Manifest PWA
public/icon.svg              Ícono
src/
  main.tsx                   Bootstrap React + Router + provider
  App.tsx                    Rutas (hash router)
  index.css                  Estilos globales mobile-first (variables de tema)
  types.ts                   Modelo de datos (Session)
  format.ts                  Helpers de fecha/duración
  storage.ts                 Persistencia local (localStorage)
  SessionsContext.tsx        Estado global + CRUD + totales
  components/
    MonthCalendar.tsx        Grilla de calendario mensual
  screens/
    CalendarScreen.tsx       Calendario + estadísticas (home)
    DayScreen.tsx            Sesiones de un día
    TimerScreen.tsx          Timer en vivo
    AddSessionScreen.tsx     Carga manual
```

## Respaldo en Google Sheets (vía Apps Script)

La app respalda en **una planilla compartida** que actúa de base de datos.
localStorage es la copia de trabajo (offline); la planilla es el respaldo. Cada
persona pone **su nombre** (se guarda en `localStorage`) y sus sesiones van a una
columna `Nombre`, así varias personas comparten una planilla sin pisarse.

**No hay login de Google en la app.** El acceso a la planilla lo hace un **Google
Apps Script** publicado como *web app* que corre como el dueño de la planilla (ver
`apps-script/Code.gs`). La app solo le hace `fetch` mandando nombre + datos. Al
abrir por primera vez, la app pide **solo el nombre** (no es un login con
contraseña) y listo.

La escritura es **incremental, fila por fila** (no reescribe la planilla):

- **Crear sesión** (carga manual o parar el timer) → **agrega una fila** (append;
  el backend ignora IDs ya presentes, así no duplica).
- **Borrar sesión** → **borrado lógico**: marca la columna `Borrado` en `TRUE`. La
  fila nunca se elimina, así no se pierde nada por error; las filas marcadas se
  ignoran al leer.
- **Abrir la app sin cambios** → no hace ninguna llamada.
- **Dispositivo nuevo** → al poner tu nombre baja **solo tus** sesiones desde la
  planilla.

### Configuración (una sola vez)

1. **Deploy del Apps Script**: seguí los pasos que están al inicio de
   `apps-script/Code.gs` (pegarlo en *Extensiones → Apps Script* de tu planilla,
   *Implementar → Aplicación web*, *Ejecutar como: Yo*, *Acceso: Cualquiera*).
   Copiá la URL que termina en `/exec`.
2. **Env var**: poné esa URL en `VITE_SHEETS_ENDPOINT` (en `.env` para local y en
   las *Environment Variables* de tu hosting), y deployá la app. Es la única
   variable necesaria, y la misma para todos los dispositivos.

```
VITE_SHEETS_ENDPOINT=https://script.google.com/macros/s/XXXX/exec
```

Notas:
- La planilla queda en **tu Drive** como una planilla normal; la app nunca te
  pide login porque quien escribe es el Apps Script (con tu permiso, ya dado al
  deployar).
- Cada operación toca solo su propia fila (append, o marcar `Borrado`): varias
  personas pueden escribir a la vez sin pisarse y nunca se elimina nada.
- La URL del web app no es secreta; queda visible en el bundle del cliente (como
  cualquier endpoint de una app de navegador).
