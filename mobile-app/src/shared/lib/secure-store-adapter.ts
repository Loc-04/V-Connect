import * as SecureStore from 'expo-secure-store';

/**
 * Supabase-compatible storage adapter backed by expo-secure-store.
 * Implements the { getItem, setItem, removeItem } interface required
 * by `createClient(..., { auth: { storage } })`.
 *
 * SecureStore has a ~2048-byte value limit on some platforms.
 * Supabase JWT sessions are typically well under this, but the
 * adapter silently catches write failures so the app never crashes.
 */
export const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Silently swallow – avoids crashing on value-size limits.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // No-op if key doesn't exist.
    }
  },
};
