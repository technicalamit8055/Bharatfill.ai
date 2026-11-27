/**
 * Sidebar navigation icons, drawn by lucide-react.
 *
 * Named for the destination rather than the glyph, for the same reason as the dashboard set:
 * the nav is defined once as data, and swapping a picture should not mean renaming a route.
 * Slightly smaller than the dashboard icons (17px) so they sit level with the nav label.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  CreditCard,
  FileStack,
  FolderOpen,
  Home,
  Library,
  NotebookTabs,
  Settings,
  Users,
  Wand2,
  Wrench,
} from 'lucide-react';

type IconProps = { className?: string };

const BASE = {
  size: 17,
  strokeWidth: 1.8,
  'aria-hidden': true,
} as const;

function icon(Glyph: LucideIcon) {
  return function Icon({ className }: IconProps) {
    return <Glyph {...BASE} className={className} />;
  };
}

export const HomeIcon = icon(Home);
export const CustomersIcon = icon(Users);
export const DocumentsIcon = icon(FolderOpen);
export const ToolsIcon = icon(Wrench);
export const ApplicationsIcon = icon(FileStack);
export const LibraryIcon = icon(Library);
export const KhataIcon = icon(NotebookTabs);
/** Fill sessions: the wand is the autofill run itself, not the form it ran against. */
export const FillSessionsIcon = icon(Wand2);
export const BillingIcon = icon(CreditCard);
export const SettingsIcon = icon(Settings);
/** Schemes and vacancies are government programmes — a civic building, not a document. */
export const SchemesIcon = icon(Building2);
