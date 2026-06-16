const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const TAJAWAL_REGULAR_B64 = fs
  .readFileSync(path.join(FONT_DIR, "Tajawal-Regular.ttf"))
  .toString("base64");
const TAJAWAL_BOLD_B64 = fs.readFileSync(path.join(FONT_DIR, "Tajawal-Bold.ttf")).toString("base64");

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
    });
  }
  return browserPromise;
}

function escapeHtml(value) {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pdfDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function pdfAmount(value) {
  return Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildHtmlTable(headers, rows) {
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((cells, rowIndex) => {
      const isTotal = rowIndex === rows.length - 1 && String(cells[0] || "").includes("الإجمالي");
      const rowClass = isTotal ? ' class="total-row"' : "";
      const tds = cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("");
      return `<tr${rowClass}>${tds}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildLedgerPageHtml({ title, metaLines, sections }) {
  const metaHtml = metaLines.map((line) => `<p class="meta">${escapeHtml(line)}</p>`).join("");
  const sectionsHtml = sections
    .map((section) => {
      const heading = section.heading
        ? `<h2 class="section-title">${escapeHtml(section.heading)}</h2>`
        : "";
      return `${heading}${buildHtmlTable(section.headers, section.rows)}`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <style>
    @font-face {
      font-family: 'Tajawal';
      src: url(data:font/truetype;charset=utf-8;base64,${TAJAWAL_REGULAR_B64}) format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Tajawal';
      src: url(data:font/truetype;charset=utf-8;base64,${TAJAWAL_BOLD_B64}) format('truetype');
      font-weight: 700;
      font-style: normal;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Tajawal', Arial, sans-serif;
      direction: rtl;
      color: #0f172a;
      font-size: 11pt;
      line-height: 1.45;
      margin: 0;
      padding: 0;
    }
    .title {
      text-align: center;
      font-size: 18pt;
      font-weight: 700;
      margin: 0 0 14px;
    }
    .meta {
      margin: 0 0 6px;
      color: #334155;
      font-size: 10.5pt;
    }
    .section-title {
      font-size: 13pt;
      font-weight: 700;
      margin: 18px 0 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: right;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
    }
    tr.total-row td {
      font-weight: 700;
      background: #f8fafc;
    }
  </style>
</head>
<body>
  <h1 class="title">${escapeHtml(title)}</h1>
  ${metaHtml}
  ${sectionsHtml}
</body>
</html>`;
}

function buildSupplierPdfHtml({ farmName, supplier, rows }) {
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
  const totalRemaining = rows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);
  const tableRows =
    rows.length > 0
      ? rows.map((row, index) => [
          index + 1,
          pdfDate(row.date),
          row.itemType,
          row.quantityLabel,
          pdfAmount(row.amount),
          pdfAmount(row.paidAmount),
          pdfAmount(row.remainingAmount),
        ])
      : [["—", "—", "لا توجد حركات", "—", "—", "—", "—"]];

  if (rows.length > 0) {
    tableRows.push([
      "الإجمالي",
      "",
      "",
      "",
      pdfAmount(totalAmount),
      pdfAmount(totalPaid),
      pdfAmount(totalRemaining),
    ]);
  }

  return buildLedgerPageHtml({
    title: "كشف حساب مورد",
    metaLines: [
      `المزرعة: ${farmName || "—"}`,
      `المورد: ${supplier.name || "—"}${supplier.phone ? ` — ${supplier.phone}` : ""}`,
      `تاريخ التصدير: ${pdfDate(new Date())}`,
    ],
    sections: [
      {
        headers: ["#", "التاريخ", "البند", "الكمية", "إجمالي الحساب", "واصل", "باقي"],
        rows: tableRows,
      },
    ],
  });
}

function buildTraderPdfHtml({ farmName, trader, rows }) {
  const totalKg = rows.reduce((s, r) => s + Number(r.totalNetWeight || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
  const totalRemaining = rows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);

  const tableRows =
    rows.length > 0
      ? rows.map((row) => [
          pdfDate(row.date),
          row.broker || "—",
          pdfAmount(row.totalNetWeight),
          pdfAmount(row.pricePerKg),
          pdfAmount(row.totalAmount),
          pdfAmount(row.paidAmount),
          pdfAmount(row.remainingAmount),
        ])
      : [["—", "—", "لا توجد مبيعات", "—", "—", "—", "—"]];

  if (rows.length > 0) {
    tableRows.push([
      "الإجمالي",
      "",
      pdfAmount(totalKg),
      totalKg > 0 ? pdfAmount(totalAmount / totalKg) : "—",
      pdfAmount(totalAmount),
      pdfAmount(totalPaid),
      pdfAmount(totalRemaining),
    ]);
  }

  return buildLedgerPageHtml({
    title: "كشف حساب تاجر",
    metaLines: [
      `المزرعة: ${farmName || "—"}`,
      `التاجر: ${trader.name || "—"}${trader.phone ? ` — ${trader.phone}` : ""}`,
      `تاريخ التصدير: ${pdfDate(new Date())}`,
    ],
    sections: [
      {
        headers: ["التاريخ", "السمسار", "صافي الوزن", "سعر الكيلة", "إجمالي الحساب", "واصل", "باقي"],
        rows: tableRows,
      },
    ],
  });
}

function buildBrokerPdfHtml({ farmName, broker, saleRows, byTrader }) {
  const grandKg = saleRows.reduce((s, r) => s + Number(r.totalNetWeight || 0), 0);
  const grandTotal = saleRows.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const grandPaid = saleRows.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
  const grandRem = saleRows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);

  const summaryRows =
    byTrader.length > 0
      ? byTrader.map((row) => [
          row.traderLabel,
          pdfAmount(row.totalNetKg),
          row.avgPricePerKg > 0 ? pdfAmount(row.avgPricePerKg) : "—",
          pdfAmount(row.totalAmount),
          pdfAmount(row.totalPaid),
          pdfAmount(row.totalRemaining),
        ])
      : [["—", "—", "لا توجد مبيعات", "—", "—", "—"]];

  if (byTrader.length > 0) {
    summaryRows.push([
      "الإجمالي",
      pdfAmount(grandKg),
      grandKg > 0 ? pdfAmount(grandTotal / grandKg) : "—",
      pdfAmount(grandTotal),
      pdfAmount(grandPaid),
      pdfAmount(grandRem),
    ]);
  }

  const detailRows =
    saleRows.length > 0
      ? saleRows.map((row) => [
          row.linkedTrader?.name || row.trader || "—",
          pdfDate(row.date),
          pdfAmount(row.totalNetWeight),
          pdfAmount(row.pricePerKg),
          pdfAmount(row.totalAmount),
          pdfAmount(row.paidAmount),
          pdfAmount(row.remainingAmount),
        ])
      : [["—", "—", "لا توجد مبيعات", "—", "—", "—", "—"]];

  const sections = [
    {
      heading: "ملخص حسب التاجر",
      headers: ["اسم التاجر", "صافي الوزن", "سعر الكيلة", "إجمالي الحساب", "واصل", "باقي"],
      rows: summaryRows,
    },
  ];

  if (saleRows.length > 0) {
    sections.push({
      heading: "تفاصيل المبيعات",
      headers: ["التاجر", "التاريخ", "صافي الوزن", "سعر الكيلة", "إجمالي الحساب", "واصل", "باقي"],
      rows: detailRows,
    });
  }

  return buildLedgerPageHtml({
    title: "كشف حساب سمسار",
    metaLines: [
      `المزرعة: ${farmName || "—"}`,
      `السمسار: ${broker.name || "—"}${broker.phone ? ` — ${broker.phone}` : ""}`,
      `تاريخ التصدير: ${pdfDate(new Date())}`,
    ],
    sections,
  });
}

async function renderHtmlToPdf(res, html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.evaluateHandle("document.fonts.ready");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "10mm", right: "10mm" },
    });
    res.send(Buffer.from(pdfBuffer));
  } finally {
    await page.close();
  }
}

module.exports = {
  renderHtmlToPdf,
  buildSupplierPdfHtml,
  buildTraderPdfHtml,
  buildBrokerPdfHtml,
};
