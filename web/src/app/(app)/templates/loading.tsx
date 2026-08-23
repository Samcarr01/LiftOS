import { Skeleton } from '@/components/ui/skeleton';

export default function TemplatesLoading() {
  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        <div className="page-header">
          <h1 className="page-header-title">Workouts</h1>
          <Skeleton className="h-9 w-20 rounded-2xl" />
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      </div>
    </div>
  );
}
