import { Skeleton } from '@/components/ui/skeleton';

export default function TemplateDetailLoading() {
  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-2xl" />
          <Skeleton className="h-7 min-w-0 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-2xl" />
        </div>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <Skeleton className="h-5 w-32 rounded-md" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        </section>
      </div>
    </div>
  );
}
