import { Skeleton } from '@/components/ui/skeleton';

export default function ExerciseDetailLoading() {
  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-2xl" />
          <Skeleton className="h-6 w-48 rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </div>
  );
}
