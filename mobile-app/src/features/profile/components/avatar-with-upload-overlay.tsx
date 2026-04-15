import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/src/shared/ui/themed-text';
import { pickCompressAndUpload } from '@/src/shared/lib/image-upload';
import { updateUserAvatar } from '@/src/features/profile';

interface Props {
  userId: string;
  avatarUrl: string | null;
  initials: string;
  size?: number;
  bucket?: string;
  onAvatarUpdated: (publicUrl: string) => void;
}

export function AvatarWithUploadOverlay({
  userId,
  avatarUrl,
  initials,
  size = 96,
  bucket = 'avatars',
  onAvatarUpdated,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const radius = size / 2;

  async function handlePress() {
    if (uploading) return;
    setUploading(true);
    try {
      const objectPath = `${userId}_${Date.now()}.jpg`;
      const publicUrl = await pickCompressAndUpload(bucket, objectPath);
      if (!publicUrl) {
        setUploading(false);
        return;
      }
      await updateUserAvatar(userId, publicUrl);
      onAvatarUpdated(publicUrl);
    } catch (err) {
      Alert.alert('Upload Failed', err instanceof Error ? err.message : 'Unable to upload avatar.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Pressable onPress={() => void handlePress()} style={[styles.wrapper, { width: size, height: size }]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={[styles.avatar, { width: size, height: size, borderRadius: radius }]} />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}>
          <ThemedText style={styles.fallbackText}>{initials}</ThemedText>
        </View>
      )}

      {uploading ? (
        <View style={[styles.overlay, { borderRadius: radius }]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <View style={styles.badge}>
          <MaterialIcons name="add-a-photo" size={16} color="#0f766e" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  avatar: {
    borderWidth: 2,
    borderColor: '#0f766e',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
    borderWidth: 2,
    borderColor: '#0f766e',
  },
  fallbackText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f766e',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
