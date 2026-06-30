/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del Apps Script web app que respalda en Google Sheets (ver apps-script/). */
  readonly VITE_SHEETS_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
