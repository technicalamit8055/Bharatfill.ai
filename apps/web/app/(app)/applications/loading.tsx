import {
  RouteLoading,
  HeaderSkeleton,
  StatGridSkeleton,
  TableSkeleton,
} from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeaderSkeleton />
      <StatGridSkeleton count={5} />
      <TableSkeleton columns={6} />
    </RouteLoading>
  );
}
