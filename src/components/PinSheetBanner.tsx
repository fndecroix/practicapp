import { useSync } from '../SyncContext';

/**
 * Setup-only banner: after the app creates the backup sheet, show its id so it
 * can be pinned in VITE_BACKUP_SPREADSHEET_ID. Once that env var is set this
 * never renders (pinSheetId is null), so normal users never see it.
 */
export function PinSheetBanner() {
  const { pinSheetId } = useSync();
  if (!pinSheetId) return null;

  return (
    <div className="pin-banner">
      <span>
        Planilla creada en tu Drive. Fijala para todos los dispositivos poniendo
        este ID en <code>VITE_BACKUP_SPREADSHEET_ID</code>:
      </span>
      <code className="pin-id">{pinSheetId}</code>
    </div>
  );
}
