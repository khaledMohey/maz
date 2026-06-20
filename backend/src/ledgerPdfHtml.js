const path = require("path");
const pdfmake = require("pdfmake");

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

pdfmake.setFonts({
  Tajawal: {
    normal: path.join(FONT_DIR, "Tajawal-Regular.ttf"),
    bold: path.join(FONT_DIR, "Tajawal-Bold.ttf"),
  },
});
pdfmake.setLocalAccessPolicy((filePath) => filePath.startsWith(FONT_DIR));

const TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => "#e2e8f0",
  vLineColor: () => "#e2e8f0",
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

const BASE_DOC = {
  defaultStyle: { font: "Tajawal", alignment: "right", fontSize: 10 },
  pageSize: "A4",
  pageMargins: [28, 40, 28, 40],
  styles: {
    title: { fontSize: 18, bold: true, alignment: "center", margin: [0, 0, 0, 12] },
    meta: { fontSize: 10.5, color: "#334155", margin: [0, 0, 0, 4] },
    sectionTitle: { fontSize: 13, bold: true, margin: [0, 14, 0, 6] },
    tableHeader: { bold: true, fillColor: "#f1f5f9" },
    totalRow: { bold: true, fillColor: "#f8fafc" },
  },
};

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

function cell(value, style) {
  const text = value == null || value === "" ? "—" : String(value);
  return style ? { text, style } : text;
}

function headerCell(value) {
  return cell(value, "tableHeader");
}

function buildTableSection({ heading, headers, rows }) {
  const section = [];
  if (heading) {
    section.push({ text: heading, style: "sectionTitle" });
  }

  const body = [
    headers.map((h) => headerCell(h)),
    ...rows.map((rowCells, rowIndex) => {
      const isTotal =
        rowIndex === rows.length - 1 && String(rowCells[0] || "").includes("الإجمالي");
      return rowCells.map((value) => (isTotal ? cell(value, "totalRow") : cell(value)));
    }),
  ];

  section.push({
    table: {
      headerRows: 1,
      widths: headers.map(() => "*"),
      body,
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 10],
  });

  return section;
}

function buildLedgerDoc({ title, metaLines, sections }) {
  const content = [{ text: title, style: "title" }];
  for (const line of metaLines) {
    content.push({ text: line, style: "meta" });
  }
  for (const section of sections) {
    content.push(...buildTableSection(section));
  }

  return {
    ...BASE_DOC,
    content,
  };
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

  return buildLedgerDoc({
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
  const totalEmptyKg = rows.reduce((s, r) => s + Number(r.emptyWeight || 0), 0);
  const totalFullKg = rows.reduce((s, r) => s + Number(r.fullWeight || 0), 0);
  const totalKg = rows.reduce((s, r) => s + Number(r.totalNetWeight || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
  const totalRemaining = rows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);

  const tableRows =
    rows.length > 0
      ? rows.map((row) => [
          pdfDate(row.date),
          row.broker || "—",
          pdfAmount(row.emptyWeight),
          pdfAmount(row.fullWeight),
          pdfAmount(row.totalNetWeight),
          pdfAmount(row.pricePerKg),
          pdfAmount(row.totalAmount),
          pdfAmount(row.paidAmount),
          pdfAmount(row.remainingAmount),
        ])
      : [["—", "—", "—", "—", "لا توجد مبيعات", "—", "—", "—", "—"]];

  if (rows.length > 0) {
    tableRows.push([
      "الإجمالي",
      "",
      pdfAmount(totalEmptyKg),
      pdfAmount(totalFullKg),
      pdfAmount(totalKg),
      totalKg > 0 ? pdfAmount(totalAmount / totalKg) : "—",
      pdfAmount(totalAmount),
      pdfAmount(totalPaid),
      pdfAmount(totalRemaining),
    ]);
  }

  return buildLedgerDoc({
    title: "كشف حساب تاجر",
    metaLines: [
      `المزرعة: ${farmName || "—"}`,
      `التاجر: ${trader.name || "—"}${trader.phone ? ` — ${trader.phone}` : ""}`,
      `تاريخ التصدير: ${pdfDate(new Date())}`,
    ],
    sections: [
      {
        headers: [
          "التاريخ",
          "السمسار",
          "وزن فارغ",
          "وزن ممتلئ",
          "صافي الوزن",
          "سعر الكيلة",
          "إجمالي الحساب",
          "واصل",
          "باقي",
        ],
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

  return buildLedgerDoc({
    title: "كشف حساب سمسار",
    metaLines: [
      `المزرعة: ${farmName || "—"}`,
      `السمسار: ${broker.name || "—"}${broker.phone ? ` — ${broker.phone}` : ""}`,
      `تاريخ التصدير: ${pdfDate(new Date())}`,
    ],
    sections,
  });
}

async function renderHtmlToPdf(res, docDefinition) {
  const pdfBuffer = await pdfmake.createPdf(docDefinition).getBuffer();
  res.send(pdfBuffer);
}

module.exports = {
  renderHtmlToPdf,
  buildSupplierPdfHtml,
  buildTraderPdfHtml,
  buildBrokerPdfHtml,
};
