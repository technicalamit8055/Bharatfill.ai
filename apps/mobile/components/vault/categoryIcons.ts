/** One icon per vault category, shared by Home's vault grid and the Vault tab's folders. */

import type { LucideIcon } from 'lucide-react-native';
import { Award, Folder, GraduationCap, IdCard } from 'lucide-react-native';

import type { VaultCategoryKey } from '../../lib/vault/categories';

export const VAULT_CATEGORY_ICONS: Readonly<Record<VaultCategoryKey, LucideIcon>> = {
  identity: IdCard,
  academic: GraduationCap,
  certificate: Award,
  form_asset: Folder,
};
