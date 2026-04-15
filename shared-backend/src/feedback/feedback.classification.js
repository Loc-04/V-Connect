const positivePatterns = [
  /\b(?:great|excellent|amazing|awesome|helpful|well organized|well-organized|good job|learned a lot)\b/i,
  /\b(?:smooth|friendly|clear guidance|well managed|very satisfied|highly recommend)\b/i,
  /\b(?:tot voi|rat tot|hai long|hieu qua|chuyen nghiep|ho tro tot)\b/i,
];

const negativePatterns = [
  /\b(?:chaotic|poorly managed|badly organized|confusing|unclear|disorganized)\b/i,
  /\b(?:late|delay|slow|frustrating|not helpful|waste of time)\b/i,
  /\b(?:te|kem|that vong|cham tre|khong ro rang|quan ly kem)\b/i,
];

const incidentPatterns = [
  /\b(?:incident|injur(?:y|ed)|hurt|accident|unsafe|dangerous|hazard)\b/i,
  /\b(?:abuse|harass(?:ment)?|violence|fight|conflict|emergency|no quick response)\b/i,
  /\b(?:su co|chan thuong|nguy hiem|mat an toan|bao luc|quay roi|xung dot)\b/i,
];

const logisticsPatterns = [
  /\b(?:late|delay|queue|waiting|check[-\s]?in|capacity|overbooked|schedule|reschedule)\b/i,
  /\b(?:logistic|coordination|transport|equipment|supplies|resource shortage)\b/i,
  /\b(?:cham tre|qua tai|xep hang|thieu vat tu|thieu nhan su)\b/i,
];

const communicationPatterns = [
  /\b(?:unclear|no response|not informed|instruction|guidance|communication|contact)\b/i,
  /\b(?:confusing update|late notice|hard to reach|miscommunication)\b/i,
  /\b(?:khong ro rang|khong duoc thong bao|phan hoi cham|giao tiep kem)\b/i,
];

function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

function toConfidence(signalScore, maxScore = 4) {
  const safeSignal = Number.isFinite(signalScore) ? Math.max(0, signalScore) : 0;
  return Number(Math.min(1, safeSignal / Math.max(maxScore, 1)).toFixed(2));
}

function classifyFeedbackSemantics(input = {}) {
  const normalizedComment = normalizeText(input?.comment);
  const ratingRaw = Number(input?.rating);
  const rating = Number.isFinite(ratingRaw) ? ratingRaw : null;

  const positiveScoreFromText = countMatches(normalizedComment, positivePatterns);
  const negativeScoreFromText = countMatches(normalizedComment, negativePatterns);
  const incidentScore = countMatches(normalizedComment, incidentPatterns);
  const logisticsScore = countMatches(normalizedComment, logisticsPatterns);
  const communicationScore = countMatches(normalizedComment, communicationPatterns);

  let positiveScore = positiveScoreFromText;
  let negativeScore = negativeScoreFromText;

  if (rating != null) {
    if (rating >= 4) {
      positiveScore += 2;
    } else if (rating <= 2) {
      negativeScore += 2;
    }
  }

  let sentimentLabel = 'neutral';
  if (positiveScore > negativeScore) {
    sentimentLabel = 'positive';
  } else if (negativeScore > positiveScore) {
    sentimentLabel = 'negative';
  }

  const incidentLabel = incidentScore > 0 ? 'incident' : 'none';
  const semanticLabel = incidentLabel === 'incident' ? 'incident' : sentimentLabel;

  const semanticReasons = [];
  if (incidentLabel === 'incident') {
    semanticReasons.push('incident_keyword_detected');
  }
  if (positiveScoreFromText > 0) {
    semanticReasons.push('positive_language_detected');
  }
  if (negativeScoreFromText > 0) {
    semanticReasons.push('negative_language_detected');
  }
  if (logisticsScore > 0) {
    semanticReasons.push('logistics_issue_detected');
  }
  if (communicationScore > 0) {
    semanticReasons.push('communication_issue_detected');
  }
  if (rating != null) {
    if (rating >= 4) {
      semanticReasons.push('high_rating_signal');
    } else if (rating <= 2) {
      semanticReasons.push('low_rating_signal');
    } else {
      semanticReasons.push('mid_rating_signal');
    }
  }

  const issueTags = [];
  if (incidentScore > 0) {
    issueTags.push('incident', 'safety');
  }
  if (logisticsScore > 0) {
    issueTags.push('logistics');
  }
  if (communicationScore > 0) {
    issueTags.push('communication');
  }
  if (sentimentLabel === 'positive') {
    issueTags.push('positive');
  } else if (sentimentLabel === 'negative') {
    issueTags.push('negative');
  } else {
    issueTags.push('neutral');
  }

  const semanticLabels = Array.from(
    new Set(
      [semanticLabel, sentimentLabel, incidentLabel === 'incident' ? 'incident' : null, ...issueTags].filter(Boolean)
    )
  );
  const moderationLabels = Array.from(
    new Set(
      [
        incidentScore > 0 ? 'safety' : null,
        logisticsScore > 0 ? 'logistics' : null,
        communicationScore > 0 ? 'communication' : null,
      ].filter(Boolean)
    )
  );

  const sentimentConfidence = toConfidence(Math.abs(positiveScore - negativeScore) + (rating == null ? 0 : 1), 5);
  const incidentConfidence = toConfidence(incidentScore, 2);
  const semanticConfidence = Number(Math.max(sentimentConfidence, incidentConfidence).toFixed(2));

  return {
    sentimentLabel,
    incidentLabel,
    semanticLabel,
    semanticLabels,
    moderationLabels,
    issueTags: Array.from(new Set(issueTags)).slice(0, 6),
    semanticReasons: Array.from(new Set(semanticReasons)).slice(0, 6),
    confidence: {
      sentiment: sentimentConfidence,
      incident: incidentConfidence,
      semantic: semanticConfidence,
    },
  };
}

export { classifyFeedbackSemantics };
