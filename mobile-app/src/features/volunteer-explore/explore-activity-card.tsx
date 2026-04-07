import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { ThemedText } from '@/src/shared/ui/themed-text';

const PRIMARY = '#00AEEF';
const MATCH_BG = '#E6F9F3';
const MATCH_ACCENT = '#0f766e';

export interface ExploreActivityCardProps {
  title: string;
  categoryLabel: string;
  matchScore: number | null;
  matchExplanation: string | null;
  dateLine: string;
  locationLine: string;
  organizerName: string;
  imageUrl: string;
  onPress: () => void;
  onSavePress?: () => void;
}

export function ExploreActivityCard({
  title,
  categoryLabel,
  matchScore,
  matchExplanation,
  dateLine,
  locationLine,
  organizerName,
  imageUrl,
  onPress,
  onSavePress,
}: ExploreActivityCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Open activity details.`}>
      <View style={styles.heroWrap}>
        <Image source={{ uri: imageUrl }} style={styles.heroImage} contentFit="cover" transition={200} />
        <View style={styles.heroGradient} />
        {onSavePress ? (
          <View style={styles.heroActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={(e) => {
                e?.stopPropagation?.();
                onSavePress();
              }}
              hitSlop={8}
              accessibilityLabel="Save activity">
              <MaterialIcons name="favorite-border" size={22} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <ThemedText type="defaultSemiBold" style={styles.title} numberOfLines={2}>
          {title}
        </ThemedText>

        <View style={styles.tagRow}>
          <View style={styles.categoryPill}>
            <ThemedText style={styles.categoryPillText}>{categoryLabel}</ThemedText>
          </View>
          {matchScore != null && (
            <ThemedText style={styles.spotsHint}>• AI match {matchScore}%</ThemedText>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaIcon}>
            <MaterialIcons name="event" size={18} color={PRIMARY} />
          </View>
          <ThemedText style={styles.metaText} numberOfLines={2}>
            {dateLine}
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaIcon}>
            <MaterialIcons name="place" size={18} color={PRIMARY} />
          </View>
          <ThemedText style={styles.metaText} numberOfLines={2}>
            {locationLine}
          </ThemedText>
        </View>

        <View style={styles.hostRow}>
          <View style={styles.hostAvatar}>
            <MaterialIcons name="eco" size={20} color="#0f766e" />
          </View>
          <ThemedText style={styles.hostText} numberOfLines={1}>
            Hosted by <ThemedText type="defaultSemiBold">{organizerName}</ThemedText>
          </ThemedText>
        </View>

        {matchScore != null && matchExplanation ? (
          <View style={styles.matchBox}>
            <View style={styles.matchHeader}>
              <View style={styles.matchIconWrap}>
                <MaterialIcons name="auto-awesome" size={18} color={MATCH_ACCENT} />
              </View>
              <ThemedText type="defaultSemiBold" style={styles.matchTitle}>
                AI Match: {matchScore}%
              </ThemedText>
            </View>
            <ThemedText style={styles.matchBody} numberOfLines={4}>
              {matchExplanation}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.cta}>
          <ThemedText type="defaultSemiBold" style={styles.ctaText}>
            View details
          </ThemedText>
          <MaterialIcons name="chevron-right" size={22} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 22,
    borderRadius: 22,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.96,
  },
  heroWrap: {
    height: 168,
    width: '100%',
    backgroundColor: '#e8f4f8',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  heroActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: '#0f172a',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 14,
  },
  categoryPill: {
    backgroundColor: '#E0F7FC',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  categoryPillText: {
    fontSize: 13,
    color: PRIMARY,
    fontWeight: '600',
  },
  spotsHint: {
    fontSize: 14,
    color: PRIMARY,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  metaIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F7FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 21,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 14,
  },
  hostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostText: {
    flex: 1,
    fontSize: 15,
    color: '#334155',
  },
  matchBox: {
    backgroundColor: MATCH_BG,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  matchIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchTitle: {
    fontSize: 16,
    color: MATCH_ACCENT,
  },
  matchBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#115e59',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY,
    borderRadius: 999,
    paddingVertical: 14,
    gap: 4,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
  },
});
