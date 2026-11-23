import { RouteLoading, FormSkeleton, HeaderSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeaderSkeleton action={false} />
      <FormSkeleton />
    </RouteLoading>
  );
}
