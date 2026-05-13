"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useSoundNotification, SoundSettings } from "@/lib/hooks/use-sound-notification";

// ── types ──────────────────────────────────────────────────────────────────────

interface SoundContextValue {
  isMuted: boolean;
  setMuted: (v: boolean) => void;
  playSound: (vol?: number) => Promise<void>;
  unlockAudio: () => void;
  shouldPlay: (status: string) => boolean;
  isReady: boolean;
  settings: SoundSettings;
}

const DEFAULTS: SoundSettings = {
  enabled: true,
  volume: 70,
  soundUrl: null,
  soundFilename: null,
  triggerStatuses: ["processing", "completed"],
};

const SoundContext = createContext<SoundContextValue>({
  isMuted: false,
  setMuted: () => {},
  playSound: async () => {},
  unlockAudio: () => {},
  shouldPlay: () => false,
  isReady: false,
  settings: DEFAULTS,
});

// ── Dashboard provider — reads/writes localStorage ─────────────────────────────

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const { playSound, unlockAudio, shouldPlay, isReady, settings } = useSoundNotification();

  const [isMuted, setMutedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("orderly_sound_muted") === "true";
  });

  const setMuted = useCallback((v: boolean) => {
    setMutedState(v);
    localStorage.setItem("orderly_sound_muted", String(v));
  }, []);

  return (
    <SoundContext.Provider value={{ isMuted, setMuted, playSound, unlockAudio, shouldPlay, isReady, settings }}>
      {children}
    </SoundContext.Provider>
  );
}

// ── TV provider — always unmuted, ignores localStorage ─────────────────────────

export function TVSoundProvider({ children }: { children: React.ReactNode }) {
  const { playSound, unlockAudio, shouldPlay, isReady, settings } = useSoundNotification();

  return (
    <SoundContext.Provider value={{ isMuted: false, setMuted: () => {}, playSound, unlockAudio, shouldPlay, isReady, settings }}>
      {children}
    </SoundContext.Provider>
  );
}

// ── Consumer hook ──────────────────────────────────────────────────────────────

export function useSoundContext() {
  return useContext(SoundContext);
}
