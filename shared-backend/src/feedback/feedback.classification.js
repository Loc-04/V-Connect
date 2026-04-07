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

function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

function classifyFeedbackSemantics(input = {}) {
  const normalizedComment = normalizeText(input?.comment);
  const ratingRaw = Number(input?.rating);
  const rating = Number.isFinite(ratingRaw) ? ratingRaw : null;

  const positiveScoreFromText = countMatches(normalizedComment, positivePatterns);
  const negativeScoreFromText = countMatches(normalizedComment, negativePatterns);
  const incidentScore = countMatches(normalizedComment, incidentPatterns);

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
  if (rating != null) {
    if (rating >= 4) {
      semanticReasons.push('high_rating_signal');
    } else if (rating <= 2) {
      semanticReasons.push('low_rating_signal');
    } else {
      semanticReasons.push('mid_rating_signal');
    }
  }

  return {
    sentimentLabel,
    incidentLabel,
    semanticLabel,
    semanticReasons: Array.from(new Set(semanticReasons)).slice(0, 4),
  };
}

export { classifyFeedbackSemantics };
