import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const { url, serviceRoleKey } = config.supabase;
    if (!url || !serviceRoleKey) throw new Error('Supabase credentials not configured');
    _client = createClient(url, serviceRoleKey);
  }
  return _client;
}

export async function uploadFile(buffer: Buffer, path: string, mimetype: string): Promise<string> {
  const { data, error } = await getClient().storage
    .from(config.supabase.bucket)
    .upload(path, buffer, { contentType: mimetype, upsert: true });

  if (error) throw error;

  const { data: { publicUrl } } = getClient().storage
    .from(config.supabase.bucket)
    .getPublicUrl(data.path);

  return publicUrl;
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await getClient().storage
    .from(config.supabase.bucket)
    .remove([path]);
  if (error) throw error;
}
