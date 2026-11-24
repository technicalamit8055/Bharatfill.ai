/** One line icon per vault category, for rows and lists. The tiles use `<ArtIcon>`. */

import type { LucideIcon } from 'lucide-react-native';
import { Award, Folder, GraduationCap, IdCard } from 'lucide-react-native';

import type { VaultCategoryKey } from '../../lib/vault/categories';

export const VAULT_CATEGORY_ICONS: Readonly<Record<VaultCategoryKey, LucideIcon>> = {
  identity: IdCard,
  academic: GraduationCap,
  certificate: Award,
  form_asset: Folder,
};
