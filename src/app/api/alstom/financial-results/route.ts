/**
 * /api/alstom/financial-results
 * ─────────────────────────────────────────────────────────────────────────
 * Fetches https://www.alstom.com/finance/financial-results, scans the HTML
 * for PDF links published in Alstom's standard /sites/alstom.com/files/
 * structure, and returns metadata about the most recent FY 2025/26 release.
 *
 * Designed to detect the audited FY 2025/26 Annual Results document
 * (expected mid-May 2026) the moment Alstom publishes it, so the STI
 * module (src/lib/engine/ai-scenarios.ts) can flip from "preliminary"
 * to "audited" without code changes.
 *
 * Output shape:
 *   {
 *     found: boolean
 *     fiscalYear: "FY 2025/26" | "FY 2026/27" | string
 *     documentLabel: string        // best-effort human label
 *     documentDate: string         // YYYY-MM-DD inferred from URL path
 *     documentUrl: string          // absolute PDF URL on alstom.com
 *     pageUrl: string              // listing page
 *     classification:              // best-guess doc type
 *       "annual-results-audited" | "preliminary" | "h1" | "q3" | "q1" | "other"
 *     isPostPreliminary: boolean   // dated AFTER 2026-04-16
 *     fetchedAt: string            // ISO timestamp
 *     source: "alstom.com" | "fallback"
 *   }
 *
 * Failure modes are absorbed: if the fetch fails or the HTML doesn't yield
 * any parsable PDF link, we return a deterministic fallback pointing at the
 * preliminary FY 2025/26 release so the UI never crashes.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // edge cache 1h

const LISTING_URL = "https://www.alstom.com/finance/financial-results";

// Known preliminary release (16-Apr-2026) — used as the fallback baseline.
// Anything strictly newer than this is treated as "post-preliminary",
// which is the trigger for treating the doc as the audited release.
const PRELIMINARY_DATE_ISO = "2026-04-16";
const PRELIMINARY_URL =
  "https://www.alstom.com/press-releases-news/2026/4/alstoms-preliminary-fy-202526-results";

type Classification =
  | "annual-results-audited"
  | "preliminary"
  | "h1"
  | "q3"
  | "q1"
  | "other";

type ReleaseInfo = {
  found: boolean;
  fiscalYear: string;
  documentLabel: string;
  documentDate: string;
  documentUrl: string;
  pageUrl: string;
  classification: Classification;
  isPostPreliminary: boolean;
  fetchedAt: string;
  source: "alstom.com" | "fallback";
};

/**
 * Pull every Alstom-hosted PDF link out of the listing HTML.
 * Alstom's CMS exposes documents as:
 *   /sites/alstom.com/files/YYYY/MM/DD/{slug}.pdf
 * We accept both relative and absolute forms.
 */
