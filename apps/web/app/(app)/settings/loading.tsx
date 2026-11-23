import {
  RouteLoading,
  HeaderSkeleton,
  CardGridSkeleton,
  PanelSkeleton,
} from '@/components/loading/page-skeletons';

export default function Loading() {
  return (
    <RouteLoading>
      <HeaderSkeleton action={false} />
      <PanelSkeleton rows={3} />
      <CardGridSkeleton count={4} />
    </RouteLoading>
  );
}
