require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const PDFDocument = require("pdfkit");
const fs = require("fs/promises");
const path = require("path");
const prisma = require("./prisma");
const {
  exportSupplierLedger,
  exportTraderLedger,
  exportBrokerLedger,
} = require("./ledgerReports");

/** وزن الشيكارة في تسجيل الاستهلاك اليومي (كجم) — يتوافق مع شيكارة العلف في الشراء */
const CONSUMPTION_BAG_KG = 50;

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const BACKUP_DIR = path.join(__dirname, "..", "backups");
const FARM_CREATE_PASSWORD = String(process.env.FARM_CREATE_PASSWORD || "8521");

app.use(express.json());
app.use(cors());

function getDiffDays(startDate, endDate = new Date()) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.floor((end - start) / msPerDay) + 1);
}

function mapCycle(cycle) {
  const cycleEnd = cycle.endDate ? new Date(cycle.endDate) : new Date();
  const totalArrivedChicks =
    (cycle.chickArrivals || []).reduce((sum, item) => sum + item.count, 0) + (cycle.initialBirds || 0);
  const totalMortality = (cycle.mortalities || []).reduce((sum, item) => sum + item.count, 0);
  const totalFeedWeightKg = (cycle.feeds || []).reduce((sum, item) => sum + Number(item.quantityKg || 0), 0);
  const totalFeedCost = (cycle.feeds || []).reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const totalGasCost = (cycle.gases || []).reduce(
    (sum, item) => sum + Number(item.cost ?? item.totalCost ?? 0),
    0,
  );
  const totalSolarLiters = (cycle.solars || []).reduce(
    (sum, item) => sum + Number(item.liters ?? item.kwhGenerated ?? 0),
    0,
  );
  const totalSolarCost = (cycle.solars || []).reduce(
    (sum, item) => sum + Number(item.cost ?? item.maintenanceCost ?? 0),
    0,
  );
  const totalExpenses = (cycle.expenses || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalMedicationCost = (cycle.medications || []).reduce((sum, item) => sum + Number(item.totalCost || 0), 0);
  const totalDailyFeedConsumed = (cycle.dailyConsumptions || []).reduce(
    (sum, item) => sum + Number(item.feedKg || 0),
    0,
  );
  const totalMedicationQuantity = (cycle.medications || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalMedicationUsed = (cycle.medications || []).reduce(
    (sum, item) => sum + Number(item.usedQuantity || 0),
    0,
  );
  const feedStockKg = Math.max(0, totalFeedWeightKg - totalDailyFeedConsumed);
  const medicationStockQuantity = Math.max(0, totalMedicationQuantity - totalMedicationUsed);
  const medicationStockItems = (cycle.medications || []).map((item) => {
    const quantity = Number(item.quantity || 0);
    const used = Number(item.usedQuantity || 0);
    return {
      id: item.id,
      name: item.name,
      quantity,
      usedQuantity: used,
      remainingQuantity: Math.max(0, quantity - used),
    };
  });
  const latestWeightEntry =
    (cycle.weightEntries || []).length > 0
      ? (cycle.weightEntries || []).reduce((latest, entry) => {
          const ed = new Date(entry.date).getTime();
          const ld = new Date(latest.date).getTime();
          if (ed > ld) return entry;
          if (ed < ld) return latest;
          return new Date(entry.createdAt) > new Date(latest.createdAt) ? entry : latest;
        })
      : null;
  const averageCycleWeight =
    (cycle.weightEntries || []).length > 0
      ? (cycle.weightEntries || []).reduce((sum, item) => sum + Number(item.averageWeight || 0), 0) /
        cycle.weightEntries.length
      : 0;
  const totalSalesNetWeight = (cycle.sales || []).reduce((sum, sale) => sum + Number(sale.totalNetWeight || 0), 0);
  const totalSalesAmount = (cycle.sales || []).reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const totalSalesPaid = (cycle.sales || []).reduce((sum, sale) => sum + Number(sale.paidAmount || 0), 0);
  const totalSalesRemaining = (cycle.sales || []).reduce(
    (sum, sale) => sum + Number(sale.remainingAmount || 0),
    0,
  );
  const saleWeightRows =
    (cycle.saleWeightEntries || []).length > 0
      ? cycle.saleWeightEntries
      : (cycle.sales || []).flatMap((sale) => sale.saleWeightEntries || []);
  const totalSoldBirds = saleWeightRows.reduce((sum, item) => {
    const birds = Number(item.birdCount || 0);
    return birds > 0 ? sum + birds : sum;
  }, 0);
  const workerSalaryDetails = (cycle.workers || []).map((worker) => {
    const monthlySalary = Number(worker.monthlySalary || 0);
    const dailySalary = monthlySalary / 30;
    const workerStart = worker.hiredAt ? new Date(worker.hiredAt) : new Date(cycle.startDate);
    const effectiveStart = workerStart > new Date(cycle.startDate) ? workerStart : new Date(cycle.startDate);
    const workedDays = effectiveStart > cycleEnd ? 0 : getDiffDays(effectiveStart, cycleEnd);
    const totalSalary = dailySalary * workedDays;
    const workerExpenses = (cycle.workerExpenses || []).reduce(
      (sum, exp) => sum + (exp.workerId === worker.id ? Number(exp.amount || 0) : 0),
      0,
    );
    const netSalary = totalSalary - workerExpenses;

    return {
      ...worker,
      dailySalary,
      workedDays,
      totalSalary,
      workerExpenses,
      netSalary,
    };
  });
  const totalWorkerSalary = workerSalaryDetails.reduce((sum, worker) => sum + worker.totalSalary, 0);
  const totalWorkerExpenses = workerSalaryDetails.reduce((sum, worker) => sum + worker.workerExpenses, 0);
  const totalWorkerNetSalary = workerSalaryDetails.reduce((sum, worker) => sum + worker.netSalary, 0);
  const totalChickPurchaseCost = (cycle.chickArrivals || []).reduce(
    (sum, item) => sum + Number(item.totalCost ?? 0),
    0,
  );
  /** تكلفة «الاستهلاك» في سعر الكتكوت: غاز + سولار (لا يوجد مبلغ نقدي لسجل الاستهلاك اليومي للعلف) */
  const chickPriceConsumptionCost = Number(totalGasCost || 0) + Number(totalSolarCost || 0);
  const chickPriceNumerator =
    Number(totalChickPurchaseCost || 0) +
    Number(totalFeedCost || 0) +
    chickPriceConsumptionCost +
    Number(totalExpenses || 0) +
    Number(totalMedicationCost || 0);
  const chickPricePerUnit =
    Number(totalArrivedChicks || 0) > 0 ? chickPriceNumerator / Number(totalArrivedChicks || 0) : null;
  const currentChickenCount = Math.max(0, totalArrivedChicks - totalMortality - totalSoldBirds);
  const firstArrivalDate =
    cycle.chickArrivals && cycle.chickArrivals.length > 0
      ? cycle.chickArrivals.reduce((min, item) =>
          new Date(item.arrivalDate) < new Date(min.arrivalDate) ? item : min,
        ).arrivalDate
      : cycle.startDate;

  const cycleDurationDays = cycle.endDate
    ? getDiffDays(cycle.startDate, cycle.endDate)
    : getDiffDays(cycle.startDate, new Date());

  const enrichedChickArrivals = (cycle.chickArrivals || [])
    .map((arrival) => {
      const arrivalDay = new Date(arrival.arrivalDate);
      arrivalDay.setHours(0, 0, 0, 0);
      const weightsOnOrAfter = (cycle.weightEntries || []).filter((w) => {
        const d = new Date(w.date);
        d.setHours(0, 0, 0, 0);
        return d >= arrivalDay;
      });
      const latestW =
        weightsOnOrAfter.length === 0
          ? null
          : weightsOnOrAfter.reduce((a, b) => {
              const ad = new Date(a.date).getTime();
              const bd = new Date(b.date).getTime();
              if (bd > ad) return b;
              if (bd < ad) return a;
              return new Date(b.createdAt) > new Date(a.createdAt) ? b : a;
            });
      return {
        ...arrival,
        ageDays: getDiffDays(arrival.arrivalDate, cycleEnd),
        latestAverageWeightKg: latestW ? Number(latestW.averageWeight || 0) : null,
        latestWeightDate: latestW ? latestW.date : null,
      };
    })
    .sort((a, b) => new Date(b.arrivalDate) - new Date(a.arrivalDate));

  const enrichedMortalities = (cycle.mortalities || []).map((m) => {
    const unit =
      m.chickPriceAtRecord != null && m.chickPriceAtRecord !== undefined
        ? Number(m.chickPriceAtRecord)
        : null;
    const mortalityLineLoss =
      unit != null && !Number.isNaN(unit) ? unit * Number(m.count || 0) : null;
    return { ...m, mortalityLineLoss };
  });
  const totalMortalityLossRecorded = enrichedMortalities.reduce(
    (sum, m) => sum + (m.mortalityLineLoss != null && !Number.isNaN(m.mortalityLineLoss) ? m.mortalityLineLoss : 0),
    0,
  );
  const mortalitiesWithoutPriceSnapshot = enrichedMortalities.filter(
    (m) => m.chickPriceAtRecord == null,
  ).length;

  return {
    ...cycle,
    chickArrivals: enrichedChickArrivals,
    mortalities: enrichedMortalities,
    cycleDurationDays,
    chickAgeDays: getDiffDays(firstArrivalDate, cycle.endDate || new Date()),
    isActive: cycle.endDate === null,
    totalArrivedChicks,
    totalMortality,
    currentChickenCount,
    totalFeedWeightKg,
    totalFeedCost,
    totalGasCost,
    totalSolarLiters,
    totalSolarCost,
    totalExpenses,
    totalMedicationCost,
    totalSalesNetWeight,
    totalSalesAmount,
    totalSalesPaid,
    totalSalesRemaining,
    totalSoldBirds,
    totalDailyFeedConsumed,
    feedStockKg,
    medicationStockQuantity,
    medicationStockItems,
    latestAverageWeight: latestWeightEntry ? Number(latestWeightEntry.averageWeight || 0) : 0,
    cycleAverageWeight: averageCycleWeight,
    workers: workerSalaryDetails,
    totalWorkerSalary,
    totalWorkerExpenses,
    totalWorkerNetSalary,
    totalChickPurchaseCost,
    chickPriceConsumptionCost,
    chickPriceNumerator,
    chickPricePerUnit,
    totalMortalityLossRecorded,
    mortalitiesWithoutPriceSnapshot,
  };
}

const fullCycleInclude = {
  chickArrivals: true,
  mortalities: true,
  feeds: { include: { linkedSupplier: true } },
  gases: true,
  solars: true,
  expenses: true,
  medications: true,
  workers: { include: { farmWorker: true } },
  workerExpenses: true,
  sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
  saleWeightEntries: true,
  dailyConsumptions: { orderBy: { date: "desc" } },
  weightEntries: { orderBy: { date: "desc" } },
};

async function loadMappedCycle(cycleId) {
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    include: fullCycleInclude,
  });
  if (!cycle) return null;
  return mapCycle(cycle);
}

