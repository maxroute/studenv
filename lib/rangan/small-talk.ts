// ---------------------------------------------------------------------------
// Small talk: greetings, thanks and "who are you", answered without a search
// ---------------------------------------------------------------------------
//
// Pure. A greeting isn't a question about a topic: searching the library or
// Wikipedia for "hello" finds the encyclopedia article on the word, or a note
// that happens to share a word with the previous question. These messages get
// a short reply straight away, and cost no daily question.

import { mainScript } from "@/lib/rangan/request";

export type SmallTalk = "greeting" | "thanks" | "identity" | "wellbeing" | "goodbye" | "ack";

const clean = (message: string) =>
  message
    .toLowerCase()
    .replace(/[!?.,;:~…'"“”’*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NAME = "(rangan|buddy|bro|friend|there|again|everyone|all)";
const PATTERNS: Array<[SmallTalk, RegExp]> = [
  ["greeting", new RegExp(`^(hi+|hey+|hello+|helo|hiya|yo|sup|what'?s up|namaste|namaskar|salaam|hola|good (morning|afternoon|evening|night|day))( ${NAME})*$`)],
  ["thanks", new RegExp(`^(thanks?|thank you( (so|very) much)?|thx|ty|dhanyavaad|dhonnobad|shukriya)( ${NAME})*$`)],
  ["identity", /^(who are you|what are you|what is your name|what'?s your name|your name|who made you|introduce yourself|tell me about yourself)( rangan)?$/],
  ["wellbeing", new RegExp(`^(how are you( doing)?|how'?s it going|how do you do|kaise ho|kemon acho)( ${NAME})*$`)],
  ["goodbye", new RegExp(`^(bye+|goodbye|good bye|see you|see ya|later|good night|gn|tata|alvida)( ${NAME})*$`)],
  ["ack", /^(ok+|okay|k|cool|nice|great|awesome|got it|alright|fine|hmm+|haan|accha|thik ache)$/],
];

/** The kind of small talk a whole message is, or null when it asks or says something more. */
export function smallTalk(message: string): SmallTalk | null {
  const text = clean(message);
  if (!text || text.length > 60) return null;
  for (const [kind, pattern] of PATTERNS) if (pattern.test(text)) return kind;
  return null;
}

const REPLIES: Record<SmallTalk, string> = {
  greeting: "Hi! I'm Rangan. Ask me anything about your notes, PDFs and videos, or tell me what to make: a page, a mind map, a study plan or a task for your planner.",
  thanks: "You're welcome! Anything else you'd like to learn or make?",
  identity:
    "I'm Rangan, the librarian and learning companion inside Studenv. I answer from your own notes, PDFs and videos (and Wikipedia when they're thin), and I can write pages, draw mind maps, plan your studying and add tasks to your planner.",
  wellbeing: "I'm doing well, thanks for asking! What are you studying today?",
  goodbye: "Bye for now. Good luck with your studies!",
  ack: "Okay! Tell me what you'd like to do next.",
};

/** Rangan's reply to small talk; a "good night" is a goodbye, not a hello. */
export function smallTalkReply(kind: SmallTalk, message: string): string {
  if (kind === "greeting" && /\bgood night\b/.test(clean(message))) return REPLIES.goodbye;
  return REPLIES[kind];
}

const WHAT_ABOUT: Record<"page" | "board", Record<"en" | "bn" | "hi", string>> = {
  page: {
    en: 'Sure! What should the page be about? Tell me the topic, for example "a page on photosynthesis".',
    bn: "নিশ্চয়ই! কোন বিষয়ে নোট বানাব? বিষয়টা বলো, যেমন \"সালোকসংশ্লেষ নিয়ে একটা নোট\"।",
    hi: "ज़रूर! नोट किस विषय पर बनाऊँ? विषय बताओ, जैसे \"प्रकाश संश्लेषण पर एक नोट\"।",
  },
  board: {
    en: 'Sure! What should the mind map be about? Tell me the topic, for example "a mind map of the cell".',
    bn: "নিশ্চয়ই! কোন বিষয়ে মাইন্ড ম্যাপ বানাব? বিষয়টা বলো, যেমন \"কোষের মাইন্ড ম্যাপ\"।",
    hi: "ज़रूर! माइंड मैप किस विषय पर बनाऊँ? विषय बताओ, जैसे \"कोशिका का माइंड मैप\"।",
  },
};

/**
 * "Can you make a note?" with no topic: Rangan asks what it should be about,
 * in the student's script, instead of guessing one from whatever the library has.
 */
export function whatAboutReply(kind: "page" | "board", message: string): string {
  const script = mainScript(message);
  return WHAT_ABOUT[kind][script === "Bengali" ? "bn" : script === "Devanagari" ? "hi" : "en"];
}
