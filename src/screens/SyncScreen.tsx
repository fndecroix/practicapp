import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSync } from '../SyncContext';
import { useSessions } from '../SessionsContext';
import { timeAgo } from '../format';

export default function SyncScreen() {
  const navigate = useNavigate();
  const sync = useSync();
  const { sessions } = useSessions();
  const [clientIdInput, setClientIdInput] = useState(sync.clientId);
  const [nameInput, setNameInput] = useState(sync.name);
  const [msg, setMsg] = useState<string | null>(null);

  const busy = sync.status === 'working';

  const saveClientId = () => {
    sync.setClientId(clientIdInput);
    setMsg('Client ID guardado.');
  };

  const saveName = () => {
    sync.setName(nameInput);
    setMsg('Nombre guardado.');
  };

  const onConnect = async () => {
    setMsg(null);
    try {
      await sync.connect();
      setMsg('¡Conectado! Tu respaldo quedó creado en Google Drive.');
    } catch (e) {
      setMsg('No se pudo conectar: ' + (e as Error).message);
    }
  };

  const onBackup = async () => {
    setMsg(null);
    try {
      await sync.backupNow();
      setMsg('Respaldo actualizado.');
    } catch (e) {
      setMsg('Error al respaldar: ' + (e as Error).message);
    }
  };

  const onRestore = async () => {
    if (
      !confirm(
        'Restaurar reemplaza las sesiones de este dispositivo con las TUYAS de la planilla (las que están a tu nombre). ¿Continuar?',
      )
    )
      return;
    setMsg(null);
    try {
      const restored = await sync.restore();
      setMsg(`Restauradas ${restored.length} sesiones desde la planilla.`);
    } catch (e) {
      setMsg('Error al restaurar: ' + (e as Error).message);
    }
  };

  const sheetUrl = sync.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${sync.spreadsheetId}/edit`
    : null;

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back-btn" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1>Respaldo</h1>
      </div>

      {/* Status card */}
      <div className="card sync-status">
        {!sync.connected ? (
          <p className="muted" style={{ margin: 0 }}>
            Todavía no conectaste un respaldo. Tus datos viven solo en este
            navegador.
          </p>
        ) : (
          <>
            <div className="sync-line">
              <span className="muted">Estado</span>
              <span className={sync.dirty ? 'pill warn' : 'pill ok'}>
                {busy
                  ? 'Respaldando…'
                  : sync.dirty
                    ? 'Cambios sin respaldar'
                    : 'Todo respaldado ✓'}
              </span>
            </div>
            <div className="sync-line">
              <span className="muted">Última copia</span>
              <span>{timeAgo(sync.lastBackupAt)}</span>
            </div>
            <div className="sync-line">
              <span className="muted">Sesiones</span>
              <span>{sessions.length}</span>
            </div>
          </>
        )}
      </div>

      {/* Step 1: your name (written into the shared sheet's Nombre column) */}
      <label className="field-label">Tu nombre</label>
      <input
        className="input"
        placeholder="Ej. Facu"
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
      />
      <button
        className="btn btn-ghost"
        style={{ marginTop: 10 }}
        onClick={saveName}
        disabled={!nameInput.trim() || nameInput.trim() === sync.name}
      >
        Guardar nombre
      </button>

      {/* Step 2: Client ID — hidden when provided by a build env var */}
      {sync.clientIdLocked ? (
        <p className="muted" style={{ marginTop: 18 }}>
          Client ID de Google configurado por la app ✓
        </p>
      ) : (
        <>
          <label className="field-label" style={{ marginTop: 18 }}>
            Client ID de Google (OAuth) — paso único
          </label>
          <input
            className="input"
            placeholder="xxxxxxxx.apps.googleusercontent.com"
            value={clientIdInput}
            onChange={(e) => setClientIdInput(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            className="btn btn-ghost"
            style={{ marginTop: 10 }}
            onClick={saveClientId}
            disabled={!clientIdInput.trim()}
          >
            Guardar Client ID
          </button>
        </>
      )}

      {/* Bootstrap helper: surface the created sheet id to pin via env var */}
      {sync.spreadsheetId && !sync.sheetIdLocked && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Planilla creada. Para que <b>todos los dispositivos</b> usen esta
            misma planilla, pegá este ID en la variable{' '}
            <code>VITE_BACKUP_SPREADSHEET_ID</code> y volvé a deployar:
          </p>
          <code style={{ wordBreak: 'break-all' }}>{sync.spreadsheetId}</code>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
        {!sync.connected ? (
          <button
            className="btn btn-primary"
            onClick={onConnect}
            disabled={!sync.configured || busy}
          >
            🔗 Conectar Google y crear respaldo
          </button>
        ) : (
          <>
            <button className="btn btn-primary" onClick={onBackup} disabled={busy}>
              ⬆ Respaldar ahora
            </button>
            <button className="btn btn-ghost" onClick={onRestore} disabled={busy}>
              ⬇ Restaurar desde la planilla
            </button>
            {sheetUrl && (
              <a
                className="btn btn-ghost"
                href={sheetUrl}
                target="_blank"
                rel="noreferrer"
              >
                📄 Abrir la planilla en Drive
              </a>
            )}
            <button className="btn btn-ghost danger-text" onClick={sync.disconnect}>
              Desconectar
            </button>
          </>
        )}
      </div>

      {msg && <p className="sync-msg">{msg}</p>}

      <details className="help">
        <summary>¿Cómo obtengo el Client ID? (5 min, una sola vez)</summary>
        <ol>
          <li>
            Entrá a <b>console.cloud.google.com</b> y creá un proyecto (botón
            arriba a la izquierda → Nuevo proyecto).
          </li>
          <li>
            Menú → <b>APIs y servicios → Biblioteca</b>, buscá{' '}
            <b>Google Sheets API</b> y tocá <b>Habilitar</b>.
          </li>
          <li>
            <b>APIs y servicios → Pantalla de consentimiento OAuth</b>: tipo{' '}
            <b>Externo</b>, completá nombre y tu email, guardá. En{' '}
            <b>Usuarios de prueba</b> agregá tu propio email de Google.
          </li>
          <li>
            <b>Credenciales → Crear credenciales → ID de cliente de OAuth</b>,
            tipo <b>Aplicación web</b>.
          </li>
          <li>
            En <b>Orígenes de JavaScript autorizados</b> agregá la URL desde la
            que abrís la app (ej. <code>{window.location.origin}</code> y la URL
            de tu deploy).
          </li>
          <li>
            Copiá el <b>Client ID</b> (termina en{' '}
            <code>.apps.googleusercontent.com</code>) y ponelo en la variable{' '}
            <code>VITE_GOOGLE_CLIENT_ID</code> (o pegalo arriba si no usás env
            vars).
          </li>
        </ol>
      </details>
    </div>
  );
}