async function nextFarmWorkerCode(farmId) {
  const list = await prisma.farmWorker.findMany({ where: { farmId }, select: { code: true } });
  let max = 0;
  for (const w of list) {
    const m = /^W(\d+)$/i.exec(String(w.code || ""));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `W${String(max + 1).padStart(3, "0")}`;
}

function normalizeTreasuryType(rawType) {
  const v = String(rawType || "").toUpperCase();
  const allowed = ["DEPOSIT", "WITHDRAW", "CREDIT_ADD", "CREDIT_DEDUCT"];
  return allowed.includes(v) ? v : null;
}

async function getFarmCreditOutstanding(farmId, personName) {
  const rows = await prisma.treasuryEntry.findMany({
    where: { farmId, personName },
    select: { type: true, amount: true },
  });
  return rows.reduce((sum, r) => {
    const amount = Number(r.amount || 0);
    if (r.type === "CREDIT_ADD") return sum + amount;
    if (r.type === "CREDIT_DEDUCT") return sum - amount;
    return sum;
  }, 0);
}

function normalizePurchasePaymentSource(rawSource) {
  const v = String(rawSource || "TREASURY").toUpperCase();
  return v === "CREDIT" ? "CREDIT" : "TREASURY";
}

async function getFarmCashBalance(farmId) {
  const rows = await prisma.treasuryEntry.findMany({
    where: { farmId },
    select: { type: true, amount: true },
  });
  return rows.reduce((sum, r) => {
    const amount = Number(r.amount || 0);
    if (r.type === "DEPOSIT") return sum + amount;
    if (r.type === "WITHDRAW") return sum - amount;
    return sum;
  }, 0);
}

async function upsertFarmSupplierByName(farmId, supplierName, phone = null) {
  const name = String(supplierName || "").trim();
  if (!name) return null;
  return prisma.supplier.upsert({
    where: { farmId_name: { farmId, name } },
    create: { farmId, name, phone: phone || null },
    update: phone ? { phone } : {},
  });
}

async function upsertFarmBrokerByName(farmId, brokerName, phone = null) {
  const name = String(brokerName || "").trim();
  if (!name) return null;
  return prisma.broker.upsert({
    where: { farmId_name: { farmId, name } },
    create: { farmId, name, phone: phone || null },
    update: phone ? { phone } : {},
  });
}

async function registerPurchaseTreasuryMovement({
  farmId,
  amount,
  date,
  paymentSource,
  creditPersonName,
  notes,
}) {
  if (Number.isNaN(Number(amount)) || Number(amount) <= 0) return;
  const normalizedSource = normalizePurchasePaymentSource(paymentSource);
  if (normalizedSource === "CREDIT") {
    const personName = String(creditPersonName || "").trim();
    if (!personName) {
      return { ok: false, message: "اسم المورد مطلوب عند اختيار الشراء الآجل" };
    }
    const entry = await prisma.treasuryEntry.create({
      data: {
        farmId,
        type: "CREDIT_ADD",
        amount: Number(amount),
        personName,
        notes: notes?.trim() || null,
        date,
      },
    });
    return { ok: true, entry };
  }

  const entry = await prisma.treasuryEntry.create({
    data: {
      farmId,
      type: "WITHDRAW",
      amount: Number(amount),
      notes: notes?.trim() || null,
      date,
    },
  });
  return { ok: true, entry };
}

function supplierNamesMatch(left, right) {
  return String(left || "").trim() === String(right || "").trim();
}

/** يحذف حركة خزنة مرتبطة بشراء (آجل أو سحب) عند حذف سجل الشراء */
async function removeLinkedPurchaseTreasuryEntries({ farmId, amount, date, personName, notesPrefix }) {
  if (!farmId || !notesPrefix) return [];
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) return [];

  const start = new Date(date);
  if (Number.isNaN(start.getTime())) return [];
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const candidates = await prisma.treasuryEntry.findMany({
    where: {
      farmId,
      amount: numericAmount,
      date: { gte: start, lt: end },
      type: { in: ["CREDIT_ADD", "WITHDRAW"] },
    },
    orderBy: { createdAt: "asc" },
  });

  const prefix = String(notesPrefix);
  let matched = candidates.filter((entry) => {
    const notes = String(entry.notes || "");
    if (!notes.startsWith(prefix)) return false;
    if (entry.type === "CREDIT_ADD" && personName) {
      return supplierNamesMatch(entry.personName, personName);
    }
    return true;
  });

  if (matched.length === 0 && personName) {
    matched = candidates.filter((entry) => {
      const notes = String(entry.notes || "");
      if (!notes.startsWith(prefix)) return false;
      return entry.type === "CREDIT_ADD" || entry.type === "WITHDRAW";
    });
  }

  if (matched.length === 0) return [];
  await prisma.treasuryEntry.delete({ where: { id: matched[0].id } });
  return [matched[0].id];
}

/** يحذف إيداع الخزنة المرتبط بمدفوع بيع عند حذف سجل البيع */
async function removeLinkedSaleTreasuryEntries({ farmId, amount, date, traderName }) {
  if (!farmId) return [];
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) return [];

  const start = new Date(date);
  if (Number.isNaN(start.getTime())) return [];
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const candidates = await prisma.treasuryEntry.findMany({
    where: {
      farmId,
      amount: numericAmount,
      date: { gte: start, lt: end },
      type: "DEPOSIT",
    },
    orderBy: { createdAt: "asc" },
  });

  const matched = candidates.filter((entry) => {
    const notes = String(entry.notes || "");
    if (!notes.startsWith("مدفوع بيع")) return false;
    if (traderName) return supplierNamesMatch(entry.personName, traderName);
    return true;
  });

  if (matched.length === 0) return [];
  await prisma.treasuryEntry.delete({ where: { id: matched[0].id } });
  return [matched[0].id];
}

async function attachPurchaseDeleteMeta(mapped, cycleId, removedTreasuryEntryIds) {
  if (!mapped) return mapped;
  const cycle = await prisma.cycle.findUnique({ where: { id: cycleId }, select: { farmId: true } });
  mapped.removedTreasuryEntryIds = removedTreasuryEntryIds || [];
  mapped.farmId = cycle?.farmId || null;
  return mapped;
}

async function ensureAlert({ farmId, cycleId, type, message }) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const until = new Date(since);
  until.setDate(until.getDate() + 1);

  const sameDayAlerts = await prisma.alert.findMany({
    where: {
      farmId,
      cycleId: cycleId || null,
      type,
      message,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (sameDayAlerts.length === 0) {
    await prisma.alert.create({
      data: { farmId, cycleId: cycleId || null, type, message },
    });
    return;
  }

  // Safety cleanup: keep one alert only per farm/cycle/type/message/day.
  // This handles rare race conditions where duplicate alerts are inserted.
  const duplicateAlerts = await prisma.alert.findMany({
    where: {
      farmId,
      cycleId: cycleId || null,
      type,
      message,
      createdAt: { gte: since, lt: until },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (duplicateAlerts.length > 1) {
    await prisma.alert.deleteMany({
      where: {
        id: { in: duplicateAlerts.slice(1).map((item) => item.id) },
      },
    });
  }
}

async function runSmartAlertsCheck() {
  const farms = await prisma.farm.findMany({
    include: {
      cycles: {
        where: { endDate: null },
        include: {
          chickArrivals: true,
          mortalities: true,
          dailyConsumptions: { orderBy: { date: "desc" } },
        },
      },
    },
  });

  for (const farm of farms) {
    for (const cycle of farm.cycles) {
      const totalChicks =
        cycle.initialBirds + cycle.chickArrivals.reduce((sum, item) => sum + Number(item.count || 0), 0);
      const totalMortality = cycle.mortalities.reduce((sum, item) => sum + Number(item.count || 0), 0);
      const mortalityRate = totalChicks > 0 ? (totalMortality / totalChicks) * 100 : 0;
      if (mortalityRate > 5) {
        await ensureAlert({
          farmId: farm.id,
          cycleId: cycle.id,
          type: "mortality",
          message: "نسبة النفوق عالية",
        });
      }

      const consumptions = cycle.dailyConsumptions
        .map((item) => Number(item.feedKg || 0))
        .filter((value) => value > 0);
      if (consumptions.length >= 4) {
        const latest = consumptions[0];
        const prev = consumptions.slice(1, 4);
        const prevAvg = prev.reduce((sum, val) => sum + val, 0) / prev.length;
        if (prevAvg > 0 && latest > prevAvg * 1.3) {
          await ensureAlert({
            farmId: farm.id,
            cycleId: cycle.id,
            type: "feed",
            message: "استهلاك العلف غير طبيعي",
          });
        }
      }

      const cycleDays = getDiffDays(cycle.startDate, new Date());
      if (cycleDays > 40) {
        await ensureAlert({
          farmId: farm.id,
          cycleId: cycle.id,
          type: "cycle",
          message: "الدورة تجاوزت المدة",
        });
      }

      const cycleMapped = mapCycle(cycle);
      if (cycleMapped.feedStockKg < 200) {
        await ensureAlert({
          farmId: farm.id,
          cycleId: cycle.id,
          type: "inventory",
          message: "مخزون العلف منخفض",
        });
      }

      const lowMedication = (cycleMapped.medicationStockItems || []).some((item) => item.remainingQuantity > 0 && item.remainingQuantity <= 5);
      if (lowMedication) {
        await ensureAlert({
          farmId: farm.id,
          cycleId: cycle.id,
          type: "inventory",
          message: "مخزون العلاج منخفض",
        });
      }
    }
  }
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

function toBackupFileName(date = new Date()) {
  const datePart = date.toISOString().slice(0, 10);
  return `backup-${datePart}.json`;
}

async function createDailyBackup() {
  await ensureBackupDir();

  const [
    farms,
    cycles,
    chickArrivals,
    mortalities,
    feeds,
    gases,
    solars,
    expenses,
    medications,
    workers,
    workerExpenses,
    sales,
    saleWeightEntries,
    dailyConsumptions,
    alerts,
    weightEntries,
  ] = await Promise.all([
    prisma.farm.findMany(),
    prisma.cycle.findMany(),
    prisma.chickArrival.findMany(),
    prisma.mortality.findMany(),
    prisma.feed.findMany(),
    prisma.gas.findMany(),
    prisma.solar.findMany(),
    prisma.expense.findMany(),
    prisma.medication.findMany(),
    prisma.worker.findMany(),
    prisma.workerExpense.findMany(),
    prisma.sale.findMany(),
    prisma.saleWeightEntry.findMany(),
    prisma.dailyConsumption.findMany(),
    prisma.alert.findMany(),
    prisma.weightEntry.findMany(),
  ]);

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      version: 1,
    },
    data: {
      farms,
      cycles,
      chickArrivals,
      mortalities,
      feeds,
      gases,
      solars,
      expenses,
      medications,
      workers,
      workerExpenses,
      sales,
      saleWeightEntries,
      dailyConsumptions,
      alerts,
      weightEntries,
    },
  };

  const filePath = path.join(BACKUP_DIR, toBackupFileName());
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"/><title>واجهة الـ API</title></head>
<body style="font-family: system-ui; padding: 2rem; max-width: 36rem;">
  <h1>هذا عنوان الـ API فقط</h1>
  <p>الواجهة (الموقع) تعمل على منفذ آخر عادةً <strong>5173</strong>.</p>
  <p><a href="http://localhost:5173">افتح الموقع: http://localhost:5173</a></p>
  <p>للتحقق من الخادم: <a href="/health">/health</a> أو <a href="/db-test">/db-test</a></p>
</body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "backend", port: PORT });
});

app.get("/db-test", async (_req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW() as now`;
    res.json({ status: "connected", result });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Database connection failed",
      error: error.message,
    });
  }
});

app.get("/api/backups", async (_req, res) => {
  try {
    await ensureBackupDir();
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
    return res.json({ files });
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحميل ملفات النسخ الاحتياطي", error: error.message });
  }
});

app.get("/api/backups/:fileName/download", async (req, res) => {
  try {
    const { fileName } = req.params;
    if (!/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(fileName)) {
      return res.status(400).json({ message: "اسم ملف النسخة غير صالح" });
    }
    const filePath = path.join(BACKUP_DIR, fileName);
    await fs.access(filePath);
    return res.download(filePath, fileName);
  } catch (error) {
    return res.status(404).json({ message: "ملف النسخة الاحتياطية غير موجود", error: error.message });
  }
});

app.get("/api/sales/:saleId/invoice.pdf", async (req, res) => {
  try {
    const { saleId } = req.params;
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        cycle: { include: { farm: true } },
        saleWeightEntries: true,
      },
    });
    if (!sale) return res.status(404).json({ message: "عملية البيع غير موجودة" });

    const fileName = `invoice-${saleId}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text("فاتورة بيع", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`المزرعة: ${sale.cycle?.farm?.name || "-"}`);
    doc.text(`الدورة: ${sale.cycle?.name || "-"}`);
    doc.text(`التاريخ: ${new Date(sale.date).toLocaleDateString("ar-EG")}`);
    doc.text(`التاجر: ${sale.trader || "-"}`);
    doc.text(`السمسار: ${sale.broker || "-"}`);
    doc.text(`الهاتف: ${sale.phone || "-"}`);
    doc.moveDown();

    doc.fontSize(13).text("تفاصيل الأوزان", { underline: true });
    doc.moveDown(0.5);
    sale.saleWeightEntries.forEach((entry, idx) => {
      doc
        .fontSize(11)
        .text(
          `${idx + 1}) فارغ: ${Number(entry.emptyWeight || 0).toFixed(2)} | ممتلئ: ${Number(entry.fullWeight || 0).toFixed(2)} | الأقفاص: ${entry.cages || 0} | فرخ: ${entry.birdCount != null && Number(entry.birdCount) > 0 ? Number(entry.birdCount) : "—"} | الصافي: ${Number(entry.netWeight || 0).toFixed(2)}`,
        );
    });
    if (sale.saleWeightEntries.length === 0) {
      doc.fontSize(11).text("لا توجد تفاصيل أوزان");
    }

    doc.moveDown();
    doc.fontSize(13).text("الملخص", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`إجمالي الوزن الصافي: ${Number(sale.totalNetWeight || 0).toFixed(2)} كجم`);
    doc.text(`السعر لكل كجم: ${Number(sale.pricePerKg || 0).toFixed(2)}`);
    doc.text(`إجمالي السعر: ${Number(sale.totalAmount || 0).toFixed(2)}`);
    doc.text(`المدفوع: ${Number(sale.paidAmount || 0).toFixed(2)}`);
    doc.text(`المتبقي: ${Number(sale.remainingAmount || 0).toFixed(2)}`);

    doc.end();
  } catch (error) {
    return res.status(500).json({ message: "تعذر توليد الفاتورة", error: error.message });
  }
});

function normalizeLedgerExportFormat(raw) {
  const v = String(raw || "pdf").toLowerCase();
  return v === "xlsx" || v === "excel" ? "xlsx" : "pdf";
}

async function handleLedgerExport(handler, req, res) {
  try {
    const format = normalizeLedgerExportFormat(req.query.format);
    const result = await handler(prisma, { ...req.params, format, res });
    if (result?.ok) return undefined;
    if (!res.headersSent) {
      return res.status(result?.status || 500).json({ message: result?.message || "تعذر تصدير كشف الحساب" });
    }
    return undefined;
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: "تعذر تصدير كشف الحساب", error: error.message });
    }
    return undefined;
  }
}

