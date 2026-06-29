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

## Respaldo en Google Sheets

La app respalda las sesiones en una planilla de tu Google Drive. localStorage es
la copia de trabajo (offline); la planilla es el respaldo de seguridad. Cuando
estás conectado, respalda **solo, en segundo plano, apenas guardás una sesión**.
Si se borra el navegador, "Restaurar desde la planilla" recupera todo.

Entrá a la pantalla **Respaldo** (botón ☁ arriba a la derecha) para conectarlo.

### Setup de Google Cloud (una sola vez, ~5 min)

1. En **console.cloud.google.com**, creá un proyecto.
2. **APIs y servicios → Biblioteca**: habilitá **Google Sheets API**.
3. **Pantalla de consentimiento OAuth**: tipo *Externo*; agregá tu email como
   *usuario de prueba*.
4. **Credenciales → Crear credenciales → ID de cliente OAuth → Aplicación web**.
5. En *Orígenes de JavaScript autorizados* agregá la(s) URL(s) desde donde abrís
   la app (ej. `http://localhost:5173` y tu URL de deploy).
6. Copiá el **Client ID** y pegalo en la pantalla Respaldo → **Conectar Google**.

Notas:
- Es una app web (sin servidor), así que el respaldo automático corre mientras
  la app está abierta. No perdés datos: apenas la abrís, respalda lo pendiente.
- Scope mínimo `drive.file`: la app solo accede a la planilla que ella crea, no
  al resto de tu Drive.
- El Client ID no es secreto (es público en apps client-side); se guarda en
  `localStorage`, no en el código.
