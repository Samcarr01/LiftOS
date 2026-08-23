import { Skeleton } from '@/components/ui/skeleton';

export default function HistoryDetailLoading() {
  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-40 rounded-lg" />
            <Skeleton className="mt-1.5 h-4 w-32 rounded-md" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
