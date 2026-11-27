/** One line icon per everyday paper (`lib/vault/everyday.ts`), for the type picker and Home. */

import type { DocumentType } from '@assistigo/core';
import type { LucideIcon } from 'lucide-react-native';
import {
  Car,
  FileText,
  Flame,
  LandPlot,
  Pill,
  School,
  ShieldCheck,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react-native';

import { categoryOf } from '../../lib/vault/categories';
import type { EverydayKind } from '../../lib/vault/everyday';
import { VAULT_CATEGORY_ICONS } from './categoryIcons';

export const EVERYDAY_KIND_ICONS: Readonly<Record<EverydayKind, LucideIcon>> = {
  electricity_bill: Zap,
  gas_bill: Flame,
  vehicle_rc: Car,
  vehicle_insurance: ShieldCheck,
  vehicle_puc: Wind,
  school_fee_receipt: School,
  land_record: LandPlot,
  prescription: Pill,
  warranty_card: Wrench,
};

/** The icon for a document: its everyday kind's, else its folder's, else a plain page. */
export function documentIcon(
  documentType: DocumentType | null | undefined,
  everydayKind: EverydayKind | null | undefined,
): LucideIcon {
  if (everydayKind) return EVERYDAY_KIND_ICONS[everydayKind];
  const category = documentType ? categoryOf(documentType) : null;
  return category ? VAULT_CATEGORY_ICONS[category] : FileText;
}
