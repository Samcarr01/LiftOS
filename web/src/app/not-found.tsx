import Link from 'next/link';
import { Dumbbell } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="page-shell min-h-[100dvh]">
      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Dumbbell className="h-8 w-8 text-primary" />
      </div>

      <div>
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That page doesn&apos;t exist — let&apos;s get back to lifting.
        </p>
      </div>

      <Link
        href="/"
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Go home
      </Link>
      </div>
    </div>
  );
}
