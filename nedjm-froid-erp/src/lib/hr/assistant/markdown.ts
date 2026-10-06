export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "p"; lines: Inline[][] }
  | { kind: "ul" | "ol"; items: Inline[][] }
  | { kind: "h"; inline: Inline[] };

/** Only in-app paths: an answer can never send the user to another site. */
export function safeHref(href: string): string | null {
  return /^\/(?!\/)[^\s\\]*$/.test(href) ? href : null;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*(\S(?:[^*]*?\S)?)\*/g;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of source.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: "text", text: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "bold", children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ kind: "code", text: m[2] });
    else if (m[5] !== undefined) out.push({ kind: "italic", children: parseInline(m[5]) });
    else {
      const href = safeHref(m[4]);
      out.push(href ? { kind: "link", text: m[3], href } : { kind: "text", text: m[3] });
    }
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ kind: "text", text: source.slice(last) });
  return out;
}

/** Small subset of markdown used by the assistant: paragraphs, headings, bullet and numbered lists. */
export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) blocks.push({ kind: "h", inline: parseInline(heading[1]) });
    else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = parseInline((bullet ?? numbered)![1]);
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last?.kind === "p") last.lines.push(parseInline(line.trim()));
    else blocks.push({ kind: "p", lines: [parseInline(line.trim())] });
  }
  return blocks.filter((b) => b.kind !== "p" || b.lines.length);
}
