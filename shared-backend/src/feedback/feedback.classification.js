const positivePatterns = [
  /\b(?:great|excellent|amazing|awesome|helpful|well organized|well-organized|good job|learned a lot|good|nice)\b/i,
  /\b(?:smooth|friendly|clear guidance|well managed|very satisfied|highly recommend)\b/i,
  /\b(?:tot|tot voi|rat tot|tot lam|hai long|hieu qua|chuyen nghiep|ho tro tot|hay|dep|tuyet voi)\b/i,
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

const incidentLexicon = [
  'incident',
  'injury',
  'unsafe',
  'dangerous',
  'hazard',
  'emergency',
  'abuse',
  'violence',
  'fight',
  'conflict',
  'su',
  'co',
  'nguy',
  'hiem',
  'bao',
  'luc',
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

function tokenize(text) {
  return String(text ?? '').match(/[a-z0-9]+/g) ?? [];
}

function getLongestRepeatedCharacterRun(text) {
  let longest = 1;
  let current = 1;
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] === text[index - 1]) {
      current += 1;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 1;
    }
  }
  return longest;
}

function evaluateTextQuality(inputComment) {
  const raw = String(inputComment ?? '').trim();
  const normalized = normalizeText(raw);
  const tokens = tokenize(normalized);
  const alnumChars = normalized.replace(/\s+/g, '');
  const alphaChars = (alnumChars.match(/[a-z]/g) ?? []).length;
  const digitChars = (alnumChars.match(/[0-9]/g) ?? []).length;
  const alnumCount = alphaChars + digitChars;
  const alphabeticRatio = alnumCount > 0 ? alphaChars / alnumCount : 0;
  const numericRatio = alnumCount > 0 ? digitChars / alnumCount : 0;
  const mostlyNumeric = alnumCount > 0 && numericRatio >= 0.8;

  const tokenCounts = tokens.reduce((accumulator, token) => {
    accumulator.set(token, (accumulator.get(token) ?? 0) + 1);
    return accumulator;
  }, new Map());
  const maxTokenFrequency = tokenCounts.size > 0 ? Math.max(...tokenCounts.values()) : 0;
  const repetitiveTokens =
    tokens.length >= 4 && (maxTokenFrequency >= 4 || maxTokenFrequency / Math.max(tokens.length, 1) >= 0.7);

  const longestRepeatedCharRun = getLongestRepeatedCharacterRun(alnumChars);
  const repetitiveCharacters = alnumChars.length >= 6 && longestRepeatedCharRun >= 6;
  const lowAlphabeticRatio = alnumCount >= 6 && alphabeticRatio < 0.35;

  const meaningfulWordCount = tokens.filter((token) => /[a-z]/.test(token) && token.length >= 3).length;
  const hasIncidentKeyword = tokens.some((token) => incidentLexicon.includes(token));
  const safeShortFeedbackTokens = new Set([
    'tot', 'hay', 'vui', 'dep', 'on', 'ok', 'okay', 'good', 'nice', 'bad',
    'te', 'kem', 'tuyet', 'nhat', 'duoc', 'tam', 'suon', 'okey',
  ]);
  const hasSafeShortToken = tokens.some((token) => safeShortFeedbackTokens.has(token));
  const tooFewMeaningfulWords = meaningfulWordCount < 2 && !hasIncidentKeyword && !hasSafeShortToken;

  const reasons = [];
  if (mostlyNumeric) {
    reasons.push('mostly_numeric_text');
  }
  if (repetitiveCharacters) {
    reasons.push('repeated_character_pattern');
  }
  if (repetitiveTokens) {
    reasons.push('repetitive_token_pattern');
  }
  if (lowAlphabeticRatio) {
    reasons.push('low_alphabetic_ratio');
  }
  if (tooFewMeaningfulWords) {
    reasons.push('too_few_meaningful_words');
  }
  if (normalized.length < 3) {
    reasons.push('extremely_short_text');
  }

  const strongSignalReasons = reasons.filter((reason) =>
    [
      'mostly_numeric_text',
      'repeated_character_pattern',
      'repetitive_token_pattern',
      'low_alphabetic_ratio',
    ].includes(reason)
  );
  const isLowSignal = strongSignalReasons.length > 0 || (reasons.includes('too_few_meaningful_words') && tokens.length <= 2);

  return {
    isLowSignal,
    label: isLowSignal ? (mostlyNumeric || lowAlphabeticRatio ? 'uninformative' : 'low_signal') : 'informative',
    reasons: Array.from(new Set(reasons)).slice(0, 6),
    metrics: {
      tokenCount: tokens.length,
      meaningfulWordCount,
      alphabeticRatio: Number(alphabeticRatio.toFixed(2)),
      numericRatio: Number(numericRatio.toFixed(2)),
      longestRepeatedCharRun,
      maxTokenFrequency,
    },
  };
}

