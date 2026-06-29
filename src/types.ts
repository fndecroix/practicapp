export type Session = {
  /** Stable unique id */
  id: string;
  /** Local calendar day, formatted YYYY-MM-DD */
  date: string;
  /** Epoch ms when the session started (live) or was logged (manual) */
  startedAt: number;
  /** Practiced time in seconds */
  durationSec: number;
  /** Optional focus of the session (scales, repertoire, etudes...) */
  focus?: string;
  /** Free-form notes */
  notes?: string;
  /** Whether this session has been pushed to Google Sheets */
  synced?: boolean;
};
