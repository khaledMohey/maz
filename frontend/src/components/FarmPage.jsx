import { Fragment, useEffect, useMemo, useState } from 'react'
import LargeActionButton from './LargeActionButton'
import LedgerExportButtons from './LedgerExportButtons'
import SequentialPurchaseWizard, { WizardNextButton } from './SequentialPurchaseWizard'
import ColoredMoney from './ui/ColoredMoney'

const CONSUMPTION_BAG_KG = 50
const LOG_TYPE_LABELS = {
  CHICKS: 'الكتاكيت',
  MORTALITY: 'النفوق',
  FEED: 'العلف',
  EXPENSE: 'المصروفات',
  SALE: 'المبيعات',
  MEDICATION: 'العلاج',
  WORKER_EXPENSE: 'حركات العمال',
  CONSUMPTION: 'الاستهلاك',
  WEIGHT: 'الأوزان',
  TREASURY: 'الخزنة',
}

/** YYYY-MM-DD in local calendar (matches <input type="date">). */
function localDateKey(isoOrDate) {
  if (!isoOrDate) return ''
  const x = new Date(isoOrDate)
  if (Number.isNaN(x.getTime())) return ''
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function supplierNamesMatch(left, right) {
  return (left || '').trim() === (right || '').trim()
}

function creditAddMatchesPurchase(add, purchase) {
  const addNotes = String(add.notes || '')
  const sameDay = localDateKey(add.date) === localDateKey(purchase.date)
  const sameAmount = Math.abs(Number(add.amount || 0) - Number(purchase.amount || 0)) < 0.01
  if (!sameDay || !sameAmount) return false
  if (purchase.matchKind === 'feed') return addNotes.startsWith('شراء علف')
  if (purchase.matchKind === 'medication') return addNotes.startsWith('شراء علاج')
  return false
}

function treasuryNoteToItemType(notes) {
  const text = String(notes || '').trim()
  if (!text) return 'شراء آجل'
  if (text.startsWith('شراء علاج')) return text.replace(/^شراء علاج\s*-\s*/, 'علاج — ') || 'علاج'
  if (text.startsWith('شراء علف')) return text.replace(/^شراء علف\s*-\s*/, 'علف — ') || 'علف'
  if (text.startsWith('شراء غاز')) return text.replace(/^شراء غاز\s*-\s*/, 'غاز — ') || 'غاز'
  if (text.startsWith('شراء سولار')) return 'سولار'
  if (text.startsWith('شراء كتاكيت')) return 'كتاكيت'
  if (text.startsWith('مصروف')) return text.replace(/^مصروف\s*-\s*/, 'مصروف — ') || 'مصروف'
  return text
}

function applySupplierPaymentFifo(rows, creditDeducts) {
  let paymentPool = (creditDeducts || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  for (const row of rows) {
    if (!row.isCredit) {
      row.paidAmount = row.amount
      row.remainingAmount = 0
      continue
    }
    const paid = Math.min(paymentPool, row.amount)
    row.paidAmount = paid
    row.remainingAmount = row.amount - paid
    paymentPool -= paid
  }
}

function collectSupplierLedgerRows(supplier, cycles, treasuryEntries = []) {
  const rows = []
  const supplierName = (supplier.name || '').trim()
  const usedCreditAddIds = new Set()

  for (const cy of cycles || []) {
    for (const f of cy.feeds || []) {
      if (f.supplierId === supplier.id || (!f.supplierId && supplierNamesMatch(f.supplier, supplierName))) {
        rows.push({
          id: `feed-${f.id}`,
          itemType: 'علف',
          date: f.date,
          quantityLabel: `${Number(f.quantityKg || 0).toFixed(2)} كجم`,
          amount: Number(f.totalCost || 0),
          matchKind: 'feed',
          createdAt: f.createdAt,
        })
      }
    }
    for (const m of cy.medications || []) {
      if (supplierNamesMatch(m.supplier, supplierName)) {
        rows.push({
          id: `medication-${m.id}`,
          itemType: m.name ? `علاج — ${m.name}` : 'علاج',
          date: m.date,
          quantityLabel: `${Number(m.quantity || 0).toFixed(2)}`,
          amount: Number(m.totalCost || 0),
          matchKind: 'medication',
          createdAt: m.createdAt,
        })
      }
    }
  }

  const creditAdds = []
  const creditDeducts = []
  for (const entry of treasuryEntries || []) {
    if (!supplierNamesMatch(entry.personName, supplierName)) continue
    if (entry.type === 'CREDIT_ADD') creditAdds.push(entry)
    if (entry.type === 'CREDIT_DEDUCT') creditDeducts.push(entry)
  }

  for (const row of rows) {
    const matchedAdd = creditAdds.find(
      (add) => !usedCreditAddIds.has(add.id) && creditAddMatchesPurchase(add, row),
    )
    if (matchedAdd) {
      row.isCredit = true
      usedCreditAddIds.add(matchedAdd.id)
    } else {
      row.isCredit = false
    }
  }

  for (const add of creditAdds) {
    if (usedCreditAddIds.has(add.id)) continue
    const notes = String(add.notes || '')
    if (notes.startsWith('شراء علف') || notes.startsWith('شراء علاج')) continue
    rows.push({
      id: `treasury-${add.id}`,
      itemType: treasuryNoteToItemType(notes),
      date: add.date,
      quantityLabel: '—',
      amount: Number(add.amount || 0),
      isCredit: true,
      createdAt: add.createdAt,
    })
    usedCreditAddIds.add(add.id)
  }

  rows.sort((a, b) => {
    const d = new Date(a.date) - new Date(b.date)
    if (d !== 0) return d
    return new Date(a.createdAt) - new Date(b.createdAt)
  })

  applySupplierPaymentFifo(rows, creditDeducts)
  return rows
}

function deleteSupplierLedgerRow(row, handlers) {
  const { onDeleteFeed, onDeleteMedication, onDeleteTreasuryEntry } = handlers
  if (!row?.id) return { ok: false, message: 'لا يمكن تحديد السطر' }
  if (row.id.startsWith('feed-')) return onDeleteFeed?.(row.id.slice(5))
  if (row.id.startsWith('medication-')) return onDeleteMedication?.(row.id.slice(11))
  if (row.id.startsWith('treasury-')) return onDeleteTreasuryEntry?.(row.id.slice(9))
  return { ok: false, message: 'هذا السطر لا يدعم الحذف من هنا' }
}

function sumSaleWeightEntries(sale) {
  const entries = sale?.saleWeightEntries || []
  return {
    emptyWeight: entries.reduce((sum, entry) => sum + Number(entry.emptyWeight || 0), 0),
    fullWeight: entries.reduce((sum, entry) => sum + Number(entry.fullWeight || 0), 0),
  }
}

function collectTraderSalesRows(trader, cycles) {
  const rows = []
  for (const cy of cycles || []) {
    for (const s of cy.sales || []) {
      if (s.traderId === trader.id || (!s.traderId && (s.trader || '') === trader.name)) {
        const weights = sumSaleWeightEntries(s)
        rows.push({ ...s, ...weights, cycleName: cy.name, cycleEnded: !!cy.endDate })
      }
    }
  }
  return rows.sort((a, b) => {
    const d = new Date(b.date) - new Date(a.date)
    if (d !== 0) return d
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
}

/** دمج سجّل السماسرة من الـ API مع أسماء ظهرت في مبيعات قديمة قبل ربط brokerId */
function buildBrokersLedgerList(apiBrokers, cycles) {
  const byKey = new Map()
  for (const b of apiBrokers || []) {
    byKey.set(`id:${b.id}`, { ...b, ledgerKey: `id:${b.id}` })
  }
  for (const cy of cycles || []) {
    for (const s of cy.sales || []) {
      const bn = (s.broker || '').trim()
      if (!bn) continue
      const k = s.brokerId ? `id:${s.brokerId}` : `name:${bn}`
      if (byKey.has(k)) continue
      if (s.brokerId) {
        byKey.set(k, {
          id: s.brokerId,
          name: bn,
          phone: s.linkedBroker?.phone ?? null,
          ledgerKey: k,
        })
      } else {
        byKey.set(k, { id: null, name: bn, phone: null, ledgerKey: k })
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

function collectBrokerSalesRows(brokerEntry, cycles) {
  const rows = []
  const byId = brokerEntry.id
  const name = (brokerEntry.name || '').trim()
  for (const cy of cycles || []) {
    for (const s of cy.sales || []) {
      const bn = (s.broker || '').trim()
      if (!bn && !s.brokerId) continue
      const match = byId ? s.brokerId === byId : !s.brokerId && bn === name
      if (match) rows.push({ ...s, cycleName: cy.name, cycleEnded: !!cy.endDate })
    }
  }
  return rows.sort((a, b) => {
    const d = new Date(b.date) - new Date(a.date)
    if (d !== 0) return d
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
}

function aggregateBrokerSalesByTrader(saleRows) {
  const map = new Map()
  for (const r of saleRows) {
    const tLabel = (r.linkedTrader?.name || r.trader || '—').trim() || '—'
    const key = r.traderId || `n:${tLabel}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        traderLabel: tLabel,
        totalNetKg: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalRemaining: 0,
      })
    }
    const agg = map.get(key)
    agg.totalNetKg += Number(r.totalNetWeight || 0)
    agg.totalAmount += Number(r.totalAmount || 0)
    agg.totalPaid += Number(r.paidAmount || 0)
    agg.totalRemaining += Number(r.remainingAmount || 0)
  }
  return [...map.values()].map((row) => ({
    ...row,
    avgPricePerKg: row.totalNetKg > 0 ? row.totalAmount / row.totalNetKg : 0,
  }))
}

function formatLedgerDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-EG')
  } catch {
    return '—'
  }
}

function collectFarmWorkerLedger(farmWorker, cycles) {
  const rows = []
  const totalsByCategory = { سلف: 0, صرف: 0, خصم: 0, أخرى: 0 }
  for (const cy of cycles || []) {
    for (const w of cy.workers || []) {
      if (w.farmWorkerId !== farmWorker.id) continue
      for (const exp of cy.workerExpenses || []) {
        if (exp.workerId !== w.id) continue
        const rawCat = exp.category || 'صرف'
        const cat = Object.prototype.hasOwnProperty.call(totalsByCategory, rawCat) ? rawCat : 'أخرى'
        totalsByCategory[cat] += Number(exp.amount || 0)
        rows.push({
          ...exp,
          cycleName: cy.name,
          cycleEnded: !!cy.endDate,
          category: rawCat,
        })
      }
    }
  }
  rows.sort((a, b) => {
    const d = new Date(b.date) - new Date(a.date)
    if (d !== 0) return d
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
  return { rows, totalsByCategory }
}

const actions = [
  { key: 'logs', label: 'السجل الشامل', icon: '📜' },
  { key: 'chicks', label: 'الكتاكيت', icon: '🐥' },
  { key: 'mortality', label: 'النفوق', icon: '⚠️' },
  { key: 'feed', label: 'العلف', icon: '🌽' },
  { key: 'expenses', label: 'المصاريف', icon: '💳' },
  { key: 'workers', label: 'العمال', icon: '👷' },
  { key: 'sales', label: 'البيع', icon: '🛒' },
  { key: 'medication', label: 'العلاج', icon: '💊' },
  { key: 'consumption', label: 'الاستهلاك', icon: '📊' },
  { key: 'fuel', label: 'الغاز والسولار', icon: '🔥' },
  { key: 'weight', label: 'الأوزان', icon: '⚖️' },
  { key: 'inventory', label: 'المخزون', icon: '📦' },
  { key: 'treasury', label: 'الخزنة', icon: '💰' },
  { key: 'suppliers', label: 'الموردين', icon: '🏭' },
  { key: 'trading', label: 'التجار والسماسرة', icon: '🤝' },
]

export const FARM_SECTION_SLUGS = actions.map((a) => a.key)

export function isFarmSectionSlug(s) {
  return typeof s === 'string' && FARM_SECTION_SLUGS.includes(s)
}

function FarmPage({
  farmId,
  farmName,
  treasuryEntries = [],
  suppliers,
  farmWorkers = [],
  traders,
  brokers = [],
  cycles,
  activeCycle,
  chicksCountInput,
  chicksCostInput,
  chicksDateInput,
  mortalityCountInput,
  mortalityDateInput,
  feedSupplierInput,
  feedTypeInput,
  feedPricePerTonInput,
  feedQuantityInput,
  feedDateInput,
  feedTotalWeightKg,
  feedTotalCost,
  gasTypeInput,
  gasCountInput,
  gasCostInput,
  gasDateInput,
  solarLitersInput,
  solarCostInput,
  solarDateInput,
  expenseItemNameInput,
  expenseAmountInput,
  expenseDateInput,
  medicationNameInput,
  medicationSupplierIdInput,
  medicationSupplierInput,
  medicationQuantityInput,
  medicationPriceInput,
  medicationPriceModeInput,
  medicationDateInput,
  medicationConsumeAllInput,
  workerNameInput,
  workerFarmWorkerIdInput,
  workerStartDateInput,
  workerMonthlySalaryInput,
  workerExpenseWorkerIdInput,
  workerExpenseAmountInput,
  workerExpenseDateInput,
  workerExpenseCategoryInput,
  saleTraderInput,
  saleTraderIdInput,
  saleBrokerInput,
  saleBrokerIdInput,
  salePhoneInput,
  salePricePerKgInput,
  salePaidInput,
  saleDateInput,
  saleSalePhase,
  saleCagesWeights,
  saleEmptyWeights,
  saleFullWeights,
  saleLineCagesCounts,
  saleEntriesComputed,
  saleTotalEmptyWeight,
  saleTotalCages,
  saleTotalFullWeight,
  saleTotalNetWeight,
  saleTotalPrice,
  saleRemaining,
  dailyConsumptionDateInput,
  dailyFeedConsumedInput,
  dailyFeedUnitInput,
  feedSupplierIdInput,
  supplierNameInput,
  supplierPhoneInput,
  brokerNameInput,
  brokerPhoneInput,
  traderNameInput,
  traderPhoneInput,
  purchasePaymentSourceInput,
  purchaseCreditSupplierIdInput,
  purchaseCreditSupplierNameInput,
  treasuryTypeInput,
  treasuryAmountInput,
  treasuryPersonNameInput,
  treasuryNotesInput,
  treasuryDateInput,
  weightDateInput,
  weightGroupBirdCountInput,
  weightGroupTotalKgInput,
  onChicksCountChange,
  onChicksCostChange,
  onChicksDateChange,
  onMortalityCountChange,
  onMortalityDateChange,
  onFeedSupplierChange,
  onFeedTypeChange,
  onFeedPricePerTonChange,
  onFeedQuantityChange,
  onFeedDateChange,
  onGasTypeChange,
  onGasCountChange,
  onGasCostChange,
  onGasDateChange,
  onSolarLitersChange,
  onSolarCostChange,
  onSolarDateChange,
  onExpenseItemNameChange,
  onExpenseAmountChange,
  onExpenseDateChange,
  onMedicationNameChange,
  onMedicationSupplierIdChange,
  onMedicationSupplierChange,
  onMedicationQuantityChange,
  onMedicationPriceChange,
  onMedicationPriceModeChange,
  onMedicationDateChange,
  onMedicationConsumeAllChange,
  onWorkerNameChange,
  onWorkerFarmWorkerIdChange,
  onWorkerStartDateChange,
  onWorkerMonthlySalaryChange,
  onWorkerExpenseWorkerIdChange,
  onWorkerExpenseAmountChange,
  onWorkerExpenseDateChange,
  onWorkerExpenseCategoryChange,
  onSaleTraderChange,
  onSaleTraderIdChange,
  onSaleBrokerChange,
  onSaleBrokerIdChange,
  onSalePhoneChange,
  onSalePricePerKgChange,
  onSalePaidChange,
  onSaleDateChange,
  onSaleCagesLineChange,
  onSaleEmptyLineChange,
  onSaleAddEmptyLine,
  onSaleRemoveEmptyLine,
  onSaleFullLineChange,
  onSaleLineCagesCountChange,
  onSaleAddFullLine,
  onSaleRemoveFullLine,
  onSaleConfirmEmptyPhase,
  onSaleResetWizard,
  onDailyConsumptionDateChange,
  onDailyFeedConsumedChange,
  onDailyFeedUnitChange,
  onFeedSupplierIdChange,
  onSupplierNameChange,
  onSupplierPhoneChange,
  onBrokerNameChange,
  onBrokerPhoneChange,
  onTraderNameChange,
  onTraderPhoneChange,
  onPurchasePaymentSourceChange,
  onPurchaseCreditSupplierIdChange,
  onPurchaseCreditSupplierNameChange,
  onTreasuryTypeChange,
  onTreasuryAmountChange,
  onTreasuryPersonNameChange,
  onTreasuryNotesChange,
  onTreasuryDateChange,
  onAddSupplier,
  onAddBroker,
  onAddTrader,
  onAddTreasuryEntry,
  onDeleteTreasuryEntry,
  onWeightDateChange,
  onWeightGroupBirdCountChange,
  onWeightGroupTotalKgChange,
  onAddChicks,
  onAddMortality,
  onAddFeed,
  onAddGas,
  onAddSolar,
  onAddExpense,
  onAddMedication,
  onTrackMedicationUsage,
  onAddWorker,
  onAddWorkerExpense,
  onAddSale,
  onDownloadSaleInvoice,
  onExportLedger,
  onAddDailyConsumption,
  onAddWeight,
  onUpdateChickArrival,
  onDeleteChickArrival,
  onUpdateMortality,
  onDeleteMortality,
  onUpdateFeed,
  onDeleteFeed,
  onUpdateGas,
  onDeleteGas,
  onUpdateSolar,
  onDeleteSolar,
  onUpdateExpense,
  onDeleteExpense,
  onUpdateMedication,
  onDeleteMedication,
  onUpdateWorker,
  onDeleteWorker,
  onUpdateWorkerExpense,
  onDeleteWorkerExpense,
  onUpdateSale,
  onDeleteSale,
  onUpdateDailyConsumption,
  onDeleteDailyConsumption,
  onUpdateWeightEntry,
  onDeleteWeightEntry,
  onUpdateSupplier,
  onDeleteSupplier,
  onUpdateTrader,
  onDeleteTrader,
  onUpdateBroker,
  onDeleteBroker,
  onOpenReports,
  onBack,
  onToggleCycle,
  sectionSlug = null,
  tradingTabHint = null,
  onFarmSectionNavigate,
  onFarmHomeNavigate,
}) {
  const [expandedSales, setExpandedSales] = useState({})
  const [workerLedgerFarmWorker, setWorkerLedgerFarmWorker] = useState(null)
  const [showEndCycleConfirm, setShowEndCycleConfirm] = useState(false)
  const [showStartCyclePrompt, setShowStartCyclePrompt] = useState(false)
  const [startCycleDateInput, setStartCycleDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [weightSamplesInput, setWeightSamplesInput] = useState([""])
  const [editModal, setEditModal] = useState(null)
  const [logTypeFilter, setLogTypeFilter] = useState('ALL')
  const [supplierPanel, setSupplierPanel] = useState('ADD')
  const [brokerPanel, setBrokerPanel] = useState('LEDGER')
  const [tradingMainTab, setTradingMainTab] = useState('traders')
  const [traderSubPanel, setTraderSubPanel] = useState('ledger')
  const [cycleDetailsModal, setCycleDetailsModal] = useState(null)
  const [consumptionItemFilter, setConsumptionItemFilter] = useState('FEED')
  const [consumptionFuelType, setConsumptionFuelType] = useState('GAS')
  const [consumptionGasTypeInput, setConsumptionGasTypeInput] = useState('كبير')
  const [consumptionFuelQuantityInput, setConsumptionFuelQuantityInput] = useState('')
  const [consumptionFuelDateInput, setConsumptionFuelDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [consumptionMedicationIdInput, setConsumptionMedicationIdInput] = useState('')
  const [consumptionMedicationQtyInput, setConsumptionMedicationQtyInput] = useState('')
  const [consumptionMedicationDateInput, setConsumptionMedicationDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [consumptionReportDate, setConsumptionReportDate] = useState(() => localDateKey(new Date()))
  const [paymentPanelSection, setPaymentPanelSection] = useState(null)
  const [medWizardStep, setMedWizardStep] = useState(0)
  const [feedWizardStep, setFeedWizardStep] = useState(0)

  const MED_WIZARD_LABELS = ['المورد', 'اسم العلاج', 'الكمية', 'السعر', 'التاريخ', 'السداد', 'المراجعة والحفظ']
  const FEED_WIZARD_LABELS = ['المورد', 'نوع العلف والسعر', 'الكمية', 'التاريخ', 'السداد', 'المراجعة والحفظ']

  const isPurchaseCreditReady =
    purchasePaymentSourceInput !== 'CREDIT' ||
    purchaseCreditSupplierIdInput ||
    purchaseCreditSupplierNameInput.trim()

  const medWizardStepValid = [
    true,
    !!medicationNameInput.trim(),
    Number(medicationQuantityInput) > 0,
    medicationPriceInput !== '' && !Number.isNaN(Number(medicationPriceInput)) && Number(medicationPriceInput) >= 0,
    !!medicationDateInput,
    isPurchaseCreditReady,
    true,
  ]
  const feedWizardStepValid = [
    true,
    feedPricePerTonInput !== '' && !Number.isNaN(Number(feedPricePerTonInput)) && Number(feedPricePerTonInput) >= 0,
    Number(feedQuantityInput) > 0,
    !!feedDateInput,
    isPurchaseCreditReady,
    true,
  ]

  const toggleSaleDetails = (saleId) => {
    setExpandedSales((prev) => ({ ...prev, [saleId]: !prev[saleId] }))
  }

  const handleDeleteSupplierLedgerRow = async (row) => {
    if (!window.confirm('هل تريد حذف هذا السطر من كشف حساب المورد؟ سيتم حذف حركة الشراء المرتبطة.')) {
      return
    }
    await deleteSupplierLedgerRow(row, { onDeleteFeed, onDeleteMedication, onDeleteTreasuryEntry })
  }

  const handleDeleteTraderSaleRow = async (saleId) => {
    if (!window.confirm('هل تريد حذف هذه العملية من كشف حساب التاجر؟')) return
    await onDeleteSale?.(saleId)
  }

  useEffect(() => {
    if (!activeCycle && sectionSlug) {
      onFarmHomeNavigate?.()
    }
  }, [activeCycle, sectionSlug, onFarmHomeNavigate])
  useEffect(() => {
    setPaymentPanelSection(null)
    setBrokerPanel('LEDGER')
    setMedWizardStep(0)
    setFeedWizardStep(0)
    if (sectionSlug === 'trading') {
      setTradingMainTab('traders')
      setTraderSubPanel('ledger')
    }
  }, [sectionSlug])

  useEffect(() => {
    if (sectionSlug !== 'medication' || medWizardStep !== 5) return
    setPaymentPanelSection('medication')
  }, [sectionSlug, medWizardStep])

  useEffect(() => {
    if (sectionSlug !== 'feed' || feedWizardStep !== 4) return
    setPaymentPanelSection('feed')
  }, [sectionSlug, feedWizardStep])

  useEffect(() => {
    if (sectionSlug !== 'medication') return
    if (!medicationNameInput && !medicationQuantityInput && !medicationSupplierIdInput && !medicationSupplierInput.trim()) {
      setMedWizardStep(0)
    }
  }, [sectionSlug, medicationNameInput, medicationQuantityInput, medicationSupplierIdInput, medicationSupplierInput])

  useEffect(() => {
    if (sectionSlug !== 'feed') return
    if (!feedQuantityInput && !feedSupplierIdInput && !feedSupplierInput.trim()) {
      setFeedWizardStep(0)
    }
  }, [sectionSlug, feedQuantityInput, feedSupplierIdInput, feedSupplierInput])

  useEffect(() => {
    if (sectionSlug !== 'trading') return
    if (tradingTabHint === 'brokers' || tradingTabHint === 'traders') {
      setTradingMainTab(tradingTabHint)
    }
  }, [sectionSlug, tradingTabHint])

  const activeActionMeta = (sectionSlug && actions.find((action) => action.key === sectionSlug)) || null
  const sectionMode = !!(activeCycle && sectionSlug)
  const brokersLedgerEntries = useMemo(() => buildBrokersLedgerList(brokers, cycles), [brokers, cycles])
  const feedCostPerKg =
    Number(activeCycle?.totalFeedWeightKg || 0) > 0
      ? Number(activeCycle?.totalFeedCost || 0) / Number(activeCycle?.totalFeedWeightKg || 1)
      : 0
  const totalFeedConsumptionCost = (activeCycle?.dailyConsumptions || []).reduce(
    (sum, item) => sum + Number(item.feedKg || 0) * feedCostPerKg,
    0,
  )
  const totalFuelConsumptionCost =
    (activeCycle?.gases || []).reduce((sum, item) => sum + Number(item.cost || 0), 0) +
    (activeCycle?.solars || []).reduce((sum, item) => sum + Number(item.cost || 0), 0)
  const medicationRows = (activeCycle?.medications || []).map((item) => {
    const quantity = Number(item.quantity || 0)
    const used = Number(item.usedQuantity || 0)
    const unitCost = quantity > 0 ? Number(item.totalCost || 0) / quantity : 0
    return { ...item, unitCost, used, usedCost: used * unitCost, remaining: Math.max(0, quantity - used) }
  })
  const totalMedicationConsumptionCost = medicationRows.reduce((sum, row) => sum + row.usedCost, 0)
  const totalConsumptionAll =
    totalFeedConsumptionCost + totalFuelConsumptionCost + totalMedicationConsumptionCost
  const chickPriceFromConsumptionFormula =
    Number(activeCycle?.totalArrivedChicks || 0) > 0
      ? (
          totalConsumptionAll +
          Number(activeCycle?.totalExpenses || 0) +
          Number(activeCycle?.totalChickPurchaseCost || 0)
        ) / Number(activeCycle?.totalArrivedChicks || 1)
      : null

  const consumptionDayDailyRow =
    activeCycle?.dailyConsumptions?.find((dc) => localDateKey(dc.date) === consumptionReportDate) || null
  const consumptionDayGases = (activeCycle?.gases || []).filter((g) => localDateKey(g.date) === consumptionReportDate)
  const consumptionDaySolars = (activeCycle?.solars || []).filter((s) => localDateKey(s.date) === consumptionReportDate)
  const consumptionDayGasCylinders = consumptionDayGases.reduce((s, g) => s + Number(g.count || 0), 0)
  const consumptionDayGasCostSum = consumptionDayGases.reduce((s, g) => s + Number(g.cost || 0), 0)
  const consumptionDaySolarLiters = consumptionDaySolars.reduce((s, r) => s + Number(r.liters || 0), 0)
  const consumptionDaySolarCost = consumptionDaySolars.reduce((s, r) => s + Number(r.cost || 0), 0)
  const consumptionDayGasTypeBreakdown = consumptionDayGases.reduce((acc, g) => {
    const t = (g.gasType || 'غير محدد').trim() || 'غير محدد'
    acc[t] = (acc[t] || 0) + Number(g.count || 0)
    return acc
  }, {})
  const consumptionDayGasDetailText = Object.entries(consumptionDayGasTypeBreakdown)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' — ')
  const consumptionDayFeedKg = Number(consumptionDayDailyRow?.feedKg || 0)
  const consumptionDayFeedBags =
    consumptionDayDailyRow?.consumptionBags != null && Number(consumptionDayDailyRow.consumptionBags) > 0
      ? Number(consumptionDayDailyRow.consumptionBags)
      : null
  const consumptionDayFeedCostEst = consumptionDayFeedKg * feedCostPerKg
  const consumptionDayWater = Number(consumptionDayDailyRow?.waterLiters || 0)
  const consumptionDayGasUsedField = Number(consumptionDayDailyRow?.gasUsed || 0)
  const consumptionDayKwh = Number(consumptionDayDailyRow?.electricityKwh || 0)
  const consumptionDayNotes = (consumptionDayDailyRow?.notes && String(consumptionDayDailyRow.notes).trim()) || ''
  const consumptionDayHasReportContent =
    consumptionDayFeedKg > 0 ||
    consumptionDayWater > 0 ||
    consumptionDayGasUsedField > 0 ||
    consumptionDayKwh > 0 ||
    consumptionDayNotes.length > 0 ||
    consumptionDayGases.length > 0 ||
    consumptionDaySolars.length > 0
  const shiftConsumptionReportDate = (deltaDays) => {
    const d = new Date(`${consumptionReportDate}T12:00:00`)
    d.setDate(d.getDate() + deltaDays)
    setConsumptionReportDate(localDateKey(d))
  }

  const gasCostAverages = (activeCycle?.gases || []).reduce((acc, row) => {
    const key = row.gasType === 'صغير' ? 'صغير' : 'كبير'
    acc[key].count += Number(row.count || 0)
    acc[key].cost += Number(row.cost || 0)
    return acc
  }, { كبير: { count: 0, cost: 0 }, صغير: { count: 0, cost: 0 } })
  const avgGasUnitCost =
    gasCostAverages[consumptionGasTypeInput]?.count > 0
      ? gasCostAverages[consumptionGasTypeInput].cost / gasCostAverages[consumptionGasTypeInput].count
      : 0
  const solarTotals = (activeCycle?.solars || []).reduce(
    (acc, row) => {
      acc.liters += Number(row.liters || 0)
      acc.cost += Number(row.cost || 0)
      return acc
    },
    { liters: 0, cost: 0 },
  )
  const avgSolarCostPerLiter = solarTotals.liters > 0 ? solarTotals.cost / solarTotals.liters : 0
  const consumptionFuelComputedCost =
    Number(consumptionFuelQuantityInput || 0) *
    (consumptionFuelType === 'GAS' ? avgGasUnitCost : avgSolarCostPerLiter)
  const selectedMedicationConsumption = medicationRows.find((row) => row.id === consumptionMedicationIdInput) || null
  const consumptionMedicationComputedCost =
    Number(consumptionMedicationQtyInput || 0) * Number(selectedMedicationConsumption?.unitCost || 0)
  const sortedTreasuryEntries = [...(treasuryEntries || [])].sort((a, b) => {
    const byDate = new Date(b.date) - new Date(a.date)
    if (byDate !== 0) return byDate
    return new Date(b.createdAt) - new Date(a.createdAt)
  })

  const treasuryCashBalance = sortedTreasuryEntries.reduce((sum, row) => {
    const amount = Number(row.amount || 0)
    if (row.type === 'DEPOSIT') return sum + amount
    if (row.type === 'WITHDRAW') return sum - amount
    return sum
  }, 0)

  const creditByPerson = sortedTreasuryEntries.reduce((acc, row) => {
    if (!row.personName) return acc
    const amount = Number(row.amount || 0)
    if (!acc[row.personName]) acc[row.personName] = 0
    if (row.type === 'CREDIT_ADD') acc[row.personName] += amount
    if (row.type === 'CREDIT_DEDUCT') acc[row.personName] -= amount
    return acc
  }, {})
  const purchaseCreditPeople = (suppliers || []).map((s) => s.name)
  const quickSettleCredit = (personName, amount, mode = 'PARTIAL') => {
    onTreasuryTypeChange('CREDIT_DEDUCT')
    onTreasuryPersonNameChange(personName)
    onTreasuryAmountChange(mode === 'FULL' ? Number(amount || 0).toFixed(2) : '')
    onTreasuryNotesChange(mode === 'FULL' ? 'سداد كامل من صفحة الخزنة' : 'سداد جزئي من صفحة الخزنة')
  }
  const renderPurchasePaymentPanel = (sectionKey, stepNumberOrOpts = null) => {
    const opts =
      typeof stepNumberOrOpts === 'number' ? { stepNumber: stepNumberOrOpts } : stepNumberOrOpts || {}
    const { stepNumber = null, inlineOpen = false } = opts
    const isOpen = inlineOpen || paymentPanelSection === sectionKey
    const paymentSummary =
      purchasePaymentSourceInput === 'CREDIT'
        ? `آجل على مورد: ${purchaseCreditSupplierNameInput || 'غير محدد'}`
        : 'سحب من الخزنة'

    return (
      <div className="mt-0">
        {stepNumber != null && (
          <p className="mb-1.5 flex items-center gap-2 text-sm font-bold text-slate-700">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
              {stepNumber}
            </span>
            طريقة السداد
          </p>
        )}
        {!inlineOpen && (
          <button
            type="button"
            onClick={() => setPaymentPanelSection(isOpen ? null : sectionKey)}
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-right text-sm font-bold text-slate-800 transition hover:bg-slate-100"
          >
            {isOpen ? 'إخفاء خيارات السداد' : 'تسجيل طريقة السداد (خزنة/مورد)'}
            <span className="mr-2 text-xs font-semibold text-slate-500">- {paymentSummary}</span>
          </button>
        )}
        {isOpen && (
          <div className={`${inlineOpen ? '' : 'mt-2'} rounded-xl border border-slate-200 bg-white p-3`}>
            {inlineOpen && (
              <p className="mb-2 text-sm font-semibold text-slate-600">{paymentSummary}</p>
            )}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <select
                value={purchasePaymentSourceInput}
                onChange={(event) => onPurchasePaymentSourceChange(event.target.value)}
                className="app-input"
              >
                <option value="TREASURY">سحب من الخزنة</option>
                <option value="CREDIT">آجل على مورد</option>
              </select>
              {purchasePaymentSourceInput === 'CREDIT' && (
                <>
                  <select
                    value={purchaseCreditSupplierIdInput}
                    onChange={(event) => {
                      const id = event.target.value
                      onPurchaseCreditSupplierIdChange(id)
                      const s = (suppliers || []).find((x) => x.id === id)
                      onPurchaseCreditSupplierNameChange(s ? s.name : '')
                    }}
                    className="app-input"
                  >
                    <option value="">— اختر المورد —</option>
                    {(suppliers || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={purchaseCreditSupplierNameInput}
                    onChange={(event) => {
                      onPurchaseCreditSupplierNameChange(event.target.value)
                      onPurchaseCreditSupplierIdChange('')
                    }}
                    className="app-input"
                    placeholder="اسم المورد (يدوي)"
                    list="purchase-credit-people"
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const allFarmLogs = (() => {
    if (!activeCycle) return []
    const rows = []
    ;(activeCycle.chickArrivals || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'CHICKS',
        date: x.arrivalDate || x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'شحنة كتاكيت',
        details: `العدد: ${x.count || 0}${x.totalCost != null ? ` — التكلفة: ${Number(x.totalCost).toFixed(2)}` : ''}`,
        raw: x,
      }),
    )
    ;(activeCycle.mortalities || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'MORTALITY',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'نفوق',
        details: `العدد: ${x.count || 0}${x.reason ? ` — السبب: ${x.reason}` : ''}`,
        raw: x,
      }),
    )
    ;(activeCycle.feeds || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'FEED',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'علف',
        details: `${x.feedType || '-'} — ${Number(x.quantityKg || 0).toFixed(2)} كجم — التكلفة ${Number(x.totalCost || 0).toFixed(2)}`,
        raw: x,
      }),
    )
    ;(activeCycle.gases || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'GAS',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'غاز',
        details: `${x.gasType || '-'} — العدد ${x.count || 0} — التكلفة ${Number(x.cost ?? x.totalCost ?? 0).toFixed(2)}`,
        raw: x,
      }),
    )
    ;(activeCycle.solars || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'SOLAR',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'سولار',
        details: `الكمية ${Number(x.liters || 0).toFixed(2)} — التكلفة ${Number(x.cost || 0).toFixed(2)}`,
        raw: x,
      }),
    )
    ;(activeCycle.expenses || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'EXPENSE',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'مصروف',
        details: `${x.title || x.category || 'مصروف'} — ${Number(x.amount || 0).toFixed(2)}`,
        raw: x,
      }),
    )
    ;(activeCycle.medications || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'MEDICATION',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'علاج',
        details: `${x.name || '-'} — كمية ${Number(x.quantity || 0).toFixed(2)} — تكلفة ${Number(x.totalCost || 0).toFixed(2)}`,
        raw: x,
      }),
    )
    ;(activeCycle.workerExpenses || []).forEach((x) => {
      const w = (activeCycle.workers || []).find((y) => y.id === x.workerId)
      rows.push({
        id: x.id,
        type: 'WORKER_EXPENSE',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'حركة عامل',
        details: `${w?.name || 'عامل'} — ${x.category || 'صرف'} — ${Number(x.amount || 0).toFixed(2)}`,
        raw: x,
      })
    })
    ;(activeCycle.sales || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'SALE',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'بيع',
        details: `${x.linkedTrader?.name || x.trader || '-'} — صافي ${Number(x.totalNetWeight || 0).toFixed(2)} — إجمالي ${Number(x.totalAmount || 0).toFixed(2)}`,
        raw: x,
      }),
    )
    ;(activeCycle.dailyConsumptions || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'CONSUMPTION',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'استهلاك يومي',
        details: `العلف ${Number(x.feedKg || 0).toFixed(2)} كجم${x.consumptionBags ? ` (${Number(x.consumptionBags).toFixed(2)} شيكارة)` : ''}`,
        raw: x,
      }),
    )
    ;(activeCycle.weightEntries || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'WEIGHT',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'وزن',
        details: `متوسط ${Number(x.averageWeight || 0).toFixed(2)} كجم`,
        raw: x,
      }),
    )
    ;(treasuryEntries || []).forEach((x) =>
      rows.push({
        id: x.id,
        type: 'TREASURY',
        date: x.date || x.createdAt,
        createdAt: x.createdAt,
        title: 'خزنة',
        details: `${x.type} — ${Number(x.amount || 0).toFixed(2)}${x.personName ? ` — ${x.personName}` : ''}`,
        raw: x,
      }),
    )
    return rows.sort((a, b) => {
      const d = new Date(b.date) - new Date(a.date)
      if (d !== 0) return d
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  })()

  const buildCycleLogs = (cycle) => {
    if (!cycle) return []
    const rows = []
    ;(cycle.chickArrivals || []).forEach((x) => rows.push({ id: `C-${x.id}`, date: x.arrivalDate || x.createdAt, title: 'شحنة كتاكيت', details: `العدد ${x.count || 0}` }))
    ;(cycle.mortalities || []).forEach((x) => rows.push({ id: `M-${x.id}`, date: x.date || x.createdAt, title: 'نفوق', details: `العدد ${x.count || 0}${x.reason ? ` — ${x.reason}` : ''}` }))
    ;(cycle.feeds || []).forEach((x) => rows.push({ id: `F-${x.id}`, date: x.date || x.createdAt, title: 'علف', details: `${Number(x.quantityKg || 0).toFixed(2)} كجم` }))
    ;(cycle.expenses || []).forEach((x) => rows.push({ id: `E-${x.id}`, date: x.date || x.createdAt, title: 'مصروف', details: `${x.title || '-'} — ${Number(x.amount || 0).toFixed(2)}` }))
    ;(cycle.medications || []).forEach((x) => rows.push({ id: `MED-${x.id}`, date: x.date || x.createdAt, title: 'علاج', details: `${x.name || '-'} — ${Number(x.totalCost || 0).toFixed(2)}` }))
    ;(cycle.sales || []).forEach((x) => rows.push({ id: `S-${x.id}`, date: x.date || x.createdAt, title: 'بيع', details: `صافي ${Number(x.totalNetWeight || 0).toFixed(2)} — إجمالي ${Number(x.totalAmount || 0).toFixed(2)}` }))
    ;(cycle.dailyConsumptions || []).forEach((x) => rows.push({ id: `DC-${x.id}`, date: x.date || x.createdAt, title: 'استهلاك يومي', details: `${Number(x.feedKg || 0).toFixed(2)} كجم` }))
    ;(cycle.weightEntries || []).forEach((x) => rows.push({ id: `W-${x.id}`, date: x.date || x.createdAt, title: 'وزن', details: `متوسط ${Number(x.averageWeight || 0).toFixed(2)} كجم` }))
    return rows.sort((a, b) => new Date(b.date) - new Date(a.date))
  }

  const addWeightSampleField = () => {
    setWeightSamplesInput((prev) => [...prev, ""])
  }

  const removeWeightSampleField = (index) => {
    setWeightSamplesInput((prev) => prev.filter((_, idx) => idx !== index))
  }

  const updateWeightSampleField = (index, value) => {
    setWeightSamplesInput((prev) => prev.map((item, idx) => (idx === index ? value : item)))
  }

  const openEditModal = ({ title, fields, initialValues, onSubmit }) => {
    setEditModal({
      title,
      fields,
      values: initialValues,
      onSubmit,
      saving: false,
      error: "",
    })
  }

  const closeEditModal = () => setEditModal(null)

  const updateEditModalValue = (key, value) => {
    setEditModal((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev))
  }

  const submitEditModal = async () => {
    if (!editModal) return
    setEditModal((prev) => ({ ...prev, saving: true, error: "" }))
    const result = await editModal.onSubmit(editModal.values)
    if (result?.ok) {
      closeEditModal()
      return
    }
    setEditModal((prev) => ({ ...prev, saving: false, error: result?.message || "تعذر حفظ التعديل" }))
  }

  const openEditFromLog = (entry) => {
    const x = entry.raw
    if (entry.type === 'CHICKS') {
      openEditModal({
        title: 'تعديل شحنة الكتاكيت',
        fields: [
          { key: 'arrivalDate', label: 'التاريخ', type: 'date' },
          { key: 'count', label: 'العدد', type: 'number' },
          { key: 'totalCost', label: 'إجمالي التكلفة', type: 'number' },
        ],
        initialValues: {
          arrivalDate: x.arrivalDate ? new Date(x.arrivalDate).toISOString().slice(0, 10) : '',
          count: Number(x.count || 0),
          totalCost: Number(x.totalCost || 0),
        },
        onSubmit: (values) => onUpdateChickArrival(x.id, values),
      })
      return
    }
    if (entry.type === 'MORTALITY') {
      openEditModal({
        title: 'تعديل النفوق',
        fields: [
          { key: 'date', label: 'التاريخ', type: 'date' },
          { key: 'count', label: 'العدد', type: 'number' },
          { key: 'reason', label: 'السبب', type: 'text' },
        ],
        initialValues: {
          date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '',
          count: Number(x.count || 0),
          reason: x.reason || '',
        },
        onSubmit: (values) => onUpdateMortality(x.id, values),
      })
      return
    }
    if (entry.type === 'FEED') {
      openEditModal({
        title: 'تعديل العلف',
        fields: [
          { key: 'date', label: 'التاريخ', type: 'date' },
          { key: 'feedType', label: 'نوع العلف', type: 'text' },
          { key: 'quantity', label: 'الكمية', type: 'number' },
          { key: 'unitType', label: 'الوحدة (bags/ton)', type: 'text' },
          { key: 'pricePerTon', label: 'السعر/طن', type: 'number' },
        ],
        initialValues: {
          date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '',
          feedType: x.feedType || '',
          quantity: Number(x.quantity || 0),
          unitType: x.unitType || 'bags',
          pricePerTon: Number(x.pricePerTon || 0),
        },
        onSubmit: (values) => onUpdateFeed(x.id, values),
      })
      return
    }
    if (entry.type === 'GAS') return openEditModal({ title: 'تعديل الغاز', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'gasType', label: 'النوع', type: 'text' }, { key: 'count', label: 'العدد', type: 'number' }, { key: 'cost', label: 'التكلفة', type: 'number' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', gasType: x.gasType || 'كبير', count: Number(x.count || 0), cost: Number(x.cost ?? x.totalCost ?? 0) }, onSubmit: (values) => onUpdateGas(x.id, values) })
    if (entry.type === 'SOLAR') return openEditModal({ title: 'تعديل السولار', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'liters', label: 'الكمية', type: 'number' }, { key: 'cost', label: 'التكلفة', type: 'number' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', liters: Number(x.liters || 0), cost: Number(x.cost || 0) }, onSubmit: (values) => onUpdateSolar(x.id, values) })
    if (entry.type === 'EXPENSE') return openEditModal({ title: 'تعديل المصروف', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'title', label: 'البند', type: 'text' }, { key: 'amount', label: 'المبلغ', type: 'number' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', title: x.title || '', amount: Number(x.amount || 0) }, onSubmit: (values) => onUpdateExpense(x.id, values) })
    if (entry.type === 'MEDICATION') return openEditModal({ title: 'تعديل العلاج', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'name', label: 'الاسم', type: 'text' }, { key: 'quantity', label: 'الكمية', type: 'number' }, { key: 'totalCost', label: 'إجمالي التكلفة', type: 'number' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', name: x.name || '', quantity: Number(x.quantity || 0), totalCost: Number(x.totalCost || 0) }, onSubmit: (values) => onUpdateMedication(x.id, values) })
    if (entry.type === 'WORKER_EXPENSE') return openEditModal({ title: 'تعديل حركة العامل', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'amount', label: 'المبلغ', type: 'number' }, { key: 'category', label: 'البند', type: 'text' }, { key: 'description', label: 'الوصف', type: 'text' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', amount: Number(x.amount || 0), category: x.category || 'صرف', description: x.description || '' }, onSubmit: (values) => onUpdateWorkerExpense(x.id, values) })
    if (entry.type === 'SALE') return openEditModal({ title: 'تعديل البيع', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'trader', label: 'التاجر', type: 'text' }, { key: 'broker', label: 'السمسار', type: 'text' }, { key: 'pricePerKg', label: 'سعر الكيلو', type: 'number' }, { key: 'paidAmount', label: 'المدفوع', type: 'number' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', trader: x.linkedTrader?.name || x.trader || '', broker: x.linkedBroker?.name || x.broker || '', pricePerKg: Number(x.pricePerKg || 0), paidAmount: Number(x.paidAmount || 0) }, onSubmit: (values) => onUpdateSale(x.id, values) })
    if (entry.type === 'CONSUMPTION') return openEditModal({ title: 'تعديل الاستهلاك', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'feedConsumed', label: 'الكمية', type: 'number' }, { key: 'feedUnit', label: 'الوحدة (kg/bags)', type: 'text' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', feedConsumed: Number(x.consumptionBags || x.feedKg || 0), feedUnit: x.consumptionBags ? 'bags' : 'kg' }, onSubmit: (values) => onUpdateDailyConsumption(x.id, values) })
    if (entry.type === 'WEIGHT') return openEditModal({ title: 'تعديل الوزن', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'averageWeight', label: 'متوسط الوزن', type: 'number' }], initialValues: { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : '', averageWeight: Number(x.averageWeight || 0) }, onSubmit: (values) => onUpdateWeightEntry(x.id, values) })
  }

  const deleteFromLog = async (entry) => {
    if (entry.type === 'CHICKS') return onDeleteChickArrival(entry.id)
    if (entry.type === 'MORTALITY') return onDeleteMortality(entry.id)
    if (entry.type === 'FEED') return onDeleteFeed(entry.id)
    if (entry.type === 'GAS') return onDeleteGas(entry.id)
    if (entry.type === 'SOLAR') return onDeleteSolar(entry.id)
    if (entry.type === 'EXPENSE') return onDeleteExpense(entry.id)
    if (entry.type === 'MEDICATION') return onDeleteMedication(entry.id)
    if (entry.type === 'WORKER_EXPENSE') return onDeleteWorkerExpense(entry.id)
    if (entry.type === 'SALE') return onDeleteSale(entry.id)
    if (entry.type === 'CONSUMPTION') return onDeleteDailyConsumption(entry.id)
    if (entry.type === 'WEIGHT') return onDeleteWeightEntry(entry.id)
    return { ok: false, message: 'هذا النوع لا يدعم الحذف من السجل حاليًا' }
  }

  return (
    <section className="app-page">
      <header className="app-page-hero mb-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <button type="button" onClick={onBack} className="app-btn-ghost order-2 w-fit py-2 text-sm sm:order-1 sm:text-base">
          ← لوحة التحكم
        </button>
        <div className="min-w-0 flex-1 text-center sm:order-2 sm:text-right">
          <p className="app-eyebrow">المزرعة</p>
          <h1 className="app-title-page">{farmName}</h1>
          <p className="app-lead mt-1 hidden sm:block">إدارة الدورة، المخزون، والتقارير من مكان واحد</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (activeCycle) {
              setShowEndCycleConfirm(true)
              return
            }
            setStartCycleDateInput(new Date().toISOString().slice(0, 10))
            setShowStartCyclePrompt(true)
          }}
          className={`order-3 w-full sm:w-auto ${activeCycle ? 'app-btn-danger' : 'app-btn-primary'}`}
        >
          {activeCycle ? 'إنهاء الدورة' : 'بدء دورة'}
        </button>
      </header>
      {!sectionMode && showEndCycleConfirm && activeCycle && (
        <div className="app-card mb-6 border-rose-200/80 bg-gradient-to-br from-rose-50 to-white p-5">
          <p className="mb-3 text-lg font-bold text-rose-900">هل أنت متأكد من إنهاء الدورة الحالية؟</p>
          <p className="mb-4 text-base text-rose-800">
            بعد الإنهاء سيتم فتح تقرير الدورة الكامل ويمكنك طباعته أو حفظه PDF.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setShowEndCycleConfirm(false)
                onToggleCycle()
              }}
              className="app-btn-danger py-2 text-base"
            >
              نعم، إنهاء الدورة
            </button>
            <button type="button" onClick={() => setShowEndCycleConfirm(false)} className="app-btn-outline">
              لا
            </button>
          </div>
        </div>
      )}
      {!sectionMode && (cycles || []).some((c) => c.endDate) && (
        <div className="app-card mb-6 border-slate-200 bg-slate-50/80 p-4">
          <h3 className="mb-2 text-lg font-bold text-slate-900">سجل الدورات المنتهية</h3>
          <p className="mb-3 text-sm text-slate-600">
            دورات أُغلقت مع تاريخ الإنهاء؛ للرجوع إليها أو مقارنة النتائج بين الدورات.
          </p>
          <div className="app-table-wrap app-table-wrap--scroll-y bg-white">
            <table className="w-full min-w-[480px] text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-2 py-2">الدورة</th>
                  <th className="px-2 py-2">بداية</th>
                  <th className="px-2 py-2">نهاية</th>
                  <th className="px-2 py-2">المدة (يوم)</th>
                  <th className="px-2 py-2">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {[...(cycles || [])]
                  .filter((c) => c.endDate)
                  .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))
                  .map((c) => (
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-medium">{c.name}</td>
                      <td className="px-2 py-2">
                        {c.startDate ? new Date(c.startDate).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {c.endDate ? new Date(c.endDate).toLocaleDateString('ar-EG') : '—'}
                      </td>
                      <td className="px-2 py-2">{c.cycleDurationDays != null ? c.cycleDurationDays : '—'}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setCycleDetailsModal(c)}
                          className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold text-slate-800 transition hover:bg-slate-300"
                        >
                          تفاصيل
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!sectionMode && showStartCyclePrompt && !activeCycle && (
        <div className="app-card mb-6 border-teal-200/80 bg-gradient-to-br from-teal-50 to-white p-5">
          <p className="mb-3 text-lg font-bold text-emerald-900">أدخل تاريخ بدء الدورة</p>
          <p className="mb-4 text-base text-emerald-800">
            استخدم التاريخ الحقيقي لبداية الدورة حتى لو بدأت على أرض الواقع قبل التسجيل في السيستم.
          </p>
          <div className="mb-3 max-w-xs">
            <input
              type="date"
              value={startCycleDateInput}
              onChange={(e) => setStartCycleDateInput(e.target.value)}
              className="app-input"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                if (!startCycleDateInput) return
                setShowStartCyclePrompt(false)
                onToggleCycle(startCycleDateInput)
              }}
              className="app-btn-primary py-2 text-base"
            >
              بدء الدورة
            </button>
            <button type="button" onClick={() => setShowStartCyclePrompt(false)} className="app-btn-outline">
              إلغاء
            </button>
          </div>
        </div>
      )}
      {!sectionMode && activeCycle && (
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button type="button" onClick={onOpenReports} className="app-btn-accent">
            عرض التقارير
          </button>
          <p className="app-muted max-w-xl sm:mr-auto">
            تقارير مفصّلة للدورة الحالية جاهزة للطباعة أو الحفظ كـ PDF.
          </p>
        </div>
      )}

      {!sectionMode && <div className="app-card mb-8 p-5 md:p-6">
        {activeCycle ? (
          <div>
            <div className="mb-5 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="app-panel-title">نظرة عامة</p>
                <h2 className="app-panel-heading">ملخص الدورة الحالية</h2>
              </div>
              <span className="app-badge w-fit shrink-0">{activeCycle.name}</span>
            </div>
            <div className="app-table-wrap">
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr className="bg-slate-50 text-slate-700">
                    <th className="px-4 py-3 text-base font-bold">البند</th>
                    <th className="px-4 py-3 text-base font-bold">القيمة</th>
                    <th className="px-4 py-3 text-base font-bold">البند</th>
                    <th className="px-4 py-3 text-base font-bold">القيمة</th>
                  </tr>
                </thead>
                <tbody className="text-[1.05rem] font-semibold text-slate-800">
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">مدة الدورة</td>
                    <td className="px-4 py-3">{activeCycle.cycleDurationDays} يوم</td>
                    <td className="px-4 py-3">عمر الكتكوت</td>
                    <td className="px-4 py-3">{activeCycle.chickAgeDays} يوم</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td className="px-4 py-3">العدد الحالي</td>
                    <td className="px-4 py-3">{activeCycle.currentChickenCount}</td>
                    <td className="px-4 py-3">إجمالي وزن العلف</td>
                    <td className="px-4 py-3">{Number(activeCycle.totalFeedWeightKg || 0).toFixed(0)} كجم</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">إجمالي تكلفة العلف</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalFeedCost} /></td>
                    <td className="px-4 py-3">إجمالي تكلفة الغاز</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalGasCost} /></td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td className="px-4 py-3">السولار</td>
                    <td className="px-4 py-3">{Number(activeCycle.totalSolarLiters || 0).toFixed(2)} لتر</td>
                    <td className="px-4 py-3">إجمالي المصاريف</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalExpenses} /></td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">إجمالي تكلفة العلاج</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalMedicationCost} /></td>
                    <td className="px-4 py-3">صافي رواتب العمال</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalWorkerNetSalary} /></td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td className="px-4 py-3">إجمالي تكلفة شراء الكتاكيت</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalChickPurchaseCost} /></td>
                    <td className="px-4 py-3">سعر الكتكوت (محسوب)</td>
                    <td className="px-4 py-3">
                      {chickPriceFromConsumptionFormula != null ? (
                        <ColoredMoney value={chickPriceFromConsumptionFormula} />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 text-sm text-slate-600" colSpan={4}>
                      سعر الكتكوت = (إجمالي البنود الثلاثة + المصاريف + تكلفة الكتاكيت) ÷ إجمالي عدد الكتاكيت في الدورة
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">صافي وزن البيع</td>
                    <td className="px-4 py-3">{Number(activeCycle.totalSalesNetWeight || 0).toFixed(2)} كجم</td>
                    <td className="px-4 py-3">إجمالي البيع</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalSalesAmount} /></td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">المتبقي</td>
                    <td className="px-4 py-3"><ColoredMoney value={activeCycle.totalSalesRemaining} /></td>
                    <td className="px-4 py-3">العلف المستهلك</td>
                    <td className="px-4 py-3">{Number(activeCycle.totalDailyFeedConsumed || 0).toFixed(2)} كجم</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/60">
                    <td className="px-4 py-3">آخر متوسط وزن</td>
                    <td className="px-4 py-3">{Number(activeCycle.latestAverageWeight || 0).toFixed(2)} كجم</td>
                    <td className="px-4 py-3">مخزون العلف</td>
                    <td className="px-4 py-3">{Number(activeCycle.feedStockKg || 0).toFixed(2)} كجم</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">مخزون العلاج</td>
                    <td className="px-4 py-3">{Number(activeCycle.medicationStockQuantity || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-400">—</td>
                    <td className="px-4 py-3 text-slate-400">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-lg font-semibold text-slate-700">لا توجد دورة نشطة الآن</p>
        )}
      </div>}

      {activeCycle && !sectionMode && (
        <nav className="app-toolbar" aria-label="أقسام المزرعة">
          <div className="mb-4 border-b border-slate-100 pb-4 text-center sm:text-right">
            <p className="app-panel-title">التنقّل السريع</p>
            <h2 className="app-panel-heading">اختر القسم</h2>
            <p className="app-muted mt-1">الكتاكيت، العلف، المبيعات، العمال، والمزيد</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {actions.map((action) => (
              <LargeActionButton
                key={action.key}
                icon={action.icon}
                label={action.label}
                isActive={sectionSlug === action.key}
                onClick={() => onFarmSectionNavigate?.(action.key)}
              />
            ))}
          </div>
        </nav>
      )}

      {activeCycle && sectionMode && activeActionMeta && (
        <div className="app-card-soft mb-5 flex items-center justify-between border-teal-100/70 px-5 py-4">
          <div>
            <p className="app-panel-title">القسم الحالي</p>
            <h3 className="text-2xl font-extrabold text-slate-900">{activeActionMeta.label}</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onFarmHomeNavigate?.()}
              className="app-btn-outline py-2 text-sm"
            >
              رجوع للأقسام
            </button>
            <span className="text-4xl">{activeActionMeta.icon}</span>
          </div>
        </div>
      )}

      {activeCycle && sectionSlug === 'logs' && (
        <div id="farm-section-logs" className="scroll-mt-24 mb-5 app-card p-4">
          <h3 className="mb-3 text-xl font-bold text-slate-900">السجل الشامل للمزرعة</h3>
          <p className="mb-3 text-base text-slate-600">
            كل العمليات المسجلة داخل الدورة الحالية (كتاكيت، نفوق، علف، علاج، بيع، أوزان...) مع إمكانية تعديل/حذف مباشرة.
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLogTypeFilter('ALL')}
              className={`rounded-lg px-3 py-1 text-sm font-bold ${logTypeFilter === 'ALL' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'}`}
            >
              الكل
            </button>
            {Object.entries(LOG_TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setLogTypeFilter(type)}
                className={`rounded-lg px-3 py-1 text-sm font-bold ${logTypeFilter === type ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="app-table-wrap">
            <table className="w-full min-w-[900px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">التفاصيل</th>
                  <th className="px-3 py-2">وقت التسجيل</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {allFarmLogs
                  .filter((row) => logTypeFilter === 'ALL' || row.type === logTypeFilter)
                  .map((row) => (
                    <tr key={`${row.type}-${row.id}`} className="border-b border-slate-100">
                      <td className="px-3 py-2">{row.date ? new Date(row.date).toLocaleDateString('ar-EG') : '—'}</td>
                      <td className="px-3 py-2 font-semibold">{row.title}</td>
                      <td className="px-3 py-2 text-slate-700">{row.details}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEditFromLog(row)} className="app-btn-xs-edit">
                            تعديل
                          </button>
                          <button type="button" onClick={() => deleteFromLog(row)} className="app-btn-xs-delete">
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {allFarmLogs.filter((row) => logTypeFilter === 'ALL' || row.type === logTypeFilter).length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      لا توجد سجلات مطابقة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeCycle && sectionSlug === 'consumption' && (
        <div id="farm-section-consumption" className="scroll-mt-24 mb-5 flex flex-col gap-4">
          <div className="app-card p-4">
            <h3 className="mb-2 text-xl font-bold text-slate-900">بنود الاستهلاك</h3>
            <p className="mb-3 text-base text-slate-600">اختر البند المطلوب. قسم الغاز والسولار مستقل كما هو ولم يتم إلغاؤه.</p>
            <div className="grid gap-3 md:grid-cols-4">
              <select value={consumptionItemFilter} onChange={(e) => setConsumptionItemFilter(e.target.value)} className="app-input md:col-span-2">
                <option value="FEED">بند العلف</option>
                <option value="FUEL">بند الغاز والسولار</option>
                <option value="MEDICATION">بند العلاج</option>
              </select>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                إجمالي البند:{' '}
                {consumptionItemFilter === 'FEED' ? (
                  <ColoredMoney value={totalFeedConsumptionCost} />
                ) : consumptionItemFilter === 'FUEL' ? (
                  <ColoredMoney value={totalFuelConsumptionCost} />
                ) : (
                  <ColoredMoney value={totalMedicationConsumptionCost} />
                )}
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">
                إجمالي البنود الثلاثة: <ColoredMoney value={totalConsumptionAll} />
              </div>
            </div>
          </div>

          <div className="app-card border-2 border-teal-200/80 bg-gradient-to-br from-teal-50/60 via-white to-slate-50/40 p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">تقرير الاستهلاك حسب اليوم</h3>
                <p className="mt-1 text-sm text-slate-600">
                  اختر تاريخًا واحدًا لعرض ما سُجِّل له في هذه الدورة: علف وماء وغاز/كهرباء (من الاستهلاك اليومي) وسجلات الغاز والسولار بنفس التاريخ.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftConsumptionReportDate(-1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  اليوم السابق
                </button>
                <input
                  type="date"
                  value={consumptionReportDate}
                  onChange={(e) => setConsumptionReportDate(e.target.value)}
                  className="app-input w-auto min-w-[10rem]"
                />
                <button
                  type="button"
                  onClick={() => shiftConsumptionReportDate(1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  اليوم التالي
                </button>
                <button
                  type="button"
                  onClick={() => setConsumptionReportDate(localDateKey(new Date()))}
                  className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold text-white hover:bg-teal-800"
                >
                  اليوم
                </button>
              </div>
            </div>
            <p className="mb-3 text-center text-base font-semibold text-teal-900">
              {new Date(`${consumptionReportDate}T12:00:00`).toLocaleDateString('ar-EG', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
            {!consumptionDayHasReportContent ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-center text-slate-600">
                لا توجد بيانات مسجلة لهذا اليوم في الدورة الحالية. سجِّل استهلاك العلف أو الغاز/السولار بالتاريخ نفسه ليظهر هنا.
              </div>
            ) : (
              <div className="app-table-wrap">
                <table className="w-full min-w-[720px] text-right text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 text-slate-800">
                      <th className="px-3 py-2.5 font-bold">البند</th>
                      <th className="px-3 py-2.5 font-bold">الكمية / التفاصيل</th>
                      <th className="px-3 py-2.5 font-bold">الوحدة</th>
                      <th className="px-3 py-2.5 font-bold">تكلفة تقديرية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-white">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">علف (الاستهلاك اليومي)</td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {consumptionDayFeedKg > 0 ? (
                          <>
                            <span className="font-bold text-lime-900">{consumptionDayFeedKg.toFixed(2)}</span> كجم
                            {consumptionDayFeedBags != null ? (
                              <span className="mr-2 text-slate-500">
                                ({consumptionDayFeedBags.toFixed(2)} شيكارة × {CONSUMPTION_BAG_KG} كجم)
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">كجم / شيكارة</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {consumptionDayFeedKg > 0 ? consumptionDayFeedCostEst.toFixed(2) : '—'}
                      </td>
                    </tr>
                    <tr className="bg-slate-50/80">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">ماء</td>
                      <td className="px-3 py-2.5">
                        {consumptionDayWater > 0 ? (
                          <span className="font-bold text-sky-800">{consumptionDayWater.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">لتر</td>
                      <td className="px-3 py-2.5 text-slate-400">—</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">غاز (حقل الاستهلاك اليومي)</td>
                      <td className="px-3 py-2.5">
                        {consumptionDayGasUsedField > 0 ? (
                          <span className="font-bold text-amber-900">{consumptionDayGasUsedField.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">حسب التسجيل</td>
                      <td className="px-3 py-2.5 text-slate-400">—</td>
                    </tr>
                    <tr className="bg-slate-50/80">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">كهرباء</td>
                      <td className="px-3 py-2.5">
                        {consumptionDayKwh > 0 ? (
                          <span className="font-bold text-indigo-900">{consumptionDayKwh.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">كيلوواط ساعة</td>
                      <td className="px-3 py-2.5 text-slate-400">—</td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">أسطوانات غاز (سجلات اليوم)</td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {consumptionDayGases.length > 0 ? (
                          <>
                            <span className="font-bold text-slate-900">{consumptionDayGasCylinders}</span> أسطوانة
                            {consumptionDayGasDetailText ? (
                              <div className="mt-1 text-xs text-slate-500">{consumptionDayGasDetailText}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">سجل شراء/صرف</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {consumptionDayGasCostSum > 0 ? consumptionDayGasCostSum.toFixed(2) : consumptionDayGases.length > 0 ? '0.00' : '—'}
                      </td>
                    </tr>
                    <tr className="bg-slate-50/80">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">سولار (سجلات اليوم)</td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {consumptionDaySolarLiters > 0 ? (
                          <span className="font-bold text-slate-900">{consumptionDaySolarLiters.toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">لتر</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {consumptionDaySolarCost > 0 ? consumptionDaySolarCost.toFixed(2) : consumptionDaySolars.length > 0 ? '0.00' : '—'}
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td className="px-3 py-2.5 font-semibold text-slate-900">علاج</td>
                      <td className="px-3 py-2.5 text-slate-600" colSpan={2}>
                        استخدام العلاج يُجمع على مستوى الدورة وليس مفصولًا باليوم في النسخة الحالية؛ راجع بند العلاج أدناه لإجمالي المستهلك.
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">—</td>
                    </tr>
                    {consumptionDayNotes ? (
                      <tr className="bg-amber-50/50">
                        <td className="px-3 py-2.5 font-semibold text-amber-950">ملاحظات اليوم</td>
                        <td className="px-3 py-2.5 text-amber-950" colSpan={3}>
                          {consumptionDayNotes}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {consumptionItemFilter === 'FEED' && (
          <div className="app-card p-4">
            <h3 className="mb-2 text-xl font-bold text-slate-900">الاستهلاك اليومي للعلف</h3>
            <p className="mb-3 text-base text-slate-600">
              يمكن الإدخال بالكيلو أو بالشيكارة؛ <strong>الشيكارة = {CONSUMPTION_BAG_KG} كجم</strong> (متوافقة مع شيكارة شراء العلف).
            </p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <input type="date" value={dailyConsumptionDateInput} onChange={(e) => onDailyConsumptionDateChange(e.target.value)} className="app-input" />
              <select value={dailyFeedUnitInput} onChange={(e) => onDailyFeedUnitChange(e.target.value)} className="app-input">
                <option value="kg">كيلو (كجم)</option>
                <option value="bags">شيكارة ({CONSUMPTION_BAG_KG} كجم)</option>
              </select>
              <input type="number" min="0" step="0.01" value={dailyFeedConsumedInput} onChange={(e) => onDailyFeedConsumedChange(e.target.value)} className="app-input" placeholder={dailyFeedUnitInput === 'bags' ? 'عدد الشكاير' : 'الكمية بالكجم'} />
              <button type="button" onClick={onAddDailyConsumption} className="rounded-xl bg-lime-700 px-5 py-3 text-lg font-bold text-white">حفظ الاستهلاك</button>
            </div>
            <div className="app-table-wrap mt-4">
              <table className="w-full min-w-[640px] text-right">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-700">
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">شكاير</th>
                    <th className="px-3 py-2">المكافئ (كجم)</th>
                    <th className="px-3 py-2">تكلفة الاستهلاك</th>
                    <th className="px-3 py-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeCycle.dailyConsumptions || []).map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{new Date(item.date).toLocaleDateString('ar-EG')}</td>
                      <td className="px-3 py-2">{item.consumptionBags != null && Number(item.consumptionBags) > 0 ? Number(item.consumptionBags).toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 font-semibold text-lime-900">{Number(item.feedKg || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 font-bold">{(Number(item.feedKg || 0) * feedCostPerKg).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEditModal({ title: "تعديل الاستهلاك اليومي", fields: [{ key: "date", label: "التاريخ", type: "date" }, { key: "feedConsumed", label: "الكمية", type: "number" }, { key: "feedUnit", label: "الوحدة (kg أو bags)", type: "text" }], initialValues: { date: item.date ? new Date(item.date).toISOString().slice(0, 10) : "", feedConsumed: item.consumptionBags != null ? item.consumptionBags : item.feedKg, feedUnit: item.consumptionBags != null ? "bags" : "kg" }, onSubmit: (values) => onUpdateDailyConsumption(item.id, values) })} className="app-btn-xs-edit">تعديل</button>
                          <button type="button" onClick={() => onDeleteDailyConsumption(item.id)} className="app-btn-xs-delete">حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!activeCycle.dailyConsumptions || activeCycle.dailyConsumptions.length === 0) && (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={5}>
                        لا يوجد استهلاك يومي حتى الآن
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {consumptionItemFilter === 'FUEL' && (
            <div className="app-card p-4">
              <h3 className="mb-3 text-xl font-bold text-slate-900">تفاصيل استهلاك الغاز والسولار</h3>
              <div className="mb-4 grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 md:grid-cols-5">
                <input
                  type="date"
                  value={consumptionFuelDateInput}
                  onChange={(e) => setConsumptionFuelDateInput(e.target.value)}
                  className="app-input"
                />
                <select value={consumptionFuelType} onChange={(e) => setConsumptionFuelType(e.target.value)} className="app-input">
                  <option value="GAS">غاز</option>
                  <option value="SOLAR">سولار</option>
                </select>
                {consumptionFuelType === 'GAS' ? (
                  <select value={consumptionGasTypeInput} onChange={(e) => setConsumptionGasTypeInput(e.target.value)} className="app-input">
                    <option value="كبير">كبير</option>
                    <option value="صغير">صغير</option>
                  </select>
                ) : (
                  <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">الوحدة: لتر</div>
                )}
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={consumptionFuelQuantityInput}
                  onChange={(e) => setConsumptionFuelQuantityInput(e.target.value)}
                  className="app-input"
                  placeholder={consumptionFuelType === 'GAS' ? 'العدد' : 'اللترات'}
                />
                <button
                  type="button"
                  onClick={() => {
                    const qty = Number(consumptionFuelQuantityInput || 0)
                    if (qty <= 0) return
                    if (consumptionFuelType === 'GAS') {
                      onAddGas({
                        type: consumptionGasTypeInput,
                        count: qty,
                        cost: qty * avgGasUnitCost,
                        date: consumptionFuelDateInput,
                      })
                    } else {
                      onAddSolar({
                        liters: qty,
                        cost: qty * avgSolarCostPerLiter,
                        date: consumptionFuelDateInput,
                      })
                    }
                    setConsumptionFuelQuantityInput('')
                  }}
                  className="app-btn-secondary"
                >
                  حفظ استهلاك الوقود
                </button>
                <div className="md:col-span-5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                  التكلفة التقديرية تلقائيًا: {consumptionFuelComputedCost.toFixed(2)} | متوسط الوحدة ({consumptionFuelType === 'GAS' ? consumptionGasTypeInput : 'سولار'}): {(consumptionFuelType === 'GAS' ? avgGasUnitCost : avgSolarCostPerLiter).toFixed(4)}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="app-table-wrap"><table className="w-full min-w-[520px] text-right text-sm"><thead><tr className="border-b border-slate-200 text-slate-700"><th className="px-2 py-2">تاريخ الغاز</th><th className="px-2 py-2">النوع</th><th className="px-2 py-2">العدد</th><th className="px-2 py-2">التكلفة</th></tr></thead><tbody>{(activeCycle.gases || []).map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-2 py-2">{new Date(row.date).toLocaleDateString('ar-EG')}</td><td className="px-2 py-2">{row.gasType || 'كبير'}</td><td className="px-2 py-2">{Number(row.count || 0)}</td><td className="px-2 py-2 font-bold">{Number(row.cost || 0).toFixed(2)}</td></tr>)}</tbody></table></div>
                <div className="app-table-wrap"><table className="w-full min-w-[520px] text-right text-sm"><thead><tr className="border-b border-slate-200 text-slate-700"><th className="px-2 py-2">تاريخ السولار</th><th className="px-2 py-2">اللترات</th><th className="px-2 py-2">التكلفة</th></tr></thead><tbody>{(activeCycle.solars || []).map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-2 py-2">{new Date(row.date).toLocaleDateString('ar-EG')}</td><td className="px-2 py-2">{Number(row.liters || 0).toFixed(2)}</td><td className="px-2 py-2 font-bold">{Number(row.cost || 0).toFixed(2)}</td></tr>)}</tbody></table></div>
              </div>
            </div>
          )}

          {consumptionItemFilter === 'MEDICATION' && (
            <div className="app-card p-4">
              <h3 className="mb-3 text-xl font-bold text-slate-900">تفاصيل استهلاك العلاج</h3>
              <div className="mb-4 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 md:grid-cols-5">
                <input
                  type="date"
                  value={consumptionMedicationDateInput}
                  onChange={(e) => setConsumptionMedicationDateInput(e.target.value)}
                  className="app-input"
                />
                <select
                  value={consumptionMedicationIdInput}
                  onChange={(e) => setConsumptionMedicationIdInput(e.target.value)}
                  className="app-input md:col-span-2"
                >
                  <option value="">اختر العلاج</option>
                  {medicationRows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} | متبقي: {row.remaining.toFixed(2)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={consumptionMedicationQtyInput}
                  onChange={(e) => setConsumptionMedicationQtyInput(e.target.value)}
                  className="app-input"
                  placeholder="الكمية المستهلكة"
                />
                <button
                  type="button"
                  onClick={() => {
                    const qty = Number(consumptionMedicationQtyInput || 0)
                    if (!consumptionMedicationIdInput || qty <= 0) return
                    onTrackMedicationUsage(consumptionMedicationIdInput, {
                      usedQuantity: qty,
                      date: consumptionMedicationDateInput,
                    })
                    setConsumptionMedicationQtyInput('')
                  }}
                  className="app-btn-primary"
                >
                  حفظ استهلاك العلاج
                </button>
                <div className="md:col-span-5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                  تكلفة الكمية تلقائيًا: {consumptionMedicationComputedCost.toFixed(2)} | سعر الوحدة: {Number(selectedMedicationConsumption?.unitCost || 0).toFixed(4)}
                </div>
              </div>
              <div className="app-table-wrap">
                <table className="w-full min-w-[900px] text-right">
                  <thead><tr className="border-b border-slate-200 text-slate-700"><th className="px-3 py-2">العلاج</th><th className="px-3 py-2">الكمية الكلية</th><th className="px-3 py-2">المستهلك</th><th className="px-3 py-2">المتبقي</th><th className="px-3 py-2">سعر الوحدة</th><th className="px-3 py-2">تكلفة المستهلك</th></tr></thead>
                  <tbody>{medicationRows.map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2">{Number(row.quantity || 0).toFixed(2)}</td><td className="px-3 py-2">{row.used.toFixed(2)}</td><td className="px-3 py-2 font-semibold text-emerald-700">{row.remaining.toFixed(2)}</td><td className="px-3 py-2">{row.unitCost.toFixed(2)}</td><td className="px-3 py-2 font-bold">{row.usedCost.toFixed(2)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeCycle && sectionSlug === 'fuel' && (
        <div id="farm-section-fuel" className="scroll-mt-24 mb-5 flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="app-card p-4">
              <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة الغاز</h3>
              <div className="grid gap-3">
                <select value={gasTypeInput} onChange={(event) => onGasTypeChange(event.target.value)} className="app-input">
                  <option value="كبير">كبير</option>
                  <option value="صغير">صغير</option>
                </select>
                <input type="number" min="1" value={gasCountInput} onChange={(event) => onGasCountChange(event.target.value)} className="app-input" placeholder="العدد" />
                <input type="number" min="0" value={gasCostInput} onChange={(event) => onGasCostChange(event.target.value)} className="app-input" placeholder="التكلفة" />
                <input type="date" value={gasDateInput} onChange={(event) => onGasDateChange(event.target.value)} className="app-input" />
                {renderPurchasePaymentPanel('fuel-gas')}
                <button type="button" onClick={onAddGas} className="rounded-xl bg-indigo-600 px-5 py-3 text-lg font-bold text-white">حفظ الغاز</button>
              </div>
              <div className="app-table-wrap mt-4">
                <table className="w-full min-w-[460px] text-right text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-700">
                      <th className="px-2 py-2">التاريخ</th>
                      <th className="px-2 py-2">النوع</th>
                      <th className="px-2 py-2">العدد</th>
                      <th className="px-2 py-2">التكلفة</th>
                      <th className="px-2 py-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeCycle.gases || []).map((gas) => (
                      <tr key={gas.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{new Date(gas.date).toLocaleDateString('ar-EG')}</td>
                        <td className="px-2 py-2">{gas.gasType || 'كبير'}</td>
                        <td className="px-2 py-2">{Number(gas.count || 0)}</td>
                        <td className="px-2 py-2">{Number(gas.cost || 0).toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditModal({ title: 'تعديل الغاز', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'gasType', label: 'النوع', type: 'text' }, { key: 'count', label: 'العدد', type: 'number' }, { key: 'cost', label: 'التكلفة', type: 'number' }], initialValues: { date: gas.date ? new Date(gas.date).toISOString().slice(0, 10) : '', gasType: gas.gasType || 'كبير', count: Number(gas.count || 0), cost: Number(gas.cost || 0) }, onSubmit: (values) => onUpdateGas(gas.id, values) })} className="app-btn-xs-edit">تعديل</button>
                            <button type="button" onClick={() => onDeleteGas(gas.id)} className="app-btn-xs-delete">حذف</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="app-card p-4">
              <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة السولار</h3>
              <div className="grid gap-3">
                <input type="number" min="1" value={solarLitersInput} onChange={(event) => onSolarLitersChange(event.target.value)} className="app-input" placeholder="اللترات" />
                <input type="number" min="0" value={solarCostInput} onChange={(event) => onSolarCostChange(event.target.value)} className="app-input" placeholder="التكلفة" />
                <input type="date" value={solarDateInput} onChange={(event) => onSolarDateChange(event.target.value)} className="app-input" />
                {renderPurchasePaymentPanel('fuel-solar')}
                <button type="button" onClick={onAddSolar} className="rounded-xl bg-cyan-600 px-5 py-3 text-lg font-bold text-white">حفظ السولار</button>
              </div>
              <div className="app-table-wrap mt-4">
                <table className="w-full min-w-[460px] text-right text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-700">
                      <th className="px-2 py-2">التاريخ</th>
                      <th className="px-2 py-2">اللترات</th>
                      <th className="px-2 py-2">التكلفة</th>
                      <th className="px-2 py-2">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeCycle.solars || []).map((solar) => (
                      <tr key={solar.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">{new Date(solar.date).toLocaleDateString('ar-EG')}</td>
                        <td className="px-2 py-2">{Number(solar.liters || 0).toFixed(2)}</td>
                        <td className="px-2 py-2">{Number(solar.cost || 0).toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openEditModal({ title: 'تعديل السولار', fields: [{ key: 'date', label: 'التاريخ', type: 'date' }, { key: 'liters', label: 'اللترات', type: 'number' }, { key: 'cost', label: 'التكلفة', type: 'number' }], initialValues: { date: solar.date ? new Date(solar.date).toISOString().slice(0, 10) : '', liters: Number(solar.liters || 0), cost: Number(solar.cost || 0) }, onSubmit: (values) => onUpdateSolar(solar.id, values) })} className="app-btn-xs-edit">تعديل</button>
                            <button type="button" onClick={() => onDeleteSolar(solar.id)} className="app-btn-xs-delete">حذف</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeCycle && sectionSlug === 'weight' && (() => {
        const validWeightSamples = weightSamplesInput
          .map((value) => Number(value))
          .filter((value) => !Number.isNaN(value) && value > 0)
        const gc = Number(weightGroupBirdCountInput || 0)
        const gtot = Number(weightGroupTotalKgInput || 0)
        const fromGroup = gc > 0 && gtot > 0 ? gtot / gc : 0
        const periodAverageWeight =
          fromGroup > 0
            ? fromGroup
            : validWeightSamples.length > 0
              ? validWeightSamples.reduce((sum, value) => sum + value, 0) / validWeightSamples.length
              : 0
        const sortedWeightEntries = [...(activeCycle.weightEntries || [])].sort((a, b) => {
          const byDate = new Date(a.date) - new Date(b.date)
          if (byDate !== 0) return byDate
          return new Date(a.createdAt) - new Date(b.createdAt)
        })
        const lastTenWeights = sortedWeightEntries.slice(-10)
        return (
        <div id="farm-section-weight" className="scroll-mt-24 mb-5 app-card p-4">
          <h3 className="mb-3 text-xl font-bold text-slate-900">متابعة أوزان الدجاج</h3>
          <p className="mb-4 text-base text-slate-600">
            إمّا تدخل أوزان فراخ منفردة فيُحسب المتوسط = <strong>مجموع الأوزان ÷ عددها</strong>، أو تدخل{' '}
            <strong>عدد الفرخ</strong> مع <strong>إجمالي وزنهم على الميزان</strong> (مثل 10 فرخات معًا) فيُحسب
            المتوسط تلقائيًا = الإجمالي ÷ العدد.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="date"
              value={weightDateInput}
              onChange={(e) => onWeightDateChange(e.target.value)}
              className="app-input"
            />
            <button
              type="button"
              onClick={() => {
                if (periodAverageWeight <= 0) return
                onAddWeight(periodAverageWeight, weightDateInput, {
                  groupBirdCount: fromGroup > 0 ? gc : undefined,
                  groupTotalWeightKg: fromGroup > 0 ? gtot : undefined,
                })
                setWeightSamplesInput([""])
              }}
              disabled={periodAverageWeight <= 0}
              className="app-btn-primary"
            >
              حفظ متوسط الفترة
            </button>
          </div>

          <div className="mt-3 grid gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-3 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-800">
              عدد الفرخ في العينة (اختياري)
              <input
                type="number"
                min="0"
                value={weightGroupBirdCountInput}
                onChange={(e) => onWeightGroupBirdCountChange(e.target.value)}
                className="app-input mt-1"
                placeholder="مثال: 10"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-800">
              إجمالي وزنهم (كجم)
              <input
                type="number"
                min="0"
                step="0.01"
                value={weightGroupTotalKgInput}
                onChange={(e) => onWeightGroupTotalKgChange(e.target.value)}
                className="app-input mt-1"
                placeholder="وزن المجموعة على الميزان"
              />
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-3 text-base font-semibold text-slate-700">أوزان فراخ منفردة (كجم)</p>
            <div className="grid gap-2 md:grid-cols-2">
              {weightSamplesInput.map((sample, index) => (
                <div key={`weight-sample-${index}`} className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={sample}
                    onChange={(e) => updateWeightSampleField(index, e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-2 text-base"
                    placeholder={`وزن رقم ${index + 1}`}
                  />
                  {weightSamplesInput.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWeightSampleField(index)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700"
                    >
                      حذف
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addWeightSampleField}
              className="mt-3 rounded-lg bg-slate-200 px-4 py-2 text-sm font-bold text-slate-800"
            >
              + إضافة وزن
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <p className="text-lg font-semibold text-slate-800">
              عدد أوزان منفردة: {validWeightSamples.length}
            </p>
            <p className="text-lg font-semibold text-slate-800">
              متوسط الفترة: {periodAverageWeight.toFixed(2)} كجم
              {fromGroup > 0 && (
                <span className="mr-2 block text-sm font-normal text-teal-800">
                  (من مجموعة {gc} فرخة، إجمالي {gtot.toFixed(2)} كجم)
                </span>
              )}
            </p>
            <p className="text-lg font-semibold text-slate-800">
              آخر قراءة: {Number(activeCycle.latestAverageWeight || 0).toFixed(2)} كجم
            </p>
          </div>

          {sortedWeightEntries.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-base font-bold text-slate-700">نمو الوزن (آخر دفعات حسب الترتيب الزمني)</p>
              <div className="flex h-28 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {lastTenWeights.map((entry) => {
                  const maxWeight = Math.max(
                    ...sortedWeightEntries.map((item) => Number(item.averageWeight || 0)),
                    1,
                  )
                  const heightPercent = (Number(entry.averageWeight || 0) / maxWeight) * 100
                  return (
                    <div key={entry.id} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full rounded bg-emerald-500"
                        style={{ height: `${Math.max(8, heightPercent)}%` }}
                        title={`${new Date(entry.date).toLocaleDateString('ar-EG')} — ${Number(entry.averageWeight || 0).toFixed(2)} كجم`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[720px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">تاريخ الميزان</th>
                  <th className="px-3 py-2">وقت التسجيل</th>
                  <th className="px-3 py-2">متوسط (كجم)</th>
                  <th className="px-3 py-2">عينة جماعية</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sortedWeightEntries.map((item, idx) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-800">{idx + 1}</td>
                    <td className="px-3 py-2">{new Date(item.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString('ar-EG', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-2 font-semibold text-emerald-800">
                      {Number(item.averageWeight || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.groupBirdCount != null && item.groupBirdCount > 0 && item.groupTotalWeightKg != null
                        ? `${item.groupBirdCount} فرخة — ${Number(item.groupTotalWeightKg).toFixed(2)} كجم إجمالي`
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditModal({
                              title: "تعديل الوزن",
                              fields: [
                                { key: "date", label: "التاريخ", type: "date" },
                                { key: "averageWeight", label: "متوسط الوزن (كجم)", type: "number" },
                                {
                                  key: "groupBirdCount",
                                  label: "عدد الفرخ في العينة (اختياري)",
                                  type: "number",
                                },
                                {
                                  key: "groupTotalWeightKg",
                                  label: "إجمالي وزن المجموعة (كجم)",
                                  type: "number",
                                },
                              ],
                              initialValues: {
                                date: item.date ? new Date(item.date).toISOString().slice(0, 10) : "",
                                averageWeight: Number(item.averageWeight || 0),
                                groupBirdCount: item.groupBirdCount != null ? item.groupBirdCount : "",
                                groupTotalWeightKg:
                                  item.groupTotalWeightKg != null ? Number(item.groupTotalWeightKg) : "",
                              },
                              onSubmit: (values) =>
                                onUpdateWeightEntry(item.id, {
                                  date: values.date,
                                  averageWeight: Number(values.averageWeight),
                                  groupBirdCount:
                                    values.groupBirdCount === "" || values.groupBirdCount == null
                                      ? undefined
                                      : Number(values.groupBirdCount),
                                  groupTotalWeightKg:
                                    values.groupTotalWeightKg === "" || values.groupTotalWeightKg == null
                                      ? undefined
                                      : Number(values.groupTotalWeightKg),
                                }),
                            })
                          }
                          className="app-btn-xs-edit"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteWeightEntry(item.id)}
                          className="app-btn-xs-delete"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedWeightEntries.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={6}>
                      لا توجد أوزان مسجلة حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )
      })()}

      {activeCycle && sectionSlug === 'inventory' && (
        <div id="farm-section-inventory" className="scroll-mt-24 mb-5 app-card p-4">
          <h3 className="mb-2 text-xl font-bold text-slate-900">مخزن الدورة — جدول شامل</h3>
          <p className="mb-4 text-sm text-slate-600">
            جداول مسطرة ومنظمة تعرض موقف المخزون الحالي للكتاكيت والعلف والعلاج والغاز والسولار بالتفصيل.
          </p>

          <div className="app-table-wrap mb-4">
            <table className="w-full min-w-[900px] text-right">
              <thead className="bg-slate-100 text-slate-800">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2">الصنف</th>
                  <th className="px-3 py-2">إجمالي الوارد</th>
                  <th className="px-3 py-2">إجمالي المستهلك/المصروف</th>
                  <th className="px-3 py-2">المتبقي</th>
                  <th className="px-3 py-2">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 font-semibold">كتاكيت</td>
                  <td className="px-3 py-2">{Number(activeCycle.totalArrivedChicks || 0).toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2">
                    نفوق {Number(activeCycle.totalMortality || 0).toLocaleString('ar-EG')} + مباع {Number(activeCycle.totalSoldBirds || 0).toLocaleString('ar-EG')}
                  </td>
                  <td className="px-3 py-2 font-bold text-emerald-700">{Number(activeCycle.currentChickenCount || 0).toLocaleString('ar-EG')}</td>
                  <td className="px-3 py-2 text-slate-600">المتبقي الحي في الدورة</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 font-semibold">علف</td>
                  <td className="px-3 py-2">{Number(activeCycle.totalFeedWeightKg || 0).toFixed(2)} كجم</td>
                  <td className="px-3 py-2">{Number(activeCycle.totalDailyFeedConsumed || 0).toFixed(2)} كجم</td>
                  <td className="px-3 py-2 font-bold text-emerald-700">{Number(activeCycle.feedStockKg || 0).toFixed(2)} كجم</td>
                  <td className="px-3 py-2 text-slate-600">التكلفة الإجمالية: {Number(activeCycle.totalFeedCost || 0).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 font-semibold">علاج</td>
                  <td className="px-3 py-2">{Number((activeCycle.medications || []).reduce((s, x) => s + Number(x.quantity || 0), 0)).toFixed(2)}</td>
                  <td className="px-3 py-2">{Number((activeCycle.medications || []).reduce((s, x) => s + Number(x.usedQuantity || 0), 0)).toFixed(2)}</td>
                  <td className="px-3 py-2 font-bold text-emerald-700">{Number(activeCycle.medicationStockQuantity || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-slate-600">التكلفة الإجمالية: {Number(activeCycle.totalMedicationCost || 0).toFixed(2)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 font-semibold">غاز</td>
                  <td className="px-3 py-2">{Number((activeCycle.gases || []).reduce((s, x) => s + Number(x.count || 0), 0)).toFixed(2)} أسطوانة</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2 font-bold text-slate-800">سجلات وقود</td>
                  <td className="px-3 py-2 text-slate-600">إجمالي التكلفة: {Number(activeCycle.totalGasCost || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">سولار</td>
                  <td className="px-3 py-2">{Number(activeCycle.totalSolarLiters || 0).toFixed(2)} لتر</td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2 font-bold text-slate-800">سجلات وقود</td>
                  <td className="px-3 py-2 text-slate-600">إجمالي التكلفة: {Number(activeCycle.totalSolarCost || 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="app-table-wrap">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">تفاصيل مخزون العلاج</div>
              <table className="w-full min-w-[560px] text-right">
                <thead className="bg-white text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2">العلاج</th>
                    <th className="px-3 py-2">مشتراة</th>
                    <th className="px-3 py-2">مستخدم</th>
                    <th className="px-3 py-2">متبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeCycle.medicationStockItems || []).map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{Number(item.quantity || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{Number(item.usedQuantity || 0).toFixed(2)}</td>
                      <td className={`px-3 py-2 font-bold ${Number(item.remainingQuantity || 0) <= 5 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {Number(item.remainingQuantity || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {(!activeCycle.medicationStockItems || activeCycle.medicationStockItems.length === 0) && (
                    <tr><td className="px-3 py-3 text-slate-500" colSpan={4}>لا يوجد علاج مسجل حتى الآن</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="app-table-wrap">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">تفاصيل الوقود (غاز + سولار)</div>
              <table className="w-full min-w-[560px] text-right">
                <thead className="bg-white text-slate-700">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2">النوع</th>
                    <th className="px-3 py-2">الإجمالي</th>
                    <th className="px-3 py-2">الوحدة</th>
                    <th className="px-3 py-2">التكلفة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2">غاز كبير</td>
                    <td className="px-3 py-2">{Number((activeCycle.gases || []).filter((x) => (x.gasType || 'كبير') === 'كبير').reduce((s, x) => s + Number(x.count || 0), 0)).toFixed(2)}</td>
                    <td className="px-3 py-2">أسطوانة</td>
                    <td className="px-3 py-2">{Number((activeCycle.gases || []).filter((x) => (x.gasType || 'كبير') === 'كبير').reduce((s, x) => s + Number(x.cost || 0), 0)).toFixed(2)}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2">غاز صغير</td>
                    <td className="px-3 py-2">{Number((activeCycle.gases || []).filter((x) => x.gasType === 'صغير').reduce((s, x) => s + Number(x.count || 0), 0)).toFixed(2)}</td>
                    <td className="px-3 py-2">أسطوانة</td>
                    <td className="px-3 py-2">{Number((activeCycle.gases || []).filter((x) => x.gasType === 'صغير').reduce((s, x) => s + Number(x.cost || 0), 0)).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">سولار</td>
                    <td className="px-3 py-2">{Number(activeCycle.totalSolarLiters || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">لتر</td>
                    <td className="px-3 py-2">{Number(activeCycle.totalSolarCost || 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {farmId && sectionSlug === 'treasury' && (
        <div id="farm-section-treasury" className="scroll-mt-24 mb-5 app-card p-4">
          <h3 className="mb-3 text-xl font-bold text-slate-900">خزنة المزرعة</h3>
          <p className="mb-3 text-base text-slate-600">
            سجل حركات الخزنة (إيداع/سحب) والأجل للأشخاص (إضافة أجل ثم خصم منه).
          </p>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-lg font-bold text-emerald-900">
              رصيد الخزنة النقدي: <ColoredMoney value={treasuryCashBalance} />
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-lg font-bold text-amber-900">
              إجمالي الأجل المفتوح:{' '}
              <ColoredMoney
                value={Object.values(creditByPerson)
                  .filter((v) => v > 0)
                  .reduce((s, v) => s + v, 0)}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <select
              value={treasuryTypeInput}
              onChange={(event) => onTreasuryTypeChange(event.target.value)}
              className="app-input"
            >
              <option value="DEPOSIT">إيداع</option>
              <option value="WITHDRAW">سحب</option>
              <option value="CREDIT_ADD">إضافة أجل لشخص</option>
              <option value="CREDIT_DEDUCT">خصم من أجل شخص</option>
            </select>
            <input
              type="number"
              min="0"
              value={treasuryAmountInput}
              onChange={(event) => onTreasuryAmountChange(event.target.value)}
              className="app-input"
              placeholder="المبلغ"
            />
            <input
              type="text"
              value={treasuryPersonNameInput}
              onChange={(event) => onTreasuryPersonNameChange(event.target.value)}
              className="app-input"
              placeholder="اسم الشخص (للأجل)"
              disabled={treasuryTypeInput !== 'CREDIT_ADD' && treasuryTypeInput !== 'CREDIT_DEDUCT'}
            />
            <input
              type="text"
              value={treasuryNotesInput}
              onChange={(event) => onTreasuryNotesChange(event.target.value)}
              className="app-input"
              placeholder="ملاحظات"
            />
            <input
              type="date"
              value={treasuryDateInput}
              onChange={(event) => onTreasuryDateChange(event.target.value)}
              className="app-input"
            />
            <button
              type="button"
              onClick={onAddTreasuryEntry}
              className="rounded-xl bg-emerald-700 px-5 py-3 text-lg font-bold text-white"
            >
              حفظ الحركة
            </button>
          </div>

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[860px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">المبلغ</th>
                  <th className="px-3 py-2">الشخص</th>
                  <th className="px-3 py-2">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {sortedTreasuryEntries.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {row.type === 'DEPOSIT'
                        ? 'إيداع'
                        : row.type === 'WITHDRAW'
                          ? 'سحب'
                          : row.type === 'CREDIT_ADD'
                            ? 'إضافة أجل'
                            : 'خصم من أجل'}
                    </td>
                    <td className="px-3 py-2"><ColoredMoney value={row.amount} /></td>
                    <td className="px-3 py-2">{row.personName || '—'}</td>
                    <td className="px-3 py-2">{row.notes || '—'}</td>
                  </tr>
                ))}
                {sortedTreasuryEntries.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>
                      لا توجد حركات خزنة حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[640px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">الشخص</th>
                  <th className="px-3 py-2">الأجل المتبقي</th>
                  <th className="px-3 py-2">سداد</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(creditByPerson)
                  .filter(([, v]) => v > 0)
                  .map(([person, amount]) => (
                    <tr key={person} className="border-b border-slate-100">
                      <td className="px-3 py-2">{person}</td>
                      <td className="px-3 py-2 font-semibold text-amber-800"><ColoredMoney value={amount} /></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => quickSettleCredit(person, amount, 'PARTIAL')}
                            className="rounded-lg bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800"
                          >
                            سداد جزئي
                          </button>
                          <button
                            type="button"
                            onClick={() => quickSettleCredit(person, amount, 'FULL')}
                            className="rounded-lg bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800"
                          >
                            سداد الكل
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                {Object.values(creditByPerson).every((v) => v <= 0) && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={3}>
                      لا يوجد أجل مفتوح حاليًا
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {farmId && sectionSlug === 'suppliers' && (
        <div id="farm-section-suppliers" className="scroll-mt-24 mb-5 flex flex-col gap-4">
          <div className="app-card p-4">
            <h3 className="mb-3 text-xl font-bold text-slate-900">الموردين</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSupplierPanel('ADD')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  supplierPanel === 'ADD' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                إضافة المورد
              </button>
              <button
                type="button"
                onClick={() => setSupplierPanel('LEDGER')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  supplierPanel === 'LEDGER' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                كشف حساب الموردين
              </button>
            </div>
          </div>

          {supplierPanel === 'ADD' && (
          <div className="app-card p-4 md:max-w-xl">
            <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة مورد</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={supplierNameInput}
                onChange={(e) => onSupplierNameChange(e.target.value)}
                className="app-input"
                placeholder="اسم المورد"
              />
              <input
                type="text"
                value={supplierPhoneInput}
                onChange={(e) => onSupplierPhoneChange(e.target.value)}
                className="app-input"
                placeholder="الهاتف (اختياري)"
              />
            </div>
            <button
              type="button"
              onClick={onAddSupplier}
              className="app-btn-primary mt-3"
            >
              حفظ المورد
            </button>
          </div>
          )}

          {supplierPanel === 'LEDGER' && (
          <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-xl font-bold text-slate-900">كشف حساب الموردين</h3>
            <p className="mb-4 text-base text-slate-600">
              كشف تفصيلي لكل مورد: العلف والعلاج والمشتريات الآجلة (غاز، سولار، …) مع <strong>الواصل</strong> و
              <strong>الباقي</strong> — مثل كشف حساب التجار. السداد يُوزَّع على الفواتير الآجلة من الأقدم للأحدث.
            </p>
            {(suppliers || []).length === 0 && (
              <p className="text-lg text-slate-600">لا يوجد موردون بعد. أضف موردًا من الأعلى.</p>
            )}
            {(suppliers || []).map((s) => {
              const rows = collectSupplierLedgerRows(s, cycles, treasuryEntries)
              const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
              const totalPaid = rows.reduce((sum, r) => sum + Number(r.paidAmount || 0), 0)
              const totalRemaining = rows.reduce((sum, r) => sum + Number(r.remainingAmount || 0), 0)
              return (
                <div key={s.id} className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 last:mb-0">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-2xl font-bold text-slate-900">{s.name}</h4>
                    <div className="flex flex-wrap items-center gap-3">
                      {s.phone && <span className="text-lg text-slate-600">📞 {s.phone}</span>}
                      <div className="flex flex-wrap gap-2">
                        <LedgerExportButtons
                          onExport={(format) =>
                            onExportLedger?.({
                              kind: 'supplier',
                              entityId: s.id,
                              entityName: s.name,
                              format,
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            openEditModal({
                              title: 'تعديل المورد',
                              fields: [
                                { key: 'name', label: 'اسم المورد', type: 'text' },
                                { key: 'phone', label: 'الهاتف', type: 'text' },
                              ],
                              initialValues: { name: s.name || '', phone: s.phone || '' },
                              onSubmit: (values) => onUpdateSupplier(s.id, values),
                            })
                          }
                          className="app-btn-xs-edit"
                        >
                          تعديل المورد
                        </button>
                        <button type="button" onClick={() => onDeleteSupplier(s.id)} className="app-btn-xs-delete">
                          حذف المورد
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="app-table-wrap bg-white">
                    <table className="ledger-sheet-table w-full min-w-[720px] text-right text-base">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">#</th>
                          <th className="px-3 py-2">التاريخ</th>
                          <th className="px-3 py-2">البند</th>
                          <th className="px-3 py-2">الكمية</th>
                          <th className="px-3 py-2">إجمالي الحساب</th>
                          <th className="px-3 py-2">واصل</th>
                          <th className="px-3 py-2">باقي</th>
                          <th className="px-3 py-2 w-[1%] whitespace-nowrap">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={`${row.id}-${index}`} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-bold text-slate-500">{index + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{formatLedgerDate(row.date)}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{row.itemType}</td>
                            <td className="px-3 py-2 font-semibold text-amber-900">{row.quantityLabel}</td>
                            <td className="px-3 py-2 font-bold text-slate-900"><ColoredMoney value={row.amount} /></td>
                            <td className="px-3 py-2"><ColoredMoney value={row.paidAmount} /></td>
                            <td className="px-3 py-2 font-bold text-rose-800"><ColoredMoney value={row.remainingAmount} /></td>
                            <td className="px-3 py-2">
                              {(row.id.startsWith('feed-') ||
                                row.id.startsWith('medication-') ||
                                row.id.startsWith('treasury-')) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSupplierLedgerRow(row)}
                                  className="app-btn-xs-delete"
                                >
                                  حذف
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr>
                            <td className="px-3 py-3 text-slate-500" colSpan={8}>
                              لا توجد حركات شراء لهذا المورد بعد.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {rows.length > 0 && (
                        <tfoot>
                          <tr className="ledger-sheet-total-row">
                            <td className="px-3 py-2 font-bold text-slate-900" colSpan={4}>
                              الإجمالي
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900"><ColoredMoney value={totalAmount} /></td>
                            <td className="px-3 py-2 font-bold text-slate-900"><ColoredMoney value={totalPaid} /></td>
                            <td className="px-3 py-2 font-bold text-rose-900"><ColoredMoney value={totalRemaining} /></td>
                            <td className="px-3 py-2" />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </div>
      )}

      {farmId && sectionSlug === 'trading' && (
        <div id="farm-section-trading" className="scroll-mt-24 mb-5 flex flex-col gap-4">
          <div className="app-card p-4">
            <h3 className="mb-2 text-xl font-bold text-slate-900">التجار والسماسرة</h3>
            <p className="mb-4 text-base text-slate-600">
              من مكان واحد: إضافة تاجر أو سمسار، ثم كشف حساب لكل تاجر (جميع المبيعات عبر الدورات) ولكل سمسار (ملخص
              حسب التاجر ثم تفاصيل البيعيات).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTradingMainTab('traders')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  tradingMainTab === 'traders' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                التجار
              </button>
              <button
                type="button"
                onClick={() => setTradingMainTab('brokers')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  tradingMainTab === 'brokers' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                السماسرة
              </button>
            </div>
          </div>

          {tradingMainTab === 'traders' && (
            <>
              <div className="app-card p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTraderSubPanel('add')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      traderSubPanel === 'add' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    إضافة تاجر
                  </button>
                  <button
                    type="button"
                    onClick={() => setTraderSubPanel('ledger')}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      traderSubPanel === 'ledger' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    كشف حساب التجار
                  </button>
                </div>
              </div>

              {traderSubPanel === 'add' && (
                <div className="app-card p-4 md:max-w-xl">
                  <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة تاجر للمزرعة</h3>
                  <p className="mb-3 text-base text-slate-600">
                    يُنشأ التاجر أيضًا تلقائيًا عند حفظ بيع باسمه من شاشة البيع. يمكنك إضافته هنا مسبقًا ليظهر في قائمة
                    البيع.
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      type="text"
                      value={traderNameInput}
                      onChange={(e) => onTraderNameChange(e.target.value)}
                      className="app-input"
                      placeholder="اسم التاجر"
                    />
                    <input
                      type="text"
                      value={traderPhoneInput}
                      onChange={(e) => onTraderPhoneChange(e.target.value)}
                      className="app-input"
                      placeholder="الهاتف (اختياري)"
                    />
                  </div>
                  <button type="button" onClick={onAddTrader} className="app-btn-primary mt-3">
                    حفظ التاجر
                  </button>
                </div>
              )}

              {traderSubPanel === 'ledger' && (
                <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-xl font-bold text-slate-900">سجل التجار ومبيعاتهم</h3>
            <p className="mb-4 text-base text-slate-600">
              يُنشأ ملف لكل تاجر تلقائيًا عند حفظ بيع باسمه (أو عند اختياره من القائمة في شاشة البيع). تظهر هنا كل
              المبيعات عبر الدورات مع عمود السمسار؛ <strong>كشف تفصيلي لكل سمسار</strong> (التجار المعنيين وإجمالي كل
              بيعة) من تبويب <strong>السماسرة</strong> أعلى هذه الصفحة.
            </p>
            {(traders || []).length === 0 && (
              <p className="text-lg text-slate-600">لا يوجد تجار مسجّلون بعد. سجّل أول بيع باسم التاجر من شاشة البيع.</p>
            )}
            {(traders || []).map((t) => {
              const rows = collectTraderSalesRows(t, cycles)
              const totalEmptyKg = rows.reduce((sum, r) => sum + Number(r.emptyWeight || 0), 0)
              const totalFullKg = rows.reduce((sum, r) => sum + Number(r.fullWeight || 0), 0)
              const totalKg = rows.reduce((sum, r) => sum + Number(r.totalNetWeight || 0), 0)
              const totalAmount = rows.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0)
              const totalPaid = rows.reduce((sum, r) => sum + Number(r.paidAmount || 0), 0)
              const totalRemaining = rows.reduce((sum, r) => sum + Number(r.remainingAmount || 0), 0)
              return (
                <div key={t.id} className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 last:mb-0">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-2xl font-bold text-slate-900">{t.name}</h4>
                    <div className="flex flex-wrap items-center gap-3">
                      {(t.phone || rows[0]?.phone) && (
                        <span className="text-lg text-slate-600">
                          📞 {t.phone || rows.find((r) => r.phone)?.phone || '—'}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <LedgerExportButtons
                          onExport={(format) =>
                            onExportLedger?.({
                              kind: 'trader',
                              entityId: t.id,
                              entityName: t.name,
                              format,
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            openEditModal({
                              title: 'تعديل التاجر',
                              fields: [
                                { key: 'name', label: 'اسم التاجر', type: 'text' },
                                { key: 'phone', label: 'الهاتف', type: 'text' },
                              ],
                              initialValues: { name: t.name || '', phone: t.phone || '' },
                              onSubmit: (values) => onUpdateTrader(t.id, values),
                            })
                          }
                          className="app-btn-xs-edit"
                        >
                          تعديل التاجر
                        </button>
                        <button type="button" onClick={() => onDeleteTrader(t.id)} className="app-btn-xs-delete">
                          حذف التاجر
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="app-table-wrap bg-white">
                    <table className="ledger-sheet-table w-full min-w-[820px] text-right text-base">
                      <thead>
                        <tr>
                          <th className="px-3 py-2">التاريخ</th>
                          <th className="px-3 py-2">وزن فارغ</th>
                          <th className="px-3 py-2">وزن ممتلئ</th>
                          <th className="px-3 py-2">صافي الوزن</th>
                          <th className="px-3 py-2">سعر الكيلة</th>
                          <th className="px-3 py-2">إجمالي الحساب</th>
                          <th className="px-3 py-2">واصل</th>
                          <th className="px-3 py-2">باقي</th>
                          <th className="px-3 py-2 w-[1%] whitespace-nowrap">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <Fragment key={`${row.id}-${row.cycleName}`}>
                            <tr>
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {formatLedgerDate(row.date)}
                                {row.broker ? (
                                  <span className="mt-1 block text-sm text-teal-800">السمسار: {row.broker}</span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-700">
                                {Number(row.emptyWeight || 0).toLocaleString('ar-EG', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-800">
                                {Number(row.fullWeight || 0).toLocaleString('ar-EG', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-3 py-2 font-semibold text-amber-950">
                                {Number(row.totalNetWeight || 0).toLocaleString('ar-EG', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-3 py-2">
                                <ColoredMoney value={row.pricePerKg} />
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-900">
                                <ColoredMoney value={row.totalAmount} />
                              </td>
                              <td className="px-3 py-2">
                                <ColoredMoney value={row.paidAmount} />
                              </td>
                              <td className="px-3 py-2 font-bold text-rose-800">
                                <ColoredMoney value={row.remainingAmount} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleSaleDetails(row.id)}
                                    className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-800"
                                  >
                                    {expandedSales[row.id] ? 'إخفاء' : 'أوزان'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDownloadSaleInvoice(row.id)}
                                    className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
                                  >
                                    PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTraderSaleRow(row.id)}
                                    className="app-btn-xs-delete"
                                  >
                                    حذف
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {expandedSales[row.id] && (
                              <tr>
                                <td colSpan={9} className="px-3 py-2 bg-slate-50">
                                  <div className="app-table-wrap">
                                    <table className="w-full min-w-[620px] text-right text-sm">
                                      <thead>
                                        <tr className="text-slate-600">
                                          <th className="px-2 py-1">#</th>
                                          <th className="px-2 py-1">وزن فارغ</th>
                                          <th className="px-2 py-1">وزن ممتلئ</th>
                                          <th className="px-2 py-1">الأقفاص</th>
                                          <th className="px-2 py-1">عدد الفرخ</th>
                                          <th className="px-2 py-1">الصافي</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(row.saleWeightEntries || []).map((entry, idx) => (
                                          <tr key={entry.id} className="border-t border-slate-100">
                                            <td className="px-2 py-1">{idx + 1}</td>
                                            <td className="px-2 py-1">{Number(entry.emptyWeight || 0).toFixed(2)}</td>
                                            <td className="px-2 py-1">{Number(entry.fullWeight || 0).toFixed(2)}</td>
                                            <td className="px-2 py-1">{entry.cages || 0}</td>
                                            <td className="px-2 py-1 font-semibold text-slate-800">
                                              {entry.birdCount != null && Number(entry.birdCount) > 0
                                                ? Number(entry.birdCount)
                                                : '—'}
                                            </td>
                                            <td className="px-2 py-1 font-semibold text-emerald-700">
                                              {Number(entry.netWeight || 0).toFixed(2)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                        {rows.length === 0 && (
                          <tr>
                            <td className="px-3 py-3 text-slate-500" colSpan={9}>
                              لا توجد مبيعات مسجّلة لهذا التاجر بعد.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {rows.length > 0 && (
                        <tfoot>
                          <tr className="ledger-sheet-total-row">
                            <td className="px-3 py-2 font-bold text-slate-900">الإجمالي</td>
                            <td className="px-3 py-2 font-bold text-slate-700">
                              {totalEmptyKg.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-800">
                              {totalFullKg.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 font-bold text-amber-950">
                              {totalKg.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-800">
                              {totalKg > 0 ? <ColoredMoney value={totalAmount / totalKg} /> : '—'}
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900">
                              <ColoredMoney value={totalAmount} />
                            </td>
                            <td className="px-3 py-2 font-bold text-slate-900">
                              <ColoredMoney value={totalPaid} />
                            </td>
                            <td className="px-3 py-2 font-bold text-rose-900">
                              <ColoredMoney value={totalRemaining} />
                            </td>
                            <td className="px-3 py-2" />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )
            })}
                </div>
              )}
            </>
          )}

          {tradingMainTab === 'brokers' && (
            <div className="flex flex-col gap-4">
          <div className="app-card p-4">
            <h3 className="mb-3 text-xl font-bold text-slate-900">السماسرة</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setBrokerPanel('ADD')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  brokerPanel === 'ADD' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                إضافة سمسار
              </button>
              <button
                type="button"
                onClick={() => setBrokerPanel('LEDGER')}
                className={`rounded-xl px-4 py-2 text-sm font-bold ${
                  brokerPanel === 'LEDGER' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                كشف حساب السماسرة
              </button>
            </div>
          </div>

          {brokerPanel === 'ADD' && (
            <div className="app-card p-4 md:max-w-xl">
              <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة سمسار للمزرعة</h3>
              <p className="mb-3 text-base text-slate-600">
                يمكن أيضًا إنشاء السمسار تلقائيًا عند حفظ بيع بكتابة اسمه في شاشة البيع أو اختياره من القائمة هناك.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={brokerNameInput}
                  onChange={(e) => onBrokerNameChange(e.target.value)}
                  className="app-input"
                  placeholder="اسم السمسار"
                />
                <input
                  type="text"
                  value={brokerPhoneInput}
                  onChange={(e) => onBrokerPhoneChange(e.target.value)}
                  className="app-input"
                  placeholder="الهاتف (اختياري)"
                />
              </div>
              <button type="button" onClick={onAddBroker} className="app-btn-primary mt-3">
                حفظ السمسار
              </button>
            </div>
          )}

          {brokerPanel === 'LEDGER' && (
            <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-xl font-bold text-slate-900">كشف حساب السماسرة</h3>
              <p className="mb-4 text-base text-slate-600">
                لكل سمسار: جدول بصيغة كشف الحساب (اسم التاجر، صافي الوزن، سعر الكيلة، الإجمالي، الواصل، الباقي) ثم
                جدول تفصيلي لكل عملية بيع بنفس الأعمدة.
              </p>
              {brokersLedgerEntries.length === 0 && (
                <p className="text-lg text-slate-600">لا يوجد سماسرة بعد — سجّل بيعًا مع خانة السمسار أو أضف سمسارًا من الأعلى.</p>
              )}
              {brokersLedgerEntries.map((br) => {
                const saleRows = collectBrokerSalesRows(br, cycles)
                const byTrader = aggregateBrokerSalesByTrader(saleRows)
                const grandTotal = saleRows.reduce((s, r) => s + Number(r.totalAmount || 0), 0)
                const grandPaid = saleRows.reduce((s, r) => s + Number(r.paidAmount || 0), 0)
                const grandRem = saleRows.reduce((s, r) => s + Number(r.remainingAmount || 0), 0)
                const grandKg = saleRows.reduce((s, r) => s + Number(r.totalNetWeight || 0), 0)
                return (
                  <div key={br.ledgerKey} className="mb-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 last:mb-0">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-2xl font-bold text-slate-900">{br.name}</h4>
                      <div className="flex flex-wrap items-center gap-3">
                        {br.phone && <span className="text-lg text-slate-600">📞 {br.phone}</span>}
                        <div className="flex flex-wrap gap-2">
                          <LedgerExportButtons
                            onExport={(format) =>
                              onExportLedger?.({
                                kind: 'broker',
                                entityId: br.id || null,
                                entityName: br.name,
                                format,
                              })
                            }
                          />
                          {br.id && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal({
                                    title: 'تعديل السمسار',
                                    fields: [
                                      { key: 'name', label: 'الاسم', type: 'text' },
                                      { key: 'phone', label: 'الهاتف', type: 'text' },
                                    ],
                                    initialValues: { name: br.name || '', phone: br.phone || '' },
                                    onSubmit: (values) => onUpdateBroker(br.id, values),
                                  })
                                }
                                className="app-btn-xs-edit"
                              >
                                تعديل السمسار
                              </button>
                              <button type="button" onClick={() => onDeleteBroker(br.id)} className="app-btn-xs-delete">
                                حذف السمسار
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="app-table-wrap mb-4 bg-white">
                      <table className="ledger-sheet-table w-full min-w-[640px] text-right text-base">
                        <thead>
                          <tr>
                            <th className="px-3 py-2">اسم التاجر</th>
                            <th className="px-3 py-2">صافي الوزن</th>
                            <th className="px-3 py-2">سعر الكيلة</th>
                            <th className="px-3 py-2">إجمالي الحساب</th>
                            <th className="px-3 py-2">واصل</th>
                            <th className="px-3 py-2">باقي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byTrader.map((row) => (
                            <tr key={row.key}>
                              <td className="px-3 py-2 font-semibold text-slate-900">{row.traderLabel}</td>
                              <td className="px-3 py-2 font-semibold text-amber-950">
                                {row.totalNetKg.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2">
                                {row.avgPricePerKg > 0 ? <ColoredMoney value={row.avgPricePerKg} /> : '—'}
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-900">
                                <ColoredMoney value={row.totalAmount} />
                              </td>
                              <td className="px-3 py-2">
                                <ColoredMoney value={row.totalPaid} />
                              </td>
                              <td className="px-3 py-2 font-bold text-rose-800">
                                <ColoredMoney value={row.totalRemaining} />
                              </td>
                            </tr>
                          ))}
                          {byTrader.length === 0 && (
                            <tr>
                              <td className="px-3 py-3 text-slate-500" colSpan={6}>
                                لا توجد مبيعات مرتبطة بهذا السمسار.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {byTrader.length > 0 && (
                          <tfoot>
                            <tr className="ledger-sheet-total-row">
                              <td className="px-3 py-2 font-bold text-slate-900">الإجمالي</td>
                              <td className="px-3 py-2 font-bold text-amber-950">
                                {grandKg.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-800">
                                {grandKg > 0 ? <ColoredMoney value={grandTotal / grandKg} /> : '—'}
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-900">
                                <ColoredMoney value={grandTotal} />
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-900">
                                <ColoredMoney value={grandPaid} />
                              </td>
                              <td className="px-3 py-2 font-bold text-rose-900">
                                <ColoredMoney value={grandRem} />
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    {byTrader.length > 0 && (
                      <p className="mb-4 text-center text-base font-bold text-slate-800">حسب {br.name} السمسار</p>
                    )}

                    <p className="mb-2 text-sm font-bold text-slate-800">تفاصيل المبيعات (كل عملية)</p>
                    <div className="app-table-wrap bg-white">
                      <table className="ledger-sheet-table w-full min-w-[720px] text-right text-base">
                        <thead>
                          <tr>
                            <th className="px-3 py-2">التاجر</th>
                            <th className="px-3 py-2">التاريخ</th>
                            <th className="px-3 py-2">صافي الوزن</th>
                            <th className="px-3 py-2">سعر الكيلة</th>
                            <th className="px-3 py-2">إجمالي الحساب</th>
                            <th className="px-3 py-2">واصل</th>
                            <th className="px-3 py-2">باقي</th>
                            <th className="px-3 py-2 w-[1%] whitespace-nowrap">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {saleRows.map((row) => (
                            <Fragment key={row.id}>
                              <tr>
                                <td className="px-3 py-2 font-medium text-slate-900">
                                  {row.linkedTrader?.name || row.trader || '—'}
                                </td>
                                <td className="px-3 py-2 text-slate-800">{formatLedgerDate(row.date)}</td>
                                <td className="px-3 py-2 font-semibold text-amber-950">
                                  {Number(row.totalNetWeight || 0).toLocaleString('ar-EG', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="px-3 py-2">
                                  <ColoredMoney value={row.pricePerKg} />
                                </td>
                                <td className="px-3 py-2 font-bold text-slate-900">
                                  <ColoredMoney value={row.totalAmount} />
                                </td>
                                <td className="px-3 py-2">
                                  <ColoredMoney value={row.paidAmount} />
                                </td>
                                <td className="px-3 py-2 font-bold text-rose-800">
                                  <ColoredMoney value={row.remainingAmount} />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleSaleDetails(row.id)}
                                      className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-800"
                                    >
                                      {expandedSales[row.id] ? 'إخفاء' : 'أوزان'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onDownloadSaleInvoice(row.id)}
                                      className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
                                    >
                                      PDF
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expandedSales[row.id] && (
                                <tr>
                                  <td colSpan={8} className="px-3 py-2 bg-slate-50">
                                    <div className="app-table-wrap">
                                      <table className="w-full min-w-[620px] text-right text-sm">
                                        <thead>
                                          <tr className="text-slate-600">
                                            <th className="px-2 py-1">#</th>
                                            <th className="px-2 py-1">وزن فارغ</th>
                                            <th className="px-2 py-1">وزن ممتلئ</th>
                                            <th className="px-2 py-1">الأقفاص</th>
                                            <th className="px-2 py-1">عدد الفرخ</th>
                                            <th className="px-2 py-1">الصافي</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(row.saleWeightEntries || []).map((entry, idx) => (
                                            <tr key={entry.id} className="border-t border-slate-100">
                                              <td className="px-2 py-1">{idx + 1}</td>
                                              <td className="px-2 py-1">{Number(entry.emptyWeight || 0).toFixed(2)}</td>
                                              <td className="px-2 py-1">{Number(entry.fullWeight || 0).toFixed(2)}</td>
                                              <td className="px-2 py-1">{entry.cages || 0}</td>
                                              <td className="px-2 py-1 font-semibold text-slate-800">
                                                {entry.birdCount != null && Number(entry.birdCount) > 0
                                                  ? Number(entry.birdCount)
                                                  : '—'}
                                              </td>
                                              <td className="px-2 py-1 font-semibold text-emerald-700">
                                                {Number(entry.netWeight || 0).toFixed(2)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                          {saleRows.length === 0 && (
                            <tr>
                              <td className="px-3 py-3 text-slate-500" colSpan={8}>
                                لا توجد صفوف.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
            </div>
          )}
        </div>
      )}

      {activeCycle && sectionSlug === 'sales' && (
        <div id="farm-section-sales" className="scroll-mt-24 mb-5 app-card p-4">
          <h3 className="mb-3 text-xl font-bold text-slate-900">البيع</h3>
          <p className="mb-3 text-base text-slate-600">
            اختر تاجرًا من قائمة <strong>التجار</strong> لربط البيع بسجله، أو اكتب الاسم يدويًا (يُنشأ سجل تاجر جديد
            بنفس الاسم عند الحفظ). اختر السمسار من القائمة أو اكتب اسمه ليظهر في <strong>التجار والسماسرة</strong> (تبويب السماسرة) مع التاجر.
          </p>
          <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50/90 p-3 text-base text-slate-800">
            <strong>مرحلتان للأوزان:</strong> أدخل عدد الأقفاص ثم أوزان الفارغ لكل كيزة (يمكنك إضافة عدة أسطر). اضغط{' '}
            <strong>تم</strong> ثم أدخل أوزان الممتلئ لنفس الأسطر، ثم احفظ البيع.
          </p>
          <div className="grid gap-3 md:grid-cols-7">
            <select
              value={saleTraderIdInput}
              onChange={(event) => {
                const id = event.target.value
                onSaleTraderIdChange(id)
                const tr = (traders || []).find((x) => x.id === id)
                onSaleTraderChange(tr ? tr.name : '')
                if (tr?.phone) onSalePhoneChange(tr.phone)
              }}
              className="app-input"
            >
              <option value="">— تاجر من القائمة —</option>
              {(traders || []).map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={saleTraderInput}
              onChange={(e) => {
                onSaleTraderChange(e.target.value)
                onSaleTraderIdChange('')
              }}
              className="app-input"
              placeholder="اسم التاجر (يدوي)"
            />
            <select
              value={saleBrokerIdInput}
              onChange={(event) => {
                const id = event.target.value
                onSaleBrokerIdChange(id)
                const br = (brokers || []).find((x) => x.id === id)
                onSaleBrokerChange(br ? br.name : '')
              }}
              className="app-input"
            >
              <option value="">— سمسار من القائمة —</option>
              {(brokers || []).map((br) => (
                <option key={br.id} value={br.id}>
                  {br.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={saleBrokerInput}
              onChange={(e) => {
                onSaleBrokerChange(e.target.value)
                onSaleBrokerIdChange('')
              }}
              className="app-input"
              placeholder="السمسار (يدوي)"
            />
            <input type="text" value={salePhoneInput} onChange={(e) => onSalePhoneChange(e.target.value)} className="app-input" placeholder="الهاتف" />
            <input type="number" min="0" value={salePricePerKgInput} onChange={(e) => onSalePricePerKgChange(e.target.value)} className="app-input" placeholder="سعر الكيلو" />
            <input type="date" value={saleDateInput} onChange={(e) => onSaleDateChange(e.target.value)} className="app-input" />
          </div>

          {saleSalePhase === 'empty' && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-bold text-slate-900">١ — الأوزان الفارغة</span>
                <button type="button" onClick={() => onSaleResetWizard()} className="text-sm font-semibold text-teal-800 underline">
                  إعادة تعيين الأوزان
                </button>
              </div>
              <p className="mb-2 text-sm text-slate-600">لكل سطر: أدخل عدد الأقفاص في الوزنة، ثم إجمالي الوزن الفارغ لها:</p>
              {saleEmptyWeights.map((w, index) => (
                <div key={`sale-empty-${index}`} className="mb-2 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="app-input max-w-xs flex-1"
                    placeholder={`الوزن الفارغ ${index + 1}`}
                    value={w}
                    onChange={(e) => onSaleEmptyLineChange(index, e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    className="app-input w-36"
                    placeholder="عدد الأقفاص"
                    value={saleCagesWeights[index] || ""}
                    onChange={(e) => onSaleCagesLineChange(index, e.target.value)}
                  />
                  {saleEmptyWeights.length > 1 && (
                    <button type="button" onClick={() => onSaleRemoveEmptyLine(index)} className="app-btn-xs-delete">
                      حذف
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={onSaleAddEmptyLine} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-800">
                + كيزة / وزن فارغ
              </button>
              <button type="button" onClick={onSaleConfirmEmptyPhase} className="app-btn-accent mr-3 mt-2 py-2 text-base">
                تم — افتح فورم الأوزان الممتلئة
              </button>
            </div>
          )}

          {saleSalePhase === 'full' && (
            <div className="mt-4 rounded-xl border-2 border-teal-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-lg font-bold text-slate-900">٢ — فورم الأوزان الممتلئة</span>
                <button type="button" onClick={() => onSaleResetWizard()} className="text-sm font-semibold text-teal-800 underline">
                  إعادة تعيين الأوزان
                </button>
              </div>
              <div className="mb-3 grid gap-2 md:grid-cols-3">
                <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                  <span className="block text-sm font-semibold text-slate-600">إجمالي الوزن الفارغ</span>
                  <strong className="text-xl text-slate-900">{saleTotalEmptyWeight.toFixed(2)} كجم</strong>
                </div>
                <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                  <span className="block text-sm font-semibold text-slate-600">عدد الأقفاص</span>
                  <strong className="text-xl text-slate-900">{saleTotalCages.toFixed(0)}</strong>
                </div>
                <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                  <span className="block text-sm font-semibold text-slate-600">إجمالي الوزن الممتلئ</span>
                  <strong className="text-xl text-slate-900">{Number(saleTotalFullWeight || 0).toFixed(2)} كجم</strong>
                </div>
              </div>
              <p className="mb-2 text-sm text-slate-600">
                أدخل الأوزان الممتلئة وزنة وزنة مع <strong>عدد الأقفاص</strong> لكل وزنة. الحساب النهائي: إجمالي
                الممتلئ − إجمالي الفارغ = صافي البيع. عدد الفرخ يُقدَّر تلقائيًا من آخر متوسط وزن مسجّل.
              </p>
              {saleFullWeights.map((w, index) => (
                <div key={`sale-full-${index}`} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
                  <span className="w-28 shrink-0 text-sm font-semibold text-slate-700">وزنة {index + 1}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="app-input max-w-[9.5rem] shrink-0"
                    placeholder={`وزن ممتلئ ${index + 1}`}
                    value={w}
                    onChange={(e) => onSaleFullLineChange(index, e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    className="app-input w-24 shrink-0"
                    placeholder="عدد الأقفاص"
                    title="عدد الأقفاص في هذه الوزنة"
                    value={saleLineCagesCounts[index] ?? ''}
                    onChange={(e) => onSaleLineCagesCountChange(index, e.target.value)}
                  />
                  {saleFullWeights.length > 1 && (
                    <button type="button" onClick={() => onSaleRemoveFullLine(index)} className="app-btn-xs-delete">
                      حذف
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={onSaleAddFullLine} className="mt-2 rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-800">
                + سطر وزن
              </button>
            </div>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <input type="number" min="0" value={salePaidInput} onChange={(e) => onSalePaidChange(e.target.value)} className="app-input" placeholder="المدفوع" />
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold">
              الوزن الفارغ: {saleTotalEmptyWeight.toFixed(2)}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold">
              الوزن الممتلئ: {Number(saleTotalFullWeight || 0).toFixed(2)}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold">
              إجمالي الصافي: {saleTotalNetWeight.toFixed(2)} كجم
              {saleSalePhase !== 'full' && <span className="mr-2 block text-sm font-normal text-slate-600">(بعد إكمال الممتلئ)</span>}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold">
              إجمالي السعر: <ColoredMoney value={saleTotalPrice} /> | المتبقي: <ColoredMoney value={saleRemaining} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold">
              إجمالي الأقفاص: {saleTotalCages.toFixed(0)}
            </div>
          </div>
          <button type="button" onClick={onAddSale} className="app-btn-primary mt-3">
            حفظ البيع
          </button>

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[900px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">التاجر</th>
                  <th className="px-3 py-2">السعر/كجم</th>
                  <th className="px-3 py-2">الصافي كجم</th>
                  <th className="px-3 py-2">الإجمالي</th>
                  <th className="px-3 py-2">المدفوع</th>
                  <th className="px-3 py-2">المتبقي</th>
                  <th className="px-3 py-2">التفاصيل</th>
                  <th className="px-3 py-2">فاتورة</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(activeCycle.sales || []).map((sale) => (
                  <Fragment key={sale.id}>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td className="px-3 py-2">{new Date(sale.date).toLocaleDateString("ar-EG")}</td>
                      <td className="px-3 py-2">{sale.linkedTrader?.name || sale.trader || "-"}</td>
                      <td className="px-3 py-2"><ColoredMoney value={sale.pricePerKg} /></td>
                      <td className="px-3 py-2">{Number(sale.totalNetWeight || 0).toFixed(2)}</td>
                      <td className="px-3 py-2"><ColoredMoney value={sale.totalAmount} /></td>
                      <td className="px-3 py-2"><ColoredMoney value={sale.paidAmount} /></td>
                      <td className="px-3 py-2 font-bold text-rose-700">
                        <ColoredMoney value={sale.remainingAmount} />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleSaleDetails(sale.id)}
                          className="rounded-lg bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-800"
                        >
                          {expandedSales[sale.id] ? "إخفاء" : "عرض"}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onDownloadSaleInvoice(sale.id)}
                          className="rounded-lg bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700"
                        >
                          PDF
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditModal({
                                title: "تعديل البيع",
                                fields: [
                                  { key: "date", label: "التاريخ", type: "date" },
                                  { key: "trader", label: "التاجر", type: "text" },
                                  { key: "broker", label: "السمسار", type: "text" },
                                  { key: "phone", label: "الهاتف", type: "text" },
                                  { key: "pricePerKg", label: "سعر الكيلو", type: "number" },
                                  { key: "paidAmount", label: "المدفوع", type: "number" },
                                ],
                                initialValues: {
                                  date: sale.date ? new Date(sale.date).toISOString().slice(0, 10) : "",
                                  trader: sale.linkedTrader?.name || sale.trader || "",
                                  broker: sale.broker || "",
                                  phone: sale.phone || "",
                                  pricePerKg: Number(sale.pricePerKg || 0),
                                  paidAmount: Number(sale.paidAmount || 0),
                                },
                                onSubmit: (values) => onUpdateSale(sale.id, values),
                              })
                            }
                            className="app-btn-xs-edit"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSale(sale.id)}
                            className="app-btn-xs-delete"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedSales[sale.id] && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={10} className="px-3 py-2">
                          <div className="app-table-wrap">
                            <table className="w-full min-w-[620px] text-right text-sm">
                              <thead>
                                <tr className="text-slate-600">
                                  <th className="px-2 py-1">#</th>
                                  <th className="px-2 py-1">وزن فارغ</th>
                                  <th className="px-2 py-1">وزن ممتلئ</th>
                                  <th className="px-2 py-1">الأقفاص</th>
                                  <th className="px-2 py-1">عدد الفرخ</th>
                                  <th className="px-2 py-1">الصافي</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(sale.saleWeightEntries || []).map((entry, idx) => (
                                  <tr key={entry.id} className="border-t border-slate-100">
                                    <td className="px-2 py-1">{idx + 1}</td>
                                    <td className="px-2 py-1">{Number(entry.emptyWeight || 0).toFixed(2)}</td>
                                    <td className="px-2 py-1">{Number(entry.fullWeight || 0).toFixed(2)}</td>
                                    <td className="px-2 py-1">{entry.cages || 0}</td>
                                    <td className="px-2 py-1 font-semibold text-slate-800">
                                      {entry.birdCount != null && Number(entry.birdCount) > 0
                                        ? Number(entry.birdCount)
                                        : '—'}
                                    </td>
                                    <td className="px-2 py-1 font-semibold text-emerald-700">
                                      {Number(entry.netWeight || 0).toFixed(2)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {(!activeCycle.sales || activeCycle.sales.length === 0) && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={10}>
                      لا يوجد بيع حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeCycle && sectionSlug === 'workers' && (
        <div id="farm-section-workers" className="scroll-mt-24 mb-5 app-card p-4">
          <h3 className="mb-3 text-xl font-bold text-slate-900">العمال</h3>
          <p className="mb-3 text-base text-slate-600">
            كل عامل جديد يحصل على <strong>كود</strong> ثابت للمزرعة ويظهر في القائمة لتعيينه في دورات لاحقة. حركات
            السلف والصرف تُسجّل بالبند لكل عامل في الدورة.
          </p>

          <h4 className="mb-2 text-lg font-bold text-slate-800">ملف العمال في المزرعة</h4>
          <div className="app-table-wrap mb-5 max-h-56 overflow-y-auto bg-slate-50/80">
            <table className="w-full min-w-[420px] text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-2 py-2">الكود</th>
                  <th className="px-2 py-2">الاسم</th>
                  <th className="px-2 py-2">سجل الحركات</th>
                </tr>
              </thead>
              <tbody>
                {(farmWorkers || []).map((fw) => (
                  <tr key={fw.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-mono font-bold text-teal-800">{fw.code}</td>
                    <td className="px-2 py-2">{fw.name}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setWorkerLedgerFarmWorker(fw)}
                        className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold text-slate-800"
                      >
                        كشف حساب
                      </button>
                    </td>
                  </tr>
                ))}
                {(!farmWorkers || farmWorkers.length === 0) && (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={3}>
                      لا يوجد عمال مسجّلون بعد. أضف عاملًا جديدًا بالاسم أدناه ليُنشأ له كود تلقائيًا.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h4 className="mb-2 text-lg font-bold text-slate-800">إضافة عامل للدورة الحالية</h4>
          <div className="grid gap-3 md:grid-cols-5">
            <select
              value={workerFarmWorkerIdInput}
              onChange={(event) => {
                onWorkerFarmWorkerIdChange(event.target.value)
                if (event.target.value) onWorkerNameChange('')
              }}
              className="app-input"
            >
              <option value="">— عامل جديد (بالاسم) —</option>
              {(farmWorkers || [])
                .filter((fw) => !(activeCycle.workers || []).some((w) => w.farmWorkerId === fw.id))
                .map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    {fw.code} — {fw.name}
                  </option>
                ))}
            </select>
            <input
              type="text"
              value={workerNameInput}
              onChange={(event) => {
                onWorkerNameChange(event.target.value)
                onWorkerFarmWorkerIdChange('')
              }}
              disabled={!!workerFarmWorkerIdInput}
              className="app-input disabled:opacity-60"
              placeholder={workerFarmWorkerIdInput ? '—' : 'اسم العامل الجديد'}
            />
            <input
              type="date"
              value={workerStartDateInput}
              onChange={(event) => onWorkerStartDateChange(event.target.value)}
              className="app-input"
            />
            <input
              type="number"
              min="0"
              value={workerMonthlySalaryInput}
              onChange={(event) => onWorkerMonthlySalaryChange(event.target.value)}
              className="app-input"
              placeholder="الراتب الشهري"
            />
            <button
              type="button"
              onClick={onAddWorker}
              className="rounded-xl bg-teal-700 px-5 py-3 text-lg font-bold text-white"
            >
              حفظ العامل
            </button>
          </div>

          <h4 className="mb-2 mt-6 text-lg font-bold text-slate-800">تسجيل حركة (سلف / صرف / …)</h4>
          <div className="mt-1 grid gap-3 md:grid-cols-5">
            <select
              value={workerExpenseWorkerIdInput}
              onChange={(event) => onWorkerExpenseWorkerIdChange(event.target.value)}
              className="app-input"
            >
              <option value="">اختر العامل</option>
              {(activeCycle.workers || []).map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.farmWorker?.code ? `${worker.farmWorker.code} — ` : ''}
                  {worker.name}
                </option>
              ))}
            </select>
            <select
              value={workerExpenseCategoryInput}
              onChange={(event) => onWorkerExpenseCategoryChange(event.target.value)}
              className="app-input"
            >
              <option value="صرف">صرف</option>
              <option value="سلف">سلف</option>
              <option value="خصم">خصم</option>
              <option value="أخرى">أخرى</option>
            </select>
            <input
              type="number"
              min="0"
              value={workerExpenseAmountInput}
              onChange={(event) => onWorkerExpenseAmountChange(event.target.value)}
              className="app-input"
              placeholder="المبلغ"
            />
            <input
              type="date"
              value={workerExpenseDateInput}
              onChange={(event) => onWorkerExpenseDateChange(event.target.value)}
              className="app-input"
            />
            <button
              type="button"
              onClick={onAddWorkerExpense}
              className="rounded-xl bg-orange-700 px-5 py-3 text-lg font-bold text-white"
            >
              حفظ الحركة
            </button>
          </div>

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[920px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">الكود</th>
                  <th className="px-3 py-2">الاسم</th>
                  <th className="px-3 py-2">بداية العمل</th>
                  <th className="px-3 py-2">الشهري</th>
                  <th className="px-3 py-2">اليومي</th>
                  <th className="px-3 py-2">أيام الدورة</th>
                  <th className="px-3 py-2">إجمالي الراتب</th>
                  <th className="px-3 py-2">خصومات</th>
                  <th className="px-3 py-2">الصافي النهائي</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(activeCycle.workers || []).map((worker) => (
                  <tr key={worker.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-mono text-teal-800">{worker.farmWorker?.code || '—'}</td>
                    <td className="px-3 py-2">{worker.name}</td>
                    <td className="px-3 py-2">
                      {worker.hiredAt ? new Date(worker.hiredAt).toLocaleDateString("ar-EG") : "-"}
                    </td>
                    <td className="px-3 py-2"><ColoredMoney value={worker.monthlySalary} /></td>
                    <td className="px-3 py-2"><ColoredMoney value={worker.dailySalary} /></td>
                    <td className="px-3 py-2">{worker.workedDays || 0}</td>
                    <td className="px-3 py-2"><ColoredMoney value={worker.totalSalary} /></td>
                    <td className="px-3 py-2"><ColoredMoney value={worker.workerExpenses} /></td>
                    <td className="px-3 py-2 font-bold text-teal-700">
                      <ColoredMoney value={worker.netSalary} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditModal({
                              title: "تعديل العامل",
                              fields: [
                                { key: "name", label: "الاسم", type: "text" },
                                { key: "hiredAt", label: "تاريخ البدء", type: "date" },
                                { key: "monthlySalary", label: "الراتب الشهري", type: "number" },
                              ],
                              initialValues: {
                                name: worker.name || "",
                                hiredAt: worker.hiredAt ? new Date(worker.hiredAt).toISOString().slice(0, 10) : "",
                                monthlySalary: Number(worker.monthlySalary || 0),
                              },
                              onSubmit: (values) => onUpdateWorker(worker.id, values),
                            })
                          }
                          className="app-btn-xs-edit"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteWorker(worker.id)}
                          className="app-btn-xs-delete"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!activeCycle.workers || activeCycle.workers.length === 0) && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={10}>
                      لا يوجد عمال حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[780px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">العامل</th>
                  <th className="px-3 py-2">البند</th>
                  <th className="px-3 py-2">المبلغ</th>
                  <th className="px-3 py-2">الوصف</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(activeCycle.workerExpenses || []).map((exp) => {
                  const worker = (activeCycle.workers || []).find((w) => w.id === exp.workerId)
                  return (
                    <tr key={exp.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{new Date(exp.date).toLocaleDateString('ar-EG')}</td>
                      <td className="px-3 py-2">{worker?.name || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{exp.category || 'صرف'}</td>
                      <td className="px-3 py-2"><ColoredMoney value={exp.amount} /></td>
                      <td className="px-3 py-2">{exp.description || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditModal({
                                title: 'تعديل حركة العامل',
                                fields: [
                                  { key: 'date', label: 'التاريخ', type: 'date' },
                                  {
                                    key: 'category',
                                    label: 'البند',
                                    type: 'select',
                                    options: [
                                      { value: 'صرف', label: 'صرف' },
                                      { value: 'سلف', label: 'سلف' },
                                      { value: 'خصم', label: 'خصم' },
                                      { value: 'أخرى', label: 'أخرى' },
                                    ],
                                  },
                                  { key: 'amount', label: 'المبلغ', type: 'number' },
                                  { key: 'description', label: 'الوصف', type: 'text' },
                                ],
                                initialValues: {
                                  date: exp.date ? new Date(exp.date).toISOString().slice(0, 10) : '',
                                  category: exp.category || 'صرف',
                                  amount: Number(exp.amount || 0),
                                  description: exp.description || '',
                                },
                                onSubmit: (values) => onUpdateWorkerExpense(exp.id, values),
                              })
                            }
                            className="app-btn-xs-edit"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteWorkerExpense(exp.id)}
                            className="app-btn-xs-delete"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {workerLedgerFarmWorker && (
            <div className="app-modal-overlay">
              <div className="app-modal max-h-[85vh] overflow-y-auto">
                <h3 className="app-modal-title mb-2">
                  كشف حساب العامل {workerLedgerFarmWorker.code} — {workerLedgerFarmWorker.name}
                </h3>
                {(() => {
                  const { rows, totalsByCategory } = collectFarmWorkerLedger(workerLedgerFarmWorker, cycles)
                  return (
                    <>
                      <p className="mb-3 text-sm text-slate-600">
                        إجمالي حسب البند: سلف {totalsByCategory.سلف.toFixed(2)} — صرف {totalsByCategory.صرف.toFixed(2)}{' '}
                        — خصم {totalsByCategory.خصم.toFixed(2)} — أخرى {totalsByCategory.أخرى.toFixed(2)}
                      </p>
                      <div className="app-table-wrap max-h-64 overflow-y-auto">
                        <table className="w-full min-w-[520px] text-right text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="px-2 py-1">الدورة</th>
                              <th className="px-2 py-1">التاريخ</th>
                              <th className="px-2 py-1">البند</th>
                              <th className="px-2 py-1">المبلغ</th>
                              <th className="px-2 py-1">الوصف</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.id} className="border-b border-slate-100">
                                <td className="px-2 py-1">{r.cycleName}</td>
                                <td className="px-2 py-1">{new Date(r.date).toLocaleDateString('ar-EG')}</td>
                                <td className="px-2 py-1">{r.category}</td>
                                <td className="px-2 py-1 font-semibold">{Number(r.amount || 0).toFixed(2)}</td>
                                <td className="px-2 py-1 text-slate-600">{r.description || '—'}</td>
                              </tr>
                            ))}
                            {rows.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-2 py-3 text-slate-500">
                                  لا توجد حركات مسجّلة لهذا العامل بعد.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )
                })()}
                <div className="mt-4">
                  <button type="button" onClick={() => setWorkerLedgerFarmWorker(null)} className="app-btn-outline">
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeCycle && sectionSlug === 'medication' && (
        <div id="farm-section-medication" className="scroll-mt-24 mb-5 app-card p-4">
          <SequentialPurchaseWizard
            title="إضافة علاج"
            description="خطوة واحدة في كل مرة — املأ البيانات ثم اضغط «الخطوة التالية». لو رجعت لخطوة سابقة تقدر تراجعها وتعدّل قبل ما تكمل."
            stepLabels={MED_WIZARD_LABELS}
            activeStep={medWizardStep}
            onStepChange={setMedWizardStep}
            accent="violet"
          >
            {medWizardStep === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">اختر موردًا من القائمة أو اكتب اسمه يدويًا، أو تخطّ بدون مورد.</p>
                <select
                  value={medicationSupplierIdInput}
                  onChange={(event) => {
                    const id = event.target.value
                    onMedicationSupplierIdChange(id)
                    const s = (suppliers || []).find((x) => x.id === id)
                    onMedicationSupplierChange(s ? s.name : '')
                  }}
                  className="app-input w-full"
                >
                  <option value="">— اختر موردًا —</option>
                  {(suppliers || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={medicationSupplierInput}
                  onChange={(event) => {
                    onMedicationSupplierChange(event.target.value)
                    onMedicationSupplierIdChange('')
                  }}
                  className="app-input w-full"
                  placeholder="اسم المورد (يدوي)"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMedWizardStep(1)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    تخطي — بدون مورد
                  </button>
                  <WizardNextButton accent="violet" className="mt-0" onClick={() => setMedWizardStep(1)} />
                </div>
              </div>
            )}
            {medWizardStep === 1 && (
              <div>
                <input
                  type="text"
                  value={medicationNameInput}
                  onChange={(event) => onMedicationNameChange(event.target.value)}
                  className="app-input w-full"
                  placeholder="مثال: فيتامين — مضاد حيوي"
                  autoFocus
                />
                <WizardNextButton
                  accent="violet"
                  disabled={!medWizardStepValid[1]}
                  onClick={() => setMedWizardStep(2)}
                />
              </div>
            )}
            {medWizardStep === 2 && (
              <div>
                <input
                  type="number"
                  min="0"
                  value={medicationQuantityInput}
                  onChange={(event) => onMedicationQuantityChange(event.target.value)}
                  className="app-input w-full"
                  placeholder="الكمية"
                  autoFocus
                />
                <WizardNextButton
                  accent="violet"
                  disabled={!medWizardStepValid[2]}
                  onClick={() => setMedWizardStep(3)}
                />
              </div>
            )}
            {medWizardStep === 3 && (
              <div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={medicationPriceModeInput}
                    onChange={(event) => onMedicationPriceModeChange(event.target.value)}
                    className="app-input w-full"
                  >
                    <option value="unit">سعر الوحدة</option>
                    <option value="total">السعر الإجمالي</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={medicationPriceInput}
                    onChange={(event) => onMedicationPriceChange(event.target.value)}
                    className="app-input w-full"
                    placeholder="السعر"
                    autoFocus
                  />
                </div>
                <WizardNextButton
                  accent="violet"
                  disabled={!medWizardStepValid[3]}
                  onClick={() => setMedWizardStep(4)}
                />
              </div>
            )}
            {medWizardStep === 4 && (
              <div>
                <input
                  type="date"
                  value={medicationDateInput}
                  onChange={(event) => onMedicationDateChange(event.target.value)}
                  className="app-input w-full max-w-xs"
                  autoFocus
                />
                <WizardNextButton
                  accent="violet"
                  disabled={!medWizardStepValid[4]}
                  onClick={() => setMedWizardStep(5)}
                />
              </div>
            )}
            {medWizardStep === 5 && (
              <div className="space-y-3">
                {renderPurchasePaymentPanel('medication', { inlineOpen: true })}
                <WizardNextButton
                  accent="violet"
                  disabled={!medWizardStepValid[5]}
                  onClick={() => setMedWizardStep(6)}
                />
              </div>
            )}
            {medWizardStep === 6 && (
              <div className="space-y-4">
                <div className="rounded-xl bg-violet-50 p-3 text-sm text-slate-800">
                  <p>
                    <strong>المورد:</strong>{' '}
                    {medicationSupplierInput.trim() || (suppliers || []).find((s) => s.id === medicationSupplierIdInput)?.name || '—'}
                  </p>
                  <p>
                    <strong>العلاج:</strong> {medicationNameInput} — <strong>الكمية:</strong> {medicationQuantityInput}
                  </p>
                  <p>
                    <strong>السعر:</strong> {medicationPriceInput}{' '}
                    ({medicationPriceModeInput === 'unit' ? 'للوحدة' : 'إجمالي'}) — <strong>التاريخ:</strong>{' '}
                    {medicationDateInput}
                  </p>
                  <p>
                    <strong>السداد:</strong>{' '}
                    {purchasePaymentSourceInput === 'CREDIT'
                      ? `آجل — ${purchaseCreditSupplierNameInput || 'مورد'}`
                      : 'من الخزنة'}
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-base font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={!!medicationConsumeAllInput}
                    onChange={(event) => onMedicationConsumeAllChange(event.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
                  />
                  <span>
                    تم استهلاك الدفعة بالكامل — تُسجّل الكمية كلها كمستخدمة فورًا (لا تُضاف للمخزون).
                  </span>
                </label>
                <button
                  type="button"
                  onClick={onAddMedication}
                  className="rounded-xl bg-violet-600 px-5 py-3 text-lg font-bold text-white"
                >
                  حفظ العلاج
                </button>
              </div>
            )}
          </SequentialPurchaseWizard>

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[700px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">الاسم</th>
                  <th className="px-3 py-2">المورد</th>
                  <th className="px-3 py-2">الكمية</th>
                  <th className="px-3 py-2">المستخدم</th>
                  <th className="px-3 py-2">التكلفة</th>
                  <th className="px-3 py-2">تتبع</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(activeCycle.medications || []).map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{new Date(item.date).toLocaleDateString("ar-EG")}</td>
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2">{item.supplier || "-"}</td>
                    <td className="px-3 py-2">{Number(item.quantity || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">{Number(item.usedQuantity || 0).toFixed(2)}</td>
                    <td className="px-3 py-2"><ColoredMoney value={item.totalCost} /></td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onTrackMedicationUsage(item.id)}
                        className="rounded-lg bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-700"
                      >
                        +١ استخدام
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditModal({
                              title: "تعديل العلاج",
                              fields: [
                                { key: "date", label: "التاريخ", type: "date" },
                                { key: "name", label: "الاسم", type: "text" },
                                { key: "supplier", label: "المورد", type: "text" },
                                { key: "quantity", label: "الكمية", type: "number" },
                                { key: "totalCost", label: "التكلفة", type: "number" },
                              ],
                              initialValues: {
                                date: item.date ? new Date(item.date).toISOString().slice(0, 10) : "",
                                name: item.name || "",
                                supplier: item.supplier || "",
                                quantity: Number(item.quantity || 0),
                                totalCost: Number(item.totalCost || 0),
                              },
                              onSubmit: (values) => onUpdateMedication(item.id, values),
                            })
                          }
                          className="app-btn-xs-edit"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMedication(item.id)}
                          className="app-btn-xs-delete"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!activeCycle.medications || activeCycle.medications.length === 0) && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={8}>
                      لا توجد أدوية حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeCycle && sectionSlug === 'expenses' && (
        <div id="farm-section-expenses" className="scroll-mt-24 mb-5 app-card p-4">
          <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة مصروف</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <input
              type="text"
              value={expenseItemNameInput}
              onChange={(event) => onExpenseItemNameChange(event.target.value)}
              className="app-input"
              placeholder="اسم المصروف"
            />
            <input
              type="number"
              min="0"
              value={expenseAmountInput}
              onChange={(event) => onExpenseAmountChange(event.target.value)}
              className="app-input"
              placeholder="المبلغ"
            />
            <input
              type="date"
              value={expenseDateInput}
              onChange={(event) => onExpenseDateChange(event.target.value)}
              className="app-input"
            />
            <button
              type="button"
              onClick={onAddExpense}
              className="rounded-xl bg-slate-700 px-5 py-3 text-lg font-bold text-white"
            >
              حفظ المصروف
            </button>
          </div>
          {renderPurchasePaymentPanel('expenses')}

          <div className="app-table-wrap mt-4">
            <table className="w-full min-w-[520px] text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">البند</th>
                  <th className="px-3 py-2">المبلغ</th>
                  <th className="px-3 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(activeCycle.expenses || []).map((expense) => (
                  <tr key={expense.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">{new Date(expense.date).toLocaleDateString("ar-EG")}</td>
                    <td className="px-3 py-2">{expense.title}</td>
                    <td className="px-3 py-2"><ColoredMoney value={expense.amount} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openEditModal({
                              title: "تعديل المصروف",
                              fields: [
                                { key: "date", label: "التاريخ", type: "date" },
                                { key: "title", label: "اسم البند", type: "text" },
                                { key: "amount", label: "المبلغ", type: "number" },
                              ],
                              initialValues: {
                                date: expense.date ? new Date(expense.date).toISOString().slice(0, 10) : "",
                                title: expense.title || "",
                                amount: Number(expense.amount || 0),
                              },
                              onSubmit: (values) => onUpdateExpense(expense.id, values),
                            })
                          }
                          className="app-btn-xs-edit"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteExpense(expense.id)}
                          className="app-btn-xs-delete"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!activeCycle.expenses || activeCycle.expenses.length === 0) && (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={4}>
                      لا توجد مصاريف حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeCycle && (sectionSlug === 'chicks' || sectionSlug === 'mortality') && (
        <div
          id={sectionSlug === 'mortality' ? 'farm-section-mortality' : 'farm-section-chicks'}
          className="scroll-mt-24 mb-5 grid gap-4 md:grid-cols-2"
        >
          {sectionSlug === 'chicks' && (
            <div className="flex flex-col gap-4 md:col-span-2">
              <div className="app-card p-4 md:max-w-xl">
                <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة كتاكيت</h3>
                <div className="grid gap-3">
                  <input
                    type="number"
                    min="1"
                    value={chicksCountInput}
                    onChange={(event) => onChicksCountChange(event.target.value)}
                    className="app-input"
                    placeholder="عدد الكتاكيت"
                  />
                  <input
                    type="date"
                    value={chicksDateInput}
                    onChange={(event) => onChicksDateChange(event.target.value)}
                    className="app-input"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={chicksCostInput}
                    onChange={(event) => onChicksCostChange(event.target.value)}
                    className="app-input"
                    placeholder="التكلفة"
                  />
                  <p className="text-sm font-semibold text-slate-600">
                    إجمالي التكلفة = عدد الكتاكيت × التكلفة
                  </p>
                  {renderPurchasePaymentPanel('chicks')}
                  <button
                    type="button"
                    onClick={onAddChicks}
                    className="app-btn-primary"
                  >
                    حفظ الكتاكيت
                  </button>
                </div>
              </div>

              <div className="app-card p-4">
                <h3 className="mb-1 text-xl font-bold text-slate-900">مخزن شحنات الكتاكيت</h3>
                <p className="mb-4 text-base text-slate-600">
                  إجمالي الوارد: {Number(activeCycle.totalArrivedChicks || 0).toLocaleString('ar-EG')} — النفوق:{' '}
                  {Number(activeCycle.totalMortality || 0).toLocaleString('ar-EG')} — العدد الحالي:{' '}
                  {Number(activeCycle.currentChickenCount || 0).toLocaleString('ar-EG')}
                  {Number(activeCycle.initialBirds || 0) > 0 && (
                    <span className="mr-2 block pt-1 text-sm text-slate-500 sm:inline sm:mr-0 sm:pr-2">
                      (يشمل {Number(activeCycle.initialBirds).toLocaleString('ar-EG')} كتكوت بداية دورة مسجّلين مع الدورة وليسوا في الجدول)
                    </span>
                  )}
                </p>
                <div className="app-table-wrap">
                  <table className="w-full min-w-[760px] text-right text-base">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-700">
                        <th className="px-2 py-2 font-bold">#</th>
                        <th className="px-2 py-2 font-bold">العدد</th>
                        <th className="px-2 py-2 font-bold">التكلفة</th>
                        <th className="px-2 py-2 font-bold">تاريخ الوصول</th>
                        <th className="px-2 py-2 font-bold">سُجّل في النظام</th>
                        <th className="px-2 py-2 font-bold">آخر تعديل</th>
                        <th className="px-2 py-2 font-bold">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activeCycle.chickArrivals || []).map((row, index) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-semibold text-slate-800">
                            {(activeCycle.chickArrivals || []).length - index}
                          </td>
                          <td className="px-2 py-2 font-bold text-slate-900">
                            {Number(row.count || 0).toLocaleString('ar-EG')}
                          </td>
                          <td className="px-2 py-2 font-semibold text-slate-800">
                            {Number(row.totalCost ?? 0) > 0 ? (
                              <ColoredMoney value={row.totalCost} />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-2 py-2 text-slate-800">
                            {row.arrivalDate
                              ? new Date(row.arrivalDate).toLocaleDateString('ar-EG', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-slate-700">
                            {row.createdAt
                              ? new Date(row.createdAt).toLocaleString('ar-EG', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })
                              : '—'}
                          </td>
                          <td className="px-2 py-2 text-slate-600">
                            {row.updatedAt
                              ? new Date(row.updatedAt).toLocaleString('ar-EG', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : '—'}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal({
                                    title: "تعديل شحنة الكتاكيت",
                                    fields: [
                                      { key: "arrivalDate", label: "تاريخ الوصول", type: "date" },
                                      { key: "count", label: "العدد", type: "number" },
                                      { key: "costPerChick", label: "التكلفة", type: "number" },
                                    ],
                                    initialValues: {
                                      arrivalDate: row.arrivalDate ? new Date(row.arrivalDate).toISOString().slice(0, 10) : "",
                                      count: Number(row.count || 0),
                                      costPerChick: Number(row.count || 0) > 0 ? Number(row.totalCost ?? 0) / Number(row.count || 1) : 0,
                                    },
                                    onSubmit: (values) =>
                                      onUpdateChickArrival(row.id, {
                                        arrivalDate: values.arrivalDate,
                                        count: values.count,
                                        totalCost: Number(values.count || 0) * Number(values.costPerChick || 0),
                                      }),
                                  })
                                }
                                className="app-btn-xs-edit"
                              >
                                تعديل
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteChickArrival(row.id)}
                                className="app-btn-xs-delete"
                              >
                                حذف
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!activeCycle.chickArrivals || activeCycle.chickArrivals.length === 0) && (
                        <tr>
                          <td className="px-2 py-4 text-slate-500" colSpan={7}>
                            لا توجد شحنات كتاكيت مسجلة بعد. أضف شحنة من الأعلى.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {sectionSlug === 'mortality' && (
            <div className="flex flex-col gap-4 md:col-span-2">
              <div className="app-card p-4 md:max-w-xl">
                <h3 className="mb-3 text-xl font-bold text-slate-900">إضافة نفوق</h3>
                <div className="grid gap-3">
                  <input
                    type="number"
                    min="1"
                    value={mortalityCountInput}
                    onChange={(event) => onMortalityCountChange(event.target.value)}
                    className="app-input"
                    placeholder="عدد النفوق"
                  />
                  <input
                    type="date"
                    value={mortalityDateInput}
                    onChange={(event) => onMortalityDateChange(event.target.value)}
                    className="app-input"
                  />
                  <button
                    type="button"
                    onClick={onAddMortality}
                    className="app-btn-danger"
                  >
                    حفظ النفوق
                  </button>
                </div>
              </div>
              <div className="app-card border-rose-200/80 bg-gradient-to-br from-rose-50/30 to-white p-5">
                <h3 className="mb-2 text-xl font-bold text-slate-900">تقرير خسارة النفوق</h3>
                <p className="mb-3 text-sm text-slate-600">
                  عند كل تسجيل نفوق يُحفظ <strong>سعر الكتكوت</strong> كما كان محسوبًا في تلك اللحظة. السجلات القديمة قبل
                  هذا التحديث قد تظهر بدون سعر.
                </p>
                <div className="mb-4 grid gap-2 rounded-xl border border-rose-100 bg-rose-50/80 p-3 text-base font-semibold text-slate-800 sm:grid-cols-2">
                  <p>
                    إجمالي خسارة النفوق (مسجّل):{' '}
                    <span className="font-bold text-rose-800">
                      <ColoredMoney value={activeCycle.totalMortalityLossRecorded} />
                    </span>
                  </p>
                  <p>
                    سعر الكتكوت الحالي للدورة:{' '}
                    <span className="font-bold text-slate-900">
                      {chickPriceFromConsumptionFormula != null ? (
                        <ColoredMoney value={chickPriceFromConsumptionFormula} />
                      ) : (
                        '—'
                      )}
                    </span>
                  </p>
                  {Number(activeCycle.mortalitiesWithoutPriceSnapshot || 0) > 0 && (
                    <p className="text-sm text-amber-800 sm:col-span-2">
                      يوجد {Number(activeCycle.mortalitiesWithoutPriceSnapshot).toLocaleString('ar-EG')} سجلًا بدون سعر
                      محفوظ (قديم قبل التحديث).
                    </p>
                  )}
                </div>
                <h3 className="mb-3 text-xl font-bold text-slate-900">تفاصيل النفوق</h3>
                <p className="mb-3 text-base text-slate-600">
                  إجمالي النفوق في الدورة:{' '}
                  <strong>{Number(activeCycle.totalMortality || 0).toLocaleString('ar-EG')}</strong>
                </p>
                <div className="app-table-wrap">
                  <table className="w-full min-w-[980px] text-right text-base">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-700">
                        <th className="px-2 py-2 font-bold">#</th>
                        <th className="px-2 py-2 font-bold">التاريخ</th>
                        <th className="px-2 py-2 font-bold">العدد</th>
                        <th className="px-2 py-2 font-bold">سعر الكتكوت وقت التسجيل</th>
                        <th className="px-2 py-2 font-bold">خسارة السطر</th>
                        <th className="px-2 py-2 font-bold">السبب</th>
                        <th className="px-2 py-2 font-bold">وقت التسجيل</th>
                        <th className="px-2 py-2 font-bold">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(activeCycle.mortalities || [])]
                        .sort((a, b) => {
                          const d = new Date(b.date) - new Date(a.date)
                          if (d !== 0) return d
                          return new Date(b.createdAt) - new Date(a.createdAt)
                        })
                        .map((row, index) => (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="px-2 py-2 font-semibold">{index + 1}</td>
                            <td className="px-2 py-2">{new Date(row.date).toLocaleDateString('ar-EG')}</td>
                            <td className="px-2 py-2 font-bold text-rose-800">{Number(row.count || 0)}</td>
                            <td className="px-2 py-2 font-semibold text-slate-800">
                              {row.chickPriceAtRecord != null ? (
                                <ColoredMoney value={row.chickPriceAtRecord} fractionDigits={4} />
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-2 py-2 font-bold text-rose-900">
                              {row.mortalityLineLoss != null ? (
                                <ColoredMoney value={row.mortalityLineLoss} />
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-2 py-2 text-slate-700">{row.reason || '—'}</td>
                            <td className="px-2 py-2 text-slate-600">
                              {row.createdAt
                                ? new Date(row.createdAt).toLocaleString('ar-EG', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })
                                : '—'}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditModal({
                                      title: "تعديل سجل النفوق",
                                      fields: [
                                        { key: "date", label: "التاريخ", type: "date" },
                                        { key: "count", label: "العدد", type: "number" },
                                        { key: "reason", label: "السبب", type: "text" },
                                      ],
                                      initialValues: {
                                        date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
                                        count: Number(row.count || 0),
                                        reason: row.reason || "",
                                      },
                                      onSubmit: (values) => onUpdateMortality(row.id, values),
                                    })
                                  }
                                  className="app-btn-xs-edit"
                                >
                                  تعديل
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteMortality(row.id)}
                                  className="app-btn-xs-delete"
                                >
                                  حذف
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {(!activeCycle.mortalities || activeCycle.mortalities.length === 0) && (
                        <tr>
                          <td className="px-2 py-4 text-slate-500" colSpan={8}>
                            لا توجد سجلات نفوق بعد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeCycle && sectionSlug === 'feed' && (() => {
        const sortedFeeds = [...(activeCycle.feeds || [])].sort((a, b) => {
          const byDate = new Date(b.date) - new Date(a.date)
          if (byDate !== 0) return byDate
          return new Date(b.createdAt) - new Date(a.createdAt)
        })
        return (
          <div id="farm-section-feed" className="scroll-mt-24 mb-5 flex flex-col gap-4">
            <div className="app-card p-4">
              <SequentialPurchaseWizard
                title="إضافة العلف"
                description="خطوة واحدة في كل مرة — املأ البيانات ثم اضغط «الخطوة التالية». لو رجعت لخطوة سابقة تقدر تراجعها وتعدّل قبل ما تكمل."
                stepLabels={FEED_WIZARD_LABELS}
                activeStep={feedWizardStep}
                onStepChange={setFeedWizardStep}
                accent="amber"
              >
                {feedWizardStep === 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600">اختر موردًا من القائمة أو اكتب اسمه يدويًا، أو تخطّ بدون مورد.</p>
                    <select
                      value={feedSupplierIdInput}
                      onChange={(event) => {
                        const id = event.target.value
                        onFeedSupplierIdChange(id)
                        const s = (suppliers || []).find((x) => x.id === id)
                        onFeedSupplierChange(s ? s.name : '')
                      }}
                      className="app-input w-full"
                    >
                      <option value="">— مورد من القائمة —</option>
                      {(suppliers || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={feedSupplierInput}
                      onChange={(event) => {
                        onFeedSupplierChange(event.target.value)
                        onFeedSupplierIdChange('')
                      }}
                      className="app-input w-full"
                      placeholder="اسم المورد (يدوي)"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setFeedWizardStep(1)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      >
                        تخطي — بدون مورد
                      </button>
                      <WizardNextButton accent="amber" className="mt-0" onClick={() => setFeedWizardStep(1)} />
                    </div>
                  </div>
                )}
                {feedWizardStep === 1 && (
                  <div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={feedTypeInput}
                        onChange={(event) => onFeedTypeChange(event.target.value)}
                        className="app-input w-full"
                      >
                        <option value="bags">شكاير</option>
                        <option value="ton">طن</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={feedPricePerTonInput}
                        onChange={(event) => onFeedPricePerTonChange(event.target.value)}
                        className="app-input w-full"
                        placeholder="سعر الطن"
                        autoFocus
                      />
                    </div>
                    <WizardNextButton
                      accent="amber"
                      disabled={!feedWizardStepValid[1]}
                      onClick={() => setFeedWizardStep(2)}
                    />
                  </div>
                )}
                {feedWizardStep === 2 && (
                  <div>
                    <input
                      type="number"
                      min="0"
                      value={feedQuantityInput}
                      onChange={(event) => onFeedQuantityChange(event.target.value)}
                      className="app-input w-full"
                      placeholder="الكمية"
                      autoFocus
                    />
                    <WizardNextButton
                      accent="amber"
                      disabled={!feedWizardStepValid[2]}
                      onClick={() => setFeedWizardStep(3)}
                    />
                  </div>
                )}
                {feedWizardStep === 3 && (
                  <div>
                    <input
                      type="date"
                      value={feedDateInput}
                      onChange={(event) => onFeedDateChange(event.target.value)}
                      className="app-input w-full max-w-xs"
                      autoFocus
                    />
                    <WizardNextButton
                      accent="amber"
                      disabled={!feedWizardStepValid[3]}
                      onClick={() => setFeedWizardStep(4)}
                    />
                  </div>
                )}
                {feedWizardStep === 4 && (
                  <div className="space-y-3">
                    {renderPurchasePaymentPanel('feed', { inlineOpen: true })}
                    <WizardNextButton
                      accent="amber"
                      disabled={!feedWizardStepValid[4]}
                      onClick={() => setFeedWizardStep(5)}
                    />
                  </div>
                )}
                {feedWizardStep === 5 && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-amber-50 p-3 text-sm text-slate-800">
                      <p>
                        <strong>المورد:</strong>{' '}
                        {feedSupplierInput.trim() || (suppliers || []).find((s) => s.id === feedSupplierIdInput)?.name || '—'}
                      </p>
                      <p>
                        <strong>النوع:</strong> {feedTypeInput === 'ton' ? 'طن' : 'شكاير'} — <strong>الكمية:</strong>{' '}
                        {feedQuantityInput} — <strong>سعر الطن:</strong> {feedPricePerTonInput}
                      </p>
                      <p>
                        <strong>التاريخ:</strong> {feedDateInput}
                      </p>
                      <p className="mt-2 font-bold">
                        الوزن الإجمالي: {feedTotalWeightKg.toFixed(2)} كجم — التكلفة: <ColoredMoney value={feedTotalCost} />
                      </p>
                      <p>
                        <strong>السداد:</strong>{' '}
                        {purchasePaymentSourceInput === 'CREDIT'
                          ? `آجل — ${purchaseCreditSupplierNameInput || 'مورد'}`
                          : 'من الخزنة'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onAddFeed}
                      className="rounded-xl bg-amber-600 px-5 py-3 text-lg font-bold text-white"
                    >
                      حفظ العلف
                    </button>
                  </div>
                )}
              </SequentialPurchaseWizard>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-xl font-bold text-slate-900">مخزن مشتريات العلف</h3>
              <p className="mb-4 text-base text-slate-600">
                إجمالي وزن المشتريات:{' '}
                <strong>{Number(activeCycle.totalFeedWeightKg || 0).toFixed(2)} كجم</strong> — إجمالي التكلفة:{' '}
                <strong>{Number(activeCycle.totalFeedCost || 0).toFixed(2)}</strong> — المخزون التقديري (بعد
                الاستهلاك): <strong>{Number(activeCycle.feedStockKg || 0).toFixed(2)} كجم</strong>
              </p>
              <div className="app-table-wrap">
                <table className="w-full min-w-[980px] text-right text-base">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-700">
                      <th className="px-2 py-2 font-bold">#</th>
                      <th className="px-2 py-2 font-bold">المورد</th>
                      <th className="px-2 py-2 font-bold">نوع الكمية</th>
                      <th className="px-2 py-2 font-bold">الكمية</th>
                      <th className="px-2 py-2 font-bold">الوزن (كجم)</th>
                      <th className="px-2 py-2 font-bold">سعر الطن</th>
                      <th className="px-2 py-2 font-bold">التكلفة</th>
                      <th className="px-2 py-2 font-bold">تاريخ الشراء</th>
                      <th className="px-2 py-2 font-bold">وقت التسجيل</th>
                      <th className="px-2 py-2 font-bold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFeeds.map((item, idx) => {
                      const isTon = item.feedType === 'ton'
                      const kg = Number(item.quantityKg || 0)
                      const qtyDisplay = isTon
                        ? `${(kg / 1000).toLocaleString('ar-EG', { maximumFractionDigits: 3 })} طن`
                        : `${(kg / 50).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} شيكارة`
                      return (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-semibold text-slate-800">{idx + 1}</td>
                          <td className="px-2 py-2 text-slate-800">
                            {item.linkedSupplier?.name || item.supplier || '—'}
                          </td>
                          <td className="px-2 py-2">{isTon ? 'طن' : 'شكاير'}</td>
                          <td className="px-2 py-2 font-medium text-slate-900">{qtyDisplay}</td>
                          <td className="px-2 py-2 font-semibold text-amber-900">{kg.toFixed(2)}</td>
                          <td className="px-2 py-2">{Number(item.unitPrice || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 font-bold text-slate-900">
                            {Number(item.totalCost || 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-slate-700">
                            {item.date ? new Date(item.date).toLocaleDateString('ar-EG') : '—'}
                          </td>
                          <td className="px-2 py-2 text-slate-600">
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleString('ar-EG', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : '—'}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal({
                                    title: "تعديل العلف",
                                    fields: [
                                      { key: "date", label: "التاريخ", type: "date" },
                                      { key: "supplier", label: "المورد", type: "text" },
                                      { key: "feedType", label: "النوع (ton/bags)", type: "text" },
                                      { key: "quantity", label: "الكمية", type: "number" },
                                      { key: "pricePerTon", label: "سعر الطن", type: "number" },
                                    ],
                                    initialValues: {
                                      date: item.date ? new Date(item.date).toISOString().slice(0, 10) : "",
                                      supplier: item.linkedSupplier?.name || item.supplier || "",
                                      feedType: item.feedType || "bags",
                                      quantity: Number(item.quantity || 0),
                                      pricePerTon: Number(item.pricePerTon || item.unitPrice || 0),
                                    },
                                    onSubmit: (values) => onUpdateFeed(item.id, values),
                                  })
                                }
                                className="app-btn-xs-edit"
                              >
                                تعديل
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteFeed(item.id)}
                                className="app-btn-xs-delete"
                              >
                                حذف
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {sortedFeeds.length === 0 && (
                      <tr>
                        <td className="px-2 py-4 text-slate-500" colSpan={10}>
                          لا توجد مشتريات علف مسجلة بعد.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      <datalist id="purchase-credit-people">
        {purchaseCreditPeople.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {editModal && (
        <div className="app-modal-overlay">
          <div className="app-modal max-h-[90vh] overflow-y-auto">
            <h3 className="app-modal-title mb-4">{editModal.title}</h3>
            {editModal.error && (
              <div className="app-banner-error mb-4 max-w-none px-3 py-2 text-sm">{editModal.error}</div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {editModal.fields.map((field) => (
                <label key={field.key} className="block text-base font-semibold text-slate-700">
                  {field.label}
                  {field.type === "select" && field.options ? (
                    <select
                      value={editModal.values[field.key] ?? ""}
                      onChange={(e) => updateEditModalValue(field.key, e.target.value)}
                      className="app-input-sm mt-1"
                    >
                      {(field.options || []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={editModal.values[field.key] ?? ""}
                      onChange={(e) => updateEditModalValue(field.key, e.target.value)}
                      className="app-input-sm mt-1"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submitEditModal}
                disabled={editModal.saving}
                className="app-btn-primary py-2 text-base disabled:opacity-60"
              >
                {editModal.saving ? "جاري الحفظ..." : "حفظ التعديل"}
              </button>
              <button type="button" onClick={closeEditModal} className="app-btn-outline">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {cycleDetailsModal && (
        <div className="app-modal-overlay">
          <div className="app-modal max-h-[92vh] overflow-y-auto !max-w-4xl">
            <h3 className="app-modal-title mb-4">تفاصيل {cycleDetailsModal.name}</h3>
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-xs font-bold text-slate-500">بداية</p>
                <p className="text-base font-extrabold text-slate-900">
                  {cycleDetailsModal.startDate ? new Date(cycleDetailsModal.startDate).toLocaleDateString('ar-EG') : '—'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-xs font-bold text-slate-500">نهاية</p>
                <p className="text-base font-extrabold text-slate-900">
                  {cycleDetailsModal.endDate ? new Date(cycleDetailsModal.endDate).toLocaleDateString('ar-EG') : 'نشطة'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-xs font-bold text-slate-500">مدة الدورة</p>
                <p className="text-base font-extrabold text-slate-900">{cycleDetailsModal.cycleDurationDays || '—'} يوم</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="text-xs font-bold text-slate-500">صافي المبيعات</p>
                <p className="text-base font-extrabold text-teal-800">
                  {Number(cycleDetailsModal.totalSalesAmount || 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="app-table-wrap">
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">البند</th>
                    <th className="px-3 py-2">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {buildCycleLogs(cycleDetailsModal).map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">{row.date ? new Date(row.date).toLocaleDateString('ar-EG') : '—'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.title}</td>
                      <td className="px-3 py-2 text-slate-700">{row.details}</td>
                    </tr>
                  ))}
                  {buildCycleLogs(cycleDetailsModal).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-3 text-slate-500">لا توجد تفاصيل مسجلة لهذه الدورة.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setCycleDetailsModal(null)}
                className="app-btn-outline"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default FarmPage
