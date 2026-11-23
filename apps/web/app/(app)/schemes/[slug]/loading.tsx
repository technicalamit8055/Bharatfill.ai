import { RouteLoading, DetailSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <DetailSkeleton tabs={false} />
    </RouteLoading>
  );
}
