import { getStaticFiles } from "@remotion/studio";
import { staticFile } from "remotion";

export const ASSETS = {
  logo: "Bharatfill-logo.png",
  banner: "bharatfill-brand-banner.png",
  mark: "bharatfill-mark-512.png",
  scannerPreview: "scanner-preview.png",
  dashboard: "dashboard.png",
  bgm: "bgm.mp3",
  swoosh: "swoosh.mp3",
  success: "success.mp3",
} as const;

/**
 * Resolves a file in public/, or null when it has not been added yet, so a
 * missing screenshot or sound effect never breaks a render.
 */
export const optionalAsset = (name: string): string | null =>
  getStaticFiles().some((file) => file.name === name)
    ? staticFile(name)
    : null;