app.get("/api/farms/:farmId/ledgers/suppliers/:supplierId/export", (req, res) =>
  handleLedgerExport(exportSupplierLedger, req, res),
);

app.get("/api/farms/:farmId/ledgers/traders/:traderId/export", (req, res) =>
  handleLedgerExport(exportTraderLedger, req, res),
);

app.get("/api/farms/:farmId/ledgers/brokers/:brokerId/export", (req, res) =>
  handleLedgerExport(exportBrokerLedger, req, res),
);

app.get("/api/farms/:farmId/ledgers/brokers/export", (req, res) =>
  handleLedgerExport(
    (db, params) =>
      exportBrokerLedger(db, {
        farmId: params.farmId,
        brokerId: null,
        brokerName: req.query.name,
        format: params.format,
        res: params.res,
      }),
    req,
    res,
  ),
);

app.get("/api/cycles/:cycleId/report", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        farm: {
          include: {
            partners: true,
            supervisors: true,
          },
        },
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
        weightEntries: { orderBy: { date: "desc" } },
      },
    });

    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });

    const mapped = mapCycle(cycle);
    const operatingCosts =
      Number(mapped.totalFeedCost || 0) +
      Number(mapped.totalGasCost || 0) +
      Number(mapped.totalSolarCost || 0) +
      Number(mapped.totalExpenses || 0) +
      Number(mapped.totalMedicationCost || 0) +
      Number(mapped.totalWorkerNetSalary || 0);
    const revenue = Number(mapped.totalSalesAmount || 0);
    const profit = revenue - operatingCosts;
    const loss = profit < 0 ? Math.abs(profit) : 0;
    const partnerDeductions = (cycle.farm?.partners || []).map((partner) => {
      const shareValue = Number(partner.shareValue || 0);
      const deductionAmount = partner.shareType === "PERCENT" ? (profit * shareValue) / 100 : shareValue;
      return {
        partnerId: partner.id,
        partnerName: partner.name,
        shareType: partner.shareType,
        shareValue,
        deductionAmount: Math.max(0, deductionAmount),
      };
    });
    const totalPartnerDeduction = partnerDeductions.reduce((sum, item) => sum + Number(item.deductionAmount || 0), 0);
    const profitAfterPartnerShare = profit - totalPartnerDeduction;
    const supervisorDeductions = (cycle.farm?.supervisors || []).map((supervisor) => {
      const shareValue = Number(supervisor.shareValue || 0);
      const deductionAmount = supervisor.shareType === "PERCENT" ? (profit * shareValue) / 100 : shareValue;
      return {
        supervisorId: supervisor.id,
        supervisorName: supervisor.name,
        shareType: supervisor.shareType,
        shareValue,
        deductionAmount: Math.max(0, deductionAmount),
      };
    });
    const totalSupervisorDeduction = supervisorDeductions.reduce((sum, item) => sum + Number(item.deductionAmount || 0), 0);
    const finalProfitAfterShares = profitAfterPartnerShare - totalSupervisorDeduction;
    const mortalityRate =
      Number(mapped.totalArrivedChicks || 0) > 0
        ? Number(mapped.totalMortality || 0) / Number(mapped.totalArrivedChicks || 0)
        : 0;
    const costPerKg =
      Number(mapped.totalSalesNetWeight || 0) > 0 ? operatingCosts / Number(mapped.totalSalesNetWeight || 0) : 0;

    return res.json({
      cycleId: mapped.id,
      cycleName: mapped.name,
      totalChicks: mapped.totalArrivedChicks,
      mortality: mapped.totalMortality,
      finalCount: mapped.currentChickenCount,
      totalChickPurchaseCost: mapped.totalChickPurchaseCost,
      chickPriceConsumptionCost: mapped.chickPriceConsumptionCost,
      chickPriceNumerator: mapped.chickPriceNumerator,
      chickPricePerUnit: mapped.chickPricePerUnit,
      feedCost: mapped.totalFeedCost,
      gasSolarCost: Number(mapped.totalGasCost || 0) + Number(mapped.totalSolarCost || 0),
      expenses: mapped.totalExpenses,
      medications: mapped.totalMedicationCost,
      workers: mapped.totalWorkerNetSalary,
      sales: mapped.totalSalesAmount,
      netProfit: profit,
      totalCost: operatingCosts,
      revenue,
      profit,
      loss,
      partnerDeductions,
      totalPartnerDeduction,
      profitAfterPartnerShare,
      supervisorDeductions,
      totalSupervisorDeduction,
      finalProfitAfterShares,
      costPerKg,
      mortalityRate,
      totalMortalityLossRecorded: mapped.totalMortalityLossRecorded,
      mortalitiesWithoutPriceSnapshot: mapped.mortalitiesWithoutPriceSnapshot,
    });
  } catch (error) {
    return res.status(500).json({ message: "تعذر إنشاء التقرير", error: error.message });
  }
});

app.get("/api/partners", async (_req, res) => {
  try {
    const partners = await prisma.partner.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        farm: true,
      },
    });
    return res.json(partners);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحميل الشركاء", error: error.message });
  }
});

app.post("/api/partners", async (req, res) => {
  try {
    const farmId = String(req.body?.farmId || "");
    const name = String(req.body?.name || "").trim();
    const shareType = req.body?.shareType === "FIXED" ? "FIXED" : "PERCENT";
    const shareValue = Number(req.body?.shareValue ?? 0);

    if (!farmId) return res.status(400).json({ message: "اختر المزرعة" });
    if (!name) return res.status(400).json({ message: "أدخل اسم الشريك" });
    if (Number.isNaN(shareValue) || shareValue <= 0) {
      return res.status(400).json({ message: "قيمة النسبة/المبلغ غير صحيحة" });
    }
    if (shareType === "PERCENT" && shareValue > 100) {
      return res.status(400).json({ message: "نسبة الشريك لا يمكن أن تتجاوز 100%" });
    }

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) return res.status(404).json({ message: "المزرعة غير موجودة" });

    const partner = await prisma.partner.create({
      data: {
        farmId,
        name,
        shareType,
        shareValue,
      },
      include: {
        farm: true,
      },
    });
    return res.status(201).json(partner);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة الشريك", error: error.message });
  }
});

app.delete("/api/partners/:partnerId", async (req, res) => {
  try {
    const { partnerId } = req.params;
    const existing = await prisma.partner.findUnique({ where: { id: partnerId } });
    if (!existing) return res.status(404).json({ message: "الشريك غير موجود" });
    await prisma.partner.delete({ where: { id: partnerId } });
    return res.json({ message: "تم حذف الشريك", id: partnerId });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف الشريك", error: error.message });
  }
});

app.get("/api/supervisors", async (_req, res) => {
  try {
    const supervisors = await prisma.supervisor.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        farm: true,
      },
    });
    return res.json(supervisors);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحميل المشرفين", error: error.message });
  }
});

app.post("/api/supervisors", async (req, res) => {
  try {
    const farmId = String(req.body?.farmId || "");
    const name = String(req.body?.name || "").trim();
    const shareType = req.body?.shareType === "FIXED" ? "FIXED" : "PERCENT";
    const shareValue = Number(req.body?.shareValue ?? 0);

    if (!farmId) return res.status(400).json({ message: "اختر المزرعة" });
    if (!name) return res.status(400).json({ message: "أدخل اسم المشرف" });
    if (Number.isNaN(shareValue) || shareValue <= 0) {
      return res.status(400).json({ message: "قيمة النسبة/المبلغ غير صحيحة" });
    }
    if (shareType === "PERCENT" && shareValue > 100) {
      return res.status(400).json({ message: "نسبة المشرف لا يمكن أن تتجاوز 100%" });
    }

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) return res.status(404).json({ message: "المزرعة غير موجودة" });

    const supervisor = await prisma.supervisor.create({
      data: {
        farmId,
        name,
        shareType,
        shareValue,
      },
      include: {
        farm: true,
      },
    });
    return res.status(201).json(supervisor);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة المشرف", error: error.message });
  }
});

app.delete("/api/supervisors/:supervisorId", async (req, res) => {
  try {
    const { supervisorId } = req.params;
    const existing = await prisma.supervisor.findUnique({ where: { id: supervisorId } });
    if (!existing) return res.status(404).json({ message: "المشرف غير موجود" });
    await prisma.supervisor.delete({ where: { id: supervisorId } });
    return res.json({ message: "تم حذف المشرف", id: supervisorId });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف المشرف", error: error.message });
  }
});

app.get("/api/farms/comparison", async (_req, res) => {
  try {
    const farms = await prisma.farm.findMany({
      include: {
        cycles: {
          include: {
            chickArrivals: true,
            mortalities: true,
            feeds: { include: { linkedSupplier: true } },
            gases: true,
            solars: true,
            expenses: true,
            medications: true,
            workers: { include: { farmWorker: true } },
            workerExpenses: true,
            sales: true,
            weightEntries: true,
          },
        },
      },
    });

    const comparison = farms
      .map((farm) => {
        const mappedCycles = farm.cycles.map(mapCycle);
        const totals = mappedCycles.reduce(
          (acc, cycle) => {
            const totalCost =
              Number(cycle.totalFeedCost || 0) +
              Number(cycle.totalGasCost || 0) +
              Number(cycle.totalSolarCost || 0) +
              Number(cycle.totalExpenses || 0) +
              Number(cycle.totalMedicationCost || 0) +
              Number(cycle.totalWorkerNetSalary || 0);

            acc.totalProfit += Number(cycle.totalSalesAmount || 0) - totalCost;
            acc.totalChicks += Number(cycle.totalArrivedChicks || 0);
            acc.totalMortality += Number(cycle.totalMortality || 0);
            acc.chickPriceNumeratorSum += Number(cycle.chickPriceNumerator || 0);
            return acc;
          },
          { totalProfit: 0, totalChicks: 0, totalMortality: 0, chickPriceNumeratorSum: 0 },
        );

        const mortalityRate = totals.totalChicks > 0 ? totals.totalMortality / totals.totalChicks : 0;
        const chickPricePerUnit =
          totals.totalChicks > 0 ? totals.chickPriceNumeratorSum / totals.totalChicks : null;

        return {
          farmId: farm.id,
          farmName: farm.name,
          totalProfit: totals.totalProfit,
          mortalityRate,
          chickPricePerUnit,
        };
      })
      .sort((a, b) => b.totalProfit - a.totalProfit);

    return res.json(comparison);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحميل مقارنة المزارع", error: error.message });
  }
});

app.get("/api/farms", async (_req, res) => {
  try {
    const farms = await prisma.farm.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        alerts: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
    const farmsWithCycles = await prisma.farm.findMany({
      where: {
        id: { in: farms.map((farm) => farm.id) },
      },
      include: {
        suppliers: { orderBy: { name: "asc" } },
        traders: { orderBy: { name: "asc" } },
        brokers: { orderBy: { name: "asc" } },
        farmWorkers: { orderBy: { code: "asc" } },
        treasuryEntries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
        cycles: {
          orderBy: { startDate: "desc" },
          include: {
            chickArrivals: true,
            mortalities: true,
            feeds: { include: { linkedSupplier: true } },
            gases: true,
            solars: true,
            expenses: true,
            medications: true,
            workers: { include: { farmWorker: true } },
            workerExpenses: true,
            sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
            saleWeightEntries: true,
            dailyConsumptions: { orderBy: { date: "desc" } },
            weightEntries: { orderBy: { date: "desc" } },
          },
        },
      },
    });

    const data = farmsWithCycles.map((farmCycles) => {
      const farmAlerts = farms.find((farm) => farm.id === farmCycles.id)?.alerts || [];
      const mappedCycles = farmCycles.cycles.map(mapCycle);
      const activeCycle = mappedCycles.find((cycle) => cycle.isActive) || null;
      return {
        ...farmCycles,
        alerts: farmAlerts,
        cycles: mappedCycles,
        activeCycle,
      };
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "تعذر تحميل المزارع", error: error.message });
  }
});

app.delete("/api/alerts", async (_req, res) => {
  try {
    const result = await prisma.alert.deleteMany({});
    return res.json({ message: "تم مسح كل التنبيهات", deletedCount: result.count });
  } catch (error) {
    return res.status(500).json({ message: "تعذر مسح التنبيهات", error: error.message });
  }
});

