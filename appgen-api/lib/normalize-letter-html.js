/**
 * LLM composer output sometimes includes literal "\\n" (backslash + n) between tags
 * after JSON.parse — visible in the letter preview and PDF. Strip those and tighten tag gaps.
 */
export function normalizeLetterBodyHtml(html) {
  if (html === undefined || html === null) return html;
  if (typeof html !== "string") return html;
  let s = html.replace(/\\r\\n|\\n|\\r|\\t/g, " ");
  s = s.replace(/>\s+</g, "><");
  return s;
}
