import { mintSession, log } from './lib.mjs';

const { user, userId, session, adminTabatha } = await mintSession();
log('minted session for', userId, 'expires', session?.expires_at);

const { data: prof, error } = await user
  .from('profiles')
  .select('id, auth_user_id, display_name, settings')
  .eq('auth_user_id', userId)
  .maybeSingle();
log('profile', JSON.stringify(prof), error?.message);

if (!prof) {
  log('NO PROFILE FOUND — aborting, need to investigate before running the rest of the suite');
  process.exit(1);
}
log('OK — smoke test passed. profile_id =', prof.id);
