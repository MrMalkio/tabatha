import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Same Tabatha Supabase project the extension syncs to. The publishable
// (anon) key is safe to ship in a client — RLS scopes every row to the
// authenticated user.
export const SUPABASE_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_';

// On web, session lands in the URL after OAuth / magic-link and supabase-js
// must parse it. On native it's a deep-link, handled explicitly.
const isWeb = Platform.OS === 'web';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
    flowType: 'pkce',
  },
  db: { schema: 'tabatha' },
});

// A public (non-schema-scoped) client for the rare call that must hit `public`
// or `auth`. Most reads/writes go through `supabase` (schema: tabatha).
export const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    storageKey: 'sb-tabatha-public',
  },
});
