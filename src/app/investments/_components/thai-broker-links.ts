/**
 * "Where to buy" links for Thai RMF funds.
 *
 * RMF funds are distributed by their asset-management company (AMC) and by
 * fund-supermarket brokers. We map a fund's manager name to its AMC's official
 * site when we recognise it, and always offer a generic search fallback so an
 * unknown manager still gets a useful link (never a dead end).
 */

// Manager-name substring → official AMC site. Matching is done on a lowercased
// "includes" basis so "SCB Asset Management", "SCBAM", etc. all resolve.
const AMC_SITES: { match: string[]; name: string; url: string }[] = [
  { match: ["scb"], name: "SCB Asset Management", url: "https://www.scbam.com/en/fund/rmf" },
  { match: ["krungsri"], name: "Krungsri Asset Management", url: "https://www.krungsriasset.com/EN/Home.aspx" },
  { match: ["tisco"], name: "TISCO Asset Management", url: "https://www.tiscoasset.com/" },
  { match: ["kasikorn", "kasset", "k-"], name: "Kasikorn Asset Management", url: "https://www.kasikornasset.com/en/Pages/default.aspx" },
  { match: ["daol"], name: "DAOL Investment", url: "https://www.daolinvestment.co.th/" },
  { match: ["mega"], name: "Mega Asset Management", url: "https://www.mega-am.com/" },
  { match: ["bualuang", "bblam"], name: "BBL Asset Management", url: "https://www.bblam.co.th/" },
  { match: ["uob"], name: "UOB Asset Management", url: "https://www.uobam.co.th/en" },
  { match: ["ktam", "krung thai"], name: "Krung Thai Asset Management", url: "https://www.ktam.co.th/en/home.aspx" },
  { match: ["one asset", "one-am", "one "], name: "ONE Asset Management", url: "https://www.one-asset.com/" },
  { match: ["principal"], name: "Principal Asset Management", url: "https://www.principal.th/en" },
  { match: ["eastspring"], name: "Eastspring Investments", url: "https://www.eastspring.co.th/en" },
  { match: ["aberdeen", "abrdn"], name: "abrdn (Thailand)", url: "https://www.abrdn.com/th-th/thailand" },
];

export type BrokerLink = { label: string; url: string };

/** Best "where to buy" link for a fund, given its manager (and code for search). */
export function brokerLinkForFund(code: string, manager?: string): BrokerLink {
  const m = (manager ?? "").toLowerCase();
  if (m) {
    const hit = AMC_SITES.find(a => a.match.some(k => m.includes(k)));
    if (hit) return { label: `Buy via ${hit.name}`, url: hit.url };
  }
  // Fallback: a scoped search that surfaces the fund page and its distributors.
  const q = encodeURIComponent(`${code} RMF ${manager ?? ""} ซื้อกองทุน`.trim());
  return { label: "Find where to buy", url: `https://www.google.com/search?q=${q}` };
}

/**
 * General "find a broker in Thailand" links — fund supermarkets / distributors
 * that carry RMFs across most AMCs (SCB, Krungsri, etc.). Shown once near the
 * radar so the user can compare platforms, not tied to a single fund.
 */
export const BROKER_DIRECTORY: BrokerLink[] = [
  { label: "Finnomena (multi-AMC fund platform)", url: "https://www.finnomena.com/fund/" },
  { label: "WealthMagik fund comparison", url: "https://www.wealthmagik.com/" },
  { label: "SEC Thailand fund check", url: "https://www.sec.or.th/TH/Pages/MarketData/Fund.aspx" },
];
