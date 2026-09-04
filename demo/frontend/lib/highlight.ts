// Tiny, dependency-free TS/JS tokeniser — enough for readable syntax colour in
// the source panes. Not a full parser; deliberately small.
export interface Tok { t: string; v: string; }

const KEYWORDS = new Set([
  "import", "from", "export", "const", "let", "var", "function", "async", "await", "return",
  "if", "else", "for", "while", "try", "catch", "finally", "throw", "new", "class", "extends",
  "interface", "type", "enum", "public", "private", "readonly", "static", "void", "null",
  "undefined", "true", "false", "this", "typeof", "as", "of", "in", "default",
]);

export function tokenize(line: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const push = (t: string, v: string) => v && toks.push({ t, v });
  // full-line comment
  if (/^\s*\/\//.test(line)) return [{ t: "comment", v: line }];
  while (i < line.length) {
    const c = line[i];
    // comment mid-line
    if (c === "/" && line[i + 1] === "/") { push("comment", line.slice(i)); break; }
    // string
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== c) { if (line[j] === "\\") j++; j++; }
      push("str", line.slice(i, j + 1)); i = j + 1; continue;
    }
    // word
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < line.length && /[A-Za-z0-9_$]/.test(line[j])) j++;
      const w = line.slice(i, j);
      push(KEYWORDS.has(w) ? "kw" : /^[A-Z]/.test(w) ? "type" : "id", w); i = j; continue;
    }
    // number
    if (/[0-9]/.test(c)) {
      let j = i; while (j < line.length && /[0-9._]/.test(line[j])) j++;
      push("num", line.slice(i, j)); i = j; continue;
    }
    push("punc", c); i++;
  }
  return toks;
}

export const TOK_COLOR: Record<string, string> = {
  comment: "var(--text-faint)",
  str: "var(--green)",
  kw: "var(--violet)",
  type: "var(--cyan)",
  num: "var(--amber)",
  id: "var(--text)",
  punc: "var(--text-dim)",
};

/** Line severity from the inline ❌ / ✅ markers the demo already uses. */
export function lineMark(line: string): "bad" | "good" | null {
  if (line.includes("❌")) return "bad";
  if (line.includes("✅")) return "good";
  return null;
}
