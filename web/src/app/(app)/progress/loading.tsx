import { Skeleton } from '@/components/ui/skeleton';

export default function ProgressLoading() {
  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7">
        <div className="page-header">
          <h1 className="page-header-title">Progress</h1>
        </div>

        {/* Segmented control */}
        <Skeleton className="mt-4 h-10 w-full rounded-xl" />

        <div className="mt-5 space-y-4">
          <Skeleton className="h-[120px] w-full rounded-2xl" />
          <Skeleton className="h-[204px] w-full rounded-2xl" />
          <Skeleton className="h-[204px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
