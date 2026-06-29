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

## Respaldo en Google Sheets (planilla compartida multiusuario)

La app usa **una única planilla compartida** de Google Drive como base de datos.
localStorage es la copia de trabajo (offline); la planilla es el respaldo. Cada
persona escribe **su nombre** (se guarda en `localStorage`) y sus sesiones van a
una columna `Nombre`. Así varias personas comparten una planilla sin pisarse.

La escritura es **incremental, fila por fila** (no reescribe la planilla):

- **Crear sesión** (carga manual o parar el timer) → **agrega una fila** (append).
- **Borrar sesión** → **borrado lógico**: marca la columna `Borrado` en `TRUE`. La
  fila nunca se elimina, así no se pierde nada de la planilla por error. Las filas
  marcadas se ignoran al leer/restaurar.
- **Abrir la app sin cambios** → no escribe nada. Se lleva un registro local de
  los IDs ya subidos para no duplicar; en un dispositivo nuevo reconcilia una vez
  contra la planilla.
- **Dispositivo nuevo** → al poner tu nombre baja **solo tus** sesiones (las que
  están a tu nombre) desde la planilla.

No hay pantalla de configuración: al abrir la app por primera vez te pide **tu
nombre** (no es un login con contraseña, solo el nombre, que queda guardado) y, en
ese mismo paso, pide el permiso de Google una vez. En un dispositivo nuevo, al
poner tu nombre, baja tu historial de la planilla.

### Modelo de cuentas: una sola cuenta de Google para todos

Todos los dispositivos se loguean con **la misma cuenta de Google** (la dueña de
la planilla) — una vez por dispositivo; el token se renueva solo en segundo plano.
El login de Google autoriza a una cuenta en *ese* dispositivo: no hay forma, sin
backend, de que un login cubra a otros. Scope mínimo `drive.file`: **la app crea
la planilla** y solo toca ese archivo, no el resto de tu Drive. La planilla queda
en **tu Drive** como una planilla normal (la ves, la abrís y la compartís vos; lo
acotado es la visión de la *app*, no la tuya).

### Configuración (env vars)

```
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com   # obligatorio
VITE_BACKUP_SPREADSHEET_ID=<id de la planilla>         # se completa tras el bootstrap
```

Pasos:

1. **Google Cloud** (una vez, ~5 min): en **console.cloud.google.com** creá un
   proyecto; **APIs y servicios → Biblioteca** habilitá **Google Sheets API**;
   **Pantalla de consentimiento OAuth** tipo *Externo* con la cuenta compartida
   como *usuario de prueba*; **Credenciales → ID de cliente OAuth → Aplicación
   web**, agregando en *Orígenes de JavaScript* tus URLs (`http://localhost:5173`
   y la de deploy). Copiá el **Client ID** → `VITE_GOOGLE_CLIENT_ID`.
2. **Bootstrap de la planilla** (una vez): dejá `VITE_BACKUP_SPREADSHEET_ID`
   vacío, abrí la app con la cuenta compartida y poné tu nombre. La app **crea la
   planilla** en tu Drive y te muestra su **ID** en un cartelito. Pegá ese ID en
   `VITE_BACKUP_SPREADSHEET_ID` y volvé a deployar: queda fija para todos.

Notas:
- Es una app web (sin servidor), así que el respaldo automático corre mientras la
  app está abierta. Apenas la abrís, sube lo pendiente (solo lo nuevo/borrado).
- Como cada operación toca solo su propia fila (append, o marcar `Borrado`), dos
  personas pueden escribir a la vez sin pisarse y nunca se elimina nada.
- Ni el Client ID ni el ID de la planilla son secretos.
