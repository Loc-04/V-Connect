const spamKeywordPatterns = [
  /\b(?:buy|sell|promo|promotion|discount|airdrop|coin|crypto|casino|bet|gambling)\b/i,
  /\b(?:free money|make money fast|click here|limited time|act now|dm me|inbox me)\b/i,
  /\b(?:quang cao|khuyen mai|uu dai|lien he|ban hang|dau tu|ca do)\b/i,
];

const forbiddenLanguagePatterns = [
  /\bdit\b/i,
  /\bdu\b/i,
  /\bdeo\b/i,
  /\bdm\b/i,
  /\bdmm\b/i,
  /\bcc\b/i,
  /\bcac\b/i,
  /\blon\b/i,
  /\bkhon nan\b/i,
  /\bngu vcl\b/i,
  /\bfuck(?:ing)?\b/i,
  /\bbitch\b/i,
  /\basshole\b/i,
  /\bmotherfucker\b/i,
];

const urlPattern = /\b(?:https?:\/\/|www\.)\S+/i;

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

function tokenizeText(text) {
  return text.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function detectRepeatedWords(tokens) {
  if (tokens.length < 4) {
    return [];
  }

  const reasons = new Set();
  let longestRun = 1;
  let currentRun = 1;

  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index] === tokens[index - 1]) {
      currentRun += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  if (longestRun >= 3) {
    reasons.add('repeated_word_sequence');
  }

  const tokenCounts = tokens.reduce((map, token) => {
    map.set(token, (map.get(token) ?? 0) + 1);
    return map;
  }, new Map());
  const highestFrequency = Math.max(...tokenCounts.values());
  if (tokens.length >= 8 && highestFrequency >= 4 && highestFrequency / tokens.length >= 0.35) {
    reasons.add('high_word_repetition');
  }

  if (tokens.length >= 8) {
    const phraseCounts = new Map();
    for (let index = 0; index < tokens.length - 1; index += 1) {
      const phrase = `${tokens[index]} ${tokens[index + 1]}`;
      phraseCounts.set(phrase, (phraseCounts.get(phrase) ?? 0) + 1);
    }
    const highestPhraseFrequency = Math.max(...phraseCounts.values());
    if (highestPhraseFrequency >= 3) {
      reasons.add('repeated_phrase_sequence');
    }
  }

  return Array.from(reasons);
}

function classifyFeedbackSpam(comment) {
  const normalizedComment = normalizeText(comment);
  if (!normalizedComment) {
    return {
      label: 'not_spam',
      reasons: [],
      isSpam: false,
    };
  }

  const reasons = new Set();
  if (urlPattern.test(normalizedComment)) {
    reasons.add('contains_link');
  }

  if (spamKeywordPatterns.some((pattern) => pattern.test(normalizedComment))) {
    reasons.add('promotional_language');
  }

  if (forbiddenLanguagePatterns.some((pattern) => pattern.test(normalizedComment))) {
    reasons.add('forbidden_language');
  }

  for (const repetitionReason of detectRepeatedWords(tokenizeText(normalizedComment))) {
    reasons.add(repetitionReason);
  }

  const reasonList = Array.from(reasons);
  return {
    label: reasonList.length > 0 ? 'spam' : 'not_spam',
    reasons: reasonList,
    isSpam: reasonList.length > 0,
  };
}

export { classifyFeedbackSpam };
