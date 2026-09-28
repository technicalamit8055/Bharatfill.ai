import { redirect } from 'next/navigation';

/** `/staff` has one page. */
export default function StaffIndexPage() {
  redirect('/staff/login');
}
