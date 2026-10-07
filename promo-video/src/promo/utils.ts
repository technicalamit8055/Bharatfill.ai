import { random } from "remotion";

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** Deterministic camera shake: same frame + seed always gives the same offset. */
export const shake = (frame: number, amplitude: number, seed: string) => ({
  x: (random(`${seed}-x-${frame}`) - 0.5) * 2 * amplitude,
  y: (random(`${seed}-y-${frame}`) - 0.5) * 2 * amplitude,
});

export const splitWords = (text: string): string[] =>
  text.split(/\s+/).filter(Boolean);
