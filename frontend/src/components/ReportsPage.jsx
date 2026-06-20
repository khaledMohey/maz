import { useMemo } from 'react'
import PageHeader from './ui/PageHeader'
import LoadingState from './ui/LoadingState'
import EmptyState from './ui/EmptyState'
import ColoredMoney from './ui/ColoredMoney'

/** تقويم محلي YYYY-MM-DD */
function localDateKeyDaily(isoOrDate) {
  if (!isoOrDate) return ''
  const x = new Date(isoOrDate)
  if (Number.isNaN(x.getTime())) return ''
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const EXPENSE_KW_TRANSPORT = ['مواصلات', 'نقل', 'توصيل', 'سلف', 'سُلُف']
const EXPENSE_KW_ELECTRIC = ['كهرب', 'كهرباء']

function expenseMatchesKeywords(exp, keywords) {
  const hay = `${exp.title || ''} ${exp.category || ''}`
  return keywords.some((k) => hay.includes(k))
}

function isGasCylinderSmall(g) {
  const t = (g.gasType || '').trim()
  return t === 'صغير' || t.includes('صغير')
}

function groupByLocalDate(items, getDate) {
  const map = {}
  for (const item of items || []) {
    const k = localDateKeyDaily(getDate(item))
    if (!k) continue
    if (!map[k]) map[k] = []
    map[k].push(item)
  }
  return map
}

/** صفوف جدول اليومية (مثل ورقة Excel) + إجماليات */
function buildDailyLedger(cycle) {
  if (!cycle?.startDate) return { rows: [], totals: null }
  const start = new Date(cycle.startDate)
  const end = cycle.endDate ? new Date(cycle.endDate) : new Date()
  start.setHours(12, 0, 0, 0)
  end.setHours(12, 0, 0, 0)
  if (start > end) return { rows: [], totals: null }

  const dateKeys = []
  const maxDays = 400
  for (let i = 0, d = new Date(start); d <= end && i < maxDays; i++) {
    dateKeys.push(localDateKeyDaily(d))
    d.setDate(d.getDate() + 1)
  }

  const dcs = groupByLocalDate(cycle.dailyConsumptions || [], (x) => x.date)
  const mort = groupByLocalDate(cycle.mortalities || [], (x) => x.date)
  const gases = groupByLocalDate(cycle.gases || [], (x) => x.date)
  const solars = groupByLocalDate(cycle.solars || [], (x) => x.date)
  const expensesByDay = groupByLocalDate(cycle.expenses || [], (x) => x.date)

  const rows = dateKeys.map((dateKey) => {
    const dcList = dcs[dateKey] || []
    const dc = dcList[0]

    let feedDisplay = '—'
    let feedBags = null
    let feedKg = 0
    if (dc) {
      feedKg = Number(dc.feedKg || 0)
      if (dc.consumptionBags != null && Number(dc.consumptionBags) > 0) {
        feedBags = Number(dc.consumptionBags)
        feedDisplay = feedBags.toLocaleString('ar-EG', { maximumFractionDigits: 2 })
      } else if (feedKg > 0) {
        feedDisplay = `${feedKg.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} كجم`
      }
    }

    const mortSum = (mort[dateKey] || []).reduce((s, x) => s + Number(x.count || 0), 0)

    let gasBig = 0
    let gasSmall = 0
    for (const g of gases[dateKey] || []) {
      const c = Number(g.count || 0)
      if (isGasCylinderSmall(g)) gasSmall += c
      else gasBig += c
    }

    const solarCost = (solars[dateKey] || []).reduce((s, x) => s + Number(x.cost || 0), 0)

    let electricMoney = 0
    for (const ex of expensesByDay[dateKey] || []) {
      if (expenseMatchesKeywords(ex, EXPENSE_KW_ELECTRIC)) electricMoney += Number(ex.amount || 0)
    }
    const electricKwh = dc && Number(dc.electricityKwh) > 0 ? Number(dc.electricityKwh) : 0

    let transport = 0
    for (const ex of expensesByDay[dateKey] || []) {
      if (expenseMatchesKeywords(ex, EXPENSE_KW_TRANSPORT)) transport += Number(ex.amount || 0)
    }

    const electricDisplay =
      electricMoney > 0
        ? Number(electricMoney).toLocaleString('ar-EG', { maximumFractionDigits: 0 })
        : electricKwh > 0
          ? `${electricKwh.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ك.س.ح`
          : '—'

    const shortDate = new Date(`${dateKey}T12:00:00`).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    })

    const hasAny =
      feedDisplay !== '—' ||
      mortSum > 0 ||
      gasBig > 0 ||
      gasSmall > 0 ||
      solarCost > 0 ||
      electricDisplay !== '—' ||
      transport > 0

    return {
      dateKey,
      shortDate,
      feedDisplay,
      feedBags,
      feedKg,
      mortSum,
      gasBig,
      gasSmall,
      solarCost,
      electricDisplay,
      electricMoney,
      electricKwh,
      transport,
      hasAny,
    }
  })

  const totals = rows.reduce(
    (acc, r) => {
      acc.mort += r.mortSum
      acc.gasBig += r.gasBig
      acc.gasSmall += r.gasSmall
      acc.solar += r.solarCost
      acc.transport += r.transport
      acc.electricMoney += r.electricMoney
      acc.feedKg += r.feedKg
      acc.feedBags += r.feedBags != null ? r.feedBags : 0
      return acc
    },
    { mort: 0, gasBig: 0, gasSmall: 0, solar: 0, transport: 0, electricMoney: 0, feedKg: 0, feedBags: 0 },
  )

  return { rows, totals }
}