app.post("/api/farms/:farmId/treasury-entries", async (req, res) => {
  try {
    const { farmId } = req.params;
    const type = normalizeTreasuryType(req.body?.type);
    const amount = Number(req.body?.amount);
    const personName = req.body?.personName?.trim() || null;
    const notes = req.body?.notes?.trim() || null;
    const date = req.body?.date ? new Date(req.body.date) : new Date();

    if (!type) return res.status(400).json({ message: "نوع حركة الخزنة غير صحيح" });
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "مبلغ الحركة يجب أن يكون أكبر من صفر" });
    }
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: "تاريخ الحركة غير صحيح" });
    }
    if ((type === "CREDIT_ADD" || type === "CREDIT_DEDUCT") && !personName) {
      return res.status(400).json({ message: "اسم الشخص مطلوب في حركات الأجل" });
    }

    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) return res.status(404).json({ message: "المزرعة غير موجودة" });

    if (type === "CREDIT_DEDUCT") {
      const outstanding = await getFarmCreditOutstanding(farmId, personName);
      if (amount > outstanding) {
        return res.status(400).json({
          message: `لا يمكن خصم ${amount.toFixed(2)} من أجل ${personName}. المتاح حاليًا ${outstanding.toFixed(2)}`,
        });
      }
    }

    const entry = await prisma.treasuryEntry.create({
      data: {
        farmId,
        type,
        amount,
        personName,
        notes,
        date,
      },
    });
    return res.status(201).json(entry);
  } catch (error) {
    return res.status(500).json({ message: "تعذر حفظ حركة الخزنة", error: error.message });
  }
});

app.delete("/api/farms/:farmId/treasury-entries/:entryId", async (req, res) => {
  try {
    const { farmId, entryId } = req.params;
    const entry = await prisma.treasuryEntry.findFirst({ where: { id: entryId, farmId } });
    if (!entry) return res.status(404).json({ message: "حركة الخزنة غير موجودة" });
    await prisma.treasuryEntry.delete({ where: { id: entryId } });
    return res.json({ ok: true, farmId, removedTreasuryEntryIds: [entryId] });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف حركة الخزنة", error: error.message });
  }
});

app.post("/api/farms/:farmId/suppliers", async (req, res) => {
  try {
    const { farmId } = req.params;
    const name = req.body?.name?.trim();
    const phone = req.body?.phone?.trim() || null;
    if (!name) {
      return res.status(400).json({ message: "أدخل اسم المورد" });
    }
    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return res.status(404).json({ message: "المزرعة غير موجودة" });
    }
    const supplier = await prisma.supplier.create({
      data: { farmId, name, phone },
    });
    return res.status(201).json(supplier);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "يوجد مورد بنفس الاسم في هذه المزرعة" });
    }
    return res.status(500).json({ message: "تعذر إضافة المورد", error: error.message });
  }
});

app.post("/api/farms", async (req, res) => {
  try {
    const password = String(req.body?.password ?? "");
    if (password !== FARM_CREATE_PASSWORD) {
      return res.status(403).json({ message: "كلمة المرور غير صحيحة" });
    }

    const name = req.body?.name?.trim();
    if (!name) {
      return res.status(400).json({ message: "أدخل اسم المزرعة" });
    }

    const location = req.body?.location?.trim() || null;

    const farm = await prisma.farm.create({
      data: { name, location },
    });

    res.status(201).json({ ...farm, cycles: [], activeCycle: null });
  } catch (error) {
    res.status(500).json({ message: "تعذر إنشاء المزرعة", error: error.message });
  }
});

app.patch("/api/farms/:farmId", async (req, res) => {
  try {
    const { farmId } = req.params;
    const name = req.body?.name?.trim();
    if (!name) {
      return res.status(400).json({ message: "أدخل اسم المزرعة" });
    }
    const location =
      req.body?.location === undefined ? undefined : req.body?.location?.trim() || null;

    const existing = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!existing) {
      return res.status(404).json({ message: "المزرعة غير موجودة" });
    }

    const farm = await prisma.farm.update({
      where: { id: farmId },
      data: {
        name,
        ...(location !== undefined ? { location } : {}),
      },
    });

    return res.json(farm);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث المزرعة", error: error.message });
  }
});

app.delete("/api/farms/:farmId", async (req, res) => {
  try {
    const { farmId } = req.params;
    const existing = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!existing) {
      return res.status(404).json({ message: "المزرعة غير موجودة" });
    }

    await prisma.farm.delete({ where: { id: farmId } });
    return res.json({ message: "تم حذف المزرعة", id: farmId });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف المزرعة", error: error.message });
  }
});

app.post("/api/farms/:farmId/cycles/start", async (req, res) => {
  try {
    const { farmId } = req.params;
    const initialBirds = Number(req.body?.initialBirds ?? 0);
    const requestedStartDate = req.body?.startDate ? new Date(req.body.startDate) : new Date();
    if (Number.isNaN(requestedStartDate.getTime())) {
      return res.status(400).json({ message: "تاريخ بداية الدورة غير صحيح" });
    }

    const farm = await prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        cycles: {
          orderBy: { createdAt: "desc" },
          include: {
            chickArrivals: true,
            mortalities: true,
            feeds: { include: { linkedSupplier: true } },
            gases: true,
            solars: true,
            expenses: true,
            medications: true,
            workers: { include: { farmWorker: true } },
            workerExpenses: true,
            sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
            saleWeightEntries: true,
            dailyConsumptions: { orderBy: { date: "desc" } },
          },
        },
      },
    });

    if (!farm) {
      return res.status(404).json({ message: "المزرعة غير موجودة" });
    }

    const existingActive = farm.cycles.find((cycle) => cycle.endDate === null);
    if (existingActive) {
      return res.status(409).json({
        message: "يوجد دورة نشطة بالفعل في هذه المزرعة",
        activeCycle: mapCycle(existingActive),
      });
    }

    const cycleNumber = farm.cycles.length + 1;
    const cycle = await prisma.cycle.create({
      data: {
        farmId,
        name: `دورة ${cycleNumber}`,
        startDate: requestedStartDate,
        initialBirds: Number.isNaN(initialBirds) ? 0 : initialBirds,
      },
    });

    return res.status(201).json(mapCycle(cycle));
  } catch (error) {
    return res.status(500).json({ message: "تعذر بدء الدورة", error: error.message });
  }
});

