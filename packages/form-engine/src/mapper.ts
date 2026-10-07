/**
 * The mapping pipeline.
 * Master spec §14.3 (resolution order), §14.6 (confidence and mandatory review), §14.8 (no auto submit).
 *
 * Given detected field metadata and a customer's values, produce a proposal the operator can
 * review. Nothing here writes to a page; the content script does that, and only for fields this
 * module marked fillable.
 */

import { requiresReview } from '@assistigo/core';
import {
  adapterDependencyDepth,
  adapterEducationLevels,
  contextualCustomerField,
  findAdapterField,
  type AdapterField,
  type PortalAdapter,
} from './adapters';
import {
  educationLevelOfField,
  educationLevelsWithData,
  fallbackEducationLevel,
} from './education-level';
import { bestMatch } from './scorer';
import { classifyField, isFileInput, isPasswordField, isSupportedInputType } from './safety';
import { SCRIPT_TWINS, expectedScript, scriptOf } from './script';
import { applyTransform } from './transforms';
import {
  CONFIDENCE,
  type DetectedField,
  type DetectionPayload,
  type EducationLevel,
  type FieldMapping,
  type FillInstruction,
  type MappingSource,
  type SkipReason,
} from './types';

/** An organization's saved override for a specific field on a specific portal. */
export type OrgFieldMapping = {
  pageOrigin: string;
  fieldSignature: string;
  customerField: string;
  transform?: string;
};

/** A mapping the operator previously confirmed on this portal. */
export type HistoricalMapping = {
  fieldSignature: string;
  customerField: string;
  transform?: string;
  /** How many times it has been confirmed. More confirmations, more trust. */
  confirmations: number;
};

export type MappingInput = {
  detection: DetectionPayload;
  /** Confirmed customer values, keyed by customer field key. Missing keys mean "not known". */
  customerValues: Readonly<Record<string, string | null>>;
  /** Field keys whose value is still `extracted` rather than operator-verified (§14.6). */
  unverifiedFields?: ReadonlySet<string>;
  adapter?: PortalAdapter | null;
  orgMappings?: readonly OrgFieldMapping[];
  history?: readonly HistoricalMapping[];
  /** Operators can opt in to overwriting fields the portal pre-filled. Off by default. */
  overwriteFilled?: boolean;
  /**
   * The qualification the operator says this page's generic education boxes are about (side
   * panel picker). Beats the profile guess, never a box that names its own level.
   */
  educationLevel?: EducationLevel | null;
};

export type MappingProposal = {
  mappings: FieldMapping[];
  /**
   * Signatures in the order they should be written, parents before dependants.
   *
   * `mappings` stays in detection order because that is the order the operator reads the page
   * in, and a review table that reshuffles itself is a review table nobody trusts. Fill order
   * is a separate concern, so it travels separately.
   */
  fillOrder: string[];
  summary: {
    detected: number;
    proposed: number;
    readyToFill: number;
    needsReview: number;
    skipped: number;
    captcha: number;
    otp: number;
    payment: number;
  };
  /**
   * Present when at least one generic education box was mapped without naming its own level, so
   * the side panel can offer the operator the choice. `level` is what was applied, `withData` the
   * levels the customer's profile holds anything for, highest first.
   */
  educationLevel: {
    level: EducationLevel | null;
    source: 'operator' | 'profile' | null;
    withData: EducationLevel[];
  } | null;
};

function skip(
  field: DetectedField,
  reason: SkipReason,
  safetyClass: FieldMapping['safetyClass'] = 'normal',
): FieldMapping {
  return {
    signature: field.signature,
    customerField: null,
    source: null,
    confidence: 0,
    reviewRequired: false,
    safetyClass,
    skipReason: reason,
  };
}

/** Boxes a name or address is typed into — the only ones where the value's script matters. */
function isFreeText(field: DetectedField): boolean {
  if (field.tagName === 'textarea') return true;
  return (
    field.tagName === 'input' && ['text', 'search', 'contenteditable'].includes(field.inputType)
  );
}