function extractPdfCandidates(html: string): Array<{
  url: string;
  dateISO: string;
  filename: string;
}> {
  const out: Array<{ url: string; dateISO: string; filename: string }> = [];
  const seen = new Set<string>();

  // Match: /sites/alstom.com/files/2026/05/14/somefile.pdf
  // (with optional https://www.alstom.com prefix).
  const re =
    /(?:https?:\/\/www\.alstom\.com)?\/sites\/alstom\.com\/files\/(\d{4})\/(\d{2})\/(\d{2})\/([^"'\s<>]+?\.pdf)/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, y, mo, d, file] = m;
    const url = `https://www.alstom.com/sites/alstom.com/files/${y}/${mo}/${d}/${file}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      dateISO: `${y}-${mo}-${d}`,
      filename: file.toLowerCase(),
    });
  }
  return out;
}

/**
 * Classify a PDF by its filename. Alstom's naming is reasonably consistent:
 *   *_Annual_Results*, *_Full_Year*, *_FY*, *_H1_*, *_Q3_*, *_Q1_*, *_Preliminary_*
 */
function classify(filename: string, dateISO: string): Classification {
  const f = filename.toLowerCase();
  if (/(preliminary)/.test(f)) return "preliminary";
  if (
    /(annual[_\- ]results|full[_\- ]year|^|_)(fy|full)/.test(f) ||
    /annual[_\- ]report/.test(f)
  ) {
    // If it's a full-year/annual doc published strictly after the preliminary
    // release date, treat as the audited release. Otherwise classify generic.
    return dateISO > PRELIMINARY_DATE_ISO ? "annual-results-audited" : "other";
  }
  if (/(^|_)h1(_|\b)|half[_\- ]year/.test(f)) return "h1";
  if (/(^|_)q3(_|\b)|third[_\- ]quarter/.test(f)) return "q3";
  if (/(^|_)q1(_|\b)|first[_\- ]quarter/.test(f)) return "q1";
  return "other";
}

/** Human-readable label derived from the filename slug. */
function labelFromFilename(filename: string): string {
  // Strip extension, replace separators with spaces, collapse whitespace.
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/^\d{8}_/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Guess the fiscal year string from filename/date. */
function inferFiscalYear(filename: string, dateISO: string): string {
  if (/202526|2025[_\-]?26/.test(filename)) return "FY 2025/26";
  if (/202627|2026[_\-]?27/.test(filename)) return "FY 2026/27";
  // Alstom's fiscal year ends 31-Mar. Full-year results released Apr-Jun
  // typically describe the FY ending in that calendar year's March.
  const [y, m] = dateISO.split("-").map(Number);
  if (m >= 4 && m <= 9) return `FY ${y - 1}/${(y % 100).toString().padStart(2, "0")}`;
  return `FY ${y}/${((y + 1) % 100).toString().padStart(2, "0")}`;
}

function fallback(): ReleaseInfo {
  return {
    found: false,
    fiscalYear: "FY 2025/26",
    documentLabel: "Preliminary FY 2025/26 results (press release)",
    documentDate: PRELIMINARY_DATE_ISO,
    documentUrl: PRELIMINARY_URL,
    pageUrl: LISTING_URL,
    classification: "preliminary",
    isPostPreliminary: false,
    fetchedAt: new Date().toISOString(),
    source: "fallback",
  };
}

async function fetchListing(): Promise<string | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(LISTING_URL, {
      signal: ctrl.signal,
      headers: {
        // A real-browser UA reduces the chance of an edge bouncer returning
        // a stripped HTML shell.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
          "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en",
      },
      // Cache at the Next edge for 1h to avoid hammering Alstom's site.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pick the "most relevant" candidate. Priority:
 *   1. Audited annual results (full-year) dated after the preliminary date.
 *   2. Otherwise the latest-dated PDF.
 */
function pickBest(
  candidates: Array<{ url: string; dateISO: string; filename: string }>,
): ReleaseInfo | null {
  if (candidates.length === 0) return null;

  const classified = candidates.map((c) => ({
    ...c,
    classification: classify(c.filename, c.dateISO),
  }));

  // Prefer audited annual results post-preliminary.
  const audited = classified
    .filter((c) => c.classification === "annual-results-audited")
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));

  const chosen = audited[0] ?? classified.sort((a, b) => b.dateISO.localeCompare(a.dateISO))[0];

  return {
    found: true,
    fiscalYear: inferFiscalYear(chosen.filename, chosen.dateISO),
    documentLabel: labelFromFilename(chosen.filename),
    documentDate: chosen.dateISO,
    documentUrl: chosen.url,
    pageUrl: LISTING_URL,
    classification: chosen.classification,
    isPostPreliminary: chosen.dateISO > PRELIMINARY_DATE_ISO,
    fetchedAt: new Date().toISOString(),
    source: "alstom.com",
  };
}

export async function GET() {
  const html = await fetchListing();
  if (!html) {
    return NextResponse.json(fallback(), {
      headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" },
    });
  }

  const candidates = extractPdfCandidates(html);
  const best = pickBest(candidates) ?? fallback();

  return NextResponse.json(best, {
    headers: {
      // Cache 1h at the edge; stale-while-revalidate keeps it responsive
      // around the publication window without thundering the origin.
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=21600",
    },
  });
}
