import { describe, expect, it, vi } from "vitest";
import {
  Codeforces,
  parseCodeforcesProblemContent,
} from "../src/platforms/codeforces";
import { parseAtCoderProblemContent } from "../src/platforms/atcoder";
import {
  ProblemContentAccessError,
  sanitizeProblemHtml,
} from "../src/problemContent";

describe("problem content parsing", () => {
  it("normalizes a Codeforces statement and samples", () => {
    const html = `<div class="problem-statement"><div class="header"><div class="title">A. Example</div><div class="time-limit">time limit per test 2 seconds</div><div class="memory-limit">memory limit per test 256 megabytes</div></div><div><p>Statement</p></div><div class="input-specification"><div class="section-title">Input</div><p>Input spec</p></div><div class="output-specification"><div class="section-title">Output</div><p>Output spec</p></div><div class="sample-tests"><div class="sample-test"><div class="input"><pre>1<br>2<br></pre></div><div class="output"><pre>3<br></pre></div></div></div></div>`;
    const result = parseCodeforcesProblemContent(
      html,
      10,
      "a",
      "https://codeforces.com/contest/10/problem/A",
    );
    expect(result).toMatchObject({
      platform: "CODEFORCES",
      contestId: "10",
      problemId: "A",
      title: "A. Example",
      timeLimitMs: 2000,
      memoryLimitMb: 256,
    });
    expect(result.statementHtml).toContain("Statement");
    expect(result.samples).toEqual([{ input: "1\n2", output: "3" }]);
  });

  it("preserves Codeforces samples rendered as line divs", () => {
    const html = `<div class="problem-statement"><div class="header"><div class="title">A. Example</div></div><div><p>Statement</p></div><div class="input-specification"></div><div class="output-specification"></div><div class="sample-tests"><div class="sample-test"><div class="input"><pre><div class="test-example-line">3</div><div class="test-example-line">1 2 3</div></pre></div><div class="output"><pre><div class="test-example-line">YES</div><div class="test-example-line">NO</div></pre></div></div></div></div>`;
    const result = parseCodeforcesProblemContent(
      html,
      10,
      "A",
      "https://codeforces.com/contest/10/problem/A",
    );
    expect(result.samples).toEqual([{ input: "3\n1 2 3", output: "YES\nNO" }]);
  });

  it("uses a custom fetcher for Codeforces problem pages", async () => {
    const html = `<div class="problem-statement"><div class="header"><div class="title">B. Custom</div></div><div><p>Fetched elsewhere</p></div><div class="input-specification"></div><div class="output-specification"></div><div class="sample-tests"></div></div>`;
    const fetcher = vi.fn().mockResolvedValue(html);

    const result = await new Codeforces().getProblemContent(1234, "b", {
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://codeforces.com/contest/1234/problem/B?locale=en",
    );
    expect(result).toMatchObject({
      contestId: "1234",
      problemId: "B",
      title: "B. Custom",
    });
    expect(result.statementHtml).toContain("Fetched elsewhere");
  });

  it("selects English AtCoder content and pairs samples", () => {
    const html = `<span class="h2">A - Example</span><div>Memory Limit: 512 MB</div><div id="task-statement"><span class="lang-en"><div class="part"><section><h3>Problem Statement</h3><p>English</p><img src="/img/a.png"></section></div><div class="part"><section><h3>Constraints</h3><p>N &gt; 0</p></section></div><div class="part"><section><h3>Input</h3><pre>N</pre></section></div><div class="part"><section><h3>Output</h3><p>Answer</p></section></div><div class="part"><section><h3>Sample Input 1</h3><pre>1\n</pre></section></div><div class="part"><section><h3>Sample Output 1</h3><pre>Yes\n</pre></section></div></span></div>`;
    const result = parseAtCoderProblemContent(
      html,
      "abc001",
      "abc001_a",
      "https://atcoder.jp/contests/abc001/tasks/abc001_a?lang=en",
    );
    expect(result).toMatchObject({
      platform: "ATCODER",
      contestId: "abc001",
      problemId: "abc001_a",
      title: "Example",
      memoryLimitMb: 512,
    });
    expect(result.statementHtml).toContain("https://atcoder.jp/img/a.png");
    expect(result.constraintsHtml).toContain("N &gt; 0");
    expect(result.samples).toEqual([{ input: "1", output: "Yes" }]);
  });

  it("reports browser verification pages explicitly", () => {
    expect(() =>
      parseCodeforcesProblemContent(
        "<html><title>Just a moment...</title><div id='cf-chl-widget'></div></html>",
        10,
        "A",
        "https://codeforces.com/contest/10/problem/A",
      ),
    ).toThrow(ProblemContentAccessError);
  });

  it("removes active content and unsafe URLs from returned HTML", () => {
    const html = `<p onclick="alert(1)" style="color:red">Safe</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><img src="/image.png">`;
    const result = sanitizeProblemHtml(html, "https://example.com/tasks/a");
    expect(result).toContain("<p>Safe</p>");
    expect(result).toContain('src="https://example.com/image.png"');
    expect(result).not.toContain("script");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("javascript:");
  });

  it("keeps safe raster data images but strips SVG data URLs", () => {
    const html = `<img src="data:image/png;base64,iVBORw0KGgo="><img src="data:image/svg+xml;base64,PHN2Zz4=">`;
    const result = sanitizeProblemHtml(html, "https://example.com/tasks/a");
    expect(result).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(result).not.toContain("image/svg+xml");
  });
});
