import {
  Building2,
  CreditCard,
  Database,
  MonitorSmartphone,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { SettingsSectionKey } from '@/lib/settings/sections';

export const SETTINGS_ICONS: Record<SettingsSectionKey, { icon: LucideIcon; tone: string }> = {
  preferences: { icon: SlidersHorizontal, tone: 'bg-brand-50 text-brand-600' },
  sessions: { icon: MonitorSmartphone, tone: 'bg-violet-50 text-violet-600' },
  security: { icon: ShieldCheck, tone: 'bg-emerald-50 text-emerald-600' },
  extension: { icon: Puzzle, tone: 'bg-orange-50 text-orange-600' },
  organization: { icon: Building2, tone: 'bg-brand-50 text-brand-600' },
  members: { icon: UsersRound, tone: 'bg-emerald-50 text-emerald-600' },
  data: { icon: Database, tone: 'bg-rose-50 text-rose-600' },
  billing: { icon: CreditCard, tone: 'bg-violet-50 text-violet-600' },
};
