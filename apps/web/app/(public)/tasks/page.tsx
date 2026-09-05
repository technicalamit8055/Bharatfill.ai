import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Bharatfill / Assistigo Tasks & Roadmap Tracker',
  description: 'Interactive task tracker and master feature roadmap for Bharatfill.ai / Assistigo.ai',
};

export default function TasksPage() {
  redirect('/tasks.html');
}
