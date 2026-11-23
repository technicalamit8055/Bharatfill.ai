import { RouteLoading, ToolSkeleton } from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <ToolSkeleton />
    </RouteLoading>
  );
}
