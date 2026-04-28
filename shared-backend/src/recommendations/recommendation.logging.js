import { supabaseAdmin } from '../database/supabase.js';
import { isUuid } from '../common/utils/validators.js';

const REC_EVENT_TYPES = new Set(['detail_open', 'register', 'approved', 'rejected', 'checked_in', 'cancelled']);
const REC_SCOPE_TYPES = new Set(['volunteer_to_activity', 'activity_to_volunteer']);
const REC_CANDIDATE_TYPES = new Set(['activity', 'volunteer']);

function asUuidOrNull(value) {
  const raw = String(value ?? '').trim();
  return isUuid(raw) ? raw : null;
}

function asFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

function asNonEmptyText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function computeScopeFromPayload(payload) {
  const explicitScope = asNonEmptyText(payload?.scope, '');
  if (REC_SCOPE_TYPES.has(explicitScope)) {
    return explicitScope;
  }

  if (asUuidOrNull(payload?.target_activity_id)) {
    return 'activity_to_volunteer';
  }
  if (asUuidOrNull(payload?.target_user_id)) {
    return 'volunteer_to_activity';
  }
  return '';
}

function computeCandidateTypeFromPayload(payload) {
  const explicitType = asNonEmptyText(payload?.candidate_type, '');
  if (REC_CANDIDATE_TYPES.has(explicitType)) {
    return explicitType;
  }

  if (asUuidOrNull(payload?.candidate_activity_id)) {
    return 'activity';
  }
  if (asUuidOrNull(payload?.candidate_volunteer_id)) {
    return 'volunteer';
  }
  return '';
}

async function persistRecommendationServingItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const normalizedRows = items
    .map((item, index) => {
      const scope = computeScopeFromPayload(item);
      const candidateType = computeCandidateTypeFromPayload(item);
      if (!scope || !candidateType) {
        return null;
      }

      const rankPositionRaw = Math.trunc(asFiniteNumber(item.rank_position, index + 1));
      const rankPosition = rankPositionRaw > 0 ? rankPositionRaw : index + 1;
      const predictedScoreRaw = asFiniteNumber(item.predicted_score, 0);
      const predictedScore = Math.max(0, Math.min(100, Number(predictedScoreRaw.toFixed(2))));

      return {
        scope,
        requester_user_id: asUuidOrNull(item.requester_user_id),
        target_user_id: asUuidOrNull(item.target_user_id),
        target_activity_id: asUuidOrNull(item.target_activity_id),
        candidate_type: candidateType,
        candidate_activity_id: asUuidOrNull(item.candidate_activity_id),
        candidate_volunteer_id: asUuidOrNull(item.candidate_volunteer_id),
        rank_position: rankPosition,
        predicted_score: predictedScore,
        model_version: asNonEmptyText(item.model_version, 'heuristic-v2-lite-2026-04'),
        provider: asNonEmptyText(item.provider, 'internal'),
        feature_snapshot:
          item?.feature_snapshot && typeof item.feature_snapshot === 'object' ? item.feature_snapshot : null,
        prediction_snapshot:
          item?.prediction_snapshot && typeof item.prediction_snapshot === 'object'
            ? item.prediction_snapshot
            : null,
      };
    })
    .filter(Boolean);

  if (normalizedRows.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('rec_serving_item')
    .insert(normalizedRows)
    .select('id, rank_position, candidate_activity_id, candidate_volunteer_id');

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data : [];
}

async function tryPersistRecommendationServingItems(items, contextLabel = 'rec.serving') {
  try {
    return await persistRecommendationServingItems(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${contextLabel}] failed: ${message}`);
    return [];
  }
}

function normalizeRecEventType(eventType) {
  const normalized = String(eventType ?? '').trim().toLowerCase();
  return REC_EVENT_TYPES.has(normalized) ? normalized : null;
}

function buildRecEventPayload(payload = {}) {
  const eventType = normalizeRecEventType(payload.event_type);
  if (!eventType) {
    return null;
  }

  return {
    event_type: eventType,
    serving_item_id: asUuidOrNull(payload.serving_item_id),
    actor_user_id: asUuidOrNull(payload.actor_user_id),
    activity_id: asUuidOrNull(payload.activity_id),
    volunteer_id: asUuidOrNull(payload.volunteer_id),
    participation_id: asUuidOrNull(payload.participation_id),
    source_surface: asNonEmptyText(payload.source_surface, 'web'),
    metadata: payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : null,
  };
}

async function logRecommendationInteraction(payload) {
  const row = buildRecEventPayload(payload);
  if (!row) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('rec_interaction_event')
    .insert(row)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

async function tryLogRecommendationInteraction(payload, contextLabel = 'rec.interaction') {
  try {
    return await logRecommendationInteraction(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${contextLabel}] failed: ${message}`);
    return null;
  }
}

export {
  logRecommendationInteraction,
  tryLogRecommendationInteraction,
  persistRecommendationServingItems,
  tryPersistRecommendationServingItems,
};
