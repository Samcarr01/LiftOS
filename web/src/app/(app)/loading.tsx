import { Skeleton } from '@/components/ui/skeleton';

export default function AppLoading() {
  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        <div className="page-header">
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <Skeleton className="h-[88px] w-full rounded-2xl" />
        <Skeleton className="h-[72px] w-full rounded-2xl" />
        <Skeleton className="h-[72px] w-full rounded-2xl" />
        <Skeleton className="h-[72px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
