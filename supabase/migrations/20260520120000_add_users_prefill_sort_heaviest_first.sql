ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS prefill_sort_heaviest_first boolean NOT NULL DEFAULT false;
