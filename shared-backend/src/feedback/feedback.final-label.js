import { classifyFeedbackSpam } from './feedback.spam.js';

const FINAL_FEEDBACK_LABELS = Object.freeze({
  NEUTRAL: 'Neutral',
  POSITIVE: 'Positive',
  NEGATIVE: 'Negative',
  INCIDENT: 'Incident',
  SPAM: 'Spam',
});

const spamTokens = ['spam', 'abusive', 'irrelevant', 'duplicate', 'meaningless', 'toxic'];
const positiveTokens = ['positive', 'pos', 'good', 'satisfied', 'compliment'];
const negativeTokens = ['negative', 'neg', 'bad', 'complaint', 'issue', 'dissatisfied', 'problem', 'incident'];
const neutralTokens = ['neutral', 'neu', 'mixed', 'normal', 'unclear', 'unknown', 'empty', 'low_signal', 'uninformative'];

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function hasToken(value, tokens) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }
  return tokens.some((token) => {
    if (token === 'spam' && (text === 'not_spam' || text === 'not spam' || text === 'ham')) {
      return false;
    }
    if (text === token) {
      return true;
    }
    const regex = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`);
    return regex.test(text);
  });
}

function normalizeConfidence(rawValue) {
  const value = Number(rawValue ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function collectStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => normalizeText(value)).filter((value) => value.length > 0);
}

function pickFinalFeedbackLabel(input = {}) {
  const contentSpamClassification = classifyFeedbackSpam(input.comment ?? '');
  const contentLooksSpam = contentSpamClassification?.isSpam === true;
  const aiLabel = normalizeText(input.aiLabel ?? input.label);
  const feedbackBucket = normalizeText(input.feedbackBucket);
  const sentimentLabel = normalizeText(input.sentimentLabel);
  const semanticLabel = normalizeText(input.semanticLabel);
  const textQualityLabel = normalizeText(input.textQualityLabel);
  const incidentLabel = normalizeText(input.incidentLabel);

  const moderationLabels = collectStrings(input.moderationLabels);
  const semanticLabels = collectStrings(input.semanticLabels);
  const issueTags = collectStrings(input.issueTags);
  const reasons = collectStrings(input.reasons);
  const semanticReasons = collectStrings(input.semanticReasons);

  const mergedSignals = [
    aiLabel,
    feedbackBucket,
    sentimentLabel,
    semanticLabel,
    textQualityLabel,
    ...moderationLabels,
    ...semanticLabels,
    ...issueTags,
    ...reasons,
    ...semanticReasons,
  ].filter(Boolean);

  const isSpam =
    contentLooksSpam ||
    input.isSpam === true ||
    aiLabel === 'spam' ||
    feedbackBucket === 'spam' ||
    mergedSignals.some((value) => hasToken(value, spamTokens));

  if (isSpam) {
    return FINAL_FEEDBACK_LABELS.SPAM;
  }

  const hasIncidentSignal =
    incidentLabel === 'incident' ||
    semanticLabel === 'incident' ||
    mergedSignals.some((value) => hasToken(value, ['incident', 'safety', 'unsafe', 'injury', 'hazard', 'violence']));
  if (hasIncidentSignal) {
    return FINAL_FEEDBACK_LABELS.INCIDENT;
  }

  if (mergedSignals.some((value) => hasToken(value, neutralTokens))) {
    const hasPositiveSignal =
      sentimentLabel === 'positive' || semanticLabel === 'positive' || mergedSignals.some((value) => hasToken(value, positiveTokens));
    const hasNegativeSignal =
      sentimentLabel === 'negative' || semanticLabel === 'negative' || mergedSignals.some((value) => hasToken(value, negativeTokens));

    if (!hasPositiveSignal && !hasNegativeSignal) {
      return FINAL_FEEDBACK_LABELS.NEUTRAL;
    }
  }

  const positiveScore = Math.max(
    normalizeConfidence(input.sentimentConfidence),
    normalizeConfidence(input.semanticConfidence)
  ) + (sentimentLabel === 'positive' || semanticLabel === 'positive' ? 0.25 : 0);

  const negativeScore = Math.max(
    normalizeConfidence(input.sentimentConfidence),
    normalizeConfidence(input.semanticConfidence)
  ) + (sentimentLabel === 'negative' || semanticLabel === 'negative' ? 0.25 : 0);

  const hasPositiveSignal =
    sentimentLabel === 'positive' || semanticLabel === 'positive' || mergedSignals.some((value) => hasToken(value, positiveTokens));
  const hasNegativeSignal =
    sentimentLabel === 'negative' || semanticLabel === 'negative' || mergedSignals.some((value) => hasToken(value, negativeTokens));

  if (hasPositiveSignal && hasNegativeSignal) {
    if (positiveScore > negativeScore) {
      return FINAL_FEEDBACK_LABELS.POSITIVE;
    }
    if (negativeScore > positiveScore) {
      return FINAL_FEEDBACK_LABELS.NEGATIVE;
    }
    return FINAL_FEEDBACK_LABELS.NEUTRAL;
  }

  if (hasPositiveSignal) {
    return FINAL_FEEDBACK_LABELS.POSITIVE;
  }

  if (hasNegativeSignal) {
    return FINAL_FEEDBACK_LABELS.NEGATIVE;
  }

  return FINAL_FEEDBACK_LABELS.NEUTRAL;
}

function normalizeFeedbackLabel(input) {
  const normalized = normalizeText(input);
  if (normalized === 'pos' || normalized === 'positive') {
    return FINAL_FEEDBACK_LABELS.POSITIVE;
  }
  if (normalized === 'neg' || normalized === 'negative') {
    return FINAL_FEEDBACK_LABELS.NEGATIVE;
  }
  if (normalized === 'incident') {
    return FINAL_FEEDBACK_LABELS.INCIDENT;
  }
  if (normalized === 'spam') {
    return FINAL_FEEDBACK_LABELS.SPAM;
  }
  return FINAL_FEEDBACK_LABELS.NEUTRAL;
}

export { FINAL_FEEDBACK_LABELS, normalizeFeedbackLabel, pickFinalFeedbackLabel };
