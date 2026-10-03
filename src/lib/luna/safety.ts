export type SafetySeverity = "clean" | "m_spam" | "sexual" | "severe";

export interface SafetyResult {
  allowed: boolean;
  severity: SafetySeverity;
  reason?: string;
  autoBan: boolean;
}

const SEVERE_PATTERNS = [
  /\bincest\b/i,
  /\bstep-?(sister|brother|mom|mother|dad|father|daughter|son)\b/i,
  /\b(mother|mom|sister|daughter|dad|father|brother|son)\s*(and|with)?\s*(sex|fucks?|fucking|suck|dick|pussy|tits|horny|naked)\b/i,
  /\b(pedophil|paedophil|underage|cp|child\s*porn|csam|grooming|non-?consensual|rape|raping)\b/i,
  /\b(preteen|lolita|shota)\b/i,
];

const SEXUAL_PATTERNS = [
  /\b(send|show)\s*(me\s+)?(your\s+|ur\s+)?(nudes?|tits?|boobs?|dick|cock|pussy|vagina)\b/i,
  /\b(show\s*(tits?|boobs?|dick|cock|pussy|vagina))\b/i,
  /\b(send\s*nudes?)\b/i,
  /\b(wanna|want\s*to|let'?s|can\s*we)\s*(cyber|sext|fuck|jerk|cum|cam|trade\s*(nudes?|pics))\b/i,
  /\b(horny|masturbat|jacking\s*off|stroking|jerking\s*off)\b/i,
  /\b(cumming|blowjob|handjob|eating\s*pussy|suck\s*my\s*(dick|cock))\b/i,
  /\b(nudes?\??|sexting\??|cybersex)\b/i,
  /\b(dirty\s*chat|dirty\s*talk|penis|vagina|clitoris)\b/i,
];

const M_SPAM_PATTERNS = [
  /^[\s\W]*m[\s\W]*$/i,
  /^m[\s/\\,.-]*\d{1,2}\b/i,
  /^m\s*(yo|years?\s*old|looking|looking\s*for|here|plz|pls|anyone|someone)\b/i,
  /^m[\s/\\,.-]*(4|for)[\s/\\,.-]*(f|m|any|all)\b/i,
  /^[\s\W]*male[\s\W]*$/i,
  /^male[\s/\\,.-]*\d{1,2}\b/i,
  /^[\s\W]*asl[\s\W\?]*$/i,
  /^[\s\W]*m[\s\W]+or[\s\W]+f[\s\W\?]*$/i,
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/[$]/g, "s")
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMSpam(text: string): boolean {
  const trimmed = text.trim();
  if (M_SPAM_PATTERNS.some((pat) => pat.test(trimmed))) {
    return true;
  }
  const norm = normalizeText(trimmed);
  return M_SPAM_PATTERNS.some((pat) => pat.test(norm));
}

function isSevereViolation(text: string): boolean {
  const norm = normalizeText(text);
  return SEVERE_PATTERNS.some((pat) => pat.test(text) || pat.test(norm));
}

function isSexualViolation(text: string): boolean {
  const norm = normalizeText(text);
  return SEXUAL_PATTERNS.some((pat) => pat.test(text) || pat.test(norm));
}

export function evaluateSafety(text: string, isOpeningMessage = false): SafetyResult {
  if (!text || !text.trim()) {
    return { allowed: true, severity: "clean", autoBan: false };
  }

  if (isSevereViolation(text)) {
    return {
      allowed: false,
      severity: "severe",
      reason: "Zero-tolerance policy: incest, exploitation, or non-consensual harm.",
      autoBan: true,
    };
  }

  if (isSexualViolation(text)) {
    return {
      allowed: false,
      severity: "sexual",
      reason: "Sexual talk, solicitations, or explicit content are strictly prohibited.",
      autoBan: true,
    };
  }

  if (isOpeningMessage && isMSpam(text)) {
    return {
      allowed: true,
      severity: "m_spam",
      reason: "Gender/ASL spam pattern detected.",
      autoBan: false,
    };
  }

  return { allowed: true, severity: "clean", autoBan: false };
}