/** A successful resolution always names a customer field; `null` means nothing matched. */
type ResolvedMapping = {
  customerField: string;
  source: MappingSource;
  confidence: number;
  transform?: string;
  educationLevel?: FieldMapping['educationLevel'];
};

/**
 * Which customer field an adapter field means for this box: the level-specific one for a generic
 * education box (education-level.ts), otherwise whatever `contextVariants` picks.
 */
function adapterCustomerField(
  adapterField: AdapterField,
  field: DetectedField,
  input: MappingInput,
): Pick<ResolvedMapping, 'customerField' | 'educationLevel'> {
  const levels = adapterEducationLevels(adapterField);
  if (levels.length > 0) {
    const named = educationLevelOfField(field);
    const namedField = named ? adapterField.educationLevels?.[named] : undefined;
    if (named && namedField) {
      return { customerField: namedField, educationLevel: { level: named, source: 'label' } };
    }

    const fallback = fallbackEducationLevel(
      levels,
      input.educationLevel,
      educationLevelsWithData(input.customerValues),
    );
    const fallbackField = fallback ? adapterField.educationLevels?.[fallback.level] : undefined;
    if (fallback && fallbackField) {
      return { customerField: fallbackField, educationLevel: fallback };
    }
  }
  return { customerField: contextualCustomerField(adapterField, field) };
}

/**
 * Resolution order (§14.3). First hit wins, and the source is recorded so the review UI can tell
 * the operator *why* a field was mapped the way it was.
 */
function resolveMapping(field: DetectedField, input: MappingInput): ResolvedMapping | null {
  // 1. Portal adapter
  if (input.adapter) {
    const adapterField = findAdapterField(input.adapter, field);
    if (adapterField) {
      return {
        ...adapterCustomerField(adapterField, field, input),
        source: 'adapter',
        // An adapter is a human-verified statement about this exact form.
        confidence: input.adapter.status === 'active' ? 0.99 : 0.9,
        ...(adapterField.transform ? { transform: adapterField.transform } : {}),
      };
    }
  }

  // 2. Organization override
  const override = input.orgMappings?.find(
    (candidate) =>
      candidate.fieldSignature === field.signature &&
      candidate.pageOrigin === input.detection.page.origin,
  );
  if (override) {
    return {
      customerField: override.customerField,
      source: 'org_custom',
      confidence: 0.98,
      ...(override.transform ? { transform: override.transform } : {}),
    };
  }

  // 3. Confirmed history for this portal
  const historical = input.history?.find(
    (candidate) => candidate.fieldSignature === field.signature,
  );
  if (historical) {
    // One confirmation is a decent signal; repeated confirmations approach adapter-level trust,
    // but never reach it — history records what an operator accepted, not what is correct.
    const confidence = Math.min(0.95, 0.85 + historical.confirmations * 0.02);
    return {
      customerField: historical.customerField,
      source: 'history',
      confidence: Number(confidence.toFixed(3)),
      ...(historical.transform ? { transform: historical.transform } : {}),
    };
  }

  // 4. Rules-based dictionary
  const match = bestMatch(field);
  if (match) {
    return {
      customerField: match.customerField,
      source: 'dictionary',
      confidence: match.score,
      ...(match.transform ? { transform: match.transform } : {}),
    };
  }

  // 5. AI-assisted mapping happens in the API layer when enabled, using metadata only.
  // 6. Manual mapping is the operator's fallback in the review UI.
  return null;
}