function toConfidence(signalScore, maxScore = 4) {
  const safeSignal = Number.isFinite(signalScore) ? Math.max(0, signalScore) : 0;
  return Number(Math.min(1, safeSignal / Math.max(maxScore, 1)).toFixed(2));
}

function classifyFeedbackSemantics(input = {}) {
  const normalizedComment = normalizeText(input?.comment);
  const textQuality = evaluateTextQuality(input?.comment ?? '');
  const ratingRaw = Number(input?.rating);
  const rating = Number.isFinite(ratingRaw) ? ratingRaw : null;
  const isSpam = Boolean(input?.isSpam);

  const positiveScoreFromText = countMatches(normalizedComment, positivePatterns);
  const negativeScoreFromText = countMatches(normalizedComment, negativePatterns);
  const incidentScore = countMatches(normalizedComment, incidentPatterns);
  const logisticsScore = countMatches(normalizedComment, logisticsPatterns);
  const communicationScore = countMatches(normalizedComment, communicationPatterns);

  let positiveScore = positiveScoreFromText;
  let negativeScore = negativeScoreFromText;

  if (!textQuality.isLowSignal && rating != null) {
    if (rating >= 4) {
      positiveScore += 1;
    } else if (rating <= 2) {
      negativeScore += 1;
    }
  }

  let sentimentLabel = 'neutral';
  if (!textQuality.isLowSignal && positiveScore > negativeScore) {
    sentimentLabel = 'positive';
  } else if (!textQuality.isLowSignal && negativeScore > positiveScore) {
    sentimentLabel = 'negative';
  }

  const incidentLabel = incidentScore > 0 ? 'incident' : 'none';
  let semanticLabel = incidentLabel === 'incident' ? 'incident' : sentimentLabel;
  if (textQuality.isLowSignal && incidentLabel !== 'incident') {
    semanticLabel = 'low_signal';
  }

  const semanticReasons = [];
  if (textQuality.isLowSignal) {
    semanticReasons.push(...textQuality.reasons);
    semanticReasons.push(textQuality.label);
  }
  if (incidentLabel === 'incident') {
    semanticReasons.push('incident_keyword_detected');
  }
  if (!textQuality.isLowSignal && positiveScoreFromText > 0) {
    semanticReasons.push('positive_language_detected');
  }
  if (!textQuality.isLowSignal && negativeScoreFromText > 0) {
    semanticReasons.push('negative_language_detected');
  }
  if (logisticsScore > 0) {
    semanticReasons.push('logistics_issue_detected');
  }
  if (communicationScore > 0) {
    semanticReasons.push('communication_issue_detected');
  }
  if (!textQuality.isLowSignal && rating != null) {
    if (rating >= 4) {
      semanticReasons.push('high_rating_signal');
    } else if (rating <= 2) {
      semanticReasons.push('low_rating_signal');
    } else {
      semanticReasons.push('mid_rating_signal');
    }
  }

  const issueTags = [];
  if (textQuality.isLowSignal) {
    issueTags.push('low_signal', 'needs_review', textQuality.label);
  }
  if (isSpam) {
    issueTags.push('spam');
  }
  if (incidentScore > 0) {
    issueTags.push('incident', 'safety');
  }
  if (logisticsScore > 0) {
    issueTags.push('logistics');
  }
  if (communicationScore > 0) {
    issueTags.push('communication');
  }

  const semanticLabels = Array.from(new Set([semanticLabel, sentimentLabel].filter(Boolean)));
  const moderationLabels = Array.from(
    new Set(
      [
        textQuality.isLowSignal ? 'needs_review' : null,
        textQuality.isLowSignal ? 'low_signal' : null,
        isSpam ? 'spam' : null,
        incidentScore > 0 ? 'safety' : null,
        logisticsScore > 0 ? 'logistics' : null,
        communicationScore > 0 ? 'communication' : null,
      ].filter(Boolean)
    )
  );

  const sentimentConfidence = textQuality.isLowSignal
    ? 0.15
    : toConfidence(Math.abs(positiveScore - negativeScore) + (rating == null ? 0 : 1), 5);
  const incidentConfidence = toConfidence(incidentScore, 2);
  const semanticConfidence = textQuality.isLowSignal
    ? 0.2
    : Number(Math.max(sentimentConfidence, incidentConfidence).toFixed(2));

  return {
    sentimentLabel,
    incidentLabel,
    semanticLabel,
    semanticLabels,
    moderationLabels,
    issueTags: Array.from(new Set(issueTags)).slice(0, 6),
    semanticReasons: Array.from(new Set(semanticReasons)).slice(0, 6),
    textQuality,
    confidence: {
      sentiment: sentimentConfidence,
      incident: incidentConfidence,
      semantic: semanticConfidence,
    },
  };
}

export { classifyFeedbackSemantics };
