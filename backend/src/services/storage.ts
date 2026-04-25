import { createClient } from '@supabase/supabase-js';
import config from '../config';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export async function uploadFile(buffer: Buffer, path: string, mimetype: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(config.supabase.bucket)
    .upload(path, buffer, { contentType: mimetype, upsert: true });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(config.supabase.bucket)
    .getPublicUrl(data.path);

  return publicUrl;
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(config.supabase.bucket)
    .remove([path]);
  if (error) throw error;
}
