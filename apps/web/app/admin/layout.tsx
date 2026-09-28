export const metadata = {
  title: { default: 'Console', template: '%s · Bharatfill Console' },
  // Internal surface. Even behind a 404 for non-staff, it has no business in an index.
  robots: { index: false, follow: false },
};

/**
 * The `/admin` root: metadata only.
 *
 * The gate lives one level down, in `(console)/layout.tsx`, so that `/admin/login` can sit under
 * the same path without being wrapped in the check that sends signed-out staff to it.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