app.post("/api/farms/:farmId/cycles/:cycleId/end", async (req, res) => {
  try {
    const { farmId, cycleId } = req.params;

    const cycle = await prisma.cycle.findFirst({
      where: { id: cycleId, farmId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
      },
    });

    if (!cycle) {
      return res.status(404).json({ message: "الدورة غير موجودة" });
    }

    if (cycle.endDate) {
      return res.status(400).json({ message: "تم إنهاء هذه الدورة مسبقًا" });
    }

    const endedCycle = await prisma.cycle.update({
      where: { id: cycleId },
      data: { endDate: new Date() },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
      },
    });

    return res.json(mapCycle(endedCycle));
  } catch (error) {
    return res.status(500).json({ message: "تعذر إنهاء الدورة", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/chicks", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const count = Number(req.body?.count);
    const arrivalDate = req.body?.arrivalDate ? new Date(req.body.arrivalDate) : new Date();
    const totalCostRaw = req.body?.totalCost;
    const totalCost =
      totalCostRaw === undefined || totalCostRaw === null || totalCostRaw === ""
        ? 0
        : Math.max(0, Number(totalCostRaw));
    const paymentSource = normalizePurchasePaymentSource(req.body?.paymentSource);
    const creditPersonName = req.body?.creditPersonName?.trim() || null;

    if (!count || count <= 0) {
      return res.status(400).json({ message: "عدد الكتاكيت يجب أن يكون أكبر من صفر" });
    }
    if (Number.isNaN(totalCost)) {
      return res.status(400).json({ message: "قيمة التكلفة غير صحيحة" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
        weightEntries: { orderBy: { date: "desc" } },
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة كتاكيت لدورة منتهية" });

    await prisma.chickArrival.create({
      data: {
        cycleId,
        count,
        arrivalDate,
        totalCost,
      },
    });
    if (paymentSource === "CREDIT" && creditPersonName) {
      await upsertFarmSupplierByName(cycle.farmId, creditPersonName);
    }
    let treasuryResult = null;
    if (totalCost > 0) {
      treasuryResult = await registerPurchaseTreasuryMovement({
        farmId: cycle.farmId,
        amount: totalCost,
        date: arrivalDate,
        paymentSource,
        creditPersonName,
        notes: "شراء كتاكيت",
      });
      if (treasuryResult?.ok === false) {
        return res.status(400).json({ message: treasuryResult.message });
      }
    }

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
        weightEntries: { orderBy: { date: "desc" } },
      },
    });

    const mapped = mapCycle(updatedCycle);
    if (treasuryResult?.entry) mapped.treasuryEntry = treasuryResult.entry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة الكتاكيت", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/mortality", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const count = Number(req.body?.count);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const reason = req.body?.reason?.trim() || null;

    if (!count || count <= 0) {
      return res.status(400).json({ message: "عدد النفوق يجب أن يكون أكبر من صفر" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: fullCycleInclude,
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة نفوق لدورة منتهية" });

    const mapped = mapCycle(cycle);
    if (count > mapped.currentChickenCount) {
      return res.status(400).json({ message: "عدد النفوق أكبر من العدد الحالي للدجاج" });
    }

    const chickPriceAtRecord =
      mapped.chickPricePerUnit != null && !Number.isNaN(Number(mapped.chickPricePerUnit))
        ? Number(mapped.chickPricePerUnit)
        : null;

    await prisma.mortality.create({
      data: {
        cycleId,
        date,
        count,
        reason,
        chickPriceAtRecord,
      },
    });

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: fullCycleInclude,
    });

    return res.status(201).json(mapCycle(updatedCycle));
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة النفوق", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/feed", async (req, res) => {
  try {
    const { cycleId } = req.params;
    let supplier = req.body?.supplier?.trim() || null;
    const supplierId = req.body?.supplierId?.trim() || null;
    const type = req.body?.type === "ton" ? "ton" : "bags";
    const quantity = Number(req.body?.quantity);
    const pricePerTon = Number(req.body?.pricePerTon);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const paymentSource = normalizePurchasePaymentSource(req.body?.paymentSource);
    const creditPersonNameRaw = req.body?.creditPersonName?.trim() || null;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
    }
    if (Number.isNaN(pricePerTon) || pricePerTon < 0) {
      return res.status(400).json({ message: "سعر الطن غير صحيح" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة علف لدورة منتهية" });

    let resolvedSupplierId = null;
    if (supplierId) {
      const sup = await prisma.supplier.findFirst({
        where: { id: supplierId, farmId: cycle.farmId },
      });
      if (!sup) {
        return res.status(400).json({ message: "المورد غير موجود أو لا يتبع هذه المزرعة" });
      }
      supplier = sup.name;
      resolvedSupplierId = sup.id;
    } else if (supplier) {
      const upsertedSupplier = await upsertFarmSupplierByName(cycle.farmId, supplier);
      if (upsertedSupplier) {
        supplier = upsertedSupplier.name;
        resolvedSupplierId = upsertedSupplier.id;
      }
    } else if (paymentSource === "CREDIT" && creditPersonNameRaw) {
      /** شراء علف آجل باسم صاحب الأجل فقط (بدون حقل مورد) — يجب إنشاء سجل مورد ليظهر في «الموردين» وكشف العلف */
      const upsertedSupplier = await upsertFarmSupplierByName(cycle.farmId, creditPersonNameRaw);
      if (upsertedSupplier) {
        supplier = upsertedSupplier.name;
        resolvedSupplierId = upsertedSupplier.id;
      }
    }

    const totalWeightKg = type === "ton" ? quantity * 1000 : quantity * 50;
    const totalCost = (totalWeightKg / 1000) * pricePerTon;

    await prisma.feed.create({
      data: {
        cycleId,
        date,
        supplier,
        supplierId: resolvedSupplierId,
        feedType: type,
        quantity,
        quantityKg: totalWeightKg,
        pricePerTon,
        unitPrice: pricePerTon,
        totalCost,
      },
    });
    const treasuryResult = await registerPurchaseTreasuryMovement({
      farmId: cycle.farmId,
      amount: totalCost,
      date,
      paymentSource,
      creditPersonName: creditPersonNameRaw || supplier,
      notes: `شراء علف${supplier ? ` - ${supplier}` : ""}`,
    });
    if (treasuryResult?.ok === false) {
      return res.status(400).json({ message: treasuryResult.message });
    }

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
        weightEntries: { orderBy: { date: "desc" } },
      },
    });

    const mapped = mapCycle(updatedCycle);
    if (treasuryResult?.entry) mapped.treasuryEntry = treasuryResult.entry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة العلف", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/gas", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const gasType = req.body?.type === "صغير" ? "صغير" : "كبير";
    const count = Number(req.body?.count);
    const cost = Number(req.body?.cost);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const paymentSource = normalizePurchasePaymentSource(req.body?.paymentSource);
    const creditPersonName = req.body?.creditPersonName?.trim() || null;

    if (!count || count <= 0) {
      return res.status(400).json({ message: "عدد اسطوانات الغاز يجب أن يكون أكبر من صفر" });
    }
    if (Number.isNaN(cost) || cost < 0) {
      return res.status(400).json({ message: "تكلفة الغاز غير صحيحة" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة غاز لدورة منتهية" });
    if (paymentSource === "CREDIT" && creditPersonName) {
      await upsertFarmSupplierByName(cycle.farmId, creditPersonName);
    }

    await prisma.gas.create({
      data: {
        cycleId,
        date,
        gasType,
        count,
        cost,
        quantity: count,
        unit: gasType,
        totalCost: cost,
      },
    });
    const treasuryResult = await registerPurchaseTreasuryMovement({
      farmId: cycle.farmId,
      amount: cost,
      date,
      paymentSource,
      creditPersonName,
      notes: `شراء غاز - ${gasType}`,
    });
    if (treasuryResult?.ok === false) {
      return res.status(400).json({ message: treasuryResult.message });
    }

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });

    const mapped = mapCycle(updatedCycle);
    if (treasuryResult?.entry) mapped.treasuryEntry = treasuryResult.entry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة الغاز", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/solar", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const liters = Number(req.body?.liters);
    const cost = Number(req.body?.cost);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const paymentSource = normalizePurchasePaymentSource(req.body?.paymentSource);
    const creditPersonName = req.body?.creditPersonName?.trim() || null;

    if (!liters || liters <= 0) {
      return res.status(400).json({ message: "الكمية (لتر) يجب أن تكون أكبر من صفر" });
    }
    if (Number.isNaN(cost) || cost < 0) {
      return res.status(400).json({ message: "تكلفة السولار غير صحيحة" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة سولار لدورة منتهية" });
    if (paymentSource === "CREDIT" && creditPersonName) {
      await upsertFarmSupplierByName(cycle.farmId, creditPersonName);
    }

    await prisma.solar.create({
      data: {
        cycleId,
        date,
        liters,
        cost,
        kwhGenerated: liters,
        maintenanceCost: cost,
      },
    });
    const treasuryResult = await registerPurchaseTreasuryMovement({
      farmId: cycle.farmId,
      amount: cost,
      date,
      paymentSource,
      creditPersonName,
      notes: "شراء سولار",
    });
    if (treasuryResult?.ok === false) {
      return res.status(400).json({ message: treasuryResult.message });
    }

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });

    const mapped = mapCycle(updatedCycle);
    if (treasuryResult?.entry) mapped.treasuryEntry = treasuryResult.entry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة السولار", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/expenses", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const itemName = req.body?.itemName?.trim();
    const amount = Number(req.body?.amount);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const paymentSource = normalizePurchasePaymentSource(req.body?.paymentSource);
    const creditPersonName = req.body?.creditPersonName?.trim() || null;

    if (!itemName) return res.status(400).json({ message: "اسم المصروف مطلوب" });
    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "المبلغ يجب أن يكون أكبر من صفر" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة مصروف لدورة منتهية" });
    if (paymentSource === "CREDIT" && creditPersonName) {
      await upsertFarmSupplierByName(cycle.farmId, creditPersonName);
    }

    await prisma.expense.create({
      data: {
        cycleId,
        date,
        title: itemName,
        category: "تشغيل",
        amount,
      },
    });
    const treasuryResult = await registerPurchaseTreasuryMovement({
      farmId: cycle.farmId,
      amount,
      date,
      paymentSource,
      creditPersonName,
      notes: `مصروف - ${itemName}`,
    });
    if (treasuryResult?.ok === false) {
      return res.status(400).json({ message: treasuryResult.message });
    }

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });

    const mapped = mapCycle(updatedCycle);
    if (treasuryResult?.entry) mapped.treasuryEntry = treasuryResult.entry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة المصروف", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/medications", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const name = req.body?.name?.trim();
    const supplier = req.body?.supplier?.trim() || null;
    const creditPersonNameRaw = req.body?.creditPersonName?.trim() || null;
    const resolvedSupplier = supplier || creditPersonNameRaw || null;
    const quantity = Number(req.body?.quantity);
    const price = Number(req.body?.price);
    const priceMode = req.body?.priceMode === "total" ? "total" : "unit";
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const paymentSource = normalizePurchasePaymentSource(req.body?.paymentSource);

    if (!name) return res.status(400).json({ message: "اسم العلاج مطلوب" });
    if (Number.isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "الكمية يجب أن تكون أكبر من صفر" });
    }
    if (Number.isNaN(price) || price < 0) {
      return res.status(400).json({ message: "السعر غير صحيح" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة علاج لدورة منتهية" });
    if (resolvedSupplier) {
      await upsertFarmSupplierByName(cycle.farmId, resolvedSupplier);
    }

    const unitPrice = priceMode === "unit" ? price : quantity > 0 ? price / quantity : 0;
    const totalCost = priceMode === "unit" ? quantity * price : price;
    const consumeImmediately = Boolean(req.body?.consumeImmediately);
    const usedQuantity = consumeImmediately ? quantity : 0;

    await prisma.medication.create({
      data: {
        cycleId,
        date,
        name,
        supplier: resolvedSupplier,
        quantity,
        unitPrice,
        totalCost,
        usedQuantity,
      },
    });
    const treasuryResult = await registerPurchaseTreasuryMovement({
      farmId: cycle.farmId,
      amount: totalCost,
      date,
      paymentSource,
      creditPersonName: creditPersonNameRaw || resolvedSupplier,
      notes: `شراء علاج - ${name}`,
    });
    if (treasuryResult?.ok === false) {
      return res.status(400).json({ message: treasuryResult.message });
    }

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });

    const mapped = mapCycle(updatedCycle);
    if (treasuryResult?.entry) mapped.treasuryEntry = treasuryResult.entry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة العلاج", error: error.message });
  }
});

app.post("/api/medications/:medicationId/usage", async (req, res) => {
  try {
    const { medicationId } = req.params;
    const usedQuantity = Number(req.body?.usedQuantity ?? 1);

    if (Number.isNaN(usedQuantity) || usedQuantity <= 0) {
      return res.status(400).json({ message: "كمية الاستخدام غير صحيحة" });
    }

    const medication = await prisma.medication.findUnique({
      where: { id: medicationId },
      include: { cycle: true },
    });
    if (!medication) return res.status(404).json({ message: "العلاج غير موجود" });

    const currentUsed = Number(medication.usedQuantity || 0);
    const totalQuantity = Number(medication.quantity || 0);
    const nextUsed = currentUsed + usedQuantity;
    if (nextUsed > totalQuantity) {
      return res.status(400).json({ message: "كمية الاستخدام أكبر من الكمية المتاحة" });
    }

    await prisma.medication.update({
      where: { id: medicationId },
      data: { usedQuantity: nextUsed },
    });

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: medication.cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });

    return res.json(mapCycle(updatedCycle));
  } catch (error) {
    return res.status(500).json({ message: "تعذر تسجيل استخدام العلاج", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/workers", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const farmWorkerIdInput = req.body?.farmWorkerId?.trim() || null;
    const nameInput = req.body?.name?.trim();
    const phoneInput = req.body?.phone === undefined ? undefined : req.body?.phone?.trim() || null;
    const roleInput = req.body?.role === undefined ? undefined : req.body?.role?.trim() || null;
    const startDate = req.body?.startDate ? new Date(req.body.startDate) : new Date();
    const monthlySalary = Number(req.body?.monthlySalary);

    if (Number.isNaN(monthlySalary) || monthlySalary <= 0) {
      return res.status(400).json({ message: "الراتب الشهري يجب أن يكون أكبر من صفر" });
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      select: { id: true, farmId: true, endDate: true },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة عامل لدورة منتهية" });

    let farmWorkerId = null;
    let name = nameInput;
    let phone = phoneInput ?? null;
    let role = roleInput ?? null;

    if (farmWorkerIdInput) {
      const fw = await prisma.farmWorker.findFirst({
        where: { id: farmWorkerIdInput, farmId: cycle.farmId },
      });
      if (!fw) return res.status(400).json({ message: "العامل المختار غير موجود في هذه المزرعة" });
      const dup = await prisma.worker.findFirst({ where: { cycleId, farmWorkerId: fw.id } });
      if (dup) return res.status(400).json({ message: "هذا العامل مسجّل بالفعل في هذه الدورة" });
      farmWorkerId = fw.id;
      name = fw.name;
      phone = fw.phone;
      role = fw.role;
    } else {
      if (!nameInput) {
        return res.status(400).json({ message: "أدخل اسم عامل جديد أو اختر عاملاً مسجّلًا من القائمة" });
      }
      const code = await nextFarmWorkerCode(cycle.farmId);
      const fw = await prisma.farmWorker.create({
        data: {
          farmId: cycle.farmId,
          code,
          name: nameInput,
          phone: phoneInput ?? null,
          role: roleInput ?? null,
        },
      });
      farmWorkerId = fw.id;
    }

    await prisma.worker.create({
      data: {
        cycleId,
        name,
        phone,
        role,
        hiredAt: startDate,
        monthlySalary,
        farmWorkerId,
      },
    });

    const mapped = await loadMappedCycle(cycleId);
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة العامل", error: error.message });
  }
});

app.post("/api/workers/:workerId/expenses", async (req, res) => {
  try {
    const { workerId } = req.params;
    const amount = Number(req.body?.amount);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const description = req.body?.description?.trim() || null;
    const rawCategory = req.body?.category?.trim();
    const allowed = ["سلف", "صرف", "خصم", "أخرى"];
    const category = rawCategory && allowed.includes(rawCategory) ? rawCategory : "صرف";

    if (Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "مبلغ خصم العامل يجب أن يكون أكبر من صفر" });
    }

    const worker = await prisma.worker.findUnique({
      where: { id: workerId },
      include: { cycle: { select: { farmId: true } } },
    });
    if (!worker) return res.status(404).json({ message: "العامل غير موجود" });

    await prisma.workerExpense.create({
      data: {
        cycleId: worker.cycleId,
        workerId,
        amount,
        date,
        description,
        category,
      },
    });
    const treasuryEntry = await prisma.treasuryEntry.create({
      data: {
        farmId: worker.cycle.farmId,
        type: "WITHDRAW",
        amount,
        personName: worker.name || null,
        notes: `حركة عامل - ${category}${description ? ` - ${description}` : ""}`,
        date,
      },
    });

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: worker.cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
      },
    });

    const mapped = mapCycle(updatedCycle);
    mapped.treasuryEntry = treasuryEntry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة خصم العامل", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/sales", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const traderInput = req.body?.trader?.trim() || null;
    const traderIdInput = req.body?.traderId?.trim() || null;
    const brokerInput = req.body?.broker?.trim() || null;
    const brokerIdInput = req.body?.brokerId?.trim() || null;
    const phone = req.body?.phone?.trim() || null;
    const pricePerKg = Number(req.body?.pricePerKg);
    const paidAmount = Number(req.body?.paidAmount ?? 0);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    if (Number.isNaN(pricePerKg) || pricePerKg <= 0) {
      return res.status(400).json({ message: "سعر الكيلو يجب أن يكون أكبر من صفر" });
    }
    if (entries.length === 0) {
      return res.status(400).json({ message: "أدخل وزن واحد على الأقل" });
    }

    const normalizedEntries = entries.map((entry) => {
      const emptyWeight = Number(entry.emptyWeight);
      const fullWeight = Number(entry.fullWeight);
      const cages = Number(entry.cages ?? 0);
      if (Number.isNaN(emptyWeight) || Number.isNaN(fullWeight) || fullWeight < emptyWeight) {
        throw new Error("بيانات الوزن غير صحيحة");
      }
      const netWeight = fullWeight - emptyWeight;
      const totalPrice = netWeight * pricePerKg;
      const rawBird = entry.birdCount != null ? Number(entry.birdCount) : NaN;
      const manualBirdCount =
        !Number.isNaN(rawBird) && rawBird >= 1 ? Math.max(1, Math.floor(rawBird)) : null;
      return { emptyWeight, fullWeight, cages, netWeight, totalPrice, manualBirdCount };
    });

    const totalNetWeight = normalizedEntries.reduce((sum, entry) => sum + entry.netWeight, 0);
    const totalAmount = normalizedEntries.reduce((sum, entry) => sum + entry.totalPrice, 0);
    const remainingAmount = totalAmount - (Number.isNaN(paidAmount) ? 0 : paidAmount);

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        weightEntries: {
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة بيع لدورة منتهية" });

    const averageWeightForSale = Number(cycle.weightEntries?.[0]?.averageWeight || 0);
    const needsEstimateForAnyRow = normalizedEntries.some(
      (e) => e.netWeight > 0 && (e.manualBirdCount == null || e.manualBirdCount < 1),
    );
    if (needsEstimateForAnyRow && (!averageWeightForSale || averageWeightForSale <= 0)) {
      return res.status(400).json({
        message:
          "سجّل متوسط وزن الدجاج قبل البيع، أو أدخل «عدد الفرخ» يدويًا بجانب كل وزن ممتلئ لخصم المخزون بدون الاعتماد على المتوسط",
      });
    }

    const saleEntriesWithBirdCount = normalizedEntries.map((entry) => {
      const estimatedBirdCount =
        entry.netWeight > 0 && averageWeightForSale > 0
          ? Math.max(1, Math.round(entry.netWeight / averageWeightForSale))
          : 0;
      const birdCount =
        entry.manualBirdCount != null && entry.manualBirdCount >= 1
          ? entry.manualBirdCount
          : estimatedBirdCount;
      return { ...entry, birdCount };
    });
    const totalSoldBirdsForSale = saleEntriesWithBirdCount.reduce((sum, entry) => sum + entry.birdCount, 0);
    const mappedCycleBeforeSale = mapCycle(cycle);
    if (totalSoldBirdsForSale > mappedCycleBeforeSale.currentChickenCount) {
      return res.status(400).json({
        message: `العدد المباع (${totalSoldBirdsForSale}) أكبر من المتاح في المخزون (${mappedCycleBeforeSale.currentChickenCount})`,
      });
    }

    if (!traderIdInput && !traderInput) {
      return res.status(400).json({ message: "أدخل اسم التاجر أو اختره من القائمة قبل حفظ البيع" });
    }

    let trader = traderInput;
    let traderId = null;
    if (traderIdInput) {
      const linked = await prisma.trader.findFirst({
        where: { id: traderIdInput, farmId: cycle.farmId },
      });
      if (!linked) {
        return res.status(400).json({ message: "التاجر المحدد غير موجود لهذه المزرعة" });
      }
      traderId = linked.id;
      trader = linked.name;
    } else if (traderInput) {
      const upserted = await prisma.trader.upsert({
        where: { farmId_name: { farmId: cycle.farmId, name: traderInput } },
        create: { farmId: cycle.farmId, name: traderInput, phone: phone || null },
        update: phone ? { phone } : {},
      });
      traderId = upserted.id;
      trader = upserted.name;
    }

    let broker = brokerInput;
    let brokerId = null;
    if (brokerIdInput) {
      const linkedBr = await prisma.broker.findFirst({
        where: { id: brokerIdInput, farmId: cycle.farmId },
      });
      if (!linkedBr) {
        return res.status(400).json({ message: "السمسار المحدد غير موجود لهذه المزرعة" });
      }
      brokerId = linkedBr.id;
      broker = linkedBr.name;
    } else if (brokerInput) {
      const upsertedBr = await prisma.broker.upsert({
        where: { farmId_name: { farmId: cycle.farmId, name: brokerInput } },
        create: { farmId: cycle.farmId, name: brokerInput, phone: null },
        update: {},
      });
      brokerId = upsertedBr.id;
      broker = upsertedBr.name;
    } else {
      broker = null;
      brokerId = null;
    }

    await prisma.sale.create({
      data: {
        cycleId,
        date,
        trader,
        traderId,
        broker,
        brokerId,
        phone,
        pricePerKg,
        totalNetWeight,
        totalAmount,
        paidAmount: Number.isNaN(paidAmount) ? 0 : paidAmount,
        remainingAmount,
        customerName: trader,
        saleWeightEntries: {
          create: saleEntriesWithBirdCount.map((entry) => ({
            cycleId,
            emptyWeight: entry.emptyWeight,
            fullWeight: entry.fullWeight,
            cages: entry.cages,
            netWeight: entry.netWeight,
            weightKg: entry.netWeight,
            unitPrice: pricePerKg,
            totalPrice: entry.totalPrice,
            birdCount: entry.birdCount,
          })),
        },
      },
    });
    const normalizedPaidAmount = Number.isNaN(paidAmount) ? 0 : paidAmount;
    const treasuryEntry =
      normalizedPaidAmount > 0
        ? await prisma.treasuryEntry.create({
            data: {
              farmId: cycle.farmId,
              type: "DEPOSIT",
              amount: normalizedPaidAmount,
              personName: trader || null,
              notes: `مدفوع بيع${trader ? ` - ${trader}` : ""}`,
              date,
            },
          })
        : null;

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        weightEntries: { orderBy: { date: "desc" } },
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
      },
    });

    const mapped = mapCycle(updatedCycle);
    if (treasuryEntry) mapped.treasuryEntry = treasuryEntry;
    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة البيع", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/daily-consumption", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const feedUnit = req.body?.feedUnit === "bags" ? "bags" : "kg";
    const rawAmount = Number(req.body?.feedConsumed);

    if (Number.isNaN(rawAmount) || rawAmount <= 0) {
      return res.status(400).json({ message: "كمية العلف المستهلك يجب أن تكون أكبر من صفر" });
    }

    let feedKg;
    let consumptionBags = null;
    if (feedUnit === "bags") {
      consumptionBags = rawAmount;
      feedKg = rawAmount * CONSUMPTION_BAG_KG;
    } else {
      feedKg = rawAmount;
    }

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة استهلاك لدورة منتهية" });

    await prisma.dailyConsumption.upsert({
      where: {
        cycleId_date: {
          cycleId,
          date,
        },
      },
      create: {
        cycleId,
        date,
        feedKg,
        consumptionBags,
      },
      update: {
        feedKg,
        consumptionBags,
      },
    });

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
        weightEntries: { orderBy: { date: "desc" } },
      },
    });

    return res.status(201).json(mapCycle(updatedCycle));
  } catch (error) {
    return res.status(500).json({ message: "تعذر إضافة الاستهلاك اليومي", error: error.message });
  }
});

