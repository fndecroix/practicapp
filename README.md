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
- **Borrar sesión** → ubica esa fila por su `ID` y la elimina.
- **Abrir la app sin cambios** → no escribe nada. Se lleva un registro local de
  los IDs ya subidos para no duplicar; en un dispositivo nuevo reconcilia una vez
  contra la planilla.
- **Restaurar desde la planilla** → recupera **solo tus** sesiones (las que están
  a tu nombre) en este dispositivo.

### Modelo de cuentas: una sola cuenta de Google para todos

Con el scope mínimo `drive.file` la app solo puede tocar la planilla que **ella
misma creó con esa cuenta**. Por eso todos los dispositivos se loguean con **la
misma cuenta de Google** (la dueña de la planilla) — una vez por dispositivo; el
token se renueva solo en segundo plano. El login de Google autoriza a una cuenta
en *ese* dispositivo: no hay forma, sin backend, de que un login cubra a otros.

### Configuración (env vars, una sola vez)

El Client ID y el ID de la planilla se fijan por variables de entorno de build
(ver `.env.example`), así no hay que configurarlos en cada dispositivo:

```
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_BACKUP_SPREADSHEET_ID=<id de la planilla>
```

Pasos:

1. **Google Cloud** (una vez, ~5 min): en **console.cloud.google.com** creá un
   proyecto; **APIs y servicios → Biblioteca** habilitá **Google Sheets API**;
   **Pantalla de consentimiento OAuth** tipo *Externo* con la cuenta compartida
   como *usuario de prueba*; **Credenciales → ID de cliente OAuth → Aplicación
   web**, agregando en *Orígenes de JavaScript* tus URLs (`http://localhost:5173`
   y la de deploy). Copiá el **Client ID** → `VITE_GOOGLE_CLIENT_ID`.
2. **Bootstrap de la planilla** (una vez): dejá `VITE_BACKUP_SPREADSHEET_ID`
   vacío, abrí la app con la cuenta compartida, poné tu nombre y tocá *Conectar*.
   La app crea la planilla y te muestra su **ID** en la pantalla Respaldo.
   Pegalo en `VITE_BACKUP_SPREADSHEET_ID` y volvé a deployar. Listo: queda fija.

Notas:
- Es una app web (sin servidor), así que el respaldo automático corre mientras la
  app está abierta. Apenas la abrís, sube lo pendiente (solo lo nuevo/borrado).
- Como cada operación toca solo su propia fila, dos personas pueden escribir a la
  vez sin pisarse. Solo queda una ventana de carrera mínima al borrar (se leen las
  filas y luego se elimina por índice); para un grupo chico es despreciable.
- Ni el Client ID ni el ID de la planilla son secretos. Si no usás env vars, la
  pantalla Respaldo sigue dejando pegar el Client ID a mano (fallback).
