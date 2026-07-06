import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Metronome } from '../audio/metronome';
import { Tuner, noteName, noteOctave, type Pitch } from '../audio/tuner';

const BPM_MIN = 30;
const BPM_MAX = 240;
const BEAT_CHOICES = [2, 3, 4, 6];

// Open strings of the cello, for the reference chips under the tuner.
const CELLO_STRINGS = [
  { label: 'DO₂', midi: 36 },
  { label: 'SOL₂', midi: 43 },
  { label: 'RE₃', midi: 50 },
  { label: 'LA₃', midi: 57 },
];

export default function ToolsScreen() {
  const navigate = useNavigate();

  // ---- Metronome ----
  const metroRef = useRef<Metronome | null>(null);
  const [metroOn, setMetroOn] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [activeBeat, setActiveBeat] = useState(-1);
  const tapTimes = useRef<number[]>([]);

  const metro = (): Metronome => {
    if (!metroRef.current) {
      metroRef.current = new Metronome();
      metroRef.current.onBeat = setActiveBeat;
    }
    return metroRef.current;
  };

  const applyBpm = (value: number) => {
    const v = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)));
    setBpm(v);
    if (metroRef.current) metroRef.current.bpm = v;
  };

  const toggleMetro = () => {
    const m = metro();
    m.bpm = bpm;
    m.beatsPerBar = beatsPerBar;
    if (m.running) {
      m.stop();
      setMetroOn(false);
      setActiveBeat(-1);
    } else {
      m.start();
      setMetroOn(true);
    }
  };

  const chooseBeats = (n: number) => {
    setBeatsPerBar(n);
    if (metroRef.current) metroRef.current.beatsPerBar = n;
  };

  // Average the gaps between recent taps (a 2.5s silence starts over).
  const tapTempo = () => {
    const now = performance.now();
    const taps = tapTimes.current.filter((t) => now - t < 2500);
    taps.push(now);
    tapTimes.current = taps;
    if (taps.length >= 2) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      applyBpm(60000 / avg);
    }
  };

  // ---- Tuner ----
  const tunerRef = useRef<Tuner | null>(null);
  const [tunerOn, setTunerOn] = useState(false);
  const [micError, setMicError] = useState('');
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const lastPitch = useRef<{ p: Pitch; at: number } | null>(null);

  const startTuner = async () => {
    setMicError('');
    const t = new Tuner();
    // Hold the last reading briefly so the display doesn't flicker between bows.
    t.onPitch = (p) => {
      const now = performance.now();
      if (p) {
        lastPitch.current = { p, at: now };
        setPitch(p);
      } else if (!lastPitch.current || now - lastPitch.current.at > 5000) {
        setPitch(null);
      }
    };
    tunerRef.current = t;
    try {
      await t.start();
      setTunerOn(true);
    } catch {
      tunerRef.current = null;
      setMicError('No se pudo acceder al micrófono. Revisá los permisos del navegador.');
    }
  };

  const stopTuner = () => {
    tunerRef.current?.stop();
    tunerRef.current = null;
    setTunerOn(false);
    setPitch(null);
    lastPitch.current = null;
  };

  // Silence everything when leaving the screen.
  useEffect(
    () => () => {
      metroRef.current?.dispose();
      tunerRef.current?.stop();
    },
    [],
  );

  const inTune = pitch != null && Math.abs(pitch.cents) <= 5;

  return (
    <div className="screen">
      <div className="topbar">
        <button className="back-btn" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1>Herramientas</h1>
      </div>

      {/* ---- Metronome ---- */}
      <div className="tool-card">
        <div className="tool-title">Metrónomo</div>

        <div className="bpm-row">
          <button className="bpm-step" onClick={() => applyBpm(bpm - 1)}>
            −
          </button>
          <div className="bpm-display">
            <div className="bpm-value">{bpm}</div>
            <div className="bpm-unit">BPM</div>
          </div>
          <button className="bpm-step" onClick={() => applyBpm(bpm + 1)}>
            ＋
          </button>
        </div>

        <input
          className="bpm-slider"
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpm}
          onChange={(e) => applyBpm(Number(e.target.value))}
        />

        <div className="beat-dots">
          {Array.from({ length: beatsPerBar }, (_, i) => (
            <span
              key={i}
              className={
                'beat-dot' +
                (i === 0 ? ' accent' : '') +
                (metroOn && i === activeBeat ? ' on' : '')
              }
            />
          ))}
        </div>

        <div className="beats-row">
          {BEAT_CHOICES.map((n) => (
            <button
              key={n}
              className={'beats-chip' + (n === beatsPerBar ? ' sel' : '')}
              onClick={() => chooseBeats(n)}
            >
              {n}/4
            </button>
          ))}
          <button className="beats-chip tap" onClick={tapTempo}>
            Tap
          </button>
        </div>

        <button
          className={metroOn ? 'btn btn-ghost' : 'btn btn-primary'}
          onClick={toggleMetro}
        >
          {metroOn ? '■ Detener' : '▶ Iniciar'}
        </button>
      </div>

      {/* ---- Tuner ---- */}
      <div className="tool-card">
        <div className="tool-title">Afinador</div>

        {!tunerOn ? (
          <>
            <p className="cal-hint" style={{ marginTop: 0 }}>
              Usa el micrófono para detectar la nota. Todo queda en tu
              dispositivo, no se graba nada.
            </p>
            {micError && <p className="tune-error">{micError}</p>}
            <button className="btn btn-primary" onClick={startTuner}>
              🎤 Activar afinador
            </button>
          </>
        ) : (
          <>
            <div className="tune-note" data-ok={inTune}>
              {pitch ? (
                <>
                  {noteName(pitch.midi)}
                  <span className="tune-oct">{noteOctave(pitch.midi)}</span>
                </>
              ) : (
                '—'
              )}
            </div>
            <div className="tune-freq">
              {pitch ? `${pitch.freq.toFixed(1)} Hz` : 'Tocá una cuerda…'}
            </div>

            <div className="tune-gauge">
              <div className="tune-mark low">♭</div>
              <div className="tune-scale">
                <div className="tune-center" />
                {pitch && (
                  <div
                    className="tune-needle"
                    data-ok={inTune}
                    style={{ left: `${50 + pitch.cents}%` }}
                  />
                )}
              </div>
              <div className="tune-mark high">♯</div>
            </div>
            <div className="tune-cents">
              {pitch ? `${pitch.cents > 0 ? '+' : ''}${pitch.cents}¢` : ' '}
            </div>

            <div className="strings-row">
              {CELLO_STRINGS.map((s) => (
                <span
                  key={s.midi}
                  className={
                    'string-chip' + (pitch?.midi === s.midi ? ' sel' : '')
                  }
                >
                  {s.label}
                </span>
              ))}
            </div>

            <button className="btn btn-ghost" onClick={stopTuner}>
              Detener afinador
            </button>
          </>
        )}
      </div>
    </div>
  );
}
