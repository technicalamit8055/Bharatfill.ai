/** The shape of the generated icon artwork (`art-icons.generated.ts`). */

/** A flat colour, or one of the icon's own gradients by position. */
export type ArtPaint = `#${string}` | 'g0' | 'g1' | 'g2';

/** Top-left to bottom-right across the shape it fills: every icon shares that one light. */
export type ArtGradient = readonly [from: `#${string}`, to: `#${string}`];

/** One filled or stroked path. Strokes always have round caps and joins. */
export type ArtShape = {
  readonly d: string;
  readonly fill?: ArtPaint;
  readonly stroke?: ArtPaint;
  readonly strokeWidth?: number;
  readonly opacity?: number;
};

export type ArtHue = 'blue' | 'teal' | 'green' | 'rose' | 'purple' | 'orange';

export type ArtTint = { readonly light: `#${string}`; readonly dark: `#${string}` };

export type ArtIconArt = {
  /** Picks the tint the icon sits on. */
  readonly hue: ArtHue;
  /** At most three. */
  readonly gradients: readonly ArtGradient[];
  /** Painted in order, back to front, on a 48 × 48 canvas. */
  readonly shapes: readonly ArtShape[];
};