export function proposeMappings(input: MappingInput): MappingProposal {
  const mappings: FieldMapping[] = [];

  for (const field of input.detection.fields) {
    // --- hard safety rules first, before anything else looks at this field ---
    const safetyClass = classifyField({
      inputType: field.inputType,
      name: field.name,
      id: field.id,
      placeholder: field.placeholder,
      labelText: field.labelText,
      ariaLabel: field.ariaLabel,
      nearbyText: field.nearbyText,
      maxLength: field.maxLength,
    });

    if (safetyClass !== 'normal') {
      const reason: SkipReason =
        safetyClass === 'captcha'
          ? 'captcha_field'
          : safetyClass === 'otp'
            ? 'otp_field'
            : safetyClass === 'payment'
              ? 'payment_field'
              : 'submit_control';
      mappings.push(skip(field, reason, safetyClass));
      continue;
    }

    // --- fields we cannot or must not write to ---
    if (isPasswordField(field.inputType)) {
      mappings.push(skip(field, 'unsupported_type'));
      continue;
    }
    if (isFileInput(field.inputType)) {
      // Not a failure: the extension offers a prepared file for the operator to attach (§7.4.5).
      mappings.push(skip(field, 'unsupported_type'));
      continue;
    }
    if (!isSupportedInputType(field.inputType) && field.tagName === 'input') {
      mappings.push(skip(field, 'unsupported_type'));
      continue;
    }
    if (!field.visible) {
      mappings.push(skip(field, 'not_visible'));
      continue;
    }
    if (field.disabled) {
      mappings.push(skip(field, 'disabled'));
      continue;
    }
    if (field.readOnly) {
      mappings.push(skip(field, 'readonly'));
      continue;
    }
    if (field.hasValue && !input.overwriteFilled) {
      mappings.push(skip(field, 'already_filled'));
      continue;
    }

    // --- mapping ---
    const resolved = resolveMapping(field, input);
    if (!resolved) {
      mappings.push(skip(field, 'no_mapping'));
      continue;
    }

    const level = resolved.educationLevel ? { educationLevel: resolved.educationLevel } : {};

    const valueOf = (key: string | undefined): string | null =>
      key ? applyTransform(resolved.transform, input.customerValues[key] ?? null) || null : null;

    /*
     * A name's other spelling stands in when this one is empty: an older profile keeps a Hindi
     * father's name in `father_name`, and a newer one may have only `father_name_hi`. Whether that
     * spelling suits this box is the script check's call, below.
     */
    let customerField = resolved.customerField;
    let value = valueOf(customerField);
    const fallback = value === null ? SCRIPT_TWINS[customerField] : undefined;
    if (fallback && valueOf(fallback) !== null) {
      customerField = fallback;
      value = valueOf(fallback);
    }

    if (value === null) {
      mappings.push({
        signature: field.signature,
        customerField: resolved.customerField,
        source: resolved.source,
        confidence: resolved.confidence,
        reviewRequired: false,
        safetyClass: 'normal',
        skipReason: 'no_value',
        ...(resolved.transform ? { transform: resolved.transform } : {}),
        ...level,
      });
      continue;
    }

    const adapterField = input.adapter ? findAdapterField(input.adapter, field) : null;

    /*
     * Script check: a Hindi value in a box that only takes English (or the reverse). The other
     * rendering of the same fact wins when the profile has it; otherwise an explicit rule blocks
     * the value and the operator types it, and a merely English-looking box asks for review.
     */
    let scriptReview = false;
    const valueScript = isFreeText(field) ? scriptOf(value) : null;
    const expectation = valueScript ? expectedScript(field, value, adapterField?.script) : null;
    if (expectation && valueScript !== expectation.script) {
      const twin = SCRIPT_TWINS[customerField];
      const twinValue = valueOf(twin);
      if (twin && twinValue && scriptOf(twinValue) === expectation.script) {
        customerField = twin;
      } else if (expectation.strength === 'explicit') {
        mappings.push({
          signature: field.signature,
          customerField,
          source: resolved.source,
          confidence: resolved.confidence,
          reviewRequired: true,
          safetyClass: 'normal',
          skipReason: 'script_mismatch',
          expectedScript: expectation.script,
          ...(resolved.transform ? { transform: resolved.transform } : {}),
          ...level,
        });
        continue;
      } else {
        scriptReview = true;
      }
    }

    /*
     * Review is mandatory when any of these hold (§14.6):
     *   - the customer field is high-risk (Aadhaar, PAN, bank, category, income, DOB…),
     *   - the mapping is not confidently above the medium band,
     *   - the underlying value has not been verified by a human yet,
     *   - the adapter explicitly demands it,
     *   - the value may be in a script the portal will not accept,
     *   - the qualification level of a generic education box is only a guess from the profile.
     */
    const reviewRequired =
      requiresReview(customerField) ||
      resolved.confidence < CONFIDENCE.high ||
      (input.unverifiedFields?.has(customerField) ?? false) ||
      adapterField?.reviewRequired === true ||
      scriptReview ||
      resolved.educationLevel?.source === 'profile';

    mappings.push({
      signature: field.signature,
      customerField,
      source: resolved.source,
      confidence: resolved.confidence,
      reviewRequired,
      safetyClass: 'normal',
      ...(resolved.transform ? { transform: resolved.transform } : {}),
      ...(resolved.confidence < CONFIDENCE.medium ? { skipReason: 'low_confidence' as const } : {}),
      ...level,
    });
  }

  // The page-wide level, reported only when some box depended on it rather than naming its own.
  const pageLevelMapping = mappings.find(
    (mapping) => mapping.educationLevel && mapping.educationLevel.source !== 'label',
  );
  const unresolvedLevelBox = input.adapter
    ? input.detection.fields.some((field) => {
        const mapping = mappings.find((candidate) => candidate.signature === field.signature);
        if (!mapping?.customerField || mapping.educationLevel) return false;
        const adapterField = findAdapterField(input.adapter as PortalAdapter, field);
        return adapterField ? adapterEducationLevels(adapterField).length > 0 : false;
      })
    : false;
  const educationLevel: MappingProposal['educationLevel'] =
    pageLevelMapping?.educationLevel || unresolvedLevelBox
      ? {
          level: pageLevelMapping?.educationLevel?.level ?? null,
          source:
            pageLevelMapping?.educationLevel?.source === 'operator' ||
            pageLevelMapping?.educationLevel?.source === 'profile'
              ? pageLevelMapping.educationLevel.source
              : null,
          withData: educationLevelsWithData(input.customerValues),
        }
      : null;

  const proposed = mappings.filter((mapping) => mapping.customerField !== null);
  const fillable = proposed.filter((mapping) => mapping.skipReason === undefined);

  return {
    mappings,
    fillOrder: dependencyFillOrder(mappings, input.detection.fields, input.adapter ?? null),
    summary: {
      detected: input.detection.fields.length,
      proposed: proposed.length,
      readyToFill: fillable.filter((mapping) => !mapping.reviewRequired).length,
      needsReview: fillable.filter((mapping) => mapping.reviewRequired).length,
      skipped: mappings.filter((mapping) => mapping.skipReason !== undefined).length,
      captcha: mappings.filter((mapping) => mapping.safetyClass === 'captcha').length,
      otp: mappings.filter((mapping) => mapping.safetyClass === 'otp').length,
      payment: mappings.filter((mapping) => mapping.safetyClass === 'payment').length,
    },
    educationLevel,
  };
}

