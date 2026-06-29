/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth Client ID de Google (público, no secreto). Fija la app en todos los dispositivos. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** ID de la planilla compartida de respaldo. Fija una sola planilla para todos. */
  readonly VITE_BACKUP_SPREADSHEET_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
