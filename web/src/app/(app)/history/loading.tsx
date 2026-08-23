import { Skeleton } from '@/components/ui/skeleton';

export default function HistoryLoading() {
  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-5 md:py-7">
        <div className="page-header"><h1 className="page-header-title">Log</h1></div>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[90px] w-full rounded-2xl" />)}
        </div>
      </div>
    </div>
  );
}
