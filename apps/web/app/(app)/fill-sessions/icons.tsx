/**
 * The fill-sessions icon set, drawn by lucide-react.
 *
 * Same convention as the customers list's `icons.tsx`: names say what the icon means on this
 * page, so a change of glyph is one edit here. Every icon is `aria-hidden` because each sits
 * beside a visible label, or inside a control that carries its own `aria-label`.
 */

import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Clock,
  EllipsisVertical,
  Eye,
  FileText,
  Filter,
  IndianRupee,
  ScanSearch,
  Search,
  ShieldCheck,
  SquareArrowOutUpRight,
  TriangleAlert,
  UserRound,
  WandSparkles,
  Zap,
} from 'lucide-react';

type IconProps = { className?: string };

const BASE = {
  size: 18,
  strokeWidth: 1.8,
  'aria-hidden': true,
} as const;

function icon(Glyph: LucideIcon) {
  return function Icon({ className }: IconProps) {
    return <Glyph {...BASE} className={className} />;
  };
}

// Summary cards.
export const SessionsIcon = icon(FileText);
export const AutofilledIcon = icon(Zap);
export const AccuracyIcon = icon(ShieldCheck);
export const TimeSavedIcon = icon(Clock);
export const ChangeUpIcon = icon(ArrowUp);
export const ChangeDownIcon = icon(ArrowDown);

// Banner steps.
export const DetectStepIcon = icon(ScanSearch);
export const FillStepIcon = icon(WandSparkles);
export const ReviewStepIcon = icon(ClipboardCheck);

// Toolbar.
export const SearchIcon = icon(Search);
export const FilterIcon = icon(Filter);
export const CalendarIcon = icon(CalendarDays);
export const DropdownIcon = icon(ChevronDown);

// Table.
export const SortIcon = icon(ArrowDown);
export const SortAscendingIcon = icon(ArrowUp);
export const FilledIcon = icon(CircleCheck);
export const CaptchaIcon = icon(TriangleAlert);
export const OtpIcon = icon(CircleAlert);
export const PaymentIcon = icon(IndianRupee);
export const OpenLinkIcon = icon(SquareArrowOutUpRight);
export const MoreIcon = icon(EllipsisVertical);
export const ViewSessionIcon = icon(Eye);
export const CustomerIcon = icon(UserRound);
export const PreviousIcon = icon(ChevronLeft);
export const NextIcon = icon(ChevronRight);
