const ExcelJS = require("exceljs");
const {
  renderHtmlToPdf,
  buildSupplierPdfHtml,
  buildTraderPdfHtml,
  buildBrokerPdfHtml,
} = require("./ledgerPdfHtml");

function localDateKey(isoOrDate) {
  if (!isoOrDate) return "";
  const x = new Date(isoOrDate);
  if (Number.isNaN(x.getTime())) return "";
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function supplierNamesMatch(left, right) {
  return String(left || "").trim() === String(right || "").trim();
}

function formatLedgerDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-EG");
  } catch {
    return "—";
  }
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeFilePart(name) {
  return String(name || "ledger")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

/** HTTP headers allow ASCII only in filename=; use RFC 5987 for Arabic display names. */
function buildContentDisposition(fileName) {
  const fullName = String(fileName || "export").trim() || "export";
  const asciiFallback =
    fullName
      .replace(/[^\x20-\x7E]+/g, "_")
      .replace(/["\\]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 120) || "export";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fullName)}`;
}

function setDownloadHeaders(res, contentType, fileName) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", buildContentDisposition(fileName));
}

function buildLedgerFileName(prefix, entity, entityId, ext) {
  const label = safeFilePart(entity?.name || entityId || prefix);
  const idPart = entityId ? String(entityId).slice(-8) : "export";
  return `${prefix}-${label}-${idPart}.${ext}`;
}

function creditAddMatchesPurchase(add, purchase) {
  const addNotes = String(add.notes || "");
  const sameDay = localDateKey(add.date) === localDateKey(purchase.date);
  const sameAmount = Math.abs(Number(add.amount || 0) - Number(purchase.amount || 0)) < 0.01;
  if (!sameDay || !sameAmount) return false;
  if (purchase.matchKind === "feed") return addNotes.startsWith("شراء علف");
  if (purchase.matchKind === "medication") return addNotes.startsWith("شراء علاج");
  return false;
}

function treasuryNoteToItemType(notes) {
  const text = String(notes || "").trim();
  if (!text) return "شراء آجل";
  if (text.startsWith("شراء علاج")) return text.replace(/^شراء علاج\s*-\s*/, "علاج — ") || "علاج";
  if (text.startsWith("شراء علف")) return text.replace(/^شراء علف\s*-\s*/, "علف — ") || "علف";
  if (text.startsWith("شراء غاز")) return text.replace(/^شراء غاز\s*-\s*/, "غاز — ") || "غاز";
  if (text.startsWith("شراء سولار")) return "سولار";
  if (text.startsWith("شراء كتاكيت")) return "كتاكيت";
  if (text.startsWith("مصروف")) return text.replace(/^مصروف\s*-\s*/, "مصروف — ") || "مصروف";
  return text;
}

function applySupplierPaymentFifo(rows, creditDeducts) {
  let paymentPool = (creditDeducts || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  for (const row of rows) {
    if (!row.isCredit) {
      row.paidAmount = row.amount;
      row.remainingAmount = 0;
      continue;
    }
    const paid = Math.min(paymentPool, row.amount);
    row.paidAmount = paid;
    row.remainingAmount = row.amount - paid;
    paymentPool -= paid;
  }
}

function collectSupplierLedgerRows(supplier, cycles, treasuryEntries = []) {
  const rows = [];
  const supplierName = (supplier.name || "").trim();
  const usedCreditAddIds = new Set();

  for (const cy of cycles || []) {
    for (const f of cy.feeds || []) {
      if (f.supplierId === supplier.id || (!f.supplierId && supplierNamesMatch(f.supplier, supplierName))) {
        rows.push({
          id: `feed-${f.id}`,
          itemType: "علف",
          date: f.date,
          quantityLabel: `${Number(f.quantityKg || 0).toFixed(2)} كجم`,
          amount: Number(f.totalCost || 0),
          matchKind: "feed",
          createdAt: f.createdAt,
        });
      }
    }
    for (const m of cy.medications || []) {
      if (supplierNamesMatch(m.supplier, supplierName)) {
        rows.push({
          id: `medication-${m.id}`,
          itemType: m.name ? `علاج — ${m.name}` : "علاج",
          date: m.date,
          quantityLabel: `${Number(m.quantity || 0).toFixed(2)}`,
          amount: Number(m.totalCost || 0),
          matchKind: "medication",
          createdAt: m.createdAt,
        });
      }
    }
  }

  const creditAdds = [];
  const creditDeducts = [];
  for (const entry of treasuryEntries || []) {
    if (!supplierNamesMatch(entry.personName, supplierName)) continue;
    if (entry.type === "CREDIT_ADD") creditAdds.push(entry);
    if (entry.type === "CREDIT_DEDUCT") creditDeducts.push(entry);
  }

  for (const row of rows) {
    const matchedAdd = creditAdds.find(
      (add) => !usedCreditAddIds.has(add.id) && creditAddMatchesPurchase(add, row),
    );
    if (matchedAdd) {
      row.isCredit = true;
      usedCreditAddIds.add(matchedAdd.id);
    } else {
      row.isCredit = false;
    }
  }

  for (const add of creditAdds) {
    if (usedCreditAddIds.has(add.id)) continue;
    const notes = String(add.notes || "");
    if (notes.startsWith("شراء علف") || notes.startsWith("شراء علاج")) continue;
    rows.push({
      id: `treasury-${add.id}`,
      itemType: treasuryNoteToItemType(notes),
      date: add.date,
      quantityLabel: "—",
      amount: Number(add.amount || 0),
      isCredit: true,
      createdAt: add.createdAt,
    });
    usedCreditAddIds.add(add.id);
  }

  rows.sort((a, b) => {
    const d = new Date(a.date) - new Date(b.date);
    if (d !== 0) return d;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  applySupplierPaymentFifo(rows, creditDeducts);
  return rows;
}

function collectTraderSalesRows(trader, cycles) {
  const rows = [];
  for (const cy of cycles || []) {
    for (const s of cy.sales || []) {
      if (s.traderId === trader.id || (!s.traderId && (s.trader || "") === trader.name)) {
        rows.push({ ...s, cycleName: cy.name, cycleEnded: !!cy.endDate });
      }
    }
  }
  return rows.sort((a, b) => {
    const d = new Date(a.date) - new Date(b.date);
    if (d !== 0) return d;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function collectBrokerSalesRows(brokerEntry, cycles) {
  const rows = [];
  const byId = brokerEntry.id;
  const name = (brokerEntry.name || "").trim();
  for (const cy of cycles || []) {
    for (const s of cy.sales || []) {
      const bn = (s.broker || "").trim();
      if (!bn && !s.brokerId) continue;
      const match = byId ? s.brokerId === byId : !s.brokerId && bn === name;
      if (match) rows.push({ ...s, cycleName: cy.name, cycleEnded: !!cy.endDate });
    }
  }
  return rows.sort((a, b) => {
    const d = new Date(a.date) - new Date(b.date);
    if (d !== 0) return d;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function aggregateBrokerSalesByTrader(saleRows) {
  const map = new Map();
  for (const r of saleRows) {
    const tLabel = (r.linkedTrader?.name || r.trader || "—").trim() || "—";
    const key = r.traderId || `n:${tLabel}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        traderLabel: tLabel,
        totalNetKg: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalRemaining: 0,
      });
    }
    const agg = map.get(key);
    agg.totalNetKg += Number(r.totalNetWeight || 0);
    agg.totalAmount += Number(r.totalAmount || 0);
    agg.totalPaid += Number(r.paidAmount || 0);
    agg.totalRemaining += Number(r.remainingAmount || 0);
  }
  return [...map.values()].map((row) => ({
    ...row,
    avgPricePerKg: row.totalNetKg > 0 ? row.totalAmount / row.totalNetKg : 0,
  }));
}

async function writeExcelWorkbook(res, fileName, buildSheets) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mazr3a";
  buildSheets(workbook);
  setDownloadHeaders(
    res,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName,
  );
  await workbook.xlsx.write(res);
}

function styleSheetHeader(sheet, rowNumber, colCount) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, name: "Arial", size: 11 };
  row.alignment = { horizontal: "right", vertical: "middle" };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  for (let c = 1; c <= colCount; c += 1) {
    sheet.getColumn(c).alignment = { horizontal: "right", vertical: "middle" };
  }
}

function buildSupplierExcelWorkbook(workbook, { farmName, supplier, rows }) {
  const sheet = workbook.addWorksheet("كشف المورد", { views: [{ rightToLeft: true }] });
  sheet.addRow(["كشف حساب مورد"]);
  sheet.addRow([`المزرعة: ${farmName || "—"}`]);
  sheet.addRow([`المورد: ${supplier.name || "—"}`]);
  if (supplier.phone) sheet.addRow([`الهاتف: ${supplier.phone}`]);
  sheet.addRow([]);
  sheet.addRow(["#", "التاريخ", "البند", "الكمية", "إجمالي الحساب", "واصل", "باقي"]);
  const headerRow = sheet.lastRow.number;
  rows.forEach((row, index) => {
    sheet.addRow([
      index + 1,
      formatLedgerDate(row.date),
      row.itemType,
      row.quantityLabel,
      Number(row.amount || 0),
      Number(row.paidAmount || 0),
      Number(row.remainingAmount || 0),
    ]);
  });
  if (rows.length > 0) {
    const totalAmount = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalPaid = rows.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
    const totalRemaining = rows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);
    sheet.addRow(["", "", "الإجمالي", "", totalAmount, totalPaid, totalRemaining]);
    sheet.lastRow.font = { bold: true };
  }
  styleSheetHeader(sheet, headerRow, 7);
  sheet.getColumn(5).numFmt = "#,##0.00";
  sheet.getColumn(6).numFmt = "#,##0.00";
  sheet.getColumn(7).numFmt = "#,##0.00";
}

function buildTraderExcelWorkbook(workbook, { farmName, trader, rows }) {
  const sheet = workbook.addWorksheet("كشف التاجر", { views: [{ rightToLeft: true }] });
  sheet.addRow(["كشف حساب تاجر"]);
  sheet.addRow([`المزرعة: ${farmName || "—"}`]);
  sheet.addRow([`التاجر: ${trader.name || "—"}`]);
  if (trader.phone) sheet.addRow([`الهاتف: ${trader.phone}`]);
  sheet.addRow([]);
  sheet.addRow(["التاريخ", "السمسار", "صافي الوزن", "سعر الكيلة", "إجمالي الحساب", "واصل", "باقي"]);
  const headerRow = sheet.lastRow.number;
  rows.forEach((row) => {
    sheet.addRow([
      formatLedgerDate(row.date),
      row.broker || "—",
      Number(row.totalNetWeight || 0),
      Number(row.pricePerKg || 0),
      Number(row.totalAmount || 0),
      Number(row.paidAmount || 0),
      Number(row.remainingAmount || 0),
    ]);
  });
  if (rows.length > 0) {
    const totalKg = rows.reduce((s, r) => s + Number(r.totalNetWeight || 0), 0);
    const totalAmount = rows.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
    const totalPaid = rows.reduce((s, r) => s + Number(r.paidAmount || 0), 0);
    const totalRemaining = rows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0);
    sheet.addRow([
      "الإجمالي",
      "",
      totalKg,
      totalKg > 0 ? totalAmount / totalKg : 0,
      totalAmount,
      totalPaid,
      totalRemaining,
    ]);
    sheet.lastRow.font = { bold: true };
  }
  styleSheetHeader(sheet, headerRow, 7);
  for (const col of [3, 4, 5, 6, 7]) sheet.getColumn(col).numFmt = "#,##0.00";
}

function buildBrokerExcelWorkbook(workbook, { farmName, broker, saleRows, byTrader }) {
  const summary = workbook.addWorksheet("ملخص التجار", { views: [{ rightToLeft: true }] });
  summary.addRow(["كشف حساب سمسار — ملخص"]);
  summary.addRow([`المزرعة: ${farmName || "—"}`]);
  summary.addRow([`السمسار: ${broker.name || "—"}`]);
  summary.addRow([]);
  summary.addRow(["اسم التاجر", "صافي الوزن", "سعر الكيلة", "إجمالي الحساب", "واصل", "باقي"]);
  const summaryHeader = summary.lastRow.number;
  byTrader.forEach((row) => {
    summary.addRow([
      row.traderLabel,
      Number(row.totalNetKg || 0),
      row.avgPricePerKg > 0 ? row.avgPricePerKg : 0,
      Number(row.totalAmount || 0),
      Number(row.totalPaid || 0),
      Number(row.totalRemaining || 0),
    ]);
  });
  styleSheetHeader(summary, summaryHeader, 6);
  for (const col of [2, 3, 4, 5, 6]) summary.getColumn(col).numFmt = "#,##0.00";

  const detail = workbook.addWorksheet("تفاصيل المبيعات", { views: [{ rightToLeft: true }] });
  detail.addRow(["كشف حساب سمسار — تفاصيل"]);
  detail.addRow([`السمسار: ${broker.name || "—"}`]);
  detail.addRow([]);
  detail.addRow(["التاجر", "التاريخ", "صافي الوزن", "سعر الكيلة", "إجمالي الحساب", "واصل", "باقي"]);
  const detailHeader = detail.lastRow.number;
  saleRows.forEach((row) => {
    detail.addRow([
      row.linkedTrader?.name || row.trader || "—",
      formatLedgerDate(row.date),
      Number(row.totalNetWeight || 0),
      Number(row.pricePerKg || 0),
      Number(row.totalAmount || 0),
      Number(row.paidAmount || 0),
      Number(row.remainingAmount || 0),
    ]);
  });
  styleSheetHeader(detail, detailHeader, 7);
  for (const col of [3, 4, 5, 6, 7]) detail.getColumn(col).numFmt = "#,##0.00";
}

async function loadFarmLedgerContext(prisma, farmId) {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    include: {
      suppliers: { orderBy: { name: "asc" } },
      traders: { orderBy: { name: "asc" } },
      brokers: { orderBy: { name: "asc" } },
      treasuryEntries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      cycles: {
        orderBy: { startDate: "desc" },
        include: {
          feeds: { include: { linkedSupplier: true } },
          medications: true,
          sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        },
      },
    },
  });
  if (!farm) return null;
  const cycles = farm.cycles.map((cycle) => ({
    ...cycle,
    feeds: cycle.feeds,
    medications: cycle.medications,
    sales: cycle.sales,
  }));
  return { farm, cycles, treasuryEntries: farm.treasuryEntries };
}

async function exportSupplierLedger(prisma, { farmId, supplierId, format, res }) {
  const ctx = await loadFarmLedgerContext(prisma, farmId);
  if (!ctx) return { status: 404, message: "المزرعة غير موجودة" };
  const supplier = ctx.farm.suppliers.find((s) => s.id === supplierId);
  if (!supplier) return { status: 404, message: "المورد غير موجود" };

  const rows = collectSupplierLedgerRows(supplier, ctx.cycles, ctx.treasuryEntries);
  const meta = { farmName: ctx.farm.name, supplier, rows };
  const pdfName = buildLedgerFileName("kashf-mowred", supplier, supplierId, "pdf");
  const xlsxName = buildLedgerFileName("kashf-mowred", supplier, supplierId, "xlsx");

  if (format === "pdf") {
    setDownloadHeaders(res, "application/pdf", pdfName);
    await renderHtmlToPdf(res, buildSupplierPdfHtml(meta));
    return { ok: true };
  }

  await writeExcelWorkbook(res, xlsxName, (workbook) => buildSupplierExcelWorkbook(workbook, meta));
  return { ok: true };
}

async function exportTraderLedger(prisma, { farmId, traderId, format, res }) {
  const ctx = await loadFarmLedgerContext(prisma, farmId);
  if (!ctx) return { status: 404, message: "المزرعة غير موجودة" };
  const trader = ctx.farm.traders.find((t) => t.id === traderId);
  if (!trader) return { status: 404, message: "التاجر غير موجود" };

  const rows = collectTraderSalesRows(trader, ctx.cycles);
  const meta = { farmName: ctx.farm.name, trader, rows };
  const pdfName = buildLedgerFileName("kashf-tager", trader, traderId, "pdf");
  const xlsxName = buildLedgerFileName("kashf-tager", trader, traderId, "xlsx");

  if (format === "pdf") {
    setDownloadHeaders(res, "application/pdf", pdfName);
    await renderHtmlToPdf(res, buildTraderPdfHtml(meta));
    return { ok: true };
  }

  await writeExcelWorkbook(res, xlsxName, (workbook) => buildTraderExcelWorkbook(workbook, meta));
  return { ok: true };
}

async function exportBrokerLedger(prisma, { farmId, brokerId, brokerName, format, res }) {
  const ctx = await loadFarmLedgerContext(prisma, farmId);
  if (!ctx) return { status: 404, message: "المزرعة غير موجودة" };

  let broker = null;
  if (brokerId) {
    broker = ctx.farm.brokers.find((b) => b.id === brokerId);
    if (!broker) return { status: 404, message: "السمسار غير موجود" };
  } else {
    const name = String(brokerName || "").trim();
    if (!name) return { status: 400, message: "اسم السمسار مطلوب" };
    broker = ctx.farm.brokers.find((b) => b.name === name) || { id: null, name, phone: null };
  }

  const saleRows = collectBrokerSalesRows(broker, ctx.cycles);
  const byTrader = aggregateBrokerSalesByTrader(saleRows);
  const meta = { farmName: ctx.farm.name, broker, saleRows, byTrader };
  const brokerKey = broker.id || safeFilePart(broker.name);
  const pdfName = buildLedgerFileName("kashf-simsar", broker, brokerKey, "pdf");
  const xlsxName = buildLedgerFileName("kashf-simsar", broker, brokerKey, "xlsx");

  if (format === "pdf") {
    setDownloadHeaders(res, "application/pdf", pdfName);
    await renderHtmlToPdf(res, buildBrokerPdfHtml(meta));
    return { ok: true };
  }

  await writeExcelWorkbook(res, xlsxName, (workbook) => buildBrokerExcelWorkbook(workbook, meta));
  return { ok: true };
}

module.exports = {
  exportSupplierLedger,
  exportTraderLedger,
  exportBrokerLedger,
  safeFilePart,
};
