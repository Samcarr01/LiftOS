'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Dumbbell,
  HelpCircle,
  Link2,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import GettingStartedTutorial from '@/components/tutorial/getting-started-tutorial';

/* ── Collapsible section ────────────────────────────────────── */

function Section({
  icon,
  title,
  defaultOpen,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="content-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        {icon}
        <span className="flex-1 text-sm font-semibold">{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-4 py-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── FAQ item ───────────────────────────────────────────────── */

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen(!open)}
      className="flex w-full flex-col gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.05]"
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 text-sm font-medium text-foreground">{q}</span>
        <ChevronDown
          className={cn(
            'mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </div>
      {open && <p className="text-sm text-muted-foreground">{a}</p>}
    </button>
  );
}

/* ── Help Page ──────────────────────────────────────────────── */

export default function HelpPage() {
  const [showTutorial, setShowTutorial] = useState(false);

  if (showTutorial) {
    return (
      <GettingStartedTutorial
        standalone
        onComplete={() => setShowTutorial(false)}
      />
    );
  }

  return (
    <div className="page-shell">
      <div className="page-content space-y-5 py-6 md:py-8">

        {/* Back link */}
        <Link
          href="/profile"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Profile
        </Link>

        <div>
          <h1 className="font-display text-2xl font-bold">Help & Getting Started</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Learn how to get the most out of LiftOS.
          </p>
        </div>

        {/* Quick start tutorial replay */}
        <button
          onClick={() => setShowTutorial(true)}
          className="flex w-full items-center gap-3.5 rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3.5 text-left transition-colors hover:bg-primary/12"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20">
            <Play className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary">View Getting Started Tutorial</p>
            <p className="text-xs text-primary/60">4-step walkthrough of the app</p>
          </div>
        </button>

        {/* ── Sections ──────────────────────────────── */}

        <Section
          icon={<Dumbbell className="h-4 w-4 text-primary" />}
          title="How Workouts Work"
          defaultOpen
        >
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-foreground">Templates</p>
              <p>
                Templates are your reusable workout blueprints. Create one, add exercises,
                then start it any time. Your template stays the same — only your logged
                sets change each session.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Starting a workout</p>
              <p>
                Tap <span className="font-medium text-foreground">Start Workout</span> from
                Home or the Workouts tab. Pick a template and your workout opens with sets
                prefilled from last time.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Logging sets</p>
              <p>
                Each row shows what you did last session. Adjust the numbers if needed,
                then tap the checkmark. Most sets take under 2 seconds to log.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Finishing</p>
              <p>
                When you&apos;re done, tap <span className="font-medium text-foreground">Finish Workout</span>.
                Your session is saved and the AI calculates your next targets.
              </p>
            </div>
          </div>
        </Section>

        <Section
          icon={<TrendingUp className="h-4 w-4 text-[oklch(0.72_0.19_155)]" />}
          title="Progressive Overload & AI Suggestions"
        >
          <div className="space-y-3">
            <p>
              <span className="font-semibold text-foreground">Progressive overload</span> means
              gradually doing more over time — more weight, more reps, or more sets.
              This is how you get stronger.
            </p>
            <p>
              LiftOS tracks your performance and uses a guided progression algorithm to decide
              when you&apos;re ready to progress.
            </p>
            <p>
              When you hit your target reps across all working sets, the AI suggests
              <span className="font-medium text-foreground"> increasing weight</span> next session.
              If not, it suggests holding at the current weight and building reps.
            </p>
            <p>
              Suggestions appear as an <span className="font-medium text-primary">orange banner</span> at
              the top of each exercise. Tap &quot;Apply Target&quot; to auto-fill, or dismiss if you
              want to decide yourself.
            </p>
          </div>
        </Section>

        <Section
          icon={<BookOpen className="h-4 w-4 text-[oklch(0.80_0.16_55)]" />}
          title="Creating & Editing Templates"
        >
          <div className="space-y-3">
            <p>
              Go to the <span className="font-medium text-foreground">Workouts</span> tab and
              tap <span className="font-medium text-foreground">+ New</span> to create a template.
              Give it a name, then add exercises.
            </p>
            <p>
              In the template editor, you can:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Search the exercise library or create custom exercises</li>
              <li>Drag to reorder exercises</li>
              <li>Tap the gear icon to configure sets, tracking type, and notes</li>
              <li>Duplicate or delete templates from the editor</li>
            </ul>
            <p>
              Templates auto-save as you edit. Pin your favourites to keep them at the top.
            </p>
          </div>
        </Section>

        <Section
          icon={<Link2 className="h-4 w-4 text-[oklch(0.72_0.15_250)]" />}
          title="Supersets"
        >
          <div className="space-y-3">
            <p>
              In the template editor, tap the <span className="font-medium text-foreground">link icon</span> between
              two adjacent exercises to group them into a superset.
            </p>
            <p>
              During a workout, superset exercises appear together. Alternate sets
              between exercises with minimal rest for an efficient session.
            </p>
            <p>
              Tap the link icon again to unlink exercises.
            </p>
          </div>
        </Section>

        <Section
          icon={<HelpCircle className="h-4 w-4 text-muted-foreground" />}
          title="FAQ"
        >
          <div className="space-y-2">
            <FAQ
              q="Can I skip exercises during a workout?"
              a="Yes — just leave any exercises you want to skip uncompleted. Only confirmed sets are saved to your history."
            />
            <FAQ
              q="What if I train offline?"
              a="LiftOS works offline. Your sets are saved locally and sync when you reconnect."
            />
            <FAQ
              q="How do I change my units?"
              a="Go to Profile and toggle between kg and lb. All weights update instantly."
            />
            <FAQ
              q="Can I delete a workout template?"
              a="Open the template editor and use the delete option in the menu. This won't delete your past sessions — those are kept in History."
            />
            <FAQ
              q="What does the AI actually do?"
              a="It analyses your recent sessions for each exercise and suggests whether to increase weight or build more reps. It's a guided algorithm, not a black-box — you can always see why it made a suggestion."
            />
            <FAQ
              q="How do I track bodyweight exercises?"
              a="When adding an exercise, set the tracking type to 'Reps Only'. The AI will still track your progression through rep increases."
            />
          </div>
        </Section>

        <div className="pb-8" />
      </div>
    </div>
  );
}
