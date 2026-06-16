import { useEffect, useState } from 'react'
import PageHeader from './ui/PageHeader'
import EmptyState from './ui/EmptyState'
import LoadingState from './ui/LoadingState'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend as ChartLegend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip as ChartTooltip,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

const FARM_ADD_PASSWORD = '8521'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartTooltip,
  ChartLegend,
  Filler,
)

function Dashboard({
  farms,
  alerts,
  farmComparison,
  onAddFarm,
  onUpdateFarm,
  onDeleteFarm,
  onClearAlerts,
  onOpenFarm,
  onOpenPartners,
  onOpenSupervisors,
  loading,
}) {
  const [showAddFarm, setShowAddFarm] = useState(false)
  const [farmNameInput, setFarmNameInput] = useState('')
  const [farmPasswordInput, setFarmPasswordInput] = useState('')
  const [addFarmError, setAddFarmError] = useState('')
  const [editingFarmId, setEditingFarmId] = useState(null)
  const [editFarmNameInput, setEditFarmNameInput] = useState('')
  const [editFarmError, setEditFarmError] = useState('')

  useEffect(() => {
    if (editingFarmId && !farms.some((f) => f.id === editingFarmId)) {
      const timer = setTimeout(() => {
        setEditingFarmId(null)
        setEditFarmNameInput('')
        setEditFarmError('')
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [farms, editingFarmId])

  const mortalityChartData = farms
    .flatMap((farm) =>
      (farm.cycles || []).flatMap((cycle) =>
        (cycle.mortalities || []).map((item) => ({
          date: new Date(item.date).toISOString().slice(0, 10),
          count: Number(item.count || 0),
        })),
      ),
    )
    .reduce((acc, item) => {
      acc[item.date] = (acc[item.date] || 0) + item.count
      return acc
    }, {})

  const mortalitySeries = Object.entries(mortalityChartData)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12)

  const expensesSeries = farms
    .map((farm) => ({
      farmName: farm.name,
      expenses: (farm.cycles || []).reduce((sum, cycle) => sum + Number(cycle.totalExpenses || 0), 0),
    }))
    .sort((a, b) => b.expenses - a.expenses)
    .slice(0, 8)

  const profitSeries = (farmComparison || [])
    .map((item) => ({
      farmName: item.farmName,
      profit: Number(item.totalProfit || 0),
    }))
    .slice(0, 8)

  const mortalityLineData = {
    labels: mortalitySeries.map((item) => item.date),
    datasets: [
      {
        label: 'النفوق',
        data: mortalitySeries.map((item) => item.count),
        borderColor: '#e11d48',
        backgroundColor: 'rgba(225,29,72,0.12)',
        fill: true,
        tension: 0.3,
      },
    ],
  }

  const expensesBarData = {
    labels: expensesSeries.map((item) => item.farmName),
    datasets: [
      {
        label: 'المصاريف',
        data: expensesSeries.map((item) => item.expenses),
        backgroundColor: 'rgba(13,148,136,0.55)',
      },
    ],
  }

  const profitBarData = {
    labels: profitSeries.map((item) => item.farmName),
    datasets: [
      {
        label: 'الربح',
        data: profitSeries.map((item) => item.profit),
        backgroundColor: profitSeries.map((item) => (item.profit >= 0 ? '#0d9488' : '#e11d48')),
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    font: { family: "'Tajawal', sans-serif" },
    plugins: {
      legend: {
        display: true,
        labels: { usePointStyle: true, padding: 14, font: { size: 13, weight: '600' } },
      },
    },
    scales: {
      x: { grid: { color: 'rgba(148, 163, 184, 0.15)' }, ticks: { font: { size: 11 } } },
      y: { grid: { color: 'rgba(148, 163, 184, 0.15)' }, ticks: { font: { size: 11 } } },
    },
  }

  const toggleAddFarmPanel = () => {
    setShowAddFarm((open) => {
      const next = !open
      if (next) {
        setFarmNameInput('')
        setFarmPasswordInput('')
        setAddFarmError('')
      } else {
        setAddFarmError('')
      }
      return next
    })
  }

  const handleSubmitAddFarm = async (e) => {
    e.preventDefault()
    setAddFarmError('')
    const name = farmNameInput.trim()
    if (!name) {
      setAddFarmError('أدخل اسم المزرعة')
      return
    }
    if (farmPasswordInput !== FARM_ADD_PASSWORD) {
      setAddFarmError('كلمة المرور غير صحيحة')
      return
    }
    const result = await onAddFarm({ name, password: farmPasswordInput })
    if (result?.ok) {
      setShowAddFarm(false)
      setFarmNameInput('')
      setFarmPasswordInput('')
    } else if (result?.message) {
      setAddFarmError(result.message)
    }
  }

  return (
    <section className="app-page">
      <PageHeader
        eyebrow="لوحة التحكم"
        title="المزارع"
        description="متابعة الدورات، التنبيهات، والأداء المالي — استخدم الشريط العلوي للشركاء والمشرفين."
      >
        <button type="button" onClick={toggleAddFarmPanel} className="app-btn-primary w-full sm:w-auto">
          {showAddFarm ? 'إغلاق النموذج' : '+ إضافة مزرعة'}
        </button>
      </PageHeader>

      {showAddFarm && (
        <form
          onSubmit={handleSubmitAddFarm}
          className="app-card mb-8 border-teal-200/70 bg-gradient-to-br from-teal-50/40 via-white to-white p-5 md:p-6"
        >
          <h2 className="mb-4 text-xl font-bold text-slate-900">بيانات المزرعة الجديدة</h2>
          {addFarmError && (
            <div className="app-banner-error mb-4 max-w-none text-base">{addFarmError}</div>
          )}
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <label className="block text-lg font-semibold text-slate-800">
              اسم المزرعة
              <input
                type="text"
                value={farmNameInput}
                onChange={(e) => setFarmNameInput(e.target.value)}
                className="app-input mt-2"
                placeholder="مثال: مزرعة النور"
                autoComplete="off"
              />
            </label>
            <label className="block text-lg font-semibold text-slate-800">
              كلمة المرور للإضافة
              <input
                type="password"
                value={farmPasswordInput}
                onChange={(e) => setFarmPasswordInput(e.target.value)}
                className="app-input mt-2"
                placeholder="8521"
                autoComplete="new-password"
              />
            </label>
          </div>
          <button type="submit" className="app-btn-primary">
            تأكيد إضافة المزرعة
          </button>
        </form>
      )}

      {alerts.length > 0 && (
        <div className="mb-8 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-bold text-rose-800">التنبيهات</p>
            <button type="button" onClick={onClearAlerts} className="app-btn-danger py-2 text-sm">
              مسح التنبيهات
            </button>
          </div>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-2xl border border-rose-200/90 bg-rose-50/90 px-4 py-3 text-lg font-bold text-rose-900 shadow-sm"
            >
              ⚠️ {alert.farmName}: {alert.message}
            </div>
          ))}
        </div>
      )}

      {farmComparison.length > 0 && (
        <div className="app-card mb-8 p-5">
          <h2 className="mb-4 text-xl font-bold text-slate-900">مقارنة المزارع (الأفضل أولًا)</h2>
          <div className="app-table-wrap">
            <table className="min-w-full text-right">
              <thead>
                <tr>
                  <th>المزرعة</th>
                  <th>إجمالي الربح</th>
                  <th>نسبة النفوق</th>
                  <th>سعر الكتكوت (متوسط)</th>
                </tr>
              </thead>
              <tbody>
                {farmComparison.map((item) => (
                  <tr key={item.farmId}>
                    <td>{item.farmName}</td>
                    <td>{Number(item.totalProfit || 0).toFixed(2)}</td>
                    <td>{(Number(item.mortalityRate || 0) * 100).toFixed(2)}%</td>
                    <td>{item.chickPricePerUnit != null ? Number(item.chickPricePerUnit).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-1 lg:grid-cols-3">
        <div className="app-card border-rose-100/60 p-5 lg:col-span-1">
          <h2 className="mb-3 text-lg font-bold text-slate-900">النفوق عبر الزمن</h2>
          <div className="h-64">
            <Line data={mortalityLineData} options={chartOptions} />
          </div>
        </div>

        <div className="app-card border-teal-100/60 p-5 lg:col-span-1">
          <h2 className="mb-3 text-lg font-bold text-slate-900">المصاريف</h2>
          <div className="h-64">
            <Bar data={expensesBarData} options={chartOptions} />
          </div>
        </div>

        <div className="app-card border-emerald-100/60 p-5 lg:col-span-1">
          <h2 className="mb-3 text-lg font-bold text-slate-900">الربح</h2>
          <div className="h-64">
            <Bar data={profitBarData} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && <LoadingState className="col-span-full" title="جاري تحميل المزارع…" subtitle="جلب البيانات من الخادم" />}
        {!loading && farms.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon="🏡"
              title="لا توجد مزارع بعد"
              description="ابدأ بإضافة أول مزرعة لتتبع الدورات والتكاليف والمبيعات."
            >
              <button type="button" onClick={toggleAddFarmPanel} className="app-btn-primary">
                + إضافة مزرعة
              </button>
            </EmptyState>
          </div>
        )}
        {farms.map((farm) => (
          <div
            key={farm.id}
            className="app-card group min-h-36 overflow-hidden border-teal-200/45 bg-gradient-to-br from-white via-teal-50/[0.12] to-white text-right transition hover:border-teal-300/70 hover:shadow-xl"
          >
            {editingFarmId === farm.id ? (
              <div className="p-5">
                <p className="mb-3 text-lg font-bold text-slate-800">تعديل المزرعة</p>
                {editFarmError && (
                  <div className="mb-3 rounded-xl bg-rose-100 px-3 py-2 text-base font-semibold text-rose-800">
                    {editFarmError}
                  </div>
                )}
                <label className="mb-4 block text-base font-semibold text-slate-700">
                  اسم المزرعة
                  <input
                    type="text"
                    value={editFarmNameInput}
                    onChange={(e) => setEditFarmNameInput(e.target.value)}
                    className="app-input mt-2"
                    autoComplete="off"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      setEditFarmError('')
                      const name = editFarmNameInput.trim()
                      if (!name) {
                        setEditFarmError('أدخل اسم المزرعة')
                        return
                      }
                      const result = await onUpdateFarm(farm.id, { name })
                      if (result?.ok) {
                        setEditingFarmId(null)
                        setEditFarmNameInput('')
                      } else if (result?.message) {
                        setEditFarmError(result.message)
                      }
                    }}
                    className="app-btn-primary py-2 text-base"
                  >
                    حفظ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFarmId(null)
                      setEditFarmNameInput('')
                      setEditFarmError('')
                    }}
                    className="app-btn-outline"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 p-4 sm:gap-3 sm:p-5">
                <button
                  type="button"
                  onClick={() => onOpenFarm(farm)}
                  className="min-w-0 flex-1 rounded-2xl p-1 text-right outline-none transition hover:bg-teal-50/60 focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-2"
                >
                  <p className="mb-2 text-3xl drop-shadow-sm transition group-hover:scale-105">🐔</p>
                  <h2 className="mb-1 text-2xl font-extrabold tracking-tight text-slate-900">{farm.name}</h2>
                  <p className="text-sm font-semibold text-slate-600 sm:text-base">
                    {farm.activeCycle ? `دورة نشطة: ${farm.activeCycle.name}` : 'لا توجد دورة نشطة'}
                  </p>
                </button>
                <div className="flex shrink-0 flex-col justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFarmId(farm.id)
                      setEditFarmNameInput(farm.name)
                      setEditFarmError('')
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-white hover:shadow"
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `حذف مزرعة "${farm.name}" نهائيًا؟\nسيتم حذف كل الدورات والبيانات المرتبطة بها.`,
                        )
                      ) {
                        return
                      }
                      await onDeleteFarm(farm.id)
                    }}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 transition hover:bg-rose-100"
                  >
                    🗑 حذف
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default Dashboard
