export const metadata = {
  title: { default: 'Team sign-in', template: '%s · Bharatfill Console' },
  // Internal staff entry point: not something a search engine should list.
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
