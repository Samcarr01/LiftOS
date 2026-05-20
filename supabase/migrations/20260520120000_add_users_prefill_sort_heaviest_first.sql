ALTER TABLE public.users
  ADD COLUMN prefill_sort_heaviest_first boolean NOT NULL DEFAULT false;
