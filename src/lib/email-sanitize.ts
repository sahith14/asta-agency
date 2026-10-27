/**
 * AgencyOS — Email HTML sanitisation (Task 2-c).
 *
 * Inbound email bodies are UNTRUSTED input (spec: bodies stored raw, sanitised
 * for display, never executed). This module produces the server-sanitised HTML
 * subset used by GET /api/emails/[id] and a plain-text fallback.
 *
 * Strict allowlist policy:
 * - only innocuous formatting tags survive; <script>/<style>/<iframe> are
 *   discarded ENTIRELY (tag + content) while every other disallowed tag is
 *   demoted to escaped text, never silently removed with its prose;
 * - attributes reduced to a[href] and img[src,alt]; schemes limited to
 *   http/https/mailto (deliberately NOT data: — data: URIs are an XSS vector);
 * - links get target=_blank rel="noopener noreferrer nofollow".
 */
import "server-only";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "div",
  "span",
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "hr",
  "pre",
  "code",
  "img",
] as const;

/** Tags removed together with their whole subtree (content is never shown). */
const DISCARD_WITH_CONTENT = ["script", "style", "iframe"];

const STRICT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    a: ["href"],
    img: ["src", "alt"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  // a: open safely in a new tab without granting it window.opener power or SEO credit.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    }),
  },
  // Non-allowlisted harmless tags drop their markup but keep inner text.
  // NOTE: do NOT combine this with disallowedTagsMode "recursiveEscape" —
  // that mode re-parses escaped output and, together with exclusiveFilter,
  // wipes the entire payload (verified against sanitize-html 2.x).
  // script/style/iframe are a hard discard: their "text" is markup, not prose.
  exclusiveFilter: (frame) => DISCARD_WITH_CONTENT.includes(frame.tag),
};

/** Sanitises stored raw email HTML into a safe renderable subset. */
export function sanitiseEmailHtml(html: string | null): string | null {
  if (!html) return null;
  return sanitizeHtml(html, STRICT_OPTIONS);
}

/** Minimal entity decoder for plain-text output (&amp; handled last on purpose). */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Fallback plain-text extraction from stored HTML (used by GET /api/emails/[id]
 * when bodyText is null but bodyHtml exists; computed on the fly, never persisted).
 */
export function emailToPlainText(html: string): string {
  // Preserve rough line structure before stripping tags.
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>/gi, "\n");
  const text = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
  return decodeEntities(text.replace(/\n{3,}/g, "\n\n").trim());
}
