import * as cheerio from "cheerio";

export type ProblemContentPlatform = "CODEFORCES" | "ATCODER";

export interface ProblemSample {
  input: string;
  output: string;
}

/** Parsed, platform-neutral public content for a programming problem */
export interface ProblemContent {
  platform: ProblemContentPlatform;
  contestId: string;
  problemId: string;
  title: string;
  statementHtml: string;
  inputSpecificationHtml: string;
  outputSpecificationHtml: string;
  constraintsHtml?: string;
  notesHtml?: string;
  samples: ProblemSample[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  sourceUrl: string;
}

/** Fetch the HTML document for a public problem URL */
export type ProblemContentFetcher = (url: string) => Promise<string>;

export class ProblemContentAccessError extends Error {
  constructor(public readonly platform: ProblemContentPlatform) {
    super(
      `${platform} blocked the problem page request with a browser verification challenge`,
    );
    this.name = "ProblemContentAccessError";
  }
}

export function assertProblemPageAccessible(
  html: string,
  platform: ProblemContentPlatform,
): void {
  // Keep these signatures aligned with the challenge pages returned by
  // Cloudflare and the supported platforms when their markup changes.
  if (
    /<title>\s*(just a moment|attention required)/i.test(html) ||
    /cf-chl-|challenge-platform|verify you are human/i.test(html)
  )
    throw new ProblemContentAccessError(platform);
}

/** Remove active content while preserving the markup needed for formulas and prose */
export function sanitizeProblemHtml(html: string, baseUrl: string): string {
  const $ = cheerio.load(html, null, false);
  $(
    "script, style, iframe, object, embed, form, input, button, textarea, select, meta, link",
  ).remove();
  $("*").each((_, element) => {
    for (const attribute of Object.keys($(element).attr() ?? {})) {
      const lower = attribute.toLowerCase();
      if (lower.startsWith("on") || lower === "style" || lower === "srcdoc") {
        $(element).removeAttr(attribute);
      }
    }
    for (const attribute of ["src", "href"]) {
      const value = $(element).attr(attribute);
      if (!value || value.startsWith("#")) continue;
      if (
        attribute === "src" &&
        /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
      )
        continue;
      try {
        const resolved = new URL(value, baseUrl);
        if (!["http:", "https:"].includes(resolved.protocol))
          $(element).removeAttr(attribute);
        else $(element).attr(attribute, resolved.toString());
      } catch {
        $(element).removeAttr(attribute);
      }
    }
  });
  return $.html()?.trim() ?? "";
}
