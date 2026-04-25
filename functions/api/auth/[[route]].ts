import { createAuth, type AuthEnv } from '../../_lib/auth';

// Catchall — Better Auth owns every /api/auth/* path, including magic-link
// send / verify / get-session / sign-out. Adding individual routes alongside
// this file would shadow the auth handler and break those flows.
export const onRequest: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const auth = createAuth(env);
  return auth.handler(request);
};
