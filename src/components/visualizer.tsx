"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import {
  PlayIcon,
  PauseIcon,
  UploadSimpleIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ArrowsOutSimpleIcon,
  ArrowsInSimpleIcon,
  ArrowCounterClockwiseIcon,
} from "@phosphor-icons/react";
import Knob from "./knob";
import ScenePicker from "./scene-picker";
import Playlist from "./playlist";
import { AudioEngine, type AudioEffect } from "@/lib/audio-engine";
import {
  formatTime,
  isAudioFile,
  readAudioDuration,
  type PlaylistTrack,
} from "@/lib/audio-playlist";
import { VisualEngine, type VisualSettings } from "@/lib/visual-engine";
import { VisualPresence, fragmentVisibility } from "@/lib/visual-presence";

const PRESETS = [
  "Eternal void",
  "Ghost in the signal",
  "Static bloom",
  "Afterimage",
];
const DEFAULTS: VisualSettings = {
  depth: 50,
  speed: 42,
  size: 50,
  intensity: 65,
  noise: 30,
  glitch: 15,
  contrast: 55,
  brightness: 65,
  motion: 50,
  bloom: 65,
  mode: "Orbit",
  quality: "High",
  preset: 0,
  powered: true,
  formation: "Auto",
};
const EFFECTS: AudioEffect[] = [
  "None",
  "Reverb",
  "Delay",
  "Distort",
  "Chorus",
  "Flanger",
  "Phaser",
];

function Screw({ position }: { position: string }) {
  return <span className={`screw screw--${position}`} aria-hidden="true" />;
}

