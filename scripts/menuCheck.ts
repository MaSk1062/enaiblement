/**
 * "Is this model on the menu the Architect was given?" - the assertion behind the eval case
 * that guards ARCHITECTURE.md §3.4 (an Architect recommending a model that is superseded, or
 * that does not exist at all, to a CTO on stage).
 *
 * It lives in its own file because it is fiddlier than it looks and has produced two false
 * positives already: the model names its choice in at least four shapes, and a naive substring
 * match fails on formatting rather than on disobedience - which is the one thing an eval must
 * never do. menuCheck.test.ts pins all four shapes.
 */

const PROVIDERS = new Set(["google", "anthropic", "openai", "meta", "mistral", "aws", "azure"]);

/** The model name, stripped of provider prefix, access path and any rationale. */
export const modelTokens = (raw: string) =>
  raw
    .split("(")[0] // "(via Vertex AI)", and any rationale trailing it
    .replace(/^\s*[A-Za-z][A-Za-z ]*:\s*/, "") // "Google: ", when it echoes a menu line whole
    .split(/\s[-–-]\s|,/)[0] // " - for complex clinical reasoning"
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t && !PROVIDERS.has(t));

/**
 * True when every surviving token appears on one line of the menu. Token-wise rather than
 * substring, so "Google Gemini 3.5 Flash" matches "- Google: Gemini 3.5 Flash (via Vertex AI)"
 * while "Gemini 1.5 Pro" fails on the version - which is the thing being tested.
 */
export const onMenu = (raw: string, menu: string) => {
  const tokens = modelTokens(raw);
  return (
    tokens.length > 0 &&
    menu
      .toLowerCase()
      .split("\n")
      .some((line) => tokens.every((t) => line.includes(t)))
  );
};
