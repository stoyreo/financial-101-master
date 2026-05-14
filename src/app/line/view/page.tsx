/**
 * /line/view  — Public receipt landing page for LINE flex-message card links.
 *
 * The LINE expense-tracker bot includes a "View" button in every flex-message
 * reply. This page is the link target. No authentication is required.
 *
 * URL format:
 *   https://financial101.vercel.app/line/view
 *     ?amount=250
 *     &category=Food
 *     &desc=Lunch+at+MBK
 *     &currency=THB          (optional, default THB)
 *     &date=2026-05-14       (optional, default today)
 *     &icon=🍔               (optional emoji)
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Expense Record · Financial 101',
  description: 'View your expense record',
};

// Category → colour map (matches main app)
const CATEGORY_COLORS: Record<string, string> = {
  Food:          '#f97316',
  Transport:     '#3b82f6',
  Shopping:      '#ec4899',
  Utilities:     '#8b5cf6',
  Entertainment: '#eab308',
  Health:        '#10b981',
  Pet:           '#f59e0b',
  Family:        '#6366f1',
  Housing:       '#14b8a6',
  Insurance:     '#64748b',
  Travel:        '#06b6d4',
  Work:          '#84cc16',
  Other:         '#94a3b8',
};

const CATEGORY_ICONS: Record<string, string> = {
  Food:          '🍽️',
  Transport:     '🚗',
  Shopping:      '🛍️',
  Utilities:     '💡',
  Entertainment: '🎬',
  Health:        '🏥',
  Pet:           '🐾',
  Family:        '👨‍👩‍👧',
  Housing:       '🏠',
  Insurance:     '🛡️',
  Travel:        '✈️',
  Work:          '💼',
  Other:         '📌',
};

interface PageProps {
  searchParams: {
    amount?: string;
    category?: string;
    desc?: string;
    currency?: string;
    date?: string;
    icon?: string;
  };
}

export default function LineViewPage({ searchParams }: PageProps) {
  const amount   = parseFloat(searchParams.amount ?? '0') || 0;
  const category = searchParams.category ?? 'Other';
  const desc     = searchParams.desc ?? 'Expense';
  const currency = searchParams.currency ?? 'THB';
  const date     = searchParams.date ?? new Date().toISOString().slice(0, 10);
  const icon     = searchParams.icon || CATEGORY_ICONS[category] || '📌';
  const color    = CATEGORY_COLORS[category] ?? '#94a3b8';

  const formattedAmount = new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  const formattedDate = new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f1f5f9;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          }
          .card {
            background: #fff;
            border-radius: 1.25rem;
            box-shadow: 0 4px 24px rgba(0,0,0,0.10);
            max-width: 360px;
            width: 100%;
            overflow: hidden;
          }
          .card-header {
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
          }
          .icon { font-size: 3rem; }
          .category-badge {
            display: inline-block;
            padding: 0.25rem 0.85rem;
            border-radius: 999px;
            font-size: 0.78rem;
            font-weight: 600;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            color: #fff;
          }
          .card-body {
            padding: 0 1.5rem 1.5rem;
            display: flex;
            flex-direction: column;
            gap: 0.9rem;
          }
          .amount {
            font-size: 2.4rem;
            font-weight: 700;
            text-align: center;
            color: #0f172a;
          }
          .divider {
            height: 1px;
            background: #e2e8f0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 0.92rem;
          }
          .row-label { color: #64748b; }
          .row-value { color: #0f172a; font-weight: 500; max-width: 60%; text-align: right; }
          .footer {
            padding: 0.9rem 1.5rem;
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 0.78rem;
            color: #94a3b8;
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="card-header" style={{ background: `${color}18` }}>
            <div className="icon">{icon}</div>
            <span
              className="category-badge"
              style={{ background: color }}
            >
              {category}
            </span>
          </div>

          <div className="card-body">
            <div className="amount">{formattedAmount}</div>

            <div className="divider" />

            <div className="row">
              <span className="row-label">Description</span>
              <span className="row-value">{desc}</span>
            </div>
            <div className="row">
              <span className="row-label">Date</span>
              <span className="row-value">{formattedDate}</span>
            </div>
            <div className="row">
              <span className="row-label">Category</span>
              <span className="row-value">{category}</span>
            </div>
            <div className="row">
              <span className="row-label">Currency</span>
              <span className="row-value">{currency}</span>
            </div>
          </div>

          <div className="footer">
            Recorded via Financial 101 Expense Tracker
          </div>
        </div>
      </body>
    </html>
  );
}
