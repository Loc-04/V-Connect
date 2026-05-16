import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';

import { useAuth } from '@/src/features/auth';
import {
  fetchVolunteerRecommendations,
  formatDateRangeLine,
  formatLocationLine,
  resolveExploreCoverUrl,
  type VolunteerRecommendationActivity,
} from '@/src/features/volunteer-explore';
import { ThemedText } from '@/src/shared/ui/themed-text';

const PRIMARY = '#00AEEF';
const MATCH_BG = '#E6F9F3';
const MATCH_ACCENT = '#0f766e';

export default function AiMatchScreen() {
  const { user, status: authStatus, role } = useAuth();
  const [recommendations, setRecommendations] = useState<VolunteerRecommendationActivity[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || role !== 'volunteer') {
      setRecommendations([]);
      setLoadState('ready');
      return;
    }
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const data = await fetchVolunteerRecommendations(user.id, 24);
      setRecommendations(data.activities ?? []);
      setLoadState('ready');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Unable to load recommendations.');
      setLoadState('error');
    }
  }, [user?.id, role]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void load();
    } else if (authStatus !== 'loading') {
      setLoadState('ready');
    }
  }, [authStatus, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openDetail = useCallback((id: string, recommendationItemId?: string | null) => {
    if (recommendationItemId) {
      router.push(`/(volunteer)/activity/${id}?recommendationItemId=${recommendationItemId}`);
    } else {
      router.push(`/(volunteer)/activity/${id}`);
    }
  }, []);

  if (authStatus === 'loading' || (loadState === 'loading' && recommendations.length === 0)) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  if (authStatus !== 'authenticated' || !user || role !== 'volunteer') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>Sign in to view AI Matches</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (loadState === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>Something went wrong</ThemedText>
          <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (recommendations.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>No matches found</ThemedText>
          <ThemedText style={styles.emptyHint}>We could not find any activities matching your profile right now.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  const topMatch = recommendations[0];
  const otherMatches = recommendations.slice(1, 7);

  const renderTopMatch = () => {
    const score = topMatch.matchScore ?? (topMatch.matchRatio ? Math.round(topMatch.matchRatio * 100) : null);
    const badge = topMatch.match_tier || topMatch.ai_decision?.decision || 'Recommended';
    const expl = topMatch.ai_decision?.display_explanation || topMatch.explanation;
    const reasons = topMatch.reasons || topMatch.reason_codes || [];
    const dateLine = formatDateRangeLine(topMatch.startTime, topMatch.endTime);
    const locLine = formatLocationLine(topMatch.location);
    const imageUrl = resolveExploreCoverUrl(topMatch.activityId, topMatch.cover_image_url);

    return (
      <View style={styles.topMatchContainer}>
        <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>Top Match</ThemedText>
        <Pressable
          style={({ pressed }) => [styles.topCard, pressed && styles.cardPressed]}
          onPress={() => openDetail(topMatch.activityId, topMatch.recommendation_item_id)}>
          <View style={styles.heroWrap}>
             <Image source={{ uri: imageUrl }} style={styles.heroImage} contentFit="cover" />
          </View>
          <View style={styles.topCardBody}>
            <View style={styles.badgeRow}>
              <View style={styles.scoreBadge}>
                <MaterialIcons name="auto-awesome" size={16} color="#fff" />
                <ThemedText style={styles.scoreBadgeText}>{score ? `${score}% Match` : 'Match'}</ThemedText>
              </View>
              <View style={styles.tierBadge}>
                <ThemedText style={styles.tierBadgeText}>{badge}</ThemedText>
              </View>
            </View>
            <ThemedText type="defaultSemiBold" style={styles.topTitle}>{topMatch.title}</ThemedText>
            <ThemedText style={styles.topOrganizer}>by {topMatch.organizerName}</ThemedText>
            
            <View style={styles.metaRow}>
              <MaterialIcons name="event" size={16} color="#64748b" />
              <ThemedText style={styles.metaText}>{dateLine}</ThemedText>
            </View>
            <View style={styles.metaRow}>
              <MaterialIcons name="place" size={16} color="#64748b" />
              <ThemedText style={styles.metaText}>{locLine}</ThemedText>
            </View>

            {expl ? (
              <View style={styles.explBox}>
                <ThemedText style={styles.explText}>{expl}</ThemedText>
              </View>
            ) : null}

            {reasons.length > 0 ? (
              <View style={styles.reasonsRow}>
                {reasons.slice(0, 3).map((r, i) => (
                  <View key={i} style={styles.reasonChip}>
                    <ThemedText style={styles.reasonChipText}>{r}</ThemedText>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.cta}>
              <ThemedText type="defaultSemiBold" style={styles.ctaText}>View details</ThemedText>
              <MaterialIcons name="chevron-right" size={20} color="#fff" />
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const renderOtherMatch = ({ item }: { item: VolunteerRecommendationActivity }) => {
    const score = item.matchScore ?? (item.matchRatio ? Math.round(item.matchRatio * 100) : null);
    const expl = item.ai_decision?.display_explanation || item.explanation;
    const dateLine = formatDateRangeLine(item.startTime, item.endTime);
    const locLine = formatLocationLine(item.location);

    return (
      <Pressable
        style={({ pressed }) => [styles.otherCard, pressed && styles.cardPressed]}
        onPress={() => openDetail(item.activityId, item.recommendation_item_id)}>
        <View style={styles.otherCardHeader}>
          <ThemedText type="defaultSemiBold" style={styles.otherTitle} numberOfLines={2}>{item.title}</ThemedText>
          {score ? (
             <View style={styles.otherScore}>
               <ThemedText style={styles.otherScoreText}>{score}%</ThemedText>
             </View>
          ) : null}
        </View>
        <ThemedText style={styles.otherMeta} numberOfLines={1}>{dateLine} • {locLine}</ThemedText>
        {expl ? (
           <ThemedText style={styles.otherExpl} numberOfLines={2}>{expl}</ThemedText>
        ) : null}
        <View style={styles.otherCta}>
          <ThemedText style={styles.otherCtaText}>View details</ThemedText>
          <MaterialIcons name="arrow-forward" size={16} color={PRIMARY} />
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={otherMatches}
        keyExtractor={(item) => item.activityId}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={PRIMARY} />}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <ThemedText type="title" style={styles.screenTitle}>AI Match</ThemedText>
              <ThemedText style={styles.screenSubtitle}>
                Personalized activities based on your skills, interests, and availability.
              </ThemedText>
            </View>
            {renderTopMatch()}
            {otherMatches.length > 0 && (
              <ThemedText type="defaultSemiBold" style={styles.otherSectionTitle}>Other Matches</ThemedText>
            )}
          </>
        }
        renderItem={renderOtherMatch}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, color: '#0f172a', textAlign: 'center' },
  emptyHint: { marginTop: 8, fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22 },
  errorText: { marginTop: 8, fontSize: 14, color: '#b91c1c', textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: PRIMARY, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  listContent: { paddingBottom: 32 },
  header: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 16 },
  screenTitle: { fontSize: 32, letterSpacing: -0.5, color: '#0f172a' },
  screenSubtitle: { marginTop: 6, fontSize: 15, lineHeight: 22, color: '#64748b' },
  
  topMatchContainer: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 20, color: '#0f172a', marginBottom: 12 },
  topCard: { backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16 },
  cardPressed: { opacity: 0.9 },
  heroWrap: { height: 160, width: '100%', backgroundColor: '#e2e8f0' },
  heroImage: { ...StyleSheet.absoluteFillObject },
  topCardBody: { padding: 18 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: PRIMARY, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, gap: 4 },
  scoreBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tierBadge: { backgroundColor: MATCH_BG, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tierBadgeText: { color: MATCH_ACCENT, fontSize: 13, fontWeight: '600' },
  topTitle: { fontSize: 22, color: '#0f172a', lineHeight: 28 },
  topOrganizer: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  metaText: { fontSize: 14, color: '#475569' },
  explBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, marginTop: 12, marginBottom: 12 },
  explText: { fontSize: 14, color: '#334155', lineHeight: 20 },
  reasonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  reasonChip: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  reasonChipText: { fontSize: 12, color: '#0369a1', fontWeight: '500' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: PRIMARY, borderRadius: 999, paddingVertical: 14, gap: 4 },
  ctaText: { color: '#fff', fontSize: 16 },

  otherSectionTitle: { fontSize: 20, color: '#0f172a', marginHorizontal: 22, marginBottom: 12 },
  otherCard: { backgroundColor: '#fff', marginHorizontal: 20, marginBottom: 12, borderRadius: 16, padding: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
  otherCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 },
  otherTitle: { flex: 1, fontSize: 16, color: '#0f172a', lineHeight: 22 },
  otherScore: { backgroundColor: MATCH_BG, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  otherScoreText: { color: MATCH_ACCENT, fontSize: 13, fontWeight: '700' },
  otherMeta: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  otherExpl: { fontSize: 13, color: '#334155', lineHeight: 18, marginBottom: 12 },
  otherCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  otherCtaText: { fontSize: 14, color: PRIMARY, fontWeight: '600' },
});
