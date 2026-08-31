import { strict as assert } from "node:assert";
import { test } from "node:test";
import { transcript } from "./prompt.ts";

const user = (text: string) => ({ sender: "user" as const, text });
const agent = (agentName: string, text: string) => ({ sender: "agent" as const, agentName, text });

test("an ordinary alternating conversation is unchanged", () => {
  const messages = [
    agent("Discovery Consultant", "What is your bottleneck?"),
    user("Claims take three weeks."),
    agent("Discovery Consultant", "How many a month?"),
    user("About four thousand."),
  ];

  assert.equal(
    transcript(messages),
    [
      "Discovery Consultant: What is your bottleneck?",
      "User: Claims take three weeks.",
      "Discovery Consultant: How many a month?",
      "User: About four thousand.",
    ].join("\n"),
  );
});

test("a deep dive's six replies cannot push the client out of the window", () => {
  // Six capability replies land back to back - this is what a full deep dive writes, and what
  // the old slice(-6) window returned in its entirety, leaving the model nothing the client said.
  const messages = [
    user("Cut the claims backlog."),
    agent("Industry Analyst", "Three use cases are on the Canvas."),
    ...["Discovery Consultant", "Technical Architect", "Delivery Lead", "Platform Engineer", "Reliability Engineer", "Implementation Engineer"].map(
      (name, i) => agent(name, `capability ${i + 1} delivered`),
    ),
  ];

  const out = transcript(messages);
  assert.match(out, /^User: Cut the claims backlog\./, "the client's own words must survive");
  assert.match(out, /Implementation Engineer: capability 6 delivered$/);
});

test("a five-reply rewind turn keeps the earlier user messages", () => {
  // followUp() seeds one reply and advance() adds one per stage - five agent messages in a
  // single turn. Counting messages would leave only the newest user line.
  const messages = [
    user("What would this cost?"),
    agent("Change Coach", "Roughly 170 USD a month."),
    user("Drop the chatbot use case."),
    agent("Industry Analyst", "Removed."),
    agent("Technical Architect", "Stack rebuilt."),
    agent("Project Manager", "Roadmap rephased."),
    agent("Change Coach", "Training plan updated."),
    agent("Sourcing Lead", "Partners re-shortlisted."),
  ];

  const out = transcript(messages);
  assert.match(out, /User: What would this cost\?/);
  assert.match(out, /User: Drop the chatbot use case\./);
});

test("the max ceiling bounds a run of agent messages with no user turn in it", () => {
  const messages = Array.from({ length: 100 }, (_, i) => agent("Change Coach", `line ${i}`));
  assert.equal(transcript(messages).split("\n").length, 24);
});

test("fewer user messages than the window asks for returns the whole conversation", () => {
  const messages = [agent("Discovery Consultant", "Welcome."), user("Hello.")];
  assert.equal(transcript(messages), "Discovery Consultant: Welcome.\nUser: Hello.");
});
