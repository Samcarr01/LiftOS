import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type InvokeBody =
  | string
  | Blob
  | ArrayBuffer
  | FormData
  | ReadableStream<Uint8Array>
  | Record<string, unknown>
  | undefined;

function needsRefresh(session: Session | null): boolean {
  if (!session?.access_token) return true;
  const now = Math.floor(Date.now() / 1000);
  return !session.expires_at || session.expires_at <= now + 30;
}

async function getAuthenticatedSession(
  supabase: SupabaseClient<Database>,
): Promise<Session> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  let session = sessionData.session;

  // Explicitly refresh before Edge Function calls so the browser sends
  // a user JWT instead of falling back to the anonymous key.
  if (needsRefresh(session)) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    session = refreshData.session;
  }

  if (!session?.access_token) {
    throw new Error('Please sign in again.');
  }

  return session;
}

export async function invokeAuthedFunction<TData = unknown>(
  supabase: SupabaseClient<Database>,
  functionName: string,
  body: InvokeBody,
) {
  const session = await getAuthenticatedSession(supabase);

  return supabase.functions.invoke<TData>(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}
