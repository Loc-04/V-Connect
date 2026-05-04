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
const shortLinkPattern = /\b(?:bit\.ly|t\.me|discord\.gg|tinyurl\.com)\b/i;
const numericPunctuationOnlyPattern = /^[\d\s\W_]+$/;
const repeatedSingleCharPattern = /^(.)(\1{4,})$/;
const repeatedDigitGroupPattern = /^(\d{1,3})\1{2,}$/;
const keyboardJunkPattern =
  /\b(?:asdf(?:asdf)*|qwer(?:qwer)*|qwe(?:qwe)*|zxcv?(?:zxcv?)*|hjkl(?:hjkl)*|test(?:ing)?(?:\s*[\d/-]+)?|sample|demo|dummy)\b/i;
const safeShortNeutralTokens = new Set([
  'ok', 'okay', 'tot', 'hay', 'vui', 'dep', 'on', 'te', 'kem',
  'good', 'nice', 'bad', 'duoc', 'tam', 'okey',
]);

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

function stripSpaces(text) {
  return String(text ?? '').replace(/\s+/g, '');
}

function hasMostlyNumericOrSymbolContent(normalizedComment, tokens) {
  if (!normalizedComment) {
    return false;
  }
  if (!numericPunctuationOnlyPattern.test(normalizedComment)) {
    return false;
  }
  const alphaTokenCount = tokens.filter((token) => /[a-z]/i.test(token)).length;
  return alphaTokenCount === 0;
}

function hasRepeatedCharacterJunk(normalizedComment) {
  const compact = stripSpaces(normalizedComment);
  if (!compact) {
    return false;
  }
  return repeatedSingleCharPattern.test(compact);
}

function hasRepeatedDigitGroupJunk(normalizedComment) {
  const compact = stripSpaces(normalizedComment).replace(/[^\d]/g, '');
  if (!compact) {
    return false;
  }
  return repeatedDigitGroupPattern.test(compact);
}

function hasVeryShortMeaninglessContent(normalizedComment, tokens) {
  if (!normalizedComment) {
    return false;
  }
  const compact = stripSpaces(normalizedComment);
  if (compact.length <= 2) {
    if (safeShortNeutralTokens.has(compact.toLowerCase())) {
      return false;
    }
    return true;
  }

  if (tokens.length === 1) {
    const token = String(tokens[0] ?? '').toLowerCase();
    if (safeShortNeutralTokens.has(token)) {
      return false;
    }
    if (token.length <= 2) {
      return true;
    }
  }

  return false;
}

function hasTestOrDummyContent(normalizedComment, tokens) {
  if (!normalizedComment) {
    return false;
  }
  if (!keyboardJunkPattern.test(normalizedComment)) {
    return false;
  }
  const alphaTokens = tokens.filter((token) => /[a-z]/i.test(token));
  const meaningfulTokens = alphaTokens.filter(
    (token) => token.length >= 3 && !['test', 'testing', 'sample', 'demo', 'dummy'].includes(token.toLowerCase())
  );
  return meaningfulTokens.length === 0;
}

function hasRandomKeyboardNoise(normalizedComment) {
  if (!normalizedComment) {
    return false;
  }
  const compact = stripSpaces(normalizedComment);
  if (compact.length < 6) {
    return false;
  }
  return /(asdf|qwer|qweqwe|zxcv|zxczxc|hjkl)/i.test(compact);
}

function hasLinkOnlyOrSuspiciousLink(normalizedComment, tokens) {
  if (!normalizedComment) {
    return false;
  }
  const hasLink = urlPattern.test(normalizedComment) || shortLinkPattern.test(normalizedComment);
  if (!hasLink) {
    return false;
  }

  const nonLinkTokens = tokens.filter(
    (token) =>
      !/(https?|www|bit|ly|t|me|discord|gg|tinyurl|com|net|org)/i.test(String(token ?? '').toLowerCase())
  );
  return nonLinkTokens.length === 0 || shortLinkPattern.test(normalizedComment);
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
  const tokens = tokenizeText(normalizedComment);

  if (hasMostlyNumericOrSymbolContent(normalizedComment, tokens)) {
    reasons.add('numeric_or_symbol_only_content');
  }
  if (hasRepeatedCharacterJunk(normalizedComment)) {
    reasons.add('repeated_character_noise');
  }
  if (hasRepeatedDigitGroupJunk(normalizedComment)) {
    reasons.add('repeated_digit_group_noise');
  }
  if (hasVeryShortMeaninglessContent(normalizedComment, tokens)) {
    reasons.add('too_short_or_meaningless');
  }
  if (hasLinkOnlyOrSuspiciousLink(normalizedComment, tokens)) {
    reasons.add('suspicious_or_link_only_content');
  }
  if (hasTestOrDummyContent(normalizedComment, tokens)) {
    reasons.add('test_or_dummy_content');
  }
  if (hasRandomKeyboardNoise(normalizedComment)) {
    reasons.add('random_keyboard_noise');
  }

  if (urlPattern.test(normalizedComment)) {
    reasons.add('contains_link');
  }

  if (spamKeywordPatterns.some((pattern) => pattern.test(normalizedComment))) {
    reasons.add('promotional_language');
  }

  if (forbiddenLanguagePatterns.some((pattern) => pattern.test(normalizedComment))) {
    reasons.add('forbidden_language');
  }

  for (const repetitionReason of detectRepeatedWords(tokens)) {
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
