import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { supabase } from '@/lib/supabase';

const MAX_BYTES = 700_000;

export async function pickImageFromLibrary(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Please allow photo library access to upload images.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

export async function compressImage(uri: string): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  return manipulated.uri;
}

export async function assertUnderMaxBytes(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('Compressed file not found.');
  if (info.size && info.size > MAX_BYTES) {
    throw new Error(`Image is ${Math.round(info.size / 1024)}KB — must be under ${MAX_BYTES / 1024}KB after compression.`);
  }
}

async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

export async function uploadJpegAndGetPublicUrl(
  bucket: string,
  objectPath: string,
  localUri: string,
): Promise<string> {
  const buffer = await uriToArrayBuffer(localUri);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

/**
 * Full pipeline: pick → compress → size-check → upload → public URL.
 * Returns the public URL on success, or `null` if the user cancelled.
 * Throws on unrecoverable errors (callers should catch and Alert).
 */
export async function pickCompressAndUpload(
  bucket: string,
  objectPath: string,
): Promise<string | null> {
  const rawUri = await pickImageFromLibrary();
  if (!rawUri) return null;

  const compressedUri = await compressImage(rawUri);
  await assertUnderMaxBytes(compressedUri);
  return uploadJpegAndGetPublicUrl(bucket, objectPath, compressedUri);
}
