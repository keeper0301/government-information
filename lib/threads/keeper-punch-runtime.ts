import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET, createKeeperHandlers, type KeeperStore } from './keeper-punch-oauth';

// No id column assumption: repository migrations do not define sidecar_state.
// Nonce is 256-bit random; CAS is one conditional UPDATE over bucket+nonce+status.
export const keeperStore: KeeperStore = {
  async insert(payload) {
    const { error } = await createAdminClient().from('sidecar_state').insert({ bucket: BUCKET, payload });
    if (error) throw Error('store_failed');
  },
  async get(nonce) {
    const { data, error } = await createAdminClient().from('sidecar_state').select('payload').eq('bucket', BUCKET).eq('payload->>nonce', nonce).maybeSingle();
    if (error) throw Error('store_failed');
    return data?.payload ?? null;
  },
  async cas(nonce, from, payload) {
    const { data, error } = await createAdminClient().from('sidecar_state').update({ payload }).eq('bucket', BUCKET).eq('payload->>nonce', nonce).eq('payload->>status', from).select('payload');
    if (error) throw Error('store_failed');
    return data?.length === 1;
  },
};
export const keeperHandlers = createKeeperHandlers({ env: process.env, store: keeperStore });
