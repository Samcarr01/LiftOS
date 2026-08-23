import { Skeleton } from '@/components/ui/skeleton';

export default function WorkoutLoading() {
  return (
    <div className="page-shell">
      <div className="page-content py-4 md:py-6">
        {/* Mirrors the sticky workout header so nothing shifts when it lands. */}
        <div className="-mx-4 -mt-4 border-b border-white/[0.06] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:-mt-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-40 rounded-lg" />
              <Skeleton className="mt-1.5 h-4 w-28 rounded-md" />
            </div>
          </div>
          <Skeleton className="mt-2.5 h-2 w-full rounded-full" />
        </div>

        <div className="mt-5 space-y-5 pb-28">
          <Skeleton className="h-[220px] w-full rounded-2xl" />
          <Skeleton className="h-[220px] w-full rounded-2xl" />
          <Skeleton className="h-[220px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
