import { RouteLoading, HeroSkeleton, TableSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton />
      <TableSkeleton rows={6} columns={4} toolbar={false} />
    </RouteLoading>
  );
}