app.post("/api/cycles/:cycleId/weights", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const groupBirdCount = req.body?.groupBirdCount != null ? Number(req.body.groupBirdCount) : null;
    const groupTotalWeightKg =
      req.body?.groupTotalWeightKg != null ? Number(req.body.groupTotalWeightKg) : null;
    let averageWeight = Number(req.body?.averageWeight);

    const hasGroup =
      !Number.isNaN(groupBirdCount) &&
      groupBirdCount > 0 &&
      !Number.isNaN(groupTotalWeightKg) &&
      groupTotalWeightKg > 0;
    if (hasGroup) {
      averageWeight = groupTotalWeightKg / groupBirdCount;
    }

    if (Number.isNaN(averageWeight) || averageWeight <= 0) {
      return res.status(400).json({ message: "متوسط الوزن يجب أن يكون أكبر من صفر" });
    }

    const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });
    if (cycle.endDate) return res.status(400).json({ message: "لا يمكن إضافة وزن لدورة منتهية" });

    await prisma.weightEntry.create({
      data: {
        cycleId,
        date,
        averageWeight,
        groupBirdCount: hasGroup ? Math.round(groupBirdCount) : null,
        groupTotalWeightKg: hasGroup ? groupTotalWeightKg : null,
      },
    });

    const updatedCycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        chickArrivals: true,
        mortalities: true,
        feeds: { include: { linkedSupplier: true } },
        gases: true,
        solars: true,
        expenses: true,
        medications: true,
        workers: { include: { farmWorker: true } },
        workerExpenses: true,
        sales: { include: { saleWeightEntries: true, linkedTrader: true, linkedBroker: true } },
        saleWeightEntries: true,
        dailyConsumptions: { orderBy: { date: "desc" } },
        weightEntries: { orderBy: { date: "desc" } },
      },
    });

    return res.status(201).json(mapCycle(updatedCycle));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حفظ وزن الدجاج", error: error.message });
  }
});

app.get("/api/cycles/:cycleId/inventory", async (req, res) => {
  try {
    const { cycleId } = req.params;
    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: {
        feeds: { include: { linkedSupplier: true } },
        dailyConsumptions: true,
        medications: true,
      },
    });
    if (!cycle) return res.status(404).json({ message: "الدورة غير موجودة" });

    const mapped = mapCycle(cycle);
    return res.json({
      cycleId,
      feedStockKg: mapped.feedStockKg,
      medicationStockQuantity: mapped.medicationStockQuantity,
      medications: mapped.medicationStockItems,
    });
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحميل المخزون", error: error.message });
  }
});