function OptionGroup<T extends string>({
  label,
  values,
  value,
  onChange,
  multiple = false,
}: {
  label: string;
  values: readonly T[];
  value: T | readonly T[];
  onChange: (v: T) => void;
  multiple?: boolean;
}) {
  return (
    <fieldset
      className={`radio-group ${multiple ? "effect-group" : "quality-group"}`}
    >
      <legend>{label}</legend>
      {values.map((option) => (
        <label key={option} className="radio-option">
          <input
            type={multiple ? "checkbox" : "radio"}
            name={label}
            value={option}
            checked={
              Array.isArray(value)
                ? option === "None"
                  ? value.length === 0
                  : value.includes(option)
                : value === option
            }
            onChange={() => onChange(option)}
          />
          <span className="radio-light" />
          <span>{option}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Fader({
  label,
  value,
  onChange,
  start,
  end,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  start: string;
  end: string;
}) {
  return (
    <div className="fader-control">
      <div className="fader">
        <div className="fader-markings" aria-hidden="true" />
        <div className="fader-slot" aria-hidden="true" />
        <div
          className="fader-thumb"
          style={{ "--fader-position": `${100 - value}%` } as CSSProperties}
          aria-hidden="true"
        />
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <div className="fader-extents">
        <span>{start}</span>
        <span>{end}</span>
      </div>
      <span className="control-label">{label}</span>
    </div>
  );
}

function Waveform({
  analyser,
  playing,
}: {
  analyser: () => AnalyserNode | null;
  playing: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const data = new Float32Array(2048);
    const retained = new Float32Array(2048);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const presence = new VisualPresence(reducedMotion);
    let frame = 0,
      last = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 50 || document.hidden) return;
      const delta = last ? (now - last) / 1000 : 0.05;
      last = now;
      const node = analyser();
      const active = playingRef.current && node?.context.state === "running";
      if (node && active) node.getFloatTimeDomainData(data);
      else data.fill(0);
      let power = 0;
      for (const sample of data) power += sample * sample;
      const rms = Math.sqrt(power / data.length);
      const state = presence.update(rms, active, delta);
      if (rms > 0.0005) retained.set(data);
      ctx.clearRect(0, 0, 240, 80);
      if (state.phase === "hidden") return;
      ctx.globalAlpha = state.opacity;
      ctx.strokeStyle = "#666666";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < 180; i++) {
        const material = fragmentVisibility(
          state.opacity,
          (Math.sin(Math.floor(i / 8) * 32.17 + state.seed * 71) + 1) / 2,
        );
        const disorder = reducedMotion
          ? 0
          : (1 - material) * (1 - state.opacity);
        const signal = retained[i * 10] * 34;
        const x =
            (i / 179) * 240 +
            Math.sin(i * 0.7 + state.seed * 10) * disorder * 18,
          y = 40 + signal + Math.cos(i * 0.4) * disorder * 15;
        if (i === 0 || material < 0.02 || (i % 8 === 0 && state.opacity < 0.99))
          ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser]);
  return (
    <canvas
      ref={canvas}
      width="240"
      height="80"
      className="input-waveform"
      aria-hidden="true"
    />
  );
}

export default function Visualizer() {
  const [settings, setSettings] = useState<VisualSettings>(DEFAULTS);
  const [input, setInput] = useState(50),
    [output, setOutput] = useState(50);
  const [drive, setDrive] = useState(0),
    [filter, setFilter] = useState(88),
    [mix, setMix] = useState(35);
  const [effects, setEffects] = useState<AudioEffect[]>(["Reverb"]);
  const [audioSpeed, setAudioSpeed] = useState(1);
  const [playing, setPlaying] = useState(false),
    [loading, setLoading] = useState(false);
  const [track, setTrack] = useState("Demo signal"),
    [duration, setDuration] = useState(0),
    [elapsed, setElapsed] = useState(0);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const tracksRef = useRef<PlaylistTrack[]>([]);
  const activeTrackRef = useRef<string | null>(null);
  const metadataAbort = useRef<AbortController | null>(null);
  const [error, setError] = useState(""),
    [dragOver, setDragOver] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    screen = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const levelReadout = useRef<HTMLSpanElement>(null);
  const audio = useRef<AudioEngine | null>(null);
  const settingsRef = useRef(settings),
    loadingRef = useRef(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const getAnalyser = useCallback(() => audio.current?.analyser ?? null, []);
  const update = useCallback(
    <K extends keyof VisualSettings>(key: K, value: VisualSettings[K]) =>
      setSettings((s) => ({ ...s, [key]: value })),
    [],
  );

  useEffect(() => {
    if (!canvas.current) return;
    const engine = new VisualEngine(
      canvas.current,
      () => settingsRef.current,
      getAnalyser,
      () =>
        audio.current?.isPlaying === true &&
        audio.current.context.state === "running",
      (signal) => {
        if (levelReadout.current)
          levelReadout.current.textContent =
            signal.rms > 0.0015
              ? `${(20 * Math.log10(signal.rms)).toFixed(1)} dB`
              : "−∞ dB";
      },
      () => audio.current?.remainingTime ?? null,
      () =>
        audio.current
          ? {
              position: audio.current.currentTime,
              duration: audio.current.duration,
            }
          : null,
    );
    return () => engine.dispose();
  }, [getAnalyser]);

  useEffect(() => {
    metadataAbort.current = new AbortController();
    return () => {
      metadataAbort.current?.abort();
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setElapsed(audio.current?.currentTime ?? 0),
      250,
    );
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  function getAudio() {
    if (!audio.current) {
      const engine = new AudioEngine();
      engine.setInput(input);
      engine.setOutput(output);
      engine.setFilter(filter);
      engine.setEffects(effects, mix);
      engine.setDrive(drive);
      engine.setPlaybackRate(audioSpeed);
      engine.onEnded = () => {
        setPlaying(false);
        setElapsed(0);
        const index = tracksRef.current.findIndex(
          (item) => item.id === activeTrackRef.current,
        );
        const next = tracksRef.current
          .slice(index + 1)
          .find((item) => !item.failed);
        if (index >= 0 && next) void selectTrack(next.id);
      };
      audio.current = engine;
    }
    return audio.current;
  }

  async function togglePlayback() {
    if (loadingRef.current) return;
    setError("");
    try {
      const engine = getAudio();
      if (engine.isPlaying) {
        engine.pause();
        setPlaying(false);
      } else {
        if (!settings.powered) update("powered", true);
        await engine.play();
        setPlaying(true);
      }
    } catch {
      setError("Audio could not start. Try loading an audio file.");
    }
  }

  function changeAudioSpeed(value: number) {
    setAudioSpeed(value);
    audio.current?.setPlaybackRate(value);
  }

  function toggleEffect(effect: AudioEffect) {
    const next =
      effect === "None"
        ? []
        : effects.includes(effect)
          ? effects.filter((selected) => selected !== effect)
          : [...effects, effect];
    setEffects(next);
    audio.current?.setEffects(next, mix);
  }

  function updateTracks(next: PlaylistTrack[]) {
    tracksRef.current = next;
    setTracks(next);
  }

  async function selectTrack(id: string, autoplay = true) {
    const selected = tracksRef.current.find((item) => item.id === id);
    if (!selected || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");
    let decoded = false;
    try {
      const engine = getAudio();
      engine.pause();
      setPlaying(false);
      const seconds = await engine.load(selected.file);
      if (metadataAbort.current?.signal.aborted) return;
      decoded = true;
      activeTrackRef.current = id;
      setActiveTrackId(id);
      setDuration(seconds);
      setElapsed(0);
      setTrack(selected.name);
      updateTracks(
        tracksRef.current.map((item) =>
          item.id === id ? { ...item, duration: seconds, failed: false } : item,
        ),
      );
      update("powered", true);
      if (autoplay) {
        await engine.play();
        setPlaying(true);
      }
    } catch {
      if (metadataAbort.current?.signal.aborted) return;
      if (!decoded)
        updateTracks(
          tracksRef.current.map((item) =>
            item.id === id ? { ...item, failed: true } : item,
          ),
        );
      setError(
        decoded
          ? "Audio could not start. Press Play to try again."
          : `“${selected.name}” could not be opened. Try another track, MP3, or WAV.`,
      );
      setPlaying(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function loadAudio(files: FileList | File[] | null) {
    if (!files?.length) return;
    const accepted = Array.from(files).filter(isAudioFile);
    if (!accepted.length) {
      setError("Choose audio files: MP3, WAV, FLAC, or M4A.");
      return;
    }
    const added = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      duration: null,
    }));
    const hadTracks = tracksRef.current.length > 0;
    updateTracks([...tracksRef.current, ...added]);
    if (!hadTracks) void selectTrack(added[0].id);
    if (accepted.length !== files.length)
      setError("Only audio files were added to the playlist.");

    // Probe one file at a time, releasing every temporary object URL.
    const signal = metadataAbort.current?.signal;
    if (signal)
      void (async () => {
        for (const item of added) {
          if (signal.aborted) break;
          const seconds = await readAudioDuration(item.file, signal);
          if (signal.aborted) break;
          if (seconds !== null)
            updateTracks(
              tracksRef.current.map((track) =>
                track.id === item.id && track.duration === null
                  ? { ...track, duration: seconds }
                  : track,
              ),
            );
        }
      })();
  }

  function removeTrack(id: string) {
    if (loadingRef.current) return;
    const index = tracksRef.current.findIndex((item) => item.id === id);
    const remaining = tracksRef.current.filter((item) => item.id !== id);
    updateTracks(remaining);
    if (id !== activeTrackRef.current) return;
    const wasPlaying = audio.current?.isPlaying ?? false;
    audio.current?.clear();
    activeTrackRef.current = null;
    setActiveTrackId(null);
    setPlaying(false);
    setTrack("Demo signal");
    setDuration(0);
    setElapsed(0);
    const next = remaining[Math.min(index, remaining.length - 1)];
    if (next) void selectTrack(next.id, wasPlaying);
  }

  function changePreset(direction: number) {
    setSettings((s) => {
      const preset = (s.preset + direction + PRESETS.length) % PRESETS.length;
      const values = [
        { depth: 50, speed: 42, size: 50, noise: 30, bloom: 65 },
        { depth: 75, speed: 30, size: 42, noise: 15, bloom: 40 },
        { depth: 35, speed: 58, size: 55, noise: 55, bloom: 75 },
        { depth: 65, speed: 24, size: 46, noise: 25, bloom: 85 },
      ][preset];
      return { ...s, ...values, preset };
    });
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (screen.current?.requestFullscreen)
        await screen.current.requestFullscreen();
      else setFullscreen((v) => !v);
    } catch {
      setFullscreen((v) => !v);
    }
  }

  function power() {
    if (settings.powered && playing) {
      audio.current?.pause();
      setPlaying(false);
    }
    update("powered", !settings.powered);
  }

  return (
    <main className="instrument-stage">
      <section className="instrument" aria-label="Audio visualizer instrument">
        <Screw position="tl" />
        <Screw position="tr" />
        <Screw position="bl" />
        <Screw position="br" />
        <header className="instrument-header">
          <span className="header-status">
            <span className={`status-led ${settings.powered ? "is-on" : ""}`} />
            Stereo <span className="header-status-divider">/</span> realtime
          </span>
          <h1>Audio visualizer</h1>
          <button
            className="load-button"
            onClick={() => fileInput.current?.click()}
            disabled={loading}
          >
            <UploadSimpleIcon size={14} weight="regular" />
            <span>{loading ? "Loading…" : "Load audio"}</span>
          </button>
        </header>

        <div className="workspace">
          <aside
            className="control-rail left-rail"
            aria-label="Input and signal controls"
          >
            <Knob
              label="Input"
              large
              value={input}
              onChange={(v) => {
                setInput(v);
                audio.current?.setInput(v);
              }}
              minLabel="−∞"
              maxLabel="+12"
            />
            <Waveform analyser={getAnalyser} playing={playing} />
            <div className="rail-knobs input-knobs">
              <Knob
                label="Drive"
                value={drive}
                onChange={(v) => {
                  setDrive(v);
                  audio.current?.setDrive(v);
                }}
              />
              <Knob
                label="Glitch"
                value={settings.glitch}
                onChange={(v) => update("glitch", v)}
              />
              <Knob
                label="Noise"
                value={settings.noise}
                onChange={(v) => update("noise", v)}
              />
            </div>
            <Fader
              label="Filter"
              value={filter}
              onChange={(v) => {
                setFilter(v);
                audio.current?.setFilter(v);
              }}
              start="20Hz"
              end="20kHz"
            />
            <div className="power-group">
              <span className="section-caption">Power</span>
              <button
                className={`power-switch ${settings.powered ? "is-on" : ""}`}
                role="switch"
                aria-checked={settings.powered}
                aria-label="Visualizer power"
                onClick={power}
              >
                <span>On</span>
                <span>Off</span>
              </button>
            </div>
            <div className="audio-speed-control">
              <label htmlFor="audio-speed">Audio speed</label>
              <input
                id="audio-speed"
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={audioSpeed}
                aria-label="Audio speed"
                aria-valuetext={`${audioSpeed.toFixed(2)} times normal speed`}
                onChange={(event) =>
                  changeAudioSpeed(Number(event.target.value))
                }
              />
              <button
                aria-label="Reset audio speed"
                title="Reset audio speed to 1×"
                onClick={() => changeAudioSpeed(1)}
              >
                {audioSpeed.toFixed(2)}×
              </button>
            </div>
          </aside>

          <div className="display-column">
            <div
              ref={screen}
              className={`visual-screen ${dragOver ? "is-dragover" : ""} ${fullscreen ? "is-fullscreen" : ""} ${!settings.powered ? "is-off" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                loadAudio(e.dataTransfer.files);
              }}
            >
              <div
                className={`visual-layout ${tracks.length > 1 ? "has-playlist" : ""}`}
              >
                <div className="visual-stage">
                  <canvas
                    ref={canvas}
                    className="visual-canvas"
                    aria-label={`${settings.mode} audio visualization. ${PRESETS[settings.preset]} preset.`}
                  />
                  <div className="screen-glass" aria-hidden="true" />
                  <i className="reticle reticle--tl" aria-hidden="true" />
                  <i className="reticle reticle--tr" aria-hidden="true" />
                  <i className="reticle reticle--bl" aria-hidden="true" />
                  <i className="reticle reticle--br" aria-hidden="true" />
                  <div
                    className="screen-readout readout--tl"
                    aria-hidden="true"
                  >
                    <span>Frequency</span>
                    <span>20</span>
                    <span>200</span>
                    <span>2K</span>
                    <span>20K</span>
                  </div>
                  <div
                    className="screen-readout readout--tr"
                    aria-hidden="true"
                  >
                    <span>Spectrum</span>
                    <span>L/R</span>
                    <span>Phase</span>
                    <span>3D</span>
                  </div>
                  <div
                    className="screen-readout readout--bl"
                    aria-hidden="true"
                  >
                    <span>Audio</span>
                    <span>Reactive</span>
                    <span>Realtime</span>
                  </div>
                  <div
                    className="screen-readout readout--br"
                    aria-hidden="true"
                  >
                    <span>
                      {duration
                        ? "Stereo"
                        : `${Math.round(138 * audioSpeed)} BPM`}
                    </span>
                    <span>
                      {duration
                        ? "Local audio"
                        : audioSpeed === 1
                          ? "E minor"
                          : "Demo audio"}
                    </span>
                    <span ref={levelReadout}>−∞ dB</span>
                  </div>

                  <div className="transport">
                    <button
                      className="play-button"
                      aria-label={playing ? "Pause audio" : "Play audio"}
                      onClick={() => void togglePlayback()}
                      disabled={loading}
                    >
                      {playing ? (
                        <PauseIcon size={17} weight="fill" />
                      ) : (
                        <PlayIcon size={17} weight="fill" />
                      )}
                    </button>
                    <div className="track-info">
                      <span className="track-name">
                        {loading ? "Decoding audio…" : track}
                      </span>
                      <div className="track-time">
                        <span>{formatTime(elapsed)}</span>
                        <span>
                          {duration
                            ? formatTime(duration)
                            : `${Math.round(138 * audioSpeed)} BPM`}
                        </span>
                      </div>
                      {duration > 0 && (
                        <input
                          type="range"
                          className="track-seek"
                          style={
                            {
                              "--track-progress": `${Math.min(100, (elapsed / duration) * 100)}%`,
                            } as CSSProperties
                          }
                          min="0"
                          max={duration}
                          step="0.1"
                          value={Math.min(elapsed, duration)}
                          aria-label="Playback position"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const time = Number(e.target.value);
                            audio.current?.seek(time);
                            setElapsed(time);
                          }}
                        />
                      )}
                    </div>
                    <button
                      className="screen-icon-button"
                      aria-label="Load audio file"
                      title="Load audio file"
                      onClick={() => fileInput.current?.click()}
                      disabled={loading}
                    >
                      <UploadSimpleIcon size={16} />
                    </button>
                    <button
                      className="screen-icon-button"
                      aria-label={
                        fullscreen ? "Exit fullscreen" : "Fullscreen visualizer"
                      }
                      title="Fullscreen"
                      onClick={() => void toggleFullscreen()}
                    >
                      {fullscreen ? (
                        <ArrowsInSimpleIcon size={16} />
                      ) : (
                        <ArrowsOutSimpleIcon size={16} />
                      )}
                    </button>
                  </div>
                  {!settings.powered && (
                    <span className="screen-off-label">Standby</span>
                  )}
                </div>
                {tracks.length > 1 && (
                  <Playlist
                    tracks={tracks}
                    activeId={activeTrackId}
                    playing={playing}
                    loading={loading}
                    onSelect={(id) => void selectTrack(id)}
                    onToggle={() => void togglePlayback()}
                    onRemove={removeTrack}
                  />
                )}
              </div>
              {dragOver && (
                <div className="drop-prompt">
                  <UploadSimpleIcon size={28} />
                  <span>Drop audio to add tracks</span>
                </div>
              )}
            </div>

            <ScenePicker
              value={settings.mode}
              onChange={(v) => update("mode", v)}
              formation={settings.formation ?? "Auto"}
              onFormationChange={(value) => update("formation", value)}
            />
            <div className="preset-section">
              <span className="section-caption">Presets</span>
              <div className="preset-display">
                <button
                  aria-label="Previous preset"
                  onClick={() => changePreset(-1)}
                >
                  <CaretLeftIcon size={17} weight="fill" />
                </button>
                <span aria-live="polite">{PRESETS[settings.preset]}</span>
                <button
                  aria-label="Next preset"
                  onClick={() => changePreset(1)}
                >
                  <CaretRightIcon size={17} weight="fill" />
                </button>
              </div>
            </div>
            <div className="image-controls">
              {(["contrast", "brightness", "motion", "bloom"] as const).map(
                (key) => (
                  <Knob
                    key={key}
                    label={key}
                    value={settings[key]}
                    onChange={(v) => update(key, v)}
                  />
                ),
              )}
            </div>
          </div>

          <aside
            className="control-rail right-rail"
            aria-label="Output and effects controls"
          >
            <Knob
              label="Output"
              large
              value={output}
              onChange={(v) => {
                setOutput(v);
                audio.current?.setOutput(v);
              }}
              minLabel="−∞"
              maxLabel="+12"
            />
            <div className="rail-knobs output-knobs">
              {(["depth", "speed", "size", "intensity"] as const).map((key) => (
                <Knob
                  key={key}
                  label={key}
                  value={settings[key]}
                  onChange={(v) => update(key, v)}
                />
              ))}
            </div>
            <Fader
              label="Mix"
              value={mix}
              onChange={(v) => {
                setMix(v);
                audio.current?.setEffects(effects, v);
              }}
              start="Dry"
              end="Wet"
            />
            <OptionGroup
              label="FX"
              values={EFFECTS}
              value={effects}
              multiple
              onChange={toggleEffect}
            />
            <OptionGroup
              label="Quality"
              values={["Low", "Medium", "High"] as const}
              value={settings.quality}
              onChange={(v) => update("quality", v)}
            />
          </aside>
        </div>
        <footer className="instrument-footer">
          <span>
            <span className="status-led is-on" />
            {playing ? "Signal active" : "Ready to play"}
          </span>
          <button
            aria-label="Reset all controls"
            title="Reset all controls"
            onClick={() => {
              setSettings(DEFAULTS);
              setInput(50);
              setOutput(50);
              setDrive(0);
              setFilter(88);
              setMix(35);
              setEffects(["Reverb"]);
              changeAudioSpeed(1);
              if (audio.current) {
                audio.current.setInput(50);
                audio.current.setOutput(50);
                audio.current.setFilter(88);
                audio.current.setDrive(0);
                audio.current.setEffects(["Reverb"], 35);
              }
            }}
          >
            <ArrowCounterClockwiseIcon size={12} />
            <span>Reset</span>
          </button>
        </footer>
        <input
          ref={fileInput}
          className="file-input"
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.aiff,.aif,.webm"
          aria-label="Choose audio files"
          onChange={(e) => {
            loadAudio(e.target.files);
            e.target.value = "";
          }}
        />
        {error && (
          <div className="error-notice" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              Dismiss
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
