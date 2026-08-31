/**
 * Prompt loading. Prompts are .md files imported with `?raw`, so they are bundled into the
 * server build rather than read off disk at runtime.
 */

/**
 * What the client has already turned down, for the payload of any agent that could otherwise
 * propose it again.
 *
 * Empty string when nothing was refused, so the block never appears until it means something.
 */
export function declinedBlock(declined?: { title: string; reason?: string }[]): string {
  if (!declined?.length) return "";
  return (
    "\n\nThe client has already turned these down. Do not propose them again, and do not " +
    "design around them:\n" +
    declined.map((d) => `- ${d.title}${d.reason ? ` — because: ${d.reason}` : ""}`).join("\n")
  );
}

/**
 * Substitutes {{VARS}} and refuses to return a template with any placeholder left in it.
 * Without this guard an unfilled `{{CURRENT_MODELS}}` ships to the model as literal braces
 * and the failure is invisible in the output.
 */
export function fillPrompt(template: string, vars: Record<string, string> = {}): string {
  const filled = template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
  const unfilled = filled.match(/\{\{\w+\}\}/g);
  if (unfilled) {
    throw new Error(`Prompt has unfilled placeholders: ${[...new Set(unfilled)].join(", ")}`);
  }
  return filled;
}

/**
 * The recent conversation, for the three agents whose job depends on the client's own prose.
 *
 * Anchored to USER messages, not to a message count. The window used to be `slice(-6)`, which
 * was three exchanges back when a turn was one message each way. It is not any more: `advance()`
 * emits one reply per stage, so a follow-up that rewinds to `architecture` writes five agent
 * messages in a single turn, and a deep dive writes six — one per capability. Counting messages
 * then hands the model six sentences it wrote itself and none of what the client said.
 *
 * So: walk back to the Nth-from-last user message and take everything since. `max` is the
 * ceiling that keeps a burst of agent replies from growing the window without bound.
 */
export function transcript(messages: Message[], turns = 6, max = 24): string {
  let seen = 0;
  let from = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === "user" && ++seen === turns) {
      from = i;
      break;
    }
  }

  return messages
    .slice(Math.max(from, messages.length - max))
    .map((m) => `${m.sender === "user" ? "User" : (m.agentName ?? "Agent")}: ${m.text}`)
    .join("\n");
}

/** Structurally what a ChatMessage is here, so this module stays free of the app's types. */
interface Message {
  sender: "user" | "agent";
  agentName?: string;
  text: string;
}
