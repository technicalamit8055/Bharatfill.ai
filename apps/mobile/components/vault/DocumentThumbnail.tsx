/**
 * A document's first page, letterboxed ("contain") so a portrait photo or marksheet shows whole.
 *
 * Vault pages are decrypted only while the thumbnail is mounted, into an in-memory `data:` URI
 * that is dropped on unmount — the list virtualises its rows, so only on-screen pages are held.
 * Documents without an image, or whose page does not open, show a file icon instead.
 */

import { FileText } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import type { VaultThumbnail } from '../../lib/vault/vault-screen';
import { vaultPalette as palette } from './palette';

export type DocumentThumbnailProps = {
  readonly documentId: string;
  readonly thumbnail: VaultThumbnail;
  readonly loadThumbnail: (documentId: string) => Promise<string>;
  readonly style?: StyleProp<ViewStyle>;
};

export function DocumentThumbnail({
  documentId,
  thumbnail,
  loadThumbnail,
  style,
}: DocumentThumbnailProps) {
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (thumbnail.kind !== 'vault') return;
    let cancelled = false;
    setDataUri(null);
    setFailed(false);
    loadThumbnail(documentId).then(
      (uri) => {
        if (!cancelled) setDataUri(uri);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [documentId, thumbnail.kind, loadThumbnail]);

  const source =
    thumbnail.kind === 'asset' ? thumbnail.source : dataUri !== null ? { uri: dataUri } : null;

  return (
    <View style={[styles.well, style]}>
      {source !== null ? (
        <Image
          source={source}
          style={styles.image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : thumbnail.kind === 'vault' && !failed ? null : (
        <FileText color={palette.textMuted} size={26} strokeWidth={1.8} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: palette.thumbnailSurface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
