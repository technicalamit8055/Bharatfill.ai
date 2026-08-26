/**
 * OCR provider registry.
 * Master spec §12.3 — "Never hard-code the product to a single provider."
 *
 * Two slots, not one, because a document has two very different readers behind it
 * (docs/AI_PIPELINE.md §2):
 *
 *   - a **local** slot that never lets a byte off the server (`mock`, `local`),
 *   - an **AI** slot that ships the page to a hosted vision model (`deepseek`, `anthropic`).
 *
 * `OCR_PROVIDER` selects the local slot and `OCR_AI_PROVIDER` the AI one. Which of the two runs
 * for a given document is the extraction mode's decision, made in ../pipeline.ts.
 */

import { providerUnavailable } from '@assistigo/core';
import type { OcrProvider, OcrProviderConfig } from '../types';
import {
  AiVisionOcrProvider,
  ANTHROPIC_BASE_URL,
  ANTHROPIC_MODEL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
} from './ai-vision';
import { LocalOcrProvider } from './local-ocr';
import { MockOcrProvider } from './mock';

export const OCR_PROVIDER_NAMES = [
  'mock',
  'local',
  'tesseract',
  'deepseek',
  'anthropic',
  'org_ai_vendor',
] as const;
export type OcrProviderName = (typeof OCR_PROVIDER_NAMES)[number];

/** Providers that keep every byte on this server. The rest require organization opt-in. */
export const LOCAL_OCR_PROVIDER_NAMES = ['mock', 'local', 'tesseract'] as const;
export type LocalOcrProviderName = (typeof LOCAL_OCR_PROVIDER_NAMES)[number];

/**
 * Providers that transmit document bytes to a third party.
 *
 * `org_ai_vendor` is the generic slot for an organization's own configured vendor (any provider
 * preset, any OpenAI-compatible or Anthropic-shaped endpoint) — its base URL, model, wire format
 * and key all come from `config` rather than a baked-in default, because there is no single
 * vendor behind this name the way there is behind `deepseek` or `anthropic`.
 */
export const AI_OCR_PROVIDER_NAMES = ['deepseek', 'anthropic', 'org_ai_vendor'] as const;
export type AiOcrProviderName = (typeof AI_OCR_PROVIDER_NAMES)[number];

export function isOcrProviderName(value: unknown): value is OcrProviderName {
  return typeof value === 'string' && (OCR_PROVIDER_NAMES as readonly string[]).includes(value);
}

export function isLocalOcrProviderName(value: unknown): value is LocalOcrProviderName {
  return (
    typeof value === 'string' && (LOCAL_OCR_PROVIDER_NAMES as readonly string[]).includes(value)
  );
}

export function isAiOcrProviderName(value: unknown): value is AiOcrProviderName {
  return typeof value === 'string' && (AI_OCR_PROVIDER_NAMES as readonly string[]).includes(value);
}

const mock = new MockOcrProvider();
const local = new LocalOcrProvider();

/**
 * Resolves a provider by name.
 *
 * `tesseract` is declared in the spec but not implemented. It fails loudly rather than falling
 * through to a local provider: silently substituting one in staging would turn "OCR is
 * misconfigured" into "OCR is mysteriously bad", which is far harder to diagnose. The pipeline is
 * what decides that a *configuration* gap should degrade gracefully with a warning; a caller that
 * names a provider by hand gets told the truth.
 */
export function getOcrProvider(name: string = 'mock', config?: OcrProviderConfig): OcrProvider {
  switch (name) {
    case 'mock':
      return mock;
    case 'local':
      return local;
    case 'deepseek':
      return new AiVisionOcrProvider({
        name: 'deepseek',
        baseUrl: DEEPSEEK_BASE_URL,
        model: DEEPSEEK_MODEL,
        ...config,
      });
    case 'anthropic':
      return new AiVisionOcrProvider({
        name: 'anthropic',
        baseUrl: ANTHROPIC_BASE_URL,
        model: ANTHROPIC_MODEL,
        wireFormat: 'anthropic_messages',
        ...config,
      });
    // An organization's own configured vendor. Base URL, model, wire format, custom prompt and
    // key all come from `config` — there is no baked-in default behind this name.
    case 'org_ai_vendor':
      return new AiVisionOcrProvider({ name: 'org_ai_vendor', ...config });
    case 'tesseract':
      throw providerUnavailable('errors.ocr_provider_not_configured');
    default:
      throw providerUnavailable('errors.ocr_provider_unknown');
  }
}

/**
 * Whether a named AI provider can actually run right now.
 *
 * The pipeline asks before it commits to the AI path, so a missing key becomes an operator-facing
 * "AI reading is not configured" warning on a document that still gets read locally, rather than
 * a failed job (docs/AI_PIPELINE.md §2).
 */
export function isAiProviderConfigured(name: string, config?: OcrProviderConfig): boolean {
  if (!isAiOcrProviderName(name)) return false;
  return config?.apiKey !== undefined && config.apiKey.trim() !== '';
}

export { AiVisionOcrProvider, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from './ai-vision';
export { cleanTranscription, visionUnreadableReason } from './ai-vision';
export type { AiVisionProviderOptions, VisionUnreadableReason } from './ai-vision';
export {
  LocalOcrProvider,
  localUnreadableReason,
  paragraphBlocks,
  readLocalText,
} from './local-ocr';
export type { LocalUnreadableReason } from './local-ocr';
export { MockOcrProvider };