function ReportCard({ title, value, tone = "default" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white ring-emerald-100/80"
      : tone === "danger"
        ? "border-rose-200/90 bg-gradient-to-br from-rose-50 to-white ring-rose-100/80"
        : "border-slate-200/90 bg-white ring-slate-100/60"

  return (
    <div className={`app-stat-card ${toneClass} ring-1`}>
      <p className="mb-2 text-sm font-bold text-slate-500">{title}</p>
      <p className="text-2xl font-extrabold text-slate-900 md:text-3xl">{value}</p>
    </div>
  )
}

function ReportsPage({ farmName, report, cycle, loading, onBack }) {
  const formatNumber = (value, digits = 2) => Number(value || 0).toFixed(digits)
  const formatDate = (value) => (value ? new Date(value).toLocaleDateString("ar-EG") : "—")
  const cycleStart = cycle?.startDate ? new Date(cycle.startDate) : null
  const cycleEnd = cycle?.endDate ? new Date(cycle.endDate) : new Date()
  const cycleDays =
    cycleStart && cycleEnd ? Math.max(1, Math.floor((cycleEnd - cycleStart) / (1000 * 60 * 60 * 24)) + 1) : 0

  const dailyLedger = useMemo(() => buildDailyLedger(cycle), [cycle])
  const { rows: dailyRows, totals: dailyTotals } = dailyLedger

  return (
    <section className="app-page">
      <PageHeader
        className="print:hidden"
        eyebrow="تقارير"
        title="تقرير دورة مفصل"
        description={farmName ? `المزرعة: ${farmName}` : 'ملخص مالي وتشغيلي للدورة'}
      >
        <button type="button" onClick={onBack} className="app-btn-ghost">
          ← رجوع
        </button>
        <button type="button" onClick={() => window.print()} className="app-btn-primary">
          طباعة / PDF
        </button>
      </PageHeader>

      {loading && <LoadingState title="جاري تحميل التقرير…" subtitle="تجميع الأرقام والجداول" />}

      {!loading && !report && (
        <EmptyState
          icon="📄"
          title="لا يوجد تقرير"
          description="افتح التقارير من داخل مزرعة لدورها نشطة أو بعد تحميل البيانات."
        >
          <button type="button" onClick={onBack} className="app-btn-outline">
            رجوع
          </button>
        </EmptyState>
      )}

      {!loading && report && (
        <div className="space-y-5">
          <div className="app-card border-teal-100/80 bg-gradient-to-l from-teal-50/40 via-white to-slate-50/30 p-6">
            <h2 className="mb-2 text-2xl font-bold text-slate-900">بيانات الدورة</h2>
            <div className="grid gap-2 text-lg font-semibold text-slate-800 sm:grid-cols-2">
              <p>المزرعة: {farmName || "—"}</p>
              <p>اسم الدورة: {report.cycleName || "—"}</p>
              <p>من: {formatDate(cycle?.startDate)}</p>
              <p>إلى: {formatDate(cycle?.endDate || new Date())}</p>
              <p>المدة: {cycleDays} يوم</p>
              <p>تاريخ التقرير: {new Date().toLocaleDateString("ar-EG")}</p>
            </div>
          </div>

          {cycle && dailyRows.length > 0 && (
            <div className="print:break-inside-avoid rounded-2xl border border-amber-400/70 bg-gradient-to-b from-amber-100/50 via-orange-50/40 to-amber-50/30 p-1 shadow-md sm:p-2">
              <div className="rounded-xl bg-white/95 p-4 sm:p-6">
                <div className="mb-4 flex flex-col gap-2 border-b border-amber-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-extrabold tracking-tight text-amber-950">سجل اليومية</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                      جدول يوم بيوم للعلف المستهلك، النفوق، أسطوانات الغاز (كبير / صغير)، تكلفة السولار، الكهرباء
                      (مصروف أو كيلوواط من الاستهلاك اليومي)، والمواصلات من المصاريف التي تحتوي كلمات مثل «مواصلات»
                      أو «نقل» في البند أو التصنيف.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold text-amber-950 sm:text-sm">
                    <span className="rounded-lg bg-amber-200/90 px-3 py-1.5 ring-1 ring-amber-400/50">
                      أيام الجدول: {dailyRows.length}
                    </span>
                    <span className="rounded-lg bg-amber-200/90 px-3 py-1.5 ring-1 ring-amber-400/50">
                      أيام عليها بيانات: {dailyRows.filter((r) => r.hasAny).length}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-amber-300/60 shadow-inner">
                  <table
                    className="daily-ledger-table w-full min-w-[960px] border-collapse text-right text-sm sm:text-base"
                    dir="rtl"
                  >
                    <thead>
                      <tr className="sticky top-0 z-20 border-b-2 border-amber-600/30 bg-[#fde047] text-slate-900 shadow-sm">
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">اليوم</th>
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">العلف</th>
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">النافق</th>
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">أنابيب (ك)</th>
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">أنابيب (ص)</th>
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">سولار (جنيه)</th>
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">كهرباء</th>
                        <th className="px-3 py-3 text-sm font-extrabold sm:px-4 sm:text-base">مواصلات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRows.map((row, idx) => (
                        <tr
                          key={row.dateKey}
                          className={`border-b border-amber-200/50 transition-colors ${idx % 2 === 0 ? 'bg-[#fff7ed]' : 'bg-[#ffedd5]/90'} ${row.hasAny ? '' : 'opacity-[0.65]'}`}
                        >
                          <th
                            scope="row"
                            className="whitespace-nowrap bg-[#fef9c3] px-3 py-2.5 text-center font-bold text-amber-950 sm:px-4"
                          >
                            {row.shortDate}
                          </th>
                          <td className={`px-3 py-2.5 font-semibold sm:px-4 ${row.feedDisplay === '—' ? 'text-slate-400' : 'text-slate-900'}`}>
                            {row.feedDisplay}
                          </td>
                          <td className={`px-3 py-2.5 text-center font-bold sm:px-4 ${row.mortSum > 0 ? 'text-rose-800' : 'text-slate-400'}`}>
                            {row.mortSum > 0 ? row.mortSum : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-center font-semibold sm:px-4 ${row.gasBig > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                            {row.gasBig > 0 ? row.gasBig : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-center font-semibold sm:px-4 ${row.gasSmall > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                            {row.gasSmall > 0 ? row.gasSmall : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-center font-semibold sm:px-4 ${row.solarCost > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                            {row.solarCost > 0 ? <ColoredMoney value={row.solarCost} fractionDigits={0} /> : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-center font-semibold sm:px-4 ${row.electricDisplay === '—' ? 'text-slate-400' : 'text-slate-900'}`}>
                            {row.electricDisplay}
                          </td>
                          <td className={`px-3 py-2.5 text-center font-semibold sm:px-4 ${row.transport > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
                            {row.transport > 0 ? <ColoredMoney value={row.transport} fractionDigits={0} /> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {dailyTotals && (
                      <tfoot>
                        <tr className="border-t-2 border-amber-600/40 bg-[#fcd34d] font-extrabold text-slate-900">
                          <th scope="row" className="px-3 py-3 text-right sm:px-4">
                            الإجمالي
                          </th>
                          <td className="px-3 py-3 text-xs font-bold leading-snug text-slate-800 sm:px-4 sm:text-sm">
                            {dailyTotals.feedBags > 0
                              ? `${Number(dailyTotals.feedBags).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} شيكارة`
                              : dailyTotals.feedKg > 0
                                ? `${Number(dailyTotals.feedKg).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} كجم`
                                : '—'}
                          </td>
                          <td className="px-3 py-3 text-center sm:px-4">{dailyTotals.mort}</td>
                          <td className="px-3 py-3 text-center sm:px-4">{dailyTotals.gasBig}</td>
                          <td className="px-3 py-3 text-center sm:px-4">{dailyTotals.gasSmall}</td>
                          <td className="px-3 py-3 text-center sm:px-4">
                            {dailyTotals.solar > 0 ? (
                              <ColoredMoney value={dailyTotals.solar} fractionDigits={0} />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-3 text-center text-xs sm:px-4 sm:text-sm">
                            {dailyTotals.electricMoney > 0 ? (
                              <>
                                <ColoredMoney value={dailyTotals.electricMoney} fractionDigits={0} /> ج
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-3 text-center sm:px-4">
                            {dailyTotals.transport > 0 ? (
                              <ColoredMoney value={dailyTotals.transport} fractionDigits={0} />
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ReportCard title="الربح" value={formatNumber(report.profit)} tone={Number(report.profit || 0) > 0 ? "success" : "default"} />
            <ReportCard title="الخسارة" value={formatNumber(report.loss)} tone={Number(report.loss || 0) > 0 ? "danger" : "default"} />
            <ReportCard title="تكلفة الكيلو" value={formatNumber(report.costPerKg)} />
            <ReportCard title="نسبة النفوق" value={`${(Number(report.mortalityRate || 0) * 100).toFixed(2)}%`} />
            <ReportCard title="إجمالي الكتاكيت" value={formatNumber(report.totalChicks, 0)} />
            <ReportCard title="النفوق" value={formatNumber(report.mortality, 0)} />
            <ReportCard title="خسارة النفوق (مسجّلة)" value={formatNumber(report.totalMortalityLossRecorded)} />
            <ReportCard title="العدد النهائي" value={formatNumber(report.finalCount, 0)} />
            <ReportCard title="تكلفة العلف" value={formatNumber(report.feedCost)} />
            <ReportCard title="الغاز + السولار" value={formatNumber(report.gasSolarCost)} />
            <ReportCard title="المصاريف" value={formatNumber(report.expenses)} />
            <ReportCard title="العلاج" value={formatNumber(report.medications)} />
            <ReportCard title="العمال" value={formatNumber(report.workers)} />
            <ReportCard title="المبيعات" value={formatNumber(report.sales)} />
            <ReportCard title="إجمالي التكلفة" value={formatNumber(report.totalCost)} />
            <ReportCard title="سعر الكتكوت (محسوب)" value={report.chickPricePerUnit != null ? formatNumber(report.chickPricePerUnit) : "—"} />
            <ReportCard title="الإيراد" value={formatNumber(report.revenue)} />
            <ReportCard title="صافي الربح" value={formatNumber(report.netProfit)} />
            <ReportCard title="خصم الشركاء" value={formatNumber(report.totalPartnerDeduction)} />
            <ReportCard title="خصم المشرفين" value={formatNumber(report.totalSupervisorDeduction)} />
            <ReportCard
              title="صافي بعد الشركاء"
              value={formatNumber(report.profitAfterPartnerShare)}
              tone={Number(report.profitAfterPartnerShare || 0) >= 0 ? "success" : "danger"}
            />
            <ReportCard
              title="الصافي النهائي"
              value={formatNumber(report.finalProfitAfterShares)}
              tone={Number(report.finalProfitAfterShares || 0) >= 0 ? "success" : "danger"}
            />
          </div>

          <div className="app-card border-teal-100/50 p-5">
            <h3 className="mb-3 text-xl font-bold text-slate-900">توزيع الشركاء من الربح</h3>
            <div className="app-table-wrap">
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr className="bg-slate-100 text-slate-800">
                    <th className="px-4 py-3 text-base font-bold">الشريك</th>
                    <th className="px-4 py-3 text-base font-bold">نوع الحصة</th>
                    <th className="px-4 py-3 text-base font-bold">قيمة الحصة</th>
                    <th className="px-4 py-3 text-base font-bold">المخصوم من الربح</th>
                  </tr>
                </thead>
                <tbody className="text-[1.02rem] font-semibold text-slate-800">
                  {(report.partnerDeductions || []).map((item, idx) => (
                    <tr key={item.partnerId} className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/70" : ""}`}>
                      <td className="px-4 py-3">{item.partnerName}</td>
                      <td className="px-4 py-3">{item.shareType === "PERCENT" ? "نسبة مئوية" : "مبلغ ثابت"}</td>
                      <td className="px-4 py-3">
                        {item.shareType === "PERCENT"
                          ? `${Number(item.shareValue || 0).toFixed(2)}%`
                          : formatNumber(item.shareValue)}
                      </td>
                      <td className="px-4 py-3 font-bold text-rose-700">{formatNumber(item.deductionAmount)}</td>
                    </tr>
                  ))}
                  {(!report.partnerDeductions || report.partnerDeductions.length === 0) && (
                    <tr>
                      <td className="px-4 py-4 text-slate-500" colSpan={4}>
                        لا يوجد شركاء مضافون لهذه المزرعة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="app-card border-violet-100/50 p-5">
            <h3 className="mb-3 text-xl font-bold text-slate-900">توزيع المشرفين من الربح</h3>
            <div className="app-table-wrap">
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr className="bg-slate-100 text-slate-800">
                    <th className="px-4 py-3 text-base font-bold">المشرف</th>
                    <th className="px-4 py-3 text-base font-bold">نوع الحصة</th>
                    <th className="px-4 py-3 text-base font-bold">قيمة الحصة</th>
                    <th className="px-4 py-3 text-base font-bold">المخصوم من الربح</th>
                  </tr>
                </thead>
                <tbody className="text-[1.02rem] font-semibold text-slate-800">
                  {(report.supervisorDeductions || []).map((item, idx) => (
                    <tr key={item.supervisorId} className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/70" : ""}`}>
                      <td className="px-4 py-3">{item.supervisorName}</td>
                      <td className="px-4 py-3">{item.shareType === "PERCENT" ? "نسبة مئوية" : "مبلغ ثابت"}</td>
                      <td className="px-4 py-3">
                        {item.shareType === "PERCENT"
                          ? `${Number(item.shareValue || 0).toFixed(2)}%`
                          : formatNumber(item.shareValue)}
                      </td>
                      <td className="px-4 py-3 font-bold text-rose-700">{formatNumber(item.deductionAmount)}</td>
                    </tr>
                  ))}
                  {(!report.supervisorDeductions || report.supervisorDeductions.length === 0) && (
                    <tr>
                      <td className="px-4 py-4 text-slate-500" colSpan={4}>
                        لا يوجد مشرفون مضافون لهذه المزرعة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="app-card border-sky-100/50 p-5">
            <h3 className="mb-3 text-xl font-bold text-slate-900">جدول ملخص التقرير</h3>
            <div className="app-table-wrap">
              <table className="w-full min-w-[760px] text-right">
                <thead>
                  <tr className="bg-slate-100 text-slate-800">
                    <th className="px-4 py-3 text-base font-bold">الفئة</th>
                    <th className="px-4 py-3 text-base font-bold">البند</th>
                    <th className="px-4 py-3 text-base font-bold">القيمة</th>
                    <th className="px-4 py-3 text-base font-bold">ملاحظة</th>
                  </tr>
                </thead>
                <tbody className="text-[1.02rem] font-semibold text-slate-800">
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">تشغيل</td>
                    <td className="px-4 py-3">إجمالي الكتاكيت</td>
                    <td className="px-4 py-3">{formatNumber(report.totalChicks, 0)}</td>
                    <td className="px-4 py-3 text-slate-600">إجمالي الداخل للدورة</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/70">
                    <td className="px-4 py-3">تشغيل</td>
                    <td className="px-4 py-3">النفوق</td>
                    <td className="px-4 py-3">{formatNumber(report.mortality, 0)}</td>
                    <td className="px-4 py-3 text-slate-600">نسبة: {(Number(report.mortalityRate || 0) * 100).toFixed(2)}%</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">تشغيل</td>
                    <td className="px-4 py-3">العدد النهائي</td>
                    <td className="px-4 py-3">{formatNumber(report.finalCount, 0)}</td>
                    <td className="px-4 py-3 text-slate-600">الحالي عند نهاية الدورة</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/70">
                    <td className="px-4 py-3">مالي</td>
                    <td className="px-4 py-3">إجمالي التكلفة</td>
                    <td className="px-4 py-3">{formatNumber(report.totalCost)}</td>
                    <td className="px-4 py-3 text-slate-600">تشمل كل بنود المصروفات</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">مالي</td>
                    <td className="px-4 py-3">الإيراد</td>
                    <td className="px-4 py-3">{formatNumber(report.revenue)}</td>
                    <td className="px-4 py-3 text-slate-600">من إجمالي المبيعات</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/70">
                    <td className="px-4 py-3">مالي</td>
                    <td className="px-4 py-3">صافي الربح</td>
                    <td className={`px-4 py-3 font-bold ${Number(report.netProfit || 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {formatNumber(report.netProfit)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {Number(report.netProfit || 0) >= 0 ? "ربح" : "خسارة"}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3">مالي</td>
                    <td className="px-4 py-3">إجمالي تكلفة شراء الكتاكيت</td>
                    <td className="px-4 py-3">{formatNumber(report.totalChickPurchaseCost)}</td>
                    <td className="px-4 py-3 text-slate-600">مجموع حقل التكلفة لكل شحنة</td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50/70">
                    <td className="px-4 py-3">مالي</td>
                    <td className="px-4 py-3">سعر الكتكوت (محسوب)</td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {report.chickPricePerUnit != null ? formatNumber(report.chickPricePerUnit) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      (شراء الكتاكيت + علف + غاز/سولار + مصاريف + علاج) ÷ إجمالي الكتاكيت
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {cycle && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="app-card p-5">
                  <h3 className="mb-3 text-xl font-bold text-slate-900">إحصائيات تشغيل</h3>
                  <div className="space-y-2 text-base font-semibold text-slate-800">
                    <p>عدد دفعات الكتاكيت: {(cycle.chickArrivals || []).length}</p>
                    <p>عدد سجلات النفوق: {(cycle.mortalities || []).length}</p>
                    <p>
                      إجمالي خسارة النفوق (حسب السعر وقت كل تسجيل):{' '}
                      {formatNumber(report.totalMortalityLossRecorded)}
                    </p>
                    <p>عدد سجلات العلف: {(cycle.feeds || []).length}</p>
                    <p>عدد سجلات الاستهلاك: {(cycle.dailyConsumptions || []).length}</p>
                    <p>عدد سجلات الأوزان: {(cycle.weightEntries || []).length}</p>
                    <p>عدد سجلات البيع: {(cycle.sales || []).length}</p>
                  </div>
                </div>

                <div className="app-card p-5">
                  <h3 className="mb-3 text-xl font-bold text-slate-900">إحصائيات تكلفة</h3>
                  <div className="space-y-2 text-base font-semibold text-slate-800">
                    <p>تكلفة شراء الكتاكيت (الشحنات): {formatNumber(report.totalChickPurchaseCost)}</p>
                    <p>تكلفة العلف: {formatNumber(report.feedCost)}</p>
                    <p>تكلفة الغاز + السولار (في سعر الكتكوت = الاستهلاك): {formatNumber(report.gasSolarCost)}</p>
                    <p>سعر الكتكوت (محسوب): {report.chickPricePerUnit != null ? formatNumber(report.chickPricePerUnit) : "—"}</p>
                    <p>تكلفة المصاريف: {formatNumber(report.expenses)}</p>
                    <p>تكلفة العلاج: {formatNumber(report.medications)}</p>
                    <p>تكلفة العمال: {formatNumber(report.workers)}</p>
                    <p>الإيراد: {formatNumber(report.revenue)}</p>
                  </div>
                </div>
              </div>

              <div className="app-card p-5">
                <h3 className="mb-3 text-xl font-bold text-slate-900">جدول توزيع المصروفات</h3>
                <div className="app-table-wrap">
                  <table className="w-full min-w-[760px] text-right">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800">
                        <th className="px-4 py-3 text-base font-bold">البند</th>
                        <th className="px-4 py-3 text-base font-bold">القيمة</th>
                        <th className="px-4 py-3 text-base font-bold">النسبة من إجمالي التكلفة</th>
                      </tr>
                    </thead>
                    <tbody className="text-[1.02rem] font-semibold text-slate-800">
                      {[
                        { label: "العلف", value: Number(report.feedCost || 0) },
                        { label: "الغاز + السولار", value: Number(report.gasSolarCost || 0) },
                        { label: "المصاريف", value: Number(report.expenses || 0) },
                        { label: "العلاج", value: Number(report.medications || 0) },
                        { label: "العمال", value: Number(report.workers || 0) },
                      ].map((row, idx) => {
                        const totalCost = Number(report.totalCost || 0)
                        const percentage = totalCost > 0 ? (row.value / totalCost) * 100 : 0
                        return (
                          <tr key={row.label} className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/70" : ""}`}>
                            <td className="px-4 py-3">{row.label}</td>
                            <td className="px-4 py-3">{formatNumber(row.value)}</td>
                            <td className="px-4 py-3">{percentage.toFixed(2)}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="app-card p-5">
                <h3 className="mb-3 text-xl font-bold text-slate-900">جدول تفصيلي للمبيعات</h3>
                <div className="app-table-wrap">
                  <table className="w-full min-w-[980px] text-right">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800">
                        <th className="px-4 py-3 text-base font-bold">التاريخ</th>
                        <th className="px-4 py-3 text-base font-bold">التاجر</th>
                        <th className="px-4 py-3 text-base font-bold">الصافي (كجم)</th>
                        <th className="px-4 py-3 text-base font-bold">سعر الكيلو</th>
                        <th className="px-4 py-3 text-base font-bold">إجمالي البيع</th>
                        <th className="px-4 py-3 text-base font-bold">المدفوع</th>
                        <th className="px-4 py-3 text-base font-bold">المتبقي</th>
                      </tr>
                    </thead>
                    <tbody className="text-[1.02rem] font-semibold text-slate-800">
                      {(cycle.sales || []).map((sale, idx) => (
                        <tr key={sale.id} className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/70" : ""}`}>
                          <td className="px-4 py-3">{formatDate(sale.date)}</td>
                          <td className="px-4 py-3">{sale.linkedTrader?.name || sale.trader || "—"}</td>
                          <td className="px-4 py-3">{formatNumber(sale.totalNetWeight)}</td>
                          <td className="px-4 py-3">{formatNumber(sale.pricePerKg)}</td>
                          <td className="px-4 py-3">{formatNumber(sale.totalAmount)}</td>
                          <td className="px-4 py-3">{formatNumber(sale.paidAmount)}</td>
                          <td className="px-4 py-3 font-bold text-rose-700">{formatNumber(sale.remainingAmount)}</td>
                        </tr>
                      ))}
                      {(!cycle.sales || cycle.sales.length === 0) && (
                        <tr>
                          <td className="px-4 py-4 text-slate-500" colSpan={7}>
                            لا توجد مبيعات مسجلة في هذه الدورة.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="app-card p-5">
                <h3 className="mb-3 text-xl font-bold text-slate-900">جدول تفصيلي للعلف (يوم بيوم)</h3>
                <div className="app-table-wrap">
                  <table className="w-full min-w-[1080px] text-right">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800">
                        <th className="px-4 py-3 text-base font-bold">التاريخ</th>
                        <th className="px-4 py-3 text-base font-bold">المورد</th>
                        <th className="px-4 py-3 text-base font-bold">النوع</th>
                        <th className="px-4 py-3 text-base font-bold">الكمية</th>
                        <th className="px-4 py-3 text-base font-bold">الوزن (كجم)</th>
                        <th className="px-4 py-3 text-base font-bold">سعر الطن</th>
                        <th className="px-4 py-3 text-base font-bold">التكلفة</th>
                      </tr>
                    </thead>
                    <tbody className="text-[1.02rem] font-semibold text-slate-800">
                      {(cycle.feeds || []).map((feed, idx) => {
                        const isTon = feed.feedType === "ton"
                        const kg = Number(feed.quantityKg || 0)
                        const quantityLabel = isTon
                          ? `${(kg / 1000).toFixed(3)} طن`
                          : `${(kg / 50).toFixed(2)} شيكارة`
                        return (
                          <tr key={feed.id} className={`border-t border-slate-100 ${idx % 2 ? "bg-slate-50/70" : ""}`}>
                            <td className="px-4 py-3">{formatDate(feed.date)}</td>
                            <td className="px-4 py-3">{feed.linkedSupplier?.name || feed.supplier || "—"}</td>
                            <td className="px-4 py-3">{isTon ? "طن" : "شكاير"}</td>
                            <td className="px-4 py-3">{quantityLabel}</td>
                            <td className="px-4 py-3">{formatNumber(kg)}</td>
                            <td className="px-4 py-3">{formatNumber(feed.unitPrice)}</td>
                            <td className="px-4 py-3 font-bold">{formatNumber(feed.totalCost)}</td>
                          </tr>
                        )
                      })}
                      {(!cycle.feeds || cycle.feeds.length === 0) && (
                        <tr>
                          <td className="px-4 py-4 text-slate-500" colSpan={7}>
                            لا توجد سجلات علف في هذه الدورة.
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
    </section>
  )
}

export default ReportsPage