export type FillInstructionOptions = {
  /**
   * Values the operator typed over the proposal, keyed by signature.
   *
   * An edit is taken literally — no transform is applied on top of it. The operator looked at
   * the field and typed what the portal should receive; re-formatting that would be the tool
   * overruling the human it just asked.
   */
  edits?: Readonly<Record<string, string>>;
  /** Supplies the `dependsOn` chain, which decides fill order. */
  adapter?: PortalAdapter | null;
  /**
   * A precomputed order (`MappingProposal.fillOrder`), for callers that have the proposal but
   * not the adapter — the side panel, which is deliberately never sent adapter internals.
   */
  order?: readonly string[];
};

/**
 * The exact string that will be typed into a field, or `null` if nothing will be.
 *
 * Exported because the review table has to show the operator what is actually going to be
 * written. Showing the raw profile value instead means asking someone to approve `1998-07-14`
 * and then typing `14/07/1998` — a small dishonesty that costs the operator their trust in the
 * preview the first time the two differ and they notice.
 */
export function resolveFillValue(
  mapping: Pick<FieldMapping, 'signature' | 'customerField' | 'transform' | 'skipReason'>,
  customerValues: Readonly<Record<string, string | null>>,
  edits?: Readonly<Record<string, string>>,
): string | null {
  const edited = edits?.[mapping.signature];
  if (edited !== undefined) return edited === '' ? null : edited;
  if (!mapping.customerField) return null;
  // The saved value is in the wrong script for this box; only what the operator types goes in.
  if (mapping.skipReason === 'script_mismatch') return null;

  const value = applyTransform(mapping.transform, customerValues[mapping.customerField] ?? null);
  return value === '' ? null : value;
}