app.patch("/api/chick-arrivals/:arrivalId", async (req, res) => {
  try {
    const { arrivalId } = req.params;
    const existing = await prisma.chickArrival.findUnique({ where: { id: arrivalId } });
    if (!existing) return res.status(404).json({ message: "شحنة الكتاكيت غير موجودة" });
    const count =
      req.body?.count !== undefined && req.body?.count !== null && req.body?.count !== ""
        ? Number(req.body.count)
        : existing.count;
    const arrivalDate = req.body?.arrivalDate ? new Date(req.body.arrivalDate) : undefined;
    const hasTotalCostKey = Object.prototype.hasOwnProperty.call(req.body || {}, "totalCost");
    const totalCostPatch = hasTotalCostKey ? Math.max(0, Number(req.body.totalCost ?? 0)) : undefined;
    if (Number.isNaN(count) || count <= 0) return res.status(400).json({ message: "عدد الكتاكيت غير صحيح" });
    if (hasTotalCostKey && Number.isNaN(totalCostPatch)) {
      return res.status(400).json({ message: "قيمة التكلفة غير صحيحة" });
    }
    await prisma.chickArrival.update({
      where: { id: arrivalId },
      data: {
        count,
        ...(arrivalDate ? { arrivalDate } : {}),
        ...(hasTotalCostKey ? { totalCost: totalCostPatch } : {}),
      },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث شحنة الكتاكيت", error: error.message });
  }
});

app.delete("/api/chick-arrivals/:arrivalId", async (req, res) => {
  try {
    const { arrivalId } = req.params;
    const existing = await prisma.chickArrival.findUnique({ where: { id: arrivalId } });
    if (!existing) return res.status(404).json({ message: "شحنة الكتاكيت غير موجودة" });
    const cycle = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const removedTreasuryEntryIds = await removeLinkedPurchaseTreasuryEntries({
      farmId: cycle?.farmId,
      amount: existing.totalCost,
      date: existing.arrivalDate,
      personName: null,
      notesPrefix: "شراء كتاكيت",
    });
    await prisma.chickArrival.delete({ where: { id: arrivalId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(await attachPurchaseDeleteMeta(mapped, existing.cycleId, removedTreasuryEntryIds));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف شحنة الكتاكيت", error: error.message });
  }
});

app.patch("/api/mortalities/:mortalityId", async (req, res) => {
  try {
    const { mortalityId } = req.params;
    const count = Number(req.body?.count);
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    const reason = req.body?.reason === undefined ? undefined : req.body?.reason?.trim() || null;
    if (Number.isNaN(count) || count <= 0) return res.status(400).json({ message: "عدد النفوق غير صحيح" });
    const existing = await prisma.mortality.findUnique({ where: { id: mortalityId } });
    if (!existing) return res.status(404).json({ message: "سجل النفوق غير موجود" });
    await prisma.mortality.update({
      where: { id: mortalityId },
      data: { count, ...(date ? { date } : {}), ...(reason !== undefined ? { reason } : {}) },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث سجل النفوق", error: error.message });
  }
});

app.delete("/api/mortalities/:mortalityId", async (req, res) => {
  try {
    const { mortalityId } = req.params;
    const existing = await prisma.mortality.findUnique({ where: { id: mortalityId } });
    if (!existing) return res.status(404).json({ message: "سجل النفوق غير موجود" });
    await prisma.mortality.delete({ where: { id: mortalityId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف سجل النفوق", error: error.message });
  }
});

app.patch("/api/feeds/:feedId", async (req, res) => {
  try {
    const { feedId } = req.params;
    const quantity = Number(req.body?.quantity);
    const pricePerTon = Number(req.body?.pricePerTon);
    const feedType = req.body?.feedType === "ton" ? "ton" : "bags";
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    const supplier = req.body?.supplier === undefined ? undefined : req.body?.supplier?.trim() || null;
    if (Number.isNaN(quantity) || quantity <= 0) return res.status(400).json({ message: "الكمية غير صحيحة" });
    if (Number.isNaN(pricePerTon) || pricePerTon < 0) return res.status(400).json({ message: "سعر الطن غير صحيح" });
    const existing = await prisma.feed.findUnique({ where: { id: feedId } });
    if (!existing) return res.status(404).json({ message: "سجل العلف غير موجود" });
    const quantityKg = feedType === "ton" ? quantity * 1000 : quantity * 50;
    const totalCost = (quantityKg / 1000) * pricePerTon;
    await prisma.feed.update({
      where: { id: feedId },
      data: {
        quantity,
        feedType,
        pricePerTon,
        quantityKg,
        unitPrice: pricePerTon,
        totalCost,
        ...(date ? { date } : {}),
        ...(supplier !== undefined ? { supplier } : {}),
      },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث سجل العلف", error: error.message });
  }
});

app.delete("/api/feeds/:feedId", async (req, res) => {
  try {
    const { feedId } = req.params;
    const existing = await prisma.feed.findUnique({ where: { id: feedId } });
    if (!existing) return res.status(404).json({ message: "سجل العلف غير موجود" });
    const cycle = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const removedTreasuryEntryIds = await removeLinkedPurchaseTreasuryEntries({
      farmId: cycle?.farmId,
      amount: existing.totalCost,
      date: existing.date,
      personName: existing.supplier,
      notesPrefix: "شراء علف",
    });
    await prisma.feed.delete({ where: { id: feedId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(await attachPurchaseDeleteMeta(mapped, existing.cycleId, removedTreasuryEntryIds));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف سجل العلف", error: error.message });
  }
});

app.patch("/api/gases/:gasId", async (req, res) => {
  try {
    const { gasId } = req.params;
    const count = Number(req.body?.count);
    const cost = Number(req.body?.cost);
    const gasType = req.body?.gasType === "صغير" ? "صغير" : "كبير";
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    if (Number.isNaN(count) || count <= 0) return res.status(400).json({ message: "عدد أسطوانات الغاز غير صحيح" });
    if (Number.isNaN(cost) || cost < 0) return res.status(400).json({ message: "تكلفة الغاز غير صحيحة" });
    const existing = await prisma.gas.findUnique({ where: { id: gasId } });
    if (!existing) return res.status(404).json({ message: "سجل الغاز غير موجود" });
    await prisma.gas.update({
      where: { id: gasId },
      data: { count, cost, gasType, quantity: count, totalCost: cost, ...(date ? { date } : {}) },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث سجل الغاز", error: error.message });
  }
});

app.delete("/api/gases/:gasId", async (req, res) => {
  try {
    const { gasId } = req.params;
    const existing = await prisma.gas.findUnique({ where: { id: gasId } });
    if (!existing) return res.status(404).json({ message: "سجل الغاز غير موجود" });
    const cycle = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const removedTreasuryEntryIds = await removeLinkedPurchaseTreasuryEntries({
      farmId: cycle?.farmId,
      amount: existing.cost,
      date: existing.date,
      personName: null,
      notesPrefix: "شراء غاز",
    });
    await prisma.gas.delete({ where: { id: gasId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(await attachPurchaseDeleteMeta(mapped, existing.cycleId, removedTreasuryEntryIds));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف سجل الغاز", error: error.message });
  }
});

app.patch("/api/solars/:solarId", async (req, res) => {
  try {
    const { solarId } = req.params;
    const liters = Number(req.body?.liters);
    const cost = Number(req.body?.cost);
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    if (Number.isNaN(liters) || liters <= 0) return res.status(400).json({ message: "كمية السولار غير صحيحة" });
    if (Number.isNaN(cost) || cost < 0) return res.status(400).json({ message: "تكلفة السولار غير صحيحة" });
    const existing = await prisma.solar.findUnique({ where: { id: solarId } });
    if (!existing) return res.status(404).json({ message: "سجل السولار غير موجود" });
    await prisma.solar.update({
      where: { id: solarId },
      data: { liters, cost, kwhGenerated: liters, maintenanceCost: cost, ...(date ? { date } : {}) },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث سجل السولار", error: error.message });
  }
});

app.delete("/api/solars/:solarId", async (req, res) => {
  try {
    const { solarId } = req.params;
    const existing = await prisma.solar.findUnique({ where: { id: solarId } });
    if (!existing) return res.status(404).json({ message: "سجل السولار غير موجود" });
    const cycle = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const removedTreasuryEntryIds = await removeLinkedPurchaseTreasuryEntries({
      farmId: cycle?.farmId,
      amount: existing.cost,
      date: existing.date,
      personName: null,
      notesPrefix: "شراء سولار",
    });
    await prisma.solar.delete({ where: { id: solarId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(await attachPurchaseDeleteMeta(mapped, existing.cycleId, removedTreasuryEntryIds));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف سجل السولار", error: error.message });
  }
});

app.patch("/api/expenses/:expenseId", async (req, res) => {
  try {
    const { expenseId } = req.params;
    const title = String(req.body?.title || "").trim();
    const amount = Number(req.body?.amount);
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    if (!title) return res.status(400).json({ message: "اسم المصروف مطلوب" });
    if (Number.isNaN(amount) || amount <= 0) return res.status(400).json({ message: "المبلغ غير صحيح" });
    const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!existing) return res.status(404).json({ message: "سجل المصروف غير موجود" });
    await prisma.expense.update({
      where: { id: expenseId },
      data: { title, amount, ...(date ? { date } : {}) },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث المصروف", error: error.message });
  }
});

app.delete("/api/expenses/:expenseId", async (req, res) => {
  try {
    const { expenseId } = req.params;
    const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!existing) return res.status(404).json({ message: "سجل المصروف غير موجود" });
    const cycle = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const removedTreasuryEntryIds = await removeLinkedPurchaseTreasuryEntries({
      farmId: cycle?.farmId,
      amount: existing.amount,
      date: existing.date,
      personName: null,
      notesPrefix: "مصروف",
    });
    await prisma.expense.delete({ where: { id: expenseId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(await attachPurchaseDeleteMeta(mapped, existing.cycleId, removedTreasuryEntryIds));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف المصروف", error: error.message });
  }
});

app.patch("/api/medications/:medicationId", async (req, res) => {
  try {
    const { medicationId } = req.params;
    const name = String(req.body?.name || "").trim();
    const quantity = Number(req.body?.quantity);
    const totalCost = Number(req.body?.totalCost);
    const supplier = req.body?.supplier === undefined ? undefined : req.body?.supplier?.trim() || null;
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    if (!name) return res.status(400).json({ message: "اسم العلاج مطلوب" });
    if (Number.isNaN(quantity) || quantity <= 0) return res.status(400).json({ message: "كمية العلاج غير صحيحة" });
    if (Number.isNaN(totalCost) || totalCost < 0) return res.status(400).json({ message: "تكلفة العلاج غير صحيحة" });
    const existing = await prisma.medication.findUnique({ where: { id: medicationId } });
    if (!existing) return res.status(404).json({ message: "سجل العلاج غير موجود" });
    const unitPrice = quantity > 0 ? totalCost / quantity : 0;
    await prisma.medication.update({
      where: { id: medicationId },
      data: { name, quantity, totalCost, unitPrice, ...(date ? { date } : {}), ...(supplier !== undefined ? { supplier } : {}) },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث العلاج", error: error.message });
  }
});

app.delete("/api/medications/:medicationId", async (req, res) => {
  try {
    const { medicationId } = req.params;
    const existing = await prisma.medication.findUnique({ where: { id: medicationId } });
    if (!existing) return res.status(404).json({ message: "سجل العلاج غير موجود" });
    const cycle = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const removedTreasuryEntryIds = await removeLinkedPurchaseTreasuryEntries({
      farmId: cycle?.farmId,
      amount: existing.totalCost,
      date: existing.date,
      personName: existing.supplier,
      notesPrefix: "شراء علاج",
    });
    await prisma.medication.delete({ where: { id: medicationId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(await attachPurchaseDeleteMeta(mapped, existing.cycleId, removedTreasuryEntryIds));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف العلاج", error: error.message });
  }
});

app.patch("/api/workers/:workerId", async (req, res) => {
  try {
    const { workerId } = req.params;
    const name = String(req.body?.name || "").trim();
    const monthlySalary = Number(req.body?.monthlySalary);
    const hiredAt = req.body?.hiredAt ? new Date(req.body.hiredAt) : undefined;
    if (!name) return res.status(400).json({ message: "اسم العامل مطلوب" });
    if (Number.isNaN(monthlySalary) || monthlySalary <= 0) return res.status(400).json({ message: "راتب العامل غير صحيح" });
    const existing = await prisma.worker.findUnique({ where: { id: workerId } });
    if (!existing) return res.status(404).json({ message: "العامل غير موجود" });
    await prisma.worker.update({
      where: { id: workerId },
      data: { name, monthlySalary, ...(hiredAt ? { hiredAt } : {}) },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث بيانات العامل", error: error.message });
  }
});

app.delete("/api/workers/:workerId", async (req, res) => {
  try {
    const { workerId } = req.params;
    const existing = await prisma.worker.findUnique({ where: { id: workerId } });
    if (!existing) return res.status(404).json({ message: "العامل غير موجود" });
    await prisma.worker.delete({ where: { id: workerId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف العامل", error: error.message });
  }
});

app.patch("/api/worker-expenses/:workerExpenseId", async (req, res) => {
  try {
    const { workerExpenseId } = req.params;
    const amount = Number(req.body?.amount);
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    const description = req.body?.description === undefined ? undefined : req.body?.description?.trim() || null;
    const rawCategory = req.body?.category?.trim();
    const allowed = ["سلف", "صرف", "خصم", "أخرى"];
    const category =
      rawCategory && allowed.includes(rawCategory)
        ? rawCategory
        : undefined;
    if (Number.isNaN(amount) || amount <= 0) return res.status(400).json({ message: "مبلغ الخصم غير صحيح" });
    const existing = await prisma.workerExpense.findUnique({ where: { id: workerExpenseId } });
    if (!existing) return res.status(404).json({ message: "سجل الخصم غير موجود" });
    await prisma.workerExpense.update({
      where: { id: workerExpenseId },
      data: {
        amount,
        ...(date ? { date } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(category ? { category } : {}),
      },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث خصم العامل", error: error.message });
  }
});

app.delete("/api/worker-expenses/:workerExpenseId", async (req, res) => {
  try {
    const { workerExpenseId } = req.params;
    const existing = await prisma.workerExpense.findUnique({ where: { id: workerExpenseId } });
    if (!existing) return res.status(404).json({ message: "سجل الخصم غير موجود" });
    await prisma.workerExpense.delete({ where: { id: workerExpenseId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف خصم العامل", error: error.message });
  }
});

app.patch("/api/sales/:saleId", async (req, res) => {
  try {
    const { saleId } = req.params;
    const existing = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!existing) return res.status(404).json({ message: "سجل البيع غير موجود" });

    const pricePerKg = Number(req.body?.pricePerKg);
    const paidAmount = Number(req.body?.paidAmount ?? existing.paidAmount ?? 0);
    if (Number.isNaN(pricePerKg) || pricePerKg <= 0) {
      return res.status(400).json({ message: "سعر الكيلو غير صحيح" });
    }

    const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
    let totalNetWeight = Number(existing.totalNetWeight || 0);
    let totalAmount = Number(existing.totalAmount || 0);
    let entriesPayload = null;

    if (entries && entries.length > 0) {
      const cycleForWeights = await prisma.cycle.findUnique({
        where: { id: existing.cycleId },
        include: {
          weightEntries: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      });
      const averageWeightForPatch = Number(cycleForWeights?.weightEntries?.[0]?.averageWeight || 0);
      const rowsNormalized = entries.map((entry) => {
        const emptyWeight = Number(entry.emptyWeight);
        const fullWeight = Number(entry.fullWeight);
        const cages = Number(entry.cages ?? 0);
        if (Number.isNaN(emptyWeight) || Number.isNaN(fullWeight) || fullWeight < emptyWeight) {
          throw new Error("بيانات الوزن غير صحيحة");
        }
        const netWeight = fullWeight - emptyWeight;
        const rawBird = entry.birdCount != null ? Number(entry.birdCount) : NaN;
        const manualBirdCount =
          !Number.isNaN(rawBird) && rawBird >= 1 ? Math.max(1, Math.floor(rawBird)) : null;
        return { emptyWeight, fullWeight, cages, netWeight, manualBirdCount };
      });
      const needsEstimate = rowsNormalized.some(
        (e) => e.netWeight > 0 && (e.manualBirdCount == null || e.manualBirdCount < 1),
      );
      if (needsEstimate && (!averageWeightForPatch || averageWeightForPatch <= 0)) {
        return res.status(400).json({
          message:
            "لا يمكن حفظ الأوزان بدون متوسط وزن مسجّل أو إدخال عدد فرخ لكل سطر يدويًا",
        });
      }
      entriesPayload = rowsNormalized.map((entry) => {
        const estimatedBirdCount =
          entry.netWeight > 0 && averageWeightForPatch > 0
            ? Math.max(1, Math.round(entry.netWeight / averageWeightForPatch))
            : 0;
        const birdCount =
          entry.manualBirdCount != null && entry.manualBirdCount >= 1
            ? entry.manualBirdCount
            : estimatedBirdCount;
        return {
          cycleId: existing.cycleId,
          emptyWeight: entry.emptyWeight,
          fullWeight: entry.fullWeight,
          cages: entry.cages,
          netWeight: entry.netWeight,
          weightKg: entry.netWeight,
          unitPrice: pricePerKg,
          totalPrice: entry.netWeight * pricePerKg,
          birdCount,
        };
      });
      totalNetWeight = entriesPayload.reduce((sum, item) => sum + Number(item.netWeight || 0), 0);
      totalAmount = entriesPayload.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    }

    const remainingAmount = totalAmount - (Number.isNaN(paidAmount) ? 0 : paidAmount);

    const cycleRow = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const farmId = cycleRow.farmId;

    let trader = existing.trader;
    let traderId = existing.traderId;
    if (req.body?.trader !== undefined || req.body?.traderId !== undefined) {
      const traderIdInput = req.body?.traderId ? String(req.body.traderId).trim() : null;
      const traderInput =
        req.body?.trader !== undefined ? String(req.body?.trader || "").trim() || null : existing.trader;
      traderId = null;
      if (traderIdInput) {
        const linked = await prisma.trader.findFirst({ where: { id: traderIdInput, farmId } });
        if (!linked) return res.status(400).json({ message: "التاجر المحدد غير موجود لهذه المزرعة" });
        traderId = linked.id;
        trader = linked.name;
      } else if (traderInput) {
        const phoneVal =
          req.body?.phone !== undefined ? String(req.body?.phone || "").trim() || null : existing.phone;
        const upserted = await prisma.trader.upsert({
          where: { farmId_name: { farmId, name: traderInput } },
          create: { farmId, name: traderInput, phone: phoneVal },
          update: req.body?.phone !== undefined ? { phone: phoneVal } : {},
        });
        traderId = upserted.id;
        trader = upserted.name;
      } else {
        trader = null;
        traderId = null;
      }
    }

    let broker = existing.broker;
    let brokerId = existing.brokerId ?? null;
    if (req.body?.broker !== undefined || req.body?.brokerId !== undefined) {
      const brokerIdInput = req.body?.brokerId ? String(req.body.brokerId).trim() : null;
      const brokerInput =
        req.body?.broker !== undefined ? String(req.body?.broker || "").trim() || null : existing.broker;
      brokerId = null;
      if (brokerIdInput) {
        const linkedBr = await prisma.broker.findFirst({ where: { id: brokerIdInput, farmId } });
        if (!linkedBr) return res.status(400).json({ message: "السمسار المحدد غير موجود لهذه المزرعة" });
        brokerId = linkedBr.id;
        broker = linkedBr.name;
      } else if (brokerInput) {
        const upsertedBr = await prisma.broker.upsert({
          where: { farmId_name: { farmId, name: brokerInput } },
          create: { farmId, name: brokerInput, phone: null },
          update: {},
        });
        brokerId = upsertedBr.id;
        broker = upsertedBr.name;
      } else {
        broker = null;
        brokerId = null;
      }
    }

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        date: req.body?.date ? new Date(req.body.date) : existing.date,
        trader,
        traderId,
        broker,
        brokerId,
        phone: req.body?.phone === undefined ? existing.phone : String(req.body?.phone || "").trim() || null,
        pricePerKg,
        totalNetWeight,
        totalAmount,
        paidAmount: Number.isNaN(paidAmount) ? 0 : paidAmount,
        remainingAmount,
        customerName: trader,
        ...(entriesPayload
          ? {
              saleWeightEntries: {
                deleteMany: {},
                create: entriesPayload,
              },
            }
          : {}),
      },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث البيع", error: error.message });
  }
});

app.delete("/api/sales/:saleId", async (req, res) => {
  try {
    const { saleId } = req.params;
    const existing = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!existing) return res.status(404).json({ message: "سجل البيع غير موجود" });
    const cycle = await prisma.cycle.findUnique({
      where: { id: existing.cycleId },
      select: { farmId: true },
    });
    const removedTreasuryEntryIds = await removeLinkedSaleTreasuryEntries({
      farmId: cycle?.farmId,
      amount: existing.paidAmount,
      date: existing.date,
      traderName: existing.trader,
    });
    await prisma.sale.delete({ where: { id: saleId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(await attachPurchaseDeleteMeta(mapped, existing.cycleId, removedTreasuryEntryIds));
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف سجل البيع", error: error.message });
  }
});

app.patch("/api/daily-consumptions/:consumptionId", async (req, res) => {
  try {
    const { consumptionId } = req.params;
    const rawAmount = Number(req.body?.feedConsumed);
    const feedUnit = req.body?.feedUnit === "bags" ? "bags" : "kg";
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    if (Number.isNaN(rawAmount) || rawAmount <= 0) {
      return res.status(400).json({ message: "كمية الاستهلاك غير صحيحة" });
    }
    const feedKg = feedUnit === "bags" ? rawAmount * CONSUMPTION_BAG_KG : rawAmount;
    const consumptionBags = feedUnit === "bags" ? rawAmount : null;
    const existing = await prisma.dailyConsumption.findUnique({ where: { id: consumptionId } });
    if (!existing) return res.status(404).json({ message: "سجل الاستهلاك غير موجود" });
    await prisma.dailyConsumption.update({
      where: { id: consumptionId },
      data: { feedKg, consumptionBags, ...(date ? { date } : {}) },
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث الاستهلاك اليومي", error: error.message });
  }
});

app.delete("/api/daily-consumptions/:consumptionId", async (req, res) => {
  try {
    const { consumptionId } = req.params;
    const existing = await prisma.dailyConsumption.findUnique({ where: { id: consumptionId } });
    if (!existing) return res.status(404).json({ message: "سجل الاستهلاك غير موجود" });
    await prisma.dailyConsumption.delete({ where: { id: consumptionId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف الاستهلاك اليومي", error: error.message });
  }
});

app.patch("/api/weight-entries/:weightEntryId", async (req, res) => {
  try {
    const { weightEntryId } = req.params;
    const groupBirdCount = req.body?.groupBirdCount != null ? Number(req.body.groupBirdCount) : null;
    const groupTotalWeightKg =
      req.body?.groupTotalWeightKg != null ? Number(req.body.groupTotalWeightKg) : null;
    let averageWeight = Number(req.body?.averageWeight);
    const hasGroup =
      !Number.isNaN(groupBirdCount) &&
      groupBirdCount > 0 &&
      !Number.isNaN(groupTotalWeightKg) &&
      groupTotalWeightKg > 0;
    if (hasGroup) {
      averageWeight = groupTotalWeightKg / groupBirdCount;
    }
    const date = req.body?.date ? new Date(req.body.date) : undefined;
    if (Number.isNaN(averageWeight) || averageWeight <= 0) {
      return res.status(400).json({ message: "متوسط الوزن غير صحيح" });
    }
    const existing = await prisma.weightEntry.findUnique({ where: { id: weightEntryId } });
    if (!existing) return res.status(404).json({ message: "سجل الوزن غير موجود" });
    const data = { averageWeight, ...(date ? { date } : {}) };
    if (hasGroup) {
      data.groupBirdCount = Math.round(groupBirdCount);
      data.groupTotalWeightKg = groupTotalWeightKg;
    }
    await prisma.weightEntry.update({
      where: { id: weightEntryId },
      data,
    });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث سجل الوزن", error: error.message });
  }
});

app.delete("/api/weight-entries/:weightEntryId", async (req, res) => {
  try {
    const { weightEntryId } = req.params;
    const existing = await prisma.weightEntry.findUnique({ where: { id: weightEntryId } });
    if (!existing) return res.status(404).json({ message: "سجل الوزن غير موجود" });
    await prisma.weightEntry.delete({ where: { id: weightEntryId } });
    const mapped = await loadMappedCycle(existing.cycleId);
    return res.json(mapped);
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف سجل الوزن", error: error.message });
  }
});

app.patch("/api/farms/:farmId/suppliers/:supplierId", async (req, res) => {
  try {
    const { farmId, supplierId } = req.params;
    const name = String(req.body?.name || "").trim();
    const phone = req.body?.phone?.trim() || null;
    if (!name) return res.status(400).json({ message: "اسم المورد مطلوب" });
    const existing = await prisma.supplier.findFirst({ where: { id: supplierId, farmId } });
    if (!existing) return res.status(404).json({ message: "المورد غير موجود" });
    const supplier = await prisma.supplier.update({
      where: { id: supplierId },
      data: { name, phone },
    });
    return res.json(supplier);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث المورد", error: error.message });
  }
});

app.delete("/api/farms/:farmId/suppliers/:supplierId", async (req, res) => {
  try {
    const { farmId, supplierId } = req.params;
    const existing = await prisma.supplier.findFirst({ where: { id: supplierId, farmId } });
    if (!existing) return res.status(404).json({ message: "المورد غير موجود" });
    await prisma.supplier.delete({ where: { id: supplierId } });
    return res.json({ message: "تم حذف المورد", id: supplierId });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف المورد", error: error.message });
  }
});

app.post("/api/farms/:farmId/traders", async (req, res) => {
  try {
    const { farmId } = req.params;
    const name = req.body?.name?.trim();
    const phone = req.body?.phone?.trim() || null;
    if (!name) {
      return res.status(400).json({ message: "أدخل اسم التاجر" });
    }
    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return res.status(404).json({ message: "المزرعة غير موجودة" });
    }
    const trader = await prisma.trader.create({
      data: { farmId, name, phone },
    });
    return res.status(201).json(trader);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "يوجد تاجر بنفس الاسم في هذه المزرعة" });
    }
    return res.status(500).json({ message: "تعذر إضافة التاجر", error: error.message });
  }
});

app.patch("/api/farms/:farmId/traders/:traderId", async (req, res) => {
  try {
    const { farmId, traderId } = req.params;
    const name = String(req.body?.name || "").trim();
    const phone = req.body?.phone?.trim() || null;
    if (!name) return res.status(400).json({ message: "اسم التاجر مطلوب" });
    const existing = await prisma.trader.findFirst({ where: { id: traderId, farmId } });
    if (!existing) return res.status(404).json({ message: "التاجر غير موجود" });
    const trader = await prisma.trader.update({
      where: { id: traderId },
      data: { name, phone },
    });
    return res.json(trader);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث التاجر", error: error.message });
  }
});

app.delete("/api/farms/:farmId/traders/:traderId", async (req, res) => {
  try {
    const { farmId, traderId } = req.params;
    const existing = await prisma.trader.findFirst({ where: { id: traderId, farmId } });
    if (!existing) return res.status(404).json({ message: "التاجر غير موجود" });
    await prisma.trader.delete({ where: { id: traderId } });
    return res.json({ message: "تم حذف التاجر", id: traderId });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف التاجر", error: error.message });
  }
});

app.post("/api/farms/:farmId/brokers", async (req, res) => {
  try {
    const { farmId } = req.params;
    const name = req.body?.name?.trim();
    const phone = req.body?.phone?.trim() || null;
    if (!name) {
      return res.status(400).json({ message: "أدخل اسم السمسار" });
    }
    const farm = await prisma.farm.findUnique({ where: { id: farmId } });
    if (!farm) {
      return res.status(404).json({ message: "المزرعة غير موجودة" });
    }
    const broker = await prisma.broker.create({
      data: { farmId, name, phone },
    });
    return res.status(201).json(broker);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "يوجد سمسار بنفس الاسم في هذه المزرعة" });
    }
    return res.status(500).json({ message: "تعذر إضافة السمسار", error: error.message });
  }
});

app.patch("/api/farms/:farmId/brokers/:brokerId", async (req, res) => {
  try {
    const { farmId, brokerId } = req.params;
    const name = String(req.body?.name || "").trim();
    const phone = req.body?.phone?.trim() || null;
    if (!name) return res.status(400).json({ message: "اسم السمسار مطلوب" });
    const existing = await prisma.broker.findFirst({ where: { id: brokerId, farmId } });
    if (!existing) return res.status(404).json({ message: "السمسار غير موجود" });
    const broker = await prisma.broker.update({
      where: { id: brokerId },
      data: { name, phone },
    });
    return res.json(broker);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث السمسار", error: error.message });
  }
});

app.delete("/api/farms/:farmId/brokers/:brokerId", async (req, res) => {
  try {
    const { farmId, brokerId } = req.params;
    const existing = await prisma.broker.findFirst({ where: { id: brokerId, farmId } });
    if (!existing) return res.status(404).json({ message: "السمسار غير موجود" });
    await prisma.broker.delete({ where: { id: brokerId } });
    return res.json({ message: "تم حذف السمسار", id: brokerId });
  } catch (error) {
    return res.status(500).json({ message: "تعذر حذف السمسار", error: error.message });
  }
});

app.patch("/api/partners/:partnerId", async (req, res) => {
  try {
    const { partnerId } = req.params;
    const name = String(req.body?.name || "").trim();
    const shareType = req.body?.shareType === "FIXED" ? "FIXED" : "PERCENT";
    const shareValue = Number(req.body?.shareValue);
    if (!name) return res.status(400).json({ message: "اسم الشريك مطلوب" });
    if (Number.isNaN(shareValue) || shareValue <= 0) return res.status(400).json({ message: "قيمة الحصة غير صحيحة" });
    const existing = await prisma.partner.findUnique({ where: { id: partnerId } });
    if (!existing) return res.status(404).json({ message: "الشريك غير موجود" });
    const partner = await prisma.partner.update({
      where: { id: partnerId },
      data: { name, shareType, shareValue },
      include: { farm: true },
    });
    return res.json(partner);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث الشريك", error: error.message });
  }
});

app.patch("/api/supervisors/:supervisorId", async (req, res) => {
  try {
    const { supervisorId } = req.params;
    const name = String(req.body?.name || "").trim();
    const shareType = req.body?.shareType === "FIXED" ? "FIXED" : "PERCENT";
    const shareValue = Number(req.body?.shareValue);
    if (!name) return res.status(400).json({ message: "اسم المشرف مطلوب" });
    if (Number.isNaN(shareValue) || shareValue <= 0) return res.status(400).json({ message: "قيمة الحصة غير صحيحة" });
    const existing = await prisma.supervisor.findUnique({ where: { id: supervisorId } });
    if (!existing) return res.status(404).json({ message: "المشرف غير موجود" });
    const supervisor = await prisma.supervisor.update({
      where: { id: supervisorId },
      data: { name, shareType, shareValue },
      include: { farm: true },
    });
    return res.json(supervisor);
  } catch (error) {
    return res.status(500).json({ message: "تعذر تحديث المشرف", error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

cron.schedule("0 7 * * *", () => {
  runSmartAlertsCheck().catch((error) => {
    console.error("Smart Alerts cron failed:", error.message);
  });
});

cron.schedule("0 2 * * *", () => {
  createDailyBackup().catch((error) => {
    console.error("Daily backup failed:", error.message);
  });
});

runSmartAlertsCheck().catch((error) => {
  console.error("Smart Alerts initial check failed:", error.message);
});

createDailyBackup().catch((error) => {
  console.error("Initial backup failed:", error.message);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
