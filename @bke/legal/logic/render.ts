import { createHash } from "node:crypto";

export type LegalRenderVariables = Readonly<Record<string, string>>;

export function normalizeLegalVariables(value: unknown): Record<string, string> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z_][a-z0-9_]{0,63}$/.test(key) || typeof entry !== "string" || entry.length > 10_000) {
      return null;
    }
    normalized[key] = entry;
  }
  return normalized;
}

export function applyLegalVariables(markdown: string, variables: LegalRenderVariables): string {
  return markdown.replace(/\{\{([a-z_]+)\}\}/g, (match, name: string) =>
    Object.hasOwn(variables, name) ? variables[name] : match,
  );
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const safeHref = (value: string) => {
  try {
    if (value.startsWith("/")) return value;
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "#";
  } catch {
    return "#";
  }
};

function inline(value: string) {
  return escapeHtml(value)
    .replace(
      /\[([^\]]{1,300})\]\(([^)\s]{1,1000})\)/g,
      (_all, label: string, href: string) =>
        `<a href="${escapeHtml(safeHref(href))}" rel="noopener noreferrer">${label}</a>`,
    )
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

export function renderLegalMarkdown(
  markdown: string,
  variables: LegalRenderVariables = {},
): string {
  const source = applyLegalVariables(markdown.replaceAll("\r\n", "\n"), variables);
  const lines = source.split("\n");
  const output: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      output.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item) {
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${inline(item[1]!)}</li>`);
      continue;
    }
    closeList();
    output.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return output.join("\n");
}

export function legalRenderedContentSha256(
  markdown: string,
  variables: LegalRenderVariables = {},
): string {
  return createHash("sha256").update(renderLegalMarkdown(markdown, variables)).digest("hex");
}
