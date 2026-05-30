const CONTROL_TOKEN_PATTERNS = [
  /<\|[^|\n]{1,80}\|>/gi,
  /\[\/?INST\]/gi,
  /<<\/?SYS>>/gi,
  /<\/?(?:system|assistant|user|developer)>/gi,
  /```(?:json|system|assistant|user|developer)?/gi,
];

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
  /override\s+(?:the\s+)?(?:system|developer|safety)\s+(?:prompt|instructions?|rules?)/i,
  /(?:reveal|print|show|output|exfiltrate)\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|instructions?|message)/i,
  /role\s*[- ]?play\s+as\s+(?:system|developer|assistant)/i,
  /act\s+as\s+(?:system|developer|assistant)/i,
  /이전\s*(?:의\s*)?(?:지시|명령|프롬프트)\s*(?:를|을)?\s*무시/i,
  /앞(?:선|의)?\s*(?:지시|명령|프롬프트)\s*(?:를|을)?\s*무시/i,
  /(?:시스템|system)\s*(?:프롬프트|prompt)\s*(?:를|을)?\s*(?:출력|공개|노출|보여)/i,
  /(?:개발자|developer)\s*(?:지시|명령|메시지|프롬프트)\s*(?:를|을)?\s*(?:출력|공개|노출|보여)/i,
  /(?:시스템|system)\s*(?:역할|role)\s*(?:로|처럼)\s*(?:행동|대답)/i,
];

export const sanitizeProfileText = (raw: unknown): string => {
  if (raw === null || raw === undefined) {
    return "";
  }

  let text = String(raw).normalize("NFC");

  for (const pattern of CONTROL_TOKEN_PATTERNS) {
    text = text.replace(pattern, "");
  }

  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");

  const sanitizedLines = text
    .split(/\r?\n/)
    .map((line) => sanitizeLine(line))
    .filter((line) => line.length > 0);

  return sanitizedLines.join("\n").replace(/[ \t]{2,}/g, " ").trim();
};

const sanitizeLine = (line: string): string => {
  if (isInjection(line)) {
    return "";
  }

  const parts = line.split(/([.!?。！？]\s*)/);
  const kept: string[] = [];

  for (let index = 0; index < parts.length; index += 2) {
    const sentence = `${parts[index] ?? ""}${parts[index + 1] ?? ""}`.trim();

    if (sentence && !isInjection(sentence)) {
      kept.push(sentence);
    }
  }

  return kept.join(" ").trim();
};

const isInjection = (text: string): boolean => INJECTION_PATTERNS.some((pattern) => pattern.test(text));
