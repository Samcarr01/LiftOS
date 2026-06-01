import { redirect } from 'next/navigation';

/**
 * `/templates/new` has no template record of its own — the real creation flow
 * is the name-first inline form on the templates list, which creates the DB
 * row before opening the editor. Previously this path fell through to the
 * `[id]` editor with id="new", producing a broken editor and error toasts on
 * every save. Redirect to the list with the create form auto-opened instead.
 */
export default function NewTemplatePage() {
  redirect('/templates?create=1');
}