/**
 * Turns approved mappings into the instructions the content script executes.
 *
 * This is the only place a customer value crosses into the extension, and it happens after the
 * operator has pressed Fill. Anything not explicitly approved is dropped, and the safety classes
 * are re-checked here so a tampered approval list still cannot reach a CAPTCHA field.
 */
export function buildFillInstructions(
  mappings: readonly FieldMapping[],
  customerValues: Readonly<Record<string, string | null>>,
  approvedSignatures: ReadonlySet<string>,
  fields: readonly DetectedField[],
  options: FillInstructionOptions = {},
): FillInstruction[] {
  const fieldBySignature = new Map(fields.map((field) => [field.signature, field]));
  const instructions: FillInstruction[] = [];

  for (const mapping of mappings) {
    if (!approvedSignatures.has(mapping.signature)) continue;
    if (mapping.safetyClass !== 'normal') continue;
    if (!mapping.customerField) continue;
    if (
      mapping.skipReason !== undefined &&
      mapping.skipReason !== 'low_confidence' &&
      mapping.skipReason !== 'script_mismatch'
    ) {
      continue;
    }

    const field = fieldBySignature.get(mapping.signature);
    if (!field) continue;

    const value = resolveFillValue(mapping, customerValues, options.edits);
    if (value === null) continue;
    // An operator who pasted the same Hindi spelling back in has not fixed anything.
    if (
      mapping.skipReason === 'script_mismatch' &&
      mapping.expectedScript &&
      scriptOf(value) !== null &&
      scriptOf(value) !== mapping.expectedScript
    ) {
      continue;
    }

    instructions.push({
      signature: mapping.signature,
      value,
      inputType: field.tagName === 'textarea' ? 'textarea' : field.inputType,
    });
  }

  const order =
    options.order ??
    (options.adapter ? dependencyFillOrder(mappings, fields, options.adapter) : undefined);

  if (!order) return instructions;

  const rank = new Map(order.map((signature, index) => [signature, index]));
  // A signature the order does not mention sorts last but keeps its relative position, so an
  // order list that has gone stale degrades to "fill in the order given" rather than dropping
  // fields on the floor.
  return instructions
    .map((instruction, index) => ({
      instruction,
      index,
      rank: rank.get(instruction.signature) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.instruction);
}

/**
 * The order fields should be written in: a dependent dropdown after the parent it waits on.
 *
 * The fill executor already waits for a child's options to repopulate, but waiting only works
 * if the parent was set first. Portals that lay their address block out as State → District →
 * Block make this free; the ones that put "Block" above "District", or that render the chain in
 * a modal, do not. Without an adapter this is simply detection order — there is nothing to
 * infer a dependency from, and inventing one would reorder fills for no reason.
 */
export function dependencyFillOrder(
  mappings: readonly FieldMapping[],
  fields: readonly DetectedField[],
  adapter: PortalAdapter | null,
): string[] {
  const signatures = mappings.map((mapping) => mapping.signature);
  if (!adapter) return signatures;

  const depths = adapterDependencyDepth(adapter);
  const fieldBySignature = new Map(fields.map((field) => [field.signature, field]));

  const depthOf = (signature: string): number => {
    const field = fieldBySignature.get(signature);
    if (!field) return 0;
    const adapterField = findAdapterField(adapter, field);
    return adapterField ? (depths.get(adapterField.key) ?? 0) : 0;
  };

  return signatures
    .map((signature, index) => ({ signature, index, depth: depthOf(signature) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map((entry) => entry.signature);
}
