"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── types ──────────────────────────────────────────────────────────────────────

export interface SoundSettings {
  enabled: boolean;
  volume: number; // 0–100
  soundUrl: string | null;
  soundFilename: string | null;
  triggerStatuses: string[];
}

const DEFAULTS: SoundSettings = {
  enabled: true,
  volume: 70,
  soundUrl: null,
  soundFilename: null,
  triggerStatuses: ["processing", "completed"],
};

// ── hook ───────────────────────────────────────────────────────────────────────

export function useSoundNotification() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef   = useRef<AudioBuffer | null>(null);
  const [isReady, setIsReady]   = useState(false);
  const [isMuted, setMuted]     = useState(false);
  const [settings, setSettings] = useState<SoundSettings>(DEFAULTS);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ── Lazy AudioContext — created on first user interaction ──────────────────
  useEffect(() => {
    function init() {
      if (audioCtxRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audioCtxRef.current = new ((window as any).AudioContext ?? (window as any).webkitAudioContext)();
      setIsReady(true);
    }
    window.addEventListener("click",      init, { once: true });
    window.addEventListener("keydown",    init, { once: true });
    window.addEventListener("touchstart", init, { once: true });
    return () => {
      window.removeEventListener("click",      init);
      window.removeEventListener("keydown",    init);
      window.removeEventListener("touchstart", init);
    };
  }, []);

  // ── Load settings from API ─────────────────────────────────────────────────
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/settings?key=sound_settings");
      if (!res.ok) return;
      const { value } = await res.json();
      if (value) setSettings({ ...DEFAULTS, ...(value as Partial<SoundSettings>) });
    } catch {
      // use defaults
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Decode custom audio buffer when AudioContext + soundUrl are available ──
  useEffect(() => {
    const url = settings.soundUrl;
    if (!isReady || !url) {
      bufferRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const ab  = await res.arrayBuffer();
        if (!cancelled && audioCtxRef.current) {
          bufferRef.current = await audioCtxRef.current.decodeAudioData(ab);
        }
      } catch {
        if (!cancelled) bufferRef.current = null;
      }
    })();
    return () => { cancelled = true; };
  }, [isReady, settings.soundUrl]);

  // ── playSound ──────────────────────────────────────────────────────────────
  const playSound = useCallback((volumePct?: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // Resume suspended context (Safari requires this after tab switch)
    if (ctx.state === "suspended") ctx.resume();

    const vol = (volumePct ?? settingsRef.current.volume) / 100;
    const t   = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0,    t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);

    if (bufferRef.current) {
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2);
      gain.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = bufferRef.current;
      src.connect(gain);
      src.start(t);
      src.stop(t + 2);
    } else {
      // Pleasant ding: C5 → C6
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523,  t);
      osc.frequency.setValueAtTime(523,  t + 0.15);
      osc.frequency.linearRampToValueAtTime(1046, t + 0.20);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }, []);

  // ── shouldPlay: checks all conditions before playing ──────────────────────
  const shouldPlay = useCallback((orderStatus: string): boolean => {
    const s = settingsRef.current;
    return s.enabled && s.triggerStatuses.includes(orderStatus);
  }, []);

  return { playSound, shouldPlay, isReady, isMuted, setMuted, settings, setSettings, reload };
}
