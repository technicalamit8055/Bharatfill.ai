/**
 * The dashboard icon set, drawn by lucide-react.
 *
 * These are thin aliases rather than direct imports at the call sites, and deliberately so:
 * the names here describe what the icon *means* at the counter ("walk-in drop", "signature
 * cleaner") rather than what it depicts, so a later change of glyph — or of icon library —
 * is one edit in this file instead of a rename across every card on the home screen.
 *
 * Every icon renders at 18px on a 24px grid with a 1.8 stroke, matching the weight the rest of
 * the app shell is drawn at. `className` is forwarded so a call site can resize (`h-4 w-4`) or
 * recolour (`text-brand-700`) without reaching past this module.
 */

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Camera,
  ChevronRight,
  Clipboard,
  Clock,
  CreditCard,
  Eye,
  FileText,
  FileType2,
  Grid2x2,
  Inbox,
  Keyboard,
  MessageCircle,
  Phone,
  PenTool,
  Play,
  Plus,
  Puzzle,
  QrCode,
  Radar,
  ScanLine,
  Search,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';

type IconProps = { className?: string };

/**
 * Shared geometry. `aria-hidden` is the default for every icon in this set because each one
 * sits beside its own visible label — announcing the glyph as well would read the same thing
 * twice to a screen reader.
 */
const BASE = {
  size: 18,
  strokeWidth: 1.8,
  'aria-hidden': true,
} as const;

/** Wraps a lucide glyph as a named, `className`-forwarding component. */
function icon(Glyph: LucideIcon) {
  return function Icon({ className }: IconProps) {
    return <Glyph {...BASE} className={className} />;
  };
}

// ── Summary metrics ───────────────────────────────────────────────────────────
export const FormIcon = icon(FileText);
export const UsersIcon = icon(Users);
export const DocumentIcon = icon(FileText);
export const ClipboardIcon = icon(Clipboard);
export const AlertIcon = icon(AlertTriangle);

// ── Counter tools ─────────────────────────────────────────────────────────────
export const CameraIcon = icon(Camera);
export const SignatureIcon = icon(PenTool);
export const PdfIcon = icon(FileType2);
export const IdCardIcon = icon(CreditCard);
export const GridIcon = icon(Grid2x2);
/** Smart OCR extract: a scan line reads as "run this document through the reader". */
export const ScanIcon = icon(ScanLine);

// ── Actions ───────────────────────────────────────────────────────────────────
export const PlusIcon = icon(Plus);
export const UploadIcon = icon(Upload);
export const PlayIcon = icon(Play);
export const SearchIcon = icon(Search);
export const ArrowRightIcon = icon(ArrowRight);
export const ChevronRightIcon = icon(ChevronRight);
export const EyeIcon = icon(Eye);

// ── Walk-in intake ────────────────────────────────────────────────────────────
export const QrIcon = icon(QrCode);
export const PhoneUploadIcon = icon(Smartphone);
export const InboxIcon = icon(Inbox);

// ── Contact ───────────────────────────────────────────────────────────────────
export const PhoneIcon = icon(Phone);
/**
 * WhatsApp is shown as a generic chat bubble rather than the brand mark: the button is already
 * labelled "WhatsApp", and shipping someone else's logo file is a licensing question we do not
 * need to open for an icon nobody navigates by.
 */
export const WhatsappIcon = icon(MessageCircle);

// ── Status and trend ──────────────────────────────────────────────────────────
export const ClockIcon = icon(Clock);
export const CalendarIcon = icon(Calendar);
export const ExtensionIcon = icon(Puzzle);
export const RadarIcon = icon(Radar);
export const TrendUpIcon = icon(TrendingUp);
export const TrendDownIcon = icon(TrendingDown);
export const SparkIcon = icon(Sparkles);
export const KeyboardIcon = icon(Keyboard);
