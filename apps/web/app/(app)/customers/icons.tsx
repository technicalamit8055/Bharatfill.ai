/**
 * The customers-list icon set, drawn by lucide-react.
 *
 * Same convention as the dashboard's `icons.tsx`: names say what the icon means on this page,
 * so a change of glyph is one edit here. Every icon is `aria-hidden` because each sits beside a
 * visible label, or inside a control that carries its own `aria-label`.
 */

import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardPlus,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  Globe,
  GraduationCap,
  History,
  House,
  IdCard,
  KeyRound,
  Landmark,
  MapPin,
  Megaphone,
  MessageCircle,
  Pencil,
  PenLine,
  Phone,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Smartphone,
  StickyNote,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  Users,
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

export const CustomersIcon = icon(Users);
export const VerifiedIcon = icon(CircleCheck);
export const NewCustomerIcon = icon(UserPlus);
export const StateIcon = icon(MapPin);
export const RoamingIcon = icon(Globe);
export const GrowthIcon = icon(TrendingUp);

export const SearchIcon = icon(Search);
export const FilterIcon = icon(Filter);
export const PlusIcon = icon(Plus);
export const ViewIcon = icon(Eye);
export const PreviousIcon = icon(ChevronLeft);
export const NextIcon = icon(ChevronRight);

// The customer profile (`/customers/[id]`).
export const BackIcon = icon(ArrowLeft);
export const ForwardIcon = icon(ArrowRight);
export const EditIcon = icon(Pencil);
export const DeleteIcon = icon(Trash2);
export const OperatorVerifiedIcon = icon(ShieldCheck);
export const OpportunitiesIcon = icon(Sparkles);
export const PitchIcon = icon(Megaphone);
export const CopyIcon = icon(Copy);
export const CopiedIcon = icon(Check);
export const HiddenIcon = icon(EyeOff);
export const ReadDetailsIcon = icon(Zap);
export const DownloadIcon = icon(Download);
export const EmptyListIcon = icon(FileText);

// One per profile section, keyed by `CUSTOMER_FIELD_SECTIONS` in `profile-sections.tsx`.
export const PersonalSectionIcon = icon(User);
export const FamilySectionIcon = icon(Users);
export const ContactSectionIcon = icon(Phone);
export const AddressSectionIcon = icon(MapPin);
export const PermanentAddressSectionIcon = icon(House);
export const IdentitySectionIcon = icon(IdCard);
export const EducationSectionIcon = icon(GraduationCap);
export const CertificatesSectionIcon = icon(Award);
export const BankingSectionIcon = icon(Landmark);

export const AddDetailsIcon = icon(ClipboardPlus);
export const DocumentsIcon = icon(FileText);

// Document folders (same sections as the BharatDoc app vault)
export const AllFoldersIcon = icon(FolderOpen);
export const PhotoSignatureFolderIcon = icon(PenLine);
export const OtherFolderIcon = icon(Folder);
export const FromAppIcon = icon(Smartphone);
export const ApplicationsIcon = icon(ClipboardList);
export const FillSessionsIcon = icon(FileCheck2);
export const ActivityIcon = icon(History);
export const NotesIcon = icon(StickyNote);

// Portal credential vault (spec §19.7a)
export const PortalLoginIcon = icon(KeyRound);
export const PrintIcon = icon(Printer);
export const WhatsappIcon = icon(MessageCircle);
export const GenerateIcon = icon(WandSparkles);
