import Link from 'next/link';
import { Dumbbell } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
        <Dumbbell className="h-8 w-8 text-primary" />
      </div>

      <div>
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          That page doesn't exist — let's get back to lifting.
        </p>
      </div>

      <Link
        href="/"
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Go home
      </Link>
    </div>
  );
}
