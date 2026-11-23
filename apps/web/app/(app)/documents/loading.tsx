import { RouteLoading, HeaderSkeleton, TableSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeaderSkeleton />
      <TableSkeleton />
    </RouteLoading>
  );
}
