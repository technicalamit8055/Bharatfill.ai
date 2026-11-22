/**
 * Static copy for the PDF bundle page.
 *
 * Kept out of the editor so the locale check can walk every key without rendering React.
 */

export const PDF_BUNDLE_HREF = '/document-tools/pdf-bundle';

/** Every key the bundle page and editor render. */
export const PDF_BUNDLE_COPY_KEYS = [
  'documentTools.bundle.title',
  'documentTools.bundle.description',
  'documentTools.bundle.openFromStudio',
  'documentTools.bundle.customer',
  'documentTools.bundle.chooseCustomer',
  'documentTools.bundle.customerHint',
  'documentTools.bundle.loadingDocuments',
  'documentTools.bundle.set',
  'documentTools.bundle.setHint',
  'documentTools.bundle.custom',
  'documentTools.bundle.documents',
  'documentTools.bundle.documentsHint',
  'documentTools.bundle.notOnFile',
  'documentTools.bundle.uploadMissing',
  'documentTools.bundle.chooseDocument',
  'documentTools.bundle.otherDocuments',
  'documentTools.bundle.include',
  'documentTools.bundle.moveUp',
  'documentTools.bundle.moveDown',
  'documentTools.bundle.remove',
  'documentTools.bundle.addDocument',
  'documentTools.bundle.empty',
  'documentTools.bundle.targetSize',
  'documentTools.bundle.targetHint',
  'documentTools.bundle.build',
  'documentTools.bundle.building',
  'documentTools.bundle.summary',
  'documentTools.bundle.privacy',
  'documentTools.bundle.passwordFor',
  'documentTools.bundle.errors.listFailed',
  'documentTools.bundle.errors.fetchFailed',
  'documentTools.bundle.errors.nothingSelected',
  'documentTools.bundle.errors.noPermission',
  'documentTools.bundle.imagePagesNote',
] as const;
