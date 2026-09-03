import { describe, expect, it } from "vitest";
import { legalRenderedContentSha256, renderLegalMarkdown } from "../logic/render";

describe("Legal rendering", () => {
  it("preserves the legacy legal markdown rendering contract", () => {
    const rendered = renderLegalMarkdown(
      "# Terms\n\n- **Use** [site](https://example.com)\nCompany {{company_name}}",
      { company_name: "BKE Digital Solutions" },
    );
    expect(rendered).toBe(
      '<h1>Terms</h1>\n<ul>\n<li><strong>Use</strong> <a href="https://example.com/" rel="noopener noreferrer">site</a></li>\n</ul>\n<p>Company BKE Digital Solutions</p>',
    );
    expect(legalRenderedContentSha256("# Terms", {})).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not emit unsafe link schemes", () => {
    expect(renderLegalMarkdown("[bad](javascript:alert(1))", {})).toContain('href="#"');
  });
});
