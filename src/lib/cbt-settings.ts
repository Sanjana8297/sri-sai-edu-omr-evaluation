export type BilingualMode = "en" | "hi" | "both";

export type CbtSettings = {
  autoSubmitOnTimerEnd: boolean;
  requireFullscreen: boolean;
  blockTabSwitch: boolean;
  blockClipboard: boolean;
  offlineSyncEnabled: boolean;
  bilingualMode: BilingualMode;
};

export const DEFAULT_CBT_SETTINGS: CbtSettings = {
  autoSubmitOnTimerEnd: true,
  requireFullscreen: true,
  blockTabSwitch: true,
  blockClipboard: true,
  offlineSyncEnabled: true,
  bilingualMode: "both",
};

export function parseCbtSettings(raw: unknown): CbtSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CBT_SETTINGS };
  const o = raw as Record<string, unknown>;
  const bilingual =
    o.bilingualMode === "en" || o.bilingualMode === "hi" || o.bilingualMode === "both"
      ? o.bilingualMode
      : DEFAULT_CBT_SETTINGS.bilingualMode;
  return {
    autoSubmitOnTimerEnd:
      typeof o.autoSubmitOnTimerEnd === "boolean"
        ? o.autoSubmitOnTimerEnd
        : DEFAULT_CBT_SETTINGS.autoSubmitOnTimerEnd,
    requireFullscreen:
      typeof o.requireFullscreen === "boolean" ? o.requireFullscreen : DEFAULT_CBT_SETTINGS.requireFullscreen,
    blockTabSwitch:
      typeof o.blockTabSwitch === "boolean" ? o.blockTabSwitch : DEFAULT_CBT_SETTINGS.blockTabSwitch,
    blockClipboard:
      typeof o.blockClipboard === "boolean" ? o.blockClipboard : DEFAULT_CBT_SETTINGS.blockClipboard,
    offlineSyncEnabled:
      typeof o.offlineSyncEnabled === "boolean"
        ? o.offlineSyncEnabled
        : DEFAULT_CBT_SETTINGS.offlineSyncEnabled,
    bilingualMode: bilingual,
  };
}
