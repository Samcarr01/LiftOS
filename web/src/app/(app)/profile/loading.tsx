import { Skeleton } from '@/components/ui/skeleton';

export default function ProfileLoading() {
  return (
    <div className="page-shell">
      <div className="page-content py-5 md:py-7 space-y-5">
        <div className="page-header">
          <h1 className="page-header-title">Profile</h1>
        </div>

        {/* Compact hero */}
        <Skeleton className="h-[88px] w-full rounded-2xl" />

        {/* Preferences / Training Stage / Account / Your data / App */}
        {[0, 1, 2, 3, 4].map((i) => (
          <section key={i}>
            <Skeleton className="mb-2 h-5 w-32 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-[72px] w-full rounded-2xl" />
              <Skeleton className="h-[72px] w-full rounded-2xl" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
