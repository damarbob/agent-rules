// Finds lines that credit a tool, AI model or system for the work.
//
// The patterns are heuristics. They catch the common wordings and cannot judge
// a new one, or whether a name belongs to a person. The written rule in
// rules/attribution-guide.md is the main protection and this is the backstop.

// Names that are unambiguous wherever they appear.
const STRONG = String.raw`anthropic|chatgpt|openai|gpt[-\s]?\d[\w.]*|copilot|codex|windsurf|aider|codeium|tabnine|llm|language\s+model|an?\s+ai(?:\s+(?:assistant|agent|model|tool))?|ai(?:\s+(?:assistant|agent|model|tool))?`

// Names that are also given names or common words. They only count right after
// a credit verb ("Generated with Devin") or beside a role word ("Cursor Agent").
const WEAK = String.raw`claude|devin|gemini|cursor|jules|cline|junie`

const VERB = String.raw`(?:generated|created|written|authored|assisted|made|built|produced|drafted|co-?authored|powered)`
const LINK = String.raw`(?:with|by|using|via|through)(?:\s+(?:the\s+)?(?:help|assistance|aid|support)\s+(?:of|from))?`

const CREDIT_LINE = new RegExp(String.raw`^${VERB}\s+${LINK}\s+\[?\s*(?:${STRONG}|${WEAK})\b`, 'iu')
const STRONG_NAME = new RegExp(String.raw`\b(?:${STRONG})\b`, 'iu')
const ANY_NAME = new RegExp(String.raw`\b(?:${STRONG}|${WEAK})\b`, 'iu')
const NON_HUMAN_NAME = new RegExp(
  String.raw`\b(?:${STRONG})\b|\[bot\]|\bno-?reply@|\b(?:${WEAK})\b[^<\n]*\b(?:code|agent|bot|ai|assistant|cli)\b`,
  'iu',
)

const TRAILER = /^(co-?authored-by|assisted-by|generated-by|created-by|authored-by|written-by|made-by|signed-off-by)\s*:\s*(.*)$/i

// Leading markup and emoji that decorate a footer line, such as "> 🤖 ".
const DECORATION = /^[\s>*_~`-]*(?:\p{Extended_Pictographic}️?[\s>*_~`-]*)*/u

function trailerReason(key, value) {
  const name = key.toLowerCase().replace('coauthored-by', 'co-authored-by')
  switch (name) {
    case 'co-authored-by':
      return NON_HUMAN_NAME.test(value) ? 'co-author line naming a tool or bot' : null
    case 'assisted-by':
    case 'generated-by':
      return `${key} trailer credits a tool`
    case 'signed-off-by':
      return STRONG_NAME.test(value) ? 'sign-off naming a tool' : null
    default:
      return ANY_NAME.test(value) ? `${key} trailer credits a tool` : null
  }
}

function classify(line) {
  const trailer = TRAILER.exec(line)
  if (trailer) return trailerReason(trailer[1], trailer[2])
  if (/^claude-session\s*:/i.test(line) || /claude\.ai\/code\/session/i.test(line)) return 'session link back to a tool'
  if (CREDIT_LINE.test(line)) return 'credit line naming a tool'
  return null
}

/**
 * @param {string} text A commit message or pull request text.
 * @returns {{line: number, text: string, reason: string}[]}
 */
export function findViolations(text) {
  const found = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(DECORATION, '')
    if (line === '') return
    const reason = classify(line)
    if (reason !== null) found.push({ line: index + 1, text: raw.trim(), reason })
  })
  return found
}
