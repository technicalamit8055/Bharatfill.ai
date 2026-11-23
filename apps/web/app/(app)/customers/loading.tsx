import {
  RouteLoading,
  HeroSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeroSkeleton />
      <StatGridSkeleton count={4} />
      <TableSkeleton />
    </RouteLoading>
  );
}
