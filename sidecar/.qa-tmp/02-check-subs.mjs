import { mintSession, log } from './lib.mjs';
const { user, adminTabatha, userId } = await mintSession();
const { data: prof } = await user.from('profiles').select('id').eq('auth_user_id', userId).maybeSingle();
const { data: subs } = await adminTabatha.from('push_subscriptions').select('id, profile_id, endpoint, last_ok_at, last_error').eq('profile_id', prof.id);
log('profile', prof.id, 'push_subscriptions count', subs?.length);
subs?.forEach(s => log(' -', s.id, s.endpoint.slice(0,60), 'last_ok_at', s.last_ok_at, 'last_error', s.last_error));
