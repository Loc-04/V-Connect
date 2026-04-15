import { supabase } from '@/src/data/clients';

export async function updateActivityCoverImageUrl(
  activityId: string,
  publicUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .update({ cover_image_url: publicUrl })
    .eq('id', activityId);

  if (error) {
    throw new Error(error.message);
  }
}
