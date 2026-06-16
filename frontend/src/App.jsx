import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import FarmPage, { isFarmSectionSlug } from './components/FarmPage'
import ReportsPage from './components/ReportsPage'
import PartnersPage from './components/PartnersPage'
import SupervisorsPage from './components/SupervisorsPage'
import AppChrome from './components/layout/AppChrome'
import LoadingState from './components/ui/LoadingState'
import { cacheData, enqueueRequest, getCachedData, syncQueuedRequests } from './offlineSync'

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const farmPathParts = useMemo(() => {
    const m = location.pathname.match(/^\/farm\/([^/]+)(?:\/([^/]+))?$/)
    if (!m) return { farmId: null, rawSection: null }
    return { farmId: m[1], rawSection: m[2] ?? null }
  }, [location.pathname])

  /** React Router لا يعيد التمرير للأعلى تلقائياً؛ بدون ذلك تبقى نافذة المتصفح أسفل الصفحة بعد فتح قسم مثل النفوق. */
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  const rawEnv = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
  const isLocalhostUrl =
    /^https?:\/\/localhost(?::\d+)?$/i.test(rawEnv) || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(rawEnv)
  // dev: Vite يوجّه /api → localhost (vite.config). prod: نفس الدومين + بروكسي Netlify، أو عيّن VITE_API_BASE_URL في Netlify
  const defaultProdApiBaseUrl = 'https://mazr3a-backend.fly.dev'
  const envApiBaseUrl = !import.meta.env.DEV && isLocalhostUrl ? '' : rawEnv
  const apiBaseUrl = envApiBaseUrl || (import.meta.env.DEV ? '' : defaultProdApiBaseUrl)
  const apiFetch = async (path, options = {}) => {
    const method = (options.method || 'GET').toUpperCase()
    if (!navigator.onLine && method !== 'GET') {
      await enqueueRequest(path, options)
      return new Response(JSON.stringify({ queuedOffline: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return fetch(`${apiBaseUrl}${path}`, options)
  }

  const [farms, setFarms] = useState([])
  const [selectedFarm, setSelectedFarm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [reportCycle, setReportCycle] = useState(null)
  const [showReports, setShowReports] = useState(false)
  const [showPartners, setShowPartners] = useState(false)
  const [showSupervisors, setShowSupervisors] = useState(false)
  const [farmComparison, setFarmComparison] = useState([])
  const [partners, setPartners] = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [installPromptEvent, setInstallPromptEvent] = useState(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [error, setError] = useState("")
  const [chicksCountInput, setChicksCountInput] = useState("")
  const [chicksDateInput, setChicksDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [chicksCostInput, setChicksCostInput] = useState("")
  const [mortalityCountInput, setMortalityCountInput] = useState("")
  const [mortalityDateInput, setMortalityDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [feedSupplierInput, setFeedSupplierInput] = useState("")
  const [feedTypeInput, setFeedTypeInput] = useState("bags")
  const [feedPricePerTonInput, setFeedPricePerTonInput] = useState("")
  const [feedQuantityInput, setFeedQuantityInput] = useState("")
  const [feedDateInput, setFeedDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [gasTypeInput, setGasTypeInput] = useState("كبير")
  const [gasCountInput, setGasCountInput] = useState("")
  const [gasCostInput, setGasCostInput] = useState("")
  const [gasDateInput, setGasDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [solarLitersInput, setSolarLitersInput] = useState("")
  const [solarCostInput, setSolarCostInput] = useState("")
  const [solarDateInput, setSolarDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [expenseItemNameInput, setExpenseItemNameInput] = useState("")
  const [expenseAmountInput, setExpenseAmountInput] = useState("")
  const [expenseDateInput, setExpenseDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [medicationNameInput, setMedicationNameInput] = useState("")
  const [medicationSupplierIdInput, setMedicationSupplierIdInput] = useState("")
  const [medicationSupplierInput, setMedicationSupplierInput] = useState("")
  const [medicationQuantityInput, setMedicationQuantityInput] = useState("")
  const [medicationPriceInput, setMedicationPriceInput] = useState("")
  const [medicationPriceModeInput, setMedicationPriceModeInput] = useState("unit")
  const [medicationDateInput, setMedicationDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [workerNameInput, setWorkerNameInput] = useState("")
  const [workerStartDateInput, setWorkerStartDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [workerMonthlySalaryInput, setWorkerMonthlySalaryInput] = useState("")
  const [workerExpenseWorkerIdInput, setWorkerExpenseWorkerIdInput] = useState("")
  const [workerExpenseAmountInput, setWorkerExpenseAmountInput] = useState("")
  const [workerExpenseDateInput, setWorkerExpenseDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [workerExpenseCategoryInput, setWorkerExpenseCategoryInput] = useState("صرف")
  const [workerFarmWorkerIdInput, setWorkerFarmWorkerIdInput] = useState("")
  const [saleTraderInput, setSaleTraderInput] = useState("")
  const [saleTraderIdInput, setSaleTraderIdInput] = useState("")
  const [saleBrokerInput, setSaleBrokerInput] = useState("")
  const [saleBrokerIdInput, setSaleBrokerIdInput] = useState("")
  const [salePhoneInput, setSalePhoneInput] = useState("")
  const [salePricePerKgInput, setSalePricePerKgInput] = useState("")
  const [salePaidInput, setSalePaidInput] = useState("")
  const [saleDateInput, setSaleDateInput] = useState(new Date().toISOString().slice(0, 10))
  /** مرحلة البيع: أوزان فارغة ثم بعد «تم» أوزان ممتلئة */
  const [saleSalePhase, setSaleSalePhase] = useState("empty")
  const [saleCagesWeights, setSaleCagesWeights] = useState([""])
  const [saleEmptyWeights, setSaleEmptyWeights] = useState([""])
  const [saleFullWeights, setSaleFullWeights] = useState([""])
  /** لكل سطر وزن ممتلئ: عدد الفرخ الفعلي لخصم المخزون (اختياري؛ إن وُجد يُستخدم بدل التقدير من متوسط الوزن) */
  const [saleLineBirdCounts, setSaleLineBirdCounts] = useState([""])
  const [dailyConsumptionDateInput, setDailyConsumptionDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [dailyFeedConsumedInput, setDailyFeedConsumedInput] = useState("")
  const [dailyFeedUnitInput, setDailyFeedUnitInput] = useState('kg')
  const [feedSupplierIdInput, setFeedSupplierIdInput] = useState('')
  const [supplierNameInput, setSupplierNameInput] = useState('')
  const [supplierPhoneInput, setSupplierPhoneInput] = useState('')
  const [brokerNameInput, setBrokerNameInput] = useState('')
  const [brokerPhoneInput, setBrokerPhoneInput] = useState('')
  const [traderNameInput, setTraderNameInput] = useState('')
  const [traderPhoneInput, setTraderPhoneInput] = useState('')
  const [purchasePaymentSourceInput, setPurchasePaymentSourceInput] = useState('TREASURY')
  const [purchaseCreditSupplierIdInput, setPurchaseCreditSupplierIdInput] = useState('')
  const [purchaseCreditSupplierNameInput, setPurchaseCreditSupplierNameInput] = useState('')
  const [treasuryTypeInput, setTreasuryTypeInput] = useState('DEPOSIT')
  const [treasuryAmountInput, setTreasuryAmountInput] = useState('')
  const [treasuryPersonNameInput, setTreasuryPersonNameInput] = useState('')
  const [treasuryNotesInput, setTreasuryNotesInput] = useState('')
  const [treasuryDateInput, setTreasuryDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [weightDateInput, setWeightDateInput] = useState(new Date().toISOString().slice(0, 10))
  const [weightGroupBirdCountInput, setWeightGroupBirdCountInput] = useState("")
  const [weightGroupTotalKgInput, setWeightGroupTotalKgInput] = useState("")
  const [medicationConsumeAllInput, setMedicationConsumeAllInput] = useState(false)

  const feedTotalWeightKg = useMemo(() => {
    const quantity = Number(feedQuantityInput || 0)
    if (!quantity) return 0
    return feedTypeInput === 'ton' ? quantity * 1000 : quantity * 50
  }, [feedQuantityInput, feedTypeInput])

  const feedTotalCost = useMemo(() => {
    const pricePerTon = Number(feedPricePerTonInput || 0)
    if (!pricePerTon) return 0
    return (feedTotalWeightKg / 1000) * pricePerTon
  }, [feedPricePerTonInput, feedTotalWeightKg])

  const saleTotalEmptyWeight = useMemo(
    () => saleEmptyWeights.reduce((sum, value) => sum + Number(value || 0), 0),
    [saleEmptyWeights],
  )
  const saleTotalCages = useMemo(
    () => saleCagesWeights.reduce((sum, value) => sum + Number(value || 0), 0),
    [saleCagesWeights],
  )
  const saleTotalFullWeight = useMemo(
    () => saleFullWeights.reduce((sum, value) => sum + Number(value || 0), 0),
    [saleFullWeights],
  )
  const saleManualBirdCountTotal = useMemo(
    () =>
      saleLineBirdCounts.reduce((sum, value) => {
        const count = Number(value)
        return !Number.isNaN(count) && count >= 1 ? sum + Math.floor(count) : sum
      }, 0),
    [saleLineBirdCounts],
  )

  const saleWizardRows = useMemo(() => {
    if (saleSalePhase !== "full") return []
    if (saleTotalFullWeight === 0 && saleTotalEmptyWeight === 0) return []
    return [
      {
        emptyWeight: saleTotalEmptyWeight,
        fullWeight: saleTotalFullWeight,
        cages: saleTotalCages,
        netWeight: Math.max(0, saleTotalFullWeight - saleTotalEmptyWeight),
        manualBirdCount: saleManualBirdCountTotal > 0 ? saleManualBirdCountTotal : null,
      },
    ]
  }, [saleSalePhase, saleTotalCages, saleTotalEmptyWeight, saleTotalFullWeight, saleManualBirdCountTotal])

  const saleEntriesComputed = saleWizardRows

  const saleTotalNetWeight = useMemo(
    () => saleWizardRows.reduce((sum, entry) => sum + entry.netWeight, 0),
    [saleWizardRows],
  )

  const saleTotalPrice = useMemo(() => {
    const pricePerKg = Number(salePricePerKgInput || 0)
    return saleTotalNetWeight * pricePerKg
  }, [saleTotalNetWeight, salePricePerKgInput])

  const saleRemaining = useMemo(() => saleTotalPrice - Number(salePaidInput || 0), [saleTotalPrice, salePaidInput])
  const dashboardAlerts = useMemo(
    () =>
      farms
        .flatMap((farm) => (farm.alerts || []).map((alert) => ({ ...alert, farmName: farm.name })))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 12),
    [farms],
  )

  useLayoutEffect(() => {
    const m = location.pathname.match(/^\/farm\/([^/]+)(?:\/([^/]+))?$/)
    if (!m) return
    const farmId = m[1]
    if (!farms.length) return
    const farm = farms.find((f) => f.id === farmId)
    if (!farm) {
      setSelectedFarm(null)
      navigate('/', { replace: true })
      return
    }
    setSelectedFarm(farm)
  }, [location.pathname, farms, navigate])

  useEffect(() => {
    const path = (location.pathname || '/').replace(/\/+$/, '') || '/'
    if (path === '/' || path === '') {
      setSelectedFarm((prev) => (prev ? null : prev))
    }
  }, [location.pathname])

  const farmViewSectionSlug = useMemo(() => {
    if (!selectedFarm || farmPathParts.farmId !== selectedFarm.id) return null
    if (farmPathParts.rawSection && isFarmSectionSlug(farmPathParts.rawSection)) return farmPathParts.rawSection
    return null
  }, [selectedFarm, farmPathParts.farmId, farmPathParts.rawSection])

  const tradingTabHint = useMemo(() => {
    const q = new URLSearchParams(location.search).get('tab')
    if (q === 'brokers' || q === 'traders') return q
    return null
  }, [location.search])

  const farmViewSectionUrlInvalid = useMemo(() => {
    if (!selectedFarm || farmPathParts.farmId !== selectedFarm.id) return false
    return Boolean(farmPathParts.rawSection) && !isFarmSectionSlug(farmPathParts.rawSection)
  }, [selectedFarm, farmPathParts.farmId, farmPathParts.rawSection])

  useEffect(() => {
    if (!selectedFarm || farmPathParts.farmId !== selectedFarm.id) return
    const raw = farmPathParts.rawSection
    if (raw === 'traders' || raw === 'brokers') {
      navigate(`/farm/${selectedFarm.id}/trading${raw === 'brokers' ? '?tab=brokers' : '?tab=traders'}`, {
        replace: true,
      })
    }
  }, [selectedFarm, farmPathParts.farmId, farmPathParts.rawSection, navigate])

  const farmFromPath = useMemo(() => {
    if (!farmPathParts.farmId || !farms.length) return null
    return farms.find((f) => f.id === farmPathParts.farmId) || null
  }, [farmPathParts.farmId, farms])

  const fetchFarms = async () => {
    try {
      setLoading(true)
      if (navigator.onLine) {
        setError("")
      }
      let data = []
      let comparisonData = []

      if (navigator.onLine) {
        const [farmsResponse, comparisonResponse] = await Promise.all([
          apiFetch('/api/farms'),
          apiFetch('/api/farms/comparison'),
        ])
        if (!farmsResponse.ok) {
          throw new Error('تعذر تحميل المزارع')
        }
        if (!comparisonResponse.ok) {
          throw new Error('تعذر تحميل مقارنة المزارع')
        }
        data = await farmsResponse.json()
        comparisonData = await comparisonResponse.json()
        await cacheData('farms', data)
        await cacheData('farmComparison', comparisonData)
      } else {
        data = (await getCachedData('farms')) || []
        comparisonData = (await getCachedData('farmComparison')) || []
      }
      setFarms(data)
      setFarmComparison(comparisonData)
      if (selectedFarm) {
        const updated = data.find((farm) => farm.id === selectedFarm.id)
        setSelectedFarm(updated || null)
      }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    } finally {
      setLoading(false)
    }
  }

  const applyUpdatedCycle = (updatedCycle) => {
    if (!updatedCycle?.id) return
    const { treasuryEntry, ...cycleSnapshot } = updatedCycle

    const mergeCycleIntoFarm = (farm) => {
      if (!farm?.activeCycle || farm.activeCycle.id !== cycleSnapshot.id) return farm
      const existingCycles = farm.cycles || []
      const hasCycle = existingCycles.some((cycle) => cycle.id === cycleSnapshot.id)
      const cycles = hasCycle
        ? existingCycles.map((cycle) => (cycle.id === cycleSnapshot.id ? cycleSnapshot : cycle))
        : [cycleSnapshot, ...existingCycles]

      return {
        ...farm,
        activeCycle: cycleSnapshot,
        cycles,
      }
    }

    setFarms((prev) => prev.map(mergeCycleIntoFarm))
    setSelectedFarm((prev) => (prev ? mergeCycleIntoFarm(prev) : prev))
    if (treasuryEntry) applyNewTreasuryEntry(treasuryEntry)
  }

  const applyNewTreasuryEntry = (entry) => {
    if (!entry?.id) return
    setFarms((prev) =>
      prev.map((farm) =>
        farm.id === entry.farmId
          ? {
              ...farm,
              treasuryEntries: (farm.treasuryEntries || []).some((row) => row.id === entry.id)
                ? farm.treasuryEntries
                : [entry, ...(farm.treasuryEntries || [])],
            }
          : farm,
      ),
    )
    setSelectedFarm((prev) =>
      prev?.id === entry.farmId && !(prev.treasuryEntries || []).some((row) => row.id === entry.id)
        ? { ...prev, treasuryEntries: [entry, ...(prev.treasuryEntries || [])] }
        : prev,
    )
  }

  const fetchPartners = async () => {
    try {
      const response = await apiFetch('/api/partners')
      const body = await response.json().catch(() => [])
      if (!response.ok) throw new Error(body.message || 'تعذر تحميل الشركاء')
      setPartners(Array.isArray(body) ? body : [])
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const fetchSupervisors = async () => {
    try {
      const response = await apiFetch('/api/supervisors')
      const body = await response.json().catch(() => [])
      if (!response.ok) throw new Error(body.message || 'تعذر تحميل المشرفين')
      setSupervisors(Array.isArray(body) ? body : [])
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFarms()
      fetchPartners()
      fetchSupervisors()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const onOnline = async () => {
      setIsOffline(false)
      await syncQueuedRequests(apiBaseUrl)
      await fetchFarms()
    }
    const onOffline = () => {
      setIsOffline(true)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [apiBaseUrl])

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPromptEvent(event)
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  const handleInstallApp = async () => {
    if (!installPromptEvent) return
    installPromptEvent.prompt()
    await installPromptEvent.userChoice
    setInstallPromptEvent(null)
    setCanInstall(false)
  }

  const handleUpdateFarm = async (farmId, { name }) => {
    try {
      setError('')
      const response = await apiFetch(`/api/farms/${farmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.status === 202 && body.queuedOffline) {
        return { ok: true }
      }
      if (!response.ok) {
        const msg = body.message || 'تعذر تحديث المزرعة'
        setError(msg)
        return { ok: false, message: msg }
      }
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      const msg = err.message || 'حدث خطأ'
      setError(msg)
      return { ok: false, message: msg }
    }
  }

  const handleDeleteFarm = async (farmId) => {
    try {
      setError('')
      const response = await apiFetch(`/api/farms/${farmId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (response.status === 202 && body.queuedOffline) {
        if (selectedFarm?.id === farmId) setSelectedFarm(null)
        return { ok: true }
      }
      if (!response.ok) {
        const msg = body.message || 'تعذر حذف المزرعة'
        setError(msg)
        return { ok: false, message: msg }
      }
      if (selectedFarm?.id === farmId) setSelectedFarm(null)
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      const msg = err.message || 'حدث خطأ'
      setError(msg)
      return { ok: false, message: msg }
    }
  }

  const handleAddFarm = async ({ name, password }) => {
    try {
      setError('')
      const response = await apiFetch('/api/farms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      })
      const body = await response.json().catch(() => ({}))
      if (response.status === 202 && body.queuedOffline) {
        return { ok: true }
      }
      if (!response.ok) {
        const msg = body.message || 'تعذر إنشاء مزرعة'
        setError(msg)
        return { ok: false, message: msg }
      }
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      const msg = err.message || 'حدث خطأ'
      setError(msg)
      return { ok: false, message: msg }
    }
  }

  const handleClearAlerts = async () => {
    try {
      const response = await apiFetch('/api/alerts', { method: 'DELETE' })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(body.message || 'تعذر مسح التنبيهات')
      }
      await fetchFarms()
      await fetchPartners()
      await fetchSupervisors()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleOpenFarm = (farm) => {
    setSelectedFarm(farm)
    setChicksCountInput("")
    setMortalityCountInput("")
    setFeedSupplierInput("")
    setFeedTypeInput("bags")
    setFeedPricePerTonInput("")
    setFeedQuantityInput("")
    setGasTypeInput("كبير")
    setGasCountInput("")
    setGasCostInput("")
    setSolarLitersInput("")
    setSolarCostInput("")
    setExpenseItemNameInput("")
    setExpenseAmountInput("")
    setMedicationNameInput("")
    setMedicationSupplierIdInput("")
    setMedicationSupplierInput("")
    setMedicationQuantityInput("")
    setMedicationPriceInput("")
    setMedicationPriceModeInput("unit")
    setWorkerNameInput("")
    setWorkerStartDateInput(new Date().toISOString().slice(0, 10))
    setWorkerMonthlySalaryInput("")
    setWorkerExpenseWorkerIdInput("")
    setWorkerExpenseAmountInput("")
    setSaleTraderInput("")
    setSaleTraderIdInput("")
    setSaleBrokerInput("")
    setSaleBrokerIdInput("")
    setSalePhoneInput("")
    setSalePricePerKgInput("")
    setSalePaidInput("")
    setSaleSalePhase("empty")
    setSaleCagesWeights([""])
    setSaleEmptyWeights([""])
    setSaleFullWeights([""])
    setSaleLineBirdCounts([""])
    setDailyConsumptionDateInput(new Date().toISOString().slice(0, 10))
    setDailyFeedConsumedInput("")
    setDailyFeedUnitInput('kg')
    setFeedSupplierIdInput('')
    setSupplierNameInput('')
    setSupplierPhoneInput('')
    setBrokerNameInput('')
    setBrokerPhoneInput('')
    setTraderNameInput('')
    setTraderPhoneInput('')
    setPurchasePaymentSourceInput('TREASURY')
    setPurchaseCreditSupplierIdInput('')
    setPurchaseCreditSupplierNameInput('')
    setWeightDateInput(new Date().toISOString().slice(0, 10))
    navigate(`/farm/${farm.id}`)
  }

  const resolvePurchaseCreditName = (fallbackName = '') => {
    const direct = purchaseCreditSupplierNameInput.trim()
    if (direct) return direct
    if (purchaseCreditSupplierIdInput) {
      const linked = (selectedFarm?.suppliers || []).find((s) => s.id === purchaseCreditSupplierIdInput)
      if (linked?.name) return linked.name
    }
    return fallbackName?.trim() || ''
  }
  const ensureCreditSupplierName = (fallbackName = '') => {
    if (purchasePaymentSourceInput !== 'CREDIT') return null
    const name = resolvePurchaseCreditName(fallbackName)
    if (!name) {
      setError('اختر المورد أو اكتب اسمه عند تسجيل الشراء الآجل')
      return null
    }
    return name
  }

  const handleToggleCycle = async (startDateInput) => {
    if (!selectedFarm) return

    try {
      if (selectedFarm.activeCycle) {
        const cycleId = selectedFarm.activeCycle.id
        const response = await apiFetch(
          `/api/farms/${selectedFarm.id}/cycles/${cycleId}/end`,
          { method: 'POST' },
        )
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(body.message || 'تعذر إنهاء الدورة')
        }
        await fetchFarms()
        await handleOpenReportsByCycle(cycleId, body)
        return
      } else {
        const startDate = startDateInput ? new Date(startDateInput) : new Date()
        const response = await apiFetch(`/api/farms/${selectedFarm.id}/cycles/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initialBirds: 0,
            startDate: startDate.toISOString(),
          }),
        })
        if (!response.ok) {
          const body = await response.json()
          throw new Error(body.message || 'تعذر بدء الدورة')
        }
      }

      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleOpenReports = async () => {
    if (!selectedFarm?.activeCycle) return
    return handleOpenReportsByCycle(selectedFarm.activeCycle.id)
  }

  const handleOpenReportsByCycle = async (cycleId, cycleSnapshot = null) => {
    if (!cycleId) return
    try {
      setReportLoading(true)
      const response = await apiFetch(`/api/cycles/${cycleId}/report`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر تحميل التقرير')
      setReportData(body)
      const localCycle =
        cycleSnapshot ||
        selectedFarm?.cycles?.find((cycle) => cycle.id === cycleId) ||
        null
      setReportCycle(localCycle)
      setShowReports(true)
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    } finally {
      setReportLoading(false)
    }
  }

  const handleAddChicks = async () => {
    if (!selectedFarm?.activeCycle) return
    try {
      const chicksCount = Number(chicksCountInput)
      const chickUnitCost = chicksCostInput === '' ? 0 : Number(chicksCostInput)
      const creditPersonName = ensureCreditSupplierName()
      if (purchasePaymentSourceInput === 'CREDIT' && !creditPersonName) return
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/chicks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: chicksCount,
          arrivalDate: chicksDateInput,
          totalCost: chicksCount * chickUnitCost,
          paymentSource: purchasePaymentSourceInput,
          creditPersonName: purchasePaymentSourceInput === 'CREDIT' ? creditPersonName : undefined,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة الكتاكيت')
      applyUpdatedCycle(body)
      setChicksCountInput("")
      setChicksCostInput("")
      setPurchaseCreditSupplierIdInput('')
      setPurchaseCreditSupplierNameInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddMortality = async () => {
    if (!selectedFarm?.activeCycle) return
    try {
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/mortality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: Number(mortalityCountInput),
          date: mortalityDateInput,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة النفوق')
      applyUpdatedCycle(body)
      setMortalityCountInput("")
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddFeed = async () => {
    if (!selectedFarm?.activeCycle) return
    try {
      const creditPersonName = ensureCreditSupplierName(feedSupplierInput)
      if (purchasePaymentSourceInput === 'CREDIT' && !creditPersonName) return
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: feedSupplierInput,
          supplierId: feedSupplierIdInput || undefined,
          type: feedTypeInput,
          pricePerTon: Number(feedPricePerTonInput),
          quantity: Number(feedQuantityInput),
          date: feedDateInput,
          paymentSource: purchasePaymentSourceInput,
          creditPersonName: purchasePaymentSourceInput === 'CREDIT' ? creditPersonName : undefined,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة العلف')
      applyUpdatedCycle(body)
      setFeedSupplierInput("")
      setFeedSupplierIdInput('')
      setFeedTypeInput("bags")
      setFeedPricePerTonInput("")
      setFeedQuantityInput("")
      setPurchaseCreditSupplierIdInput('')
      setPurchaseCreditSupplierNameInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddGas = async (overrides = {}) => {
    if (!selectedFarm?.activeCycle) return
    try {
      const creditPersonName = ensureCreditSupplierName()
      if (purchasePaymentSourceInput === 'CREDIT' && !creditPersonName) return
      const payload = {
        type: overrides.type ?? gasTypeInput,
        count: Number(overrides.count ?? gasCountInput),
        cost: Number(overrides.cost ?? gasCostInput),
        date: overrides.date ?? gasDateInput,
        paymentSource: purchasePaymentSourceInput,
        creditPersonName: purchasePaymentSourceInput === 'CREDIT' ? creditPersonName : undefined,
      }
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/gas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة الغاز')
      applyUpdatedCycle(body)
      setGasTypeInput("كبير")
      setGasCountInput("")
      setGasCostInput("")
      setPurchaseCreditSupplierIdInput('')
      setPurchaseCreditSupplierNameInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddSolar = async (overrides = {}) => {
    if (!selectedFarm?.activeCycle) return
    try {
      const creditPersonName = ensureCreditSupplierName()
      if (purchasePaymentSourceInput === 'CREDIT' && !creditPersonName) return
      const payload = {
        liters: Number(overrides.liters ?? solarLitersInput),
        cost: Number(overrides.cost ?? solarCostInput),
        date: overrides.date ?? solarDateInput,
        paymentSource: purchasePaymentSourceInput,
        creditPersonName: purchasePaymentSourceInput === 'CREDIT' ? creditPersonName : undefined,
      }
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/solar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة السولار')
      applyUpdatedCycle(body)
      setSolarLitersInput("")
      setSolarCostInput("")
      setPurchaseCreditSupplierIdInput('')
      setPurchaseCreditSupplierNameInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddExpense = async () => {
    if (!selectedFarm?.activeCycle) return
    try {
      const creditPersonName = ensureCreditSupplierName()
      if (purchasePaymentSourceInput === 'CREDIT' && !creditPersonName) return
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: expenseItemNameInput,
          amount: Number(expenseAmountInput),
          date: expenseDateInput,
          paymentSource: purchasePaymentSourceInput,
          creditPersonName: purchasePaymentSourceInput === 'CREDIT' ? creditPersonName : undefined,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة المصروف')
      applyUpdatedCycle(body)
      setExpenseItemNameInput("")
      setExpenseAmountInput("")
      setPurchaseCreditSupplierIdInput('')
      setPurchaseCreditSupplierNameInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddMedication = async () => {
    if (!selectedFarm?.activeCycle) return
    try {
      const linkedMedSupplier = medicationSupplierIdInput
        ? (selectedFarm?.suppliers || []).find((s) => s.id === medicationSupplierIdInput)
        : null
      const supplierNameForMedication =
        (linkedMedSupplier?.name || '').trim() || medicationSupplierInput.trim() || ''
      const creditPersonName = ensureCreditSupplierName(supplierNameForMedication)
      if (purchasePaymentSourceInput === 'CREDIT' && !creditPersonName) return
      const effectiveSupplierName = supplierNameForMedication || creditPersonName || ''
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/medications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: medicationNameInput,
          supplier: effectiveSupplierName || null,
          quantity: Number(medicationQuantityInput),
          price: Number(medicationPriceInput),
          priceMode: medicationPriceModeInput,
          date: medicationDateInput,
          consumeImmediately: medicationConsumeAllInput,
          paymentSource: purchasePaymentSourceInput,
          creditPersonName: purchasePaymentSourceInput === 'CREDIT' ? creditPersonName : undefined,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة العلاج')
      applyUpdatedCycle(body)
      setMedicationNameInput("")
      setMedicationSupplierIdInput("")
      setMedicationSupplierInput("")
      setMedicationQuantityInput("")
      setMedicationPriceInput("")
      setMedicationPriceModeInput("unit")
      setMedicationConsumeAllInput(false)
      setPurchaseCreditSupplierIdInput('')
      setPurchaseCreditSupplierNameInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleTrackMedicationUsage = async (medicationId, usageInput = 1) => {
    if (!selectedFarm?.activeCycle) return
    try {
      const usagePayload =
        usageInput && typeof usageInput === 'object'
          ? {
              usedQuantity: Number(usageInput.usedQuantity || 1),
              ...(usageInput.date ? { date: usageInput.date } : {}),
            }
          : { usedQuantity: Number(usageInput || 1) }
      const response = await apiFetch(`/api/medications/${medicationId}/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usagePayload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر تسجيل الاستخدام')
      applyUpdatedCycle(body)
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddWorker = async () => {
    if (!selectedFarm?.activeCycle) return
    try {
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/workers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          workerFarmWorkerIdInput
            ? {
                farmWorkerId: workerFarmWorkerIdInput,
                startDate: workerStartDateInput,
                monthlySalary: Number(workerMonthlySalaryInput),
              }
            : {
                name: workerNameInput,
                startDate: workerStartDateInput,
                monthlySalary: Number(workerMonthlySalaryInput),
              },
        ),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة العامل')
      applyUpdatedCycle(body)
      setWorkerNameInput("")
      setWorkerFarmWorkerIdInput("")
      setWorkerMonthlySalaryInput("")
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddWorkerExpense = async () => {
    if (!selectedFarm?.activeCycle || !workerExpenseWorkerIdInput) return
    try {
      const response = await apiFetch(`/api/workers/${workerExpenseWorkerIdInput}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(workerExpenseAmountInput),
          date: workerExpenseDateInput,
          category: workerExpenseCategoryInput,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة خصم العامل')
      applyUpdatedCycle(body)
      setWorkerExpenseAmountInput("")
      setWorkerExpenseCategoryInput("صرف")
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const updateSaleEmptyLine = (index, value) => {
    setSaleEmptyWeights((prev) => prev.map((v, i) => (i === index ? value : v)))
  }
  const updateSaleCagesLine = (index, value) => {
    setSaleCagesWeights((prev) => prev.map((v, i) => (i === index ? value : v)))
  }
  const addSaleEmptyLine = () => {
    setSaleCagesWeights((prev) => [...prev, ""])
    setSaleEmptyWeights((prev) => [...prev, ""])
  }
  const removeSaleEmptyLine = (index) => {
    setSaleEmptyWeights((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
    setSaleCagesWeights((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }
  const updateSaleFullLine = (index, value) => {
    setSaleFullWeights((prev) => prev.map((v, i) => (i === index ? value : v)))
  }
  const addSaleFullLine = () => {
    setSaleFullWeights((prev) => [...prev, ""])
    setSaleLineBirdCounts((prev) => [...prev, ""])
  }
  const removeSaleFullLine = (index) => {
    setSaleFullWeights((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
    setSaleLineBirdCounts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }
  const confirmSaleEmptyPhase = () => {
    const hasEmpty = saleEmptyWeights.some((v) => Number(v) > 0)
    if (!hasEmpty) {
      setError("أدخل وزنًا فارغًا (قفص/كيزة) على الأقل قبل «تم»")
      return
    }
    setSaleFullWeights([""])
    setSaleLineBirdCounts([""])
    setSaleSalePhase("full")
    setError("")
  }
  const resetSaleWizard = () => {
    setSaleSalePhase("empty")
    setSaleCagesWeights([""])
    setSaleEmptyWeights([""])
    setSaleFullWeights([""])
    setSaleLineBirdCounts([""])
  }

  const updateSaleLineBirdCount = (index, value) => {
    setSaleLineBirdCounts((prev) => prev.map((v, i) => (i === index ? value : v)))
  }

  const handleAddSale = async () => {
    if (!selectedFarm?.activeCycle) return
    if (saleSalePhase !== "full") {
      setError("أكمل مرحلة الأوزان الفارغة ثم «تم» ثم أدخل الأوزان الممتلئة قبل حفظ البيع")
      return
    }
    const rows = saleWizardRows.filter((r) => r.fullWeight > 0 || r.emptyWeight > 0)
    if (rows.length === 0) {
      setError("لا توجد أوزان صالحة للحفظ")
      return
    }
    const bad = rows.find((r) => r.fullWeight < r.emptyWeight)
    if (bad) {
      setError("يجب أن يكون إجمالي الوزن الممتلئ أكبر من أو يساوي إجمالي الوزن الفارغ")
      return
    }
    if (!saleTraderIdInput && !String(saleTraderInput || '').trim()) {
      setError('أدخل اسم التاجر أو اختره من القائمة قبل حفظ البيع')
      return
    }
    try {
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trader: saleTraderInput,
          traderId: saleTraderIdInput || undefined,
          broker: saleBrokerInput,
          brokerId: saleBrokerIdInput || undefined,
          phone: salePhoneInput,
          pricePerKg: Number(salePricePerKgInput),
          paidAmount: Number(salePaidInput || 0),
          date: saleDateInput,
          entries: rows.map((entry) => ({
            emptyWeight: entry.emptyWeight,
            fullWeight: entry.fullWeight,
            cages: Number(entry.cages || 0),
            ...(entry.manualBirdCount != null ? { birdCount: entry.manualBirdCount } : {}),
          })),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة البيع')
      applyUpdatedCycle(body)
      setSaleTraderInput("")
      setSaleTraderIdInput("")
      setSaleBrokerInput("")
      setSaleBrokerIdInput("")
      setSalePhoneInput("")
      setSalePricePerKgInput("")
      setSalePaidInput("")
      resetSaleWizard()
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleDownloadSaleInvoice = async (saleId) => {
    try {
      const response = await apiFetch(`/api/sales/${saleId}/invoice.pdf`)
      if (!response.ok) {
        let message = 'تعذر تحميل الفاتورة'
        try {
          const body = await response.json()
          message = body.message || message
        } catch {
          // Ignore JSON parsing for non-JSON errors.
        }
        throw new Error(message)
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `invoice-${saleId}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleExportLedger = async ({ kind, entityId, entityName, format }) => {
    if (!selectedFarm) return
    try {
      const fmt = format === 'xlsx' ? 'xlsx' : 'pdf'
      let path = ''
      if (kind === 'supplier') {
        path = `/api/farms/${selectedFarm.id}/ledgers/suppliers/${entityId}/export?format=${fmt}`
      } else if (kind === 'trader') {
        path = `/api/farms/${selectedFarm.id}/ledgers/traders/${entityId}/export?format=${fmt}`
      } else if (kind === 'broker') {
        path = entityId
          ? `/api/farms/${selectedFarm.id}/ledgers/brokers/${entityId}/export?format=${fmt}`
          : `/api/farms/${selectedFarm.id}/ledgers/brokers/export?format=${fmt}&name=${encodeURIComponent(entityName || '')}`
      } else {
        throw new Error('نوع كشف الحساب غير معروف')
      }
      const response = await apiFetch(path)
      if (!response.ok) {
        let message = 'تعذر تصدير كشف الحساب'
        try {
          const body = await response.json()
          message = body.message || message
        } catch {
          // ignore
        }
        throw new Error(message)
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const ext = fmt === 'xlsx' ? 'xlsx' : 'pdf'
      const safeName = String(entityName || entityId || kind).replace(/[<>:"/\\|?*]+/g, '_')
      link.download = `kashf-${kind}-${safeName}.${ext}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddDailyConsumption = async () => {
    if (!selectedFarm?.activeCycle) return
    try {
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/daily-consumption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dailyConsumptionDateInput,
          feedConsumed: Number(dailyFeedConsumedInput),
          feedUnit: dailyFeedUnitInput,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة الاستهلاك اليومي')
      applyUpdatedCycle(body)
      setDailyFeedConsumedInput("")
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddSupplier = async () => {
    if (!selectedFarm) return
    try {
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: supplierNameInput,
          phone: supplierPhoneInput?.trim() || null,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة المورد')
      setFarms((prev) =>
        prev.map((farm) =>
          farm.id === body.farmId ? { ...farm, suppliers: [body, ...(farm.suppliers || [])] } : farm,
        ),
      )
      setSelectedFarm((prev) =>
        prev?.id === body.farmId ? { ...prev, suppliers: [body, ...(prev.suppliers || [])] } : prev,
      )
      setSupplierNameInput('')
      setSupplierPhoneInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddTreasuryEntry = async () => {
    if (!selectedFarm) return
    try {
      const payload = {
        type: treasuryTypeInput,
        amount: Number(treasuryAmountInput),
        date: treasuryDateInput,
        notes: treasuryNotesInput?.trim() || null,
      }
      if (treasuryTypeInput === 'CREDIT_ADD' || treasuryTypeInput === 'CREDIT_DEDUCT') {
        payload.personName = treasuryPersonNameInput?.trim() || ''
      }
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/treasury-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حفظ حركة الخزنة')
      applyNewTreasuryEntry(body)
      setTreasuryTypeInput('DEPOSIT')
      setTreasuryAmountInput('')
      setTreasuryPersonNameInput('')
      setTreasuryNotesInput('')
      setTreasuryDateInput(new Date().toISOString().slice(0, 10))
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddWeight = async (averageWeightValue, dateValue, extras = {}) => {
    if (!selectedFarm?.activeCycle) return
    try {
      const resolvedAverageWeight = Number(averageWeightValue)
      const resolvedDate = dateValue || weightDateInput
      const gc = extras.groupBirdCount != null ? Number(extras.groupBirdCount) : Number(weightGroupBirdCountInput || 0)
      const gt =
        extras.groupTotalWeightKg != null
          ? Number(extras.groupTotalWeightKg)
          : Number(weightGroupTotalKgInput || 0)
      const payload = {
        date: resolvedDate,
        averageWeight: resolvedAverageWeight,
      }
      if (gc > 0 && gt > 0) {
        payload.groupBirdCount = gc
        payload.groupTotalWeightKg = gt
      }
      const response = await apiFetch(`/api/cycles/${selectedFarm.activeCycle.id}/weights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة الوزن')
      applyUpdatedCycle(body)
      setWeightGroupBirdCountInput("")
      setWeightGroupTotalKgInput("")
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleUpdateChickArrival = async (arrivalId, payload) => {
    try {
      const response = await apiFetch(`/api/chick-arrivals/${arrivalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث شحنة الكتاكيت')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteChickArrival = async (arrivalId) => {
    try {
      const response = await apiFetch(`/api/chick-arrivals/${arrivalId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف شحنة الكتاكيت')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateMortality = async (mortalityId, payload) => {
    try {
      const response = await apiFetch(`/api/mortalities/${mortalityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث سجل النفوق')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteMortality = async (mortalityId) => {
    try {
      const response = await apiFetch(`/api/mortalities/${mortalityId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف سجل النفوق')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateFeed = async (feedId, payload) => {
    try {
      const response = await apiFetch(`/api/feeds/${feedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث العلف')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteFeed = async (feedId) => {
    try {
      const response = await apiFetch(`/api/feeds/${feedId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف العلف')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateGas = async (gasId, payload) => {
    try {
      const response = await apiFetch(`/api/gases/${gasId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث الغاز')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteGas = async (gasId) => {
    try {
      const response = await apiFetch(`/api/gases/${gasId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف الغاز')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateSolar = async (solarId, payload) => {
    try {
      const response = await apiFetch(`/api/solars/${solarId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث السولار')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteSolar = async (solarId) => {
    try {
      const response = await apiFetch(`/api/solars/${solarId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف السولار')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateExpense = async (expenseId, payload) => {
    try {
      const response = await apiFetch(`/api/expenses/${expenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث المصروف')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteExpense = async (expenseId) => {
    try {
      const response = await apiFetch(`/api/expenses/${expenseId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف المصروف')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateMedication = async (medicationId, payload) => {
    try {
      const response = await apiFetch(`/api/medications/${medicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث العلاج')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteMedication = async (medicationId) => {
    try {
      const response = await apiFetch(`/api/medications/${medicationId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف العلاج')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateWorker = async (workerId, payload) => {
    try {
      const response = await apiFetch(`/api/workers/${workerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث العامل')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteWorker = async (workerId) => {
    try {
      const response = await apiFetch(`/api/workers/${workerId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف العامل')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateWorkerExpense = async (workerExpenseId, payload) => {
    try {
      const response = await apiFetch(`/api/worker-expenses/${workerExpenseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث خصم العامل')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteWorkerExpense = async (workerExpenseId) => {
    try {
      const response = await apiFetch(`/api/worker-expenses/${workerExpenseId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف خصم العامل')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateSale = async (saleId, payload) => {
    try {
      const response = await apiFetch(`/api/sales/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث البيع')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteSale = async (saleId) => {
    try {
      const response = await apiFetch(`/api/sales/${saleId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف البيع')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateDailyConsumption = async (consumptionId, payload) => {
    try {
      const response = await apiFetch(`/api/daily-consumptions/${consumptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث الاستهلاك اليومي')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteDailyConsumption = async (consumptionId) => {
    try {
      const response = await apiFetch(`/api/daily-consumptions/${consumptionId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف الاستهلاك اليومي')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateWeightEntry = async (weightEntryId, payload) => {
    try {
      const response = await apiFetch(`/api/weight-entries/${weightEntryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث الوزن')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteWeightEntry = async (weightEntryId) => {
    try {
      const response = await apiFetch(`/api/weight-entries/${weightEntryId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف الوزن')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateSupplier = async (supplierId, payload) => {
    if (!selectedFarm) return { ok: false, message: 'المزرعة غير محددة' }
    try {
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/suppliers/${supplierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث المورد')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteSupplier = async (supplierId) => {
    if (!selectedFarm) return { ok: false, message: 'المزرعة غير محددة' }
    try {
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/suppliers/${supplierId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف المورد')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleUpdateTrader = async (traderId, payload) => {
    if (!selectedFarm) return { ok: false, message: 'المزرعة غير محددة' }
    try {
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/traders/${traderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث التاجر')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteTrader = async (traderId) => {
    if (!selectedFarm) return { ok: false, message: 'المزرعة غير محددة' }
    try {
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/traders/${traderId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف التاجر')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleAddTrader = async () => {
    if (!selectedFarm) return
    try {
      setError('')
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/traders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: traderNameInput.trim(),
          phone: traderPhoneInput?.trim() || null,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة التاجر')
      setFarms((prev) =>
        prev.map((farm) =>
          farm.id === body.farmId ? { ...farm, traders: [body, ...(farm.traders || [])] } : farm,
        ),
      )
      setSelectedFarm((prev) =>
        prev?.id === body.farmId ? { ...prev, traders: [body, ...(prev.traders || [])] } : prev,
      )
      setTraderNameInput('')
      setTraderPhoneInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleAddBroker = async () => {
    if (!selectedFarm) return
    try {
      setError('')
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/brokers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: brokerNameInput.trim(),
          phone: brokerPhoneInput?.trim() || null,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر إضافة السمسار')
      setFarms((prev) =>
        prev.map((farm) =>
          farm.id === body.farmId ? { ...farm, brokers: [body, ...(farm.brokers || [])] } : farm,
        ),
      )
      setSelectedFarm((prev) =>
        prev?.id === body.farmId ? { ...prev, brokers: [body, ...(prev.brokers || [])] } : prev,
      )
      setBrokerNameInput('')
      setBrokerPhoneInput('')
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleUpdateBroker = async (brokerId, payload) => {
    if (!selectedFarm) return { ok: false, message: 'المزرعة غير محددة' }
    try {
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/brokers/${brokerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر تحديث السمسار')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleDeleteBroker = async (brokerId) => {
    if (!selectedFarm) return { ok: false, message: 'المزرعة غير محددة' }
    try {
      const response = await apiFetch(`/api/farms/${selectedFarm.id}/brokers/${brokerId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف السمسار')
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      setError(err.message || 'حدث خطأ')
      return { ok: false, message: err.message }
    }
  }

  const handleAddPartner = async ({ farmId, name, shareType, shareValue }) => {
    try {
      const response = await apiFetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmId, name, shareType, shareValue }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        return { ok: false, message: body.message || 'تعذر إضافة الشريك' }
      }
      await fetchPartners()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.message || 'حدث خطأ' }
    }
  }

  const handleDeletePartner = async (partnerId) => {
    try {
      const response = await apiFetch(`/api/partners/${partnerId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف الشريك')
      await fetchPartners()
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleUpdatePartner = async (partnerId, payload) => {
    try {
      const response = await apiFetch(`/api/partners/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, message: body.message || 'تعذر تحديث الشريك' }
      await fetchPartners()
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.message || 'حدث خطأ' }
    }
  }

  const handleAddSupervisor = async ({ farmId, name, shareType, shareValue }) => {
    try {
      const response = await apiFetch('/api/supervisors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmId, name, shareType, shareValue }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        return { ok: false, message: body.message || 'تعذر إضافة المشرف' }
      }
      await fetchSupervisors()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.message || 'حدث خطأ' }
    }
  }

  const handleDeleteSupervisor = async (supervisorId) => {
    try {
      const response = await apiFetch(`/api/supervisors/${supervisorId}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.message || 'تعذر حذف المشرف')
      await fetchSupervisors()
      await fetchFarms()
    } catch (err) {
      setError(err.message || 'حدث خطأ')
    }
  }

  const handleUpdateSupervisor = async (supervisorId, payload) => {
    try {
      const response = await apiFetch(`/api/supervisors/${supervisorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, message: body.message || 'تعذر تحديث المشرف' }
      await fetchSupervisors()
      await fetchFarms()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.message || 'حدث خطأ' }
    }
  }

  if (selectedFarm) {
    if (showReports) {
      return (
        <>
          <AppChrome
            variant="farm-reports"
            isOffline={isOffline}
            error={error}
            onDismissError={() => setError('')}
            farmId={selectedFarm.id}
            farmName={selectedFarm.name}
            onNavigateHome={() => {
              navigate('/')
              setSelectedFarm(null)
              setShowReports(false)
            }}
            onNavigateFarmRoot={() => {
              setShowReports(false)
              navigate(`/farm/${selectedFarm.id}`)
            }}
            onOpenPartners={() => setShowPartners(true)}
            onOpenSupervisors={() => setShowSupervisors(true)}
            onBackFromReports={() => setShowReports(false)}
          >
            <ReportsPage
              farmName={selectedFarm.name}
              report={reportData}
              cycle={reportCycle}
              loading={reportLoading}
              onBack={() => setShowReports(false)}
            />
          </AppChrome>
          {canInstall && (
            <button type="button" onClick={handleInstallApp} className="app-fab-install">
              تثبيت التطبيق
            </button>
          )}
        </>
      )
    }

    return (
      <>
        <AppChrome
          variant="farm"
          isOffline={isOffline}
          error={error}
          onDismissError={() => setError('')}
          farmId={selectedFarm.id}
          farmName={selectedFarm.name}
          onNavigateHome={() => {
            navigate('/')
            setSelectedFarm(null)
          }}
          onNavigateFarmRoot={() => navigate(`/farm/${selectedFarm.id}`)}
          onOpenPartners={() => setShowPartners(true)}
          onOpenSupervisors={() => setShowSupervisors(true)}
        >
          {farmViewSectionUrlInvalid ? <Navigate to={`/farm/${selectedFarm.id}`} replace /> : null}
          <FarmPage
          farmId={selectedFarm.id}
          farmName={selectedFarm.name}
          treasuryEntries={selectedFarm.treasuryEntries || []}
          suppliers={selectedFarm.suppliers || []}
          farmWorkers={selectedFarm.farmWorkers || []}
          cycles={selectedFarm.cycles || []}
          activeCycle={selectedFarm.activeCycle}
          traders={selectedFarm.traders || []}
          brokers={selectedFarm.brokers || []}
          chicksCountInput={chicksCountInput}
          chicksCostInput={chicksCostInput}
          chicksDateInput={chicksDateInput}
          mortalityCountInput={mortalityCountInput}
          mortalityDateInput={mortalityDateInput}
          feedSupplierInput={feedSupplierInput}
          feedTypeInput={feedTypeInput}
          feedPricePerTonInput={feedPricePerTonInput}
          feedQuantityInput={feedQuantityInput}
          feedDateInput={feedDateInput}
          feedTotalWeightKg={feedTotalWeightKg}
          feedTotalCost={feedTotalCost}
          gasTypeInput={gasTypeInput}
          gasCountInput={gasCountInput}
          gasCostInput={gasCostInput}
          gasDateInput={gasDateInput}
          solarLitersInput={solarLitersInput}
          solarCostInput={solarCostInput}
          solarDateInput={solarDateInput}
          expenseItemNameInput={expenseItemNameInput}
          expenseAmountInput={expenseAmountInput}
          expenseDateInput={expenseDateInput}
          medicationNameInput={medicationNameInput}
          medicationSupplierIdInput={medicationSupplierIdInput}
          medicationSupplierInput={medicationSupplierInput}
          medicationQuantityInput={medicationQuantityInput}
          medicationPriceInput={medicationPriceInput}
          medicationPriceModeInput={medicationPriceModeInput}
          medicationDateInput={medicationDateInput}
          medicationConsumeAllInput={medicationConsumeAllInput}
          workerNameInput={workerNameInput}
          workerFarmWorkerIdInput={workerFarmWorkerIdInput}
          workerStartDateInput={workerStartDateInput}
          workerMonthlySalaryInput={workerMonthlySalaryInput}
          workerExpenseWorkerIdInput={workerExpenseWorkerIdInput}
          workerExpenseAmountInput={workerExpenseAmountInput}
          workerExpenseDateInput={workerExpenseDateInput}
          workerExpenseCategoryInput={workerExpenseCategoryInput}
          saleTraderInput={saleTraderInput}
          saleTraderIdInput={saleTraderIdInput}
          saleBrokerInput={saleBrokerInput}
          saleBrokerIdInput={saleBrokerIdInput}
          salePhoneInput={salePhoneInput}
          salePricePerKgInput={salePricePerKgInput}
          salePaidInput={salePaidInput}
          saleDateInput={saleDateInput}
          saleSalePhase={saleSalePhase}
          saleCagesWeights={saleCagesWeights}
          saleEmptyWeights={saleEmptyWeights}
          saleFullWeights={saleFullWeights}
          saleLineBirdCounts={saleLineBirdCounts}
          saleEntriesComputed={saleEntriesComputed}
          saleTotalEmptyWeight={saleTotalEmptyWeight}
          saleTotalCages={saleTotalCages}
          saleTotalFullWeight={saleTotalFullWeight}
          saleTotalNetWeight={saleTotalNetWeight}
          saleTotalPrice={saleTotalPrice}
          saleRemaining={saleRemaining}
          dailyConsumptionDateInput={dailyConsumptionDateInput}
          dailyFeedConsumedInput={dailyFeedConsumedInput}
          dailyFeedUnitInput={dailyFeedUnitInput}
          feedSupplierIdInput={feedSupplierIdInput}
          supplierNameInput={supplierNameInput}
          supplierPhoneInput={supplierPhoneInput}
          brokerNameInput={brokerNameInput}
          brokerPhoneInput={brokerPhoneInput}
          traderNameInput={traderNameInput}
          traderPhoneInput={traderPhoneInput}
          purchasePaymentSourceInput={purchasePaymentSourceInput}
          purchaseCreditSupplierIdInput={purchaseCreditSupplierIdInput}
          purchaseCreditSupplierNameInput={purchaseCreditSupplierNameInput}
          treasuryTypeInput={treasuryTypeInput}
          treasuryAmountInput={treasuryAmountInput}
          treasuryPersonNameInput={treasuryPersonNameInput}
          treasuryNotesInput={treasuryNotesInput}
          treasuryDateInput={treasuryDateInput}
          weightDateInput={weightDateInput}
          weightGroupBirdCountInput={weightGroupBirdCountInput}
          weightGroupTotalKgInput={weightGroupTotalKgInput}
          onChicksCountChange={setChicksCountInput}
          onChicksCostChange={setChicksCostInput}
          onChicksDateChange={setChicksDateInput}
          onMortalityCountChange={setMortalityCountInput}
          onMortalityDateChange={setMortalityDateInput}
          onFeedSupplierChange={setFeedSupplierInput}
          onFeedTypeChange={setFeedTypeInput}
          onFeedPricePerTonChange={setFeedPricePerTonInput}
          onFeedQuantityChange={setFeedQuantityInput}
          onFeedDateChange={setFeedDateInput}
          onGasTypeChange={setGasTypeInput}
          onGasCountChange={setGasCountInput}
          onGasCostChange={setGasCostInput}
          onGasDateChange={setGasDateInput}
          onSolarLitersChange={setSolarLitersInput}
          onSolarCostChange={setSolarCostInput}
          onSolarDateChange={setSolarDateInput}
          onExpenseItemNameChange={setExpenseItemNameInput}
          onExpenseAmountChange={setExpenseAmountInput}
          onExpenseDateChange={setExpenseDateInput}
          onMedicationNameChange={setMedicationNameInput}
          onMedicationSupplierIdChange={setMedicationSupplierIdInput}
          onMedicationSupplierChange={setMedicationSupplierInput}
          onMedicationQuantityChange={setMedicationQuantityInput}
          onMedicationPriceChange={setMedicationPriceInput}
          onMedicationPriceModeChange={setMedicationPriceModeInput}
          onMedicationDateChange={setMedicationDateInput}
          onMedicationConsumeAllChange={setMedicationConsumeAllInput}
          onWorkerNameChange={setWorkerNameInput}
          onWorkerFarmWorkerIdChange={setWorkerFarmWorkerIdInput}
          onWorkerStartDateChange={setWorkerStartDateInput}
          onWorkerMonthlySalaryChange={setWorkerMonthlySalaryInput}
          onWorkerExpenseWorkerIdChange={setWorkerExpenseWorkerIdInput}
          onWorkerExpenseAmountChange={setWorkerExpenseAmountInput}
          onWorkerExpenseDateChange={setWorkerExpenseDateInput}
          onWorkerExpenseCategoryChange={setWorkerExpenseCategoryInput}
          onSaleTraderChange={setSaleTraderInput}
          onSaleTraderIdChange={setSaleTraderIdInput}
          onSaleBrokerChange={setSaleBrokerInput}
          onSaleBrokerIdChange={setSaleBrokerIdInput}
          onSalePhoneChange={setSalePhoneInput}
          onSalePricePerKgChange={setSalePricePerKgInput}
          onSalePaidChange={setSalePaidInput}
          onSaleDateChange={setSaleDateInput}
          onSaleCagesLineChange={updateSaleCagesLine}
          onSaleEmptyLineChange={updateSaleEmptyLine}
          onSaleAddEmptyLine={addSaleEmptyLine}
          onSaleRemoveEmptyLine={removeSaleEmptyLine}
          onSaleFullLineChange={updateSaleFullLine}
          onSaleLineBirdCountChange={updateSaleLineBirdCount}
          onSaleAddFullLine={addSaleFullLine}
          onSaleRemoveFullLine={removeSaleFullLine}
          onSaleConfirmEmptyPhase={confirmSaleEmptyPhase}
          onSaleResetWizard={resetSaleWizard}
          onDailyConsumptionDateChange={setDailyConsumptionDateInput}
          onDailyFeedConsumedChange={setDailyFeedConsumedInput}
          onDailyFeedUnitChange={setDailyFeedUnitInput}
          onFeedSupplierIdChange={setFeedSupplierIdInput}
          onSupplierNameChange={setSupplierNameInput}
          onSupplierPhoneChange={setSupplierPhoneInput}
          onBrokerNameChange={setBrokerNameInput}
          onBrokerPhoneChange={setBrokerPhoneInput}
          onTraderNameChange={setTraderNameInput}
          onTraderPhoneChange={setTraderPhoneInput}
          onPurchasePaymentSourceChange={setPurchasePaymentSourceInput}
          onPurchaseCreditSupplierIdChange={setPurchaseCreditSupplierIdInput}
          onPurchaseCreditSupplierNameChange={setPurchaseCreditSupplierNameInput}
          onTreasuryTypeChange={setTreasuryTypeInput}
          onTreasuryAmountChange={setTreasuryAmountInput}
          onTreasuryPersonNameChange={setTreasuryPersonNameInput}
          onTreasuryNotesChange={setTreasuryNotesInput}
          onTreasuryDateChange={setTreasuryDateInput}
          onAddSupplier={handleAddSupplier}
          onAddBroker={handleAddBroker}
          onAddTrader={handleAddTrader}
          onAddTreasuryEntry={handleAddTreasuryEntry}
          onWeightDateChange={setWeightDateInput}
          onWeightGroupBirdCountChange={setWeightGroupBirdCountInput}
          onWeightGroupTotalKgChange={setWeightGroupTotalKgInput}
          onAddChicks={handleAddChicks}
          onAddMortality={handleAddMortality}
          onAddFeed={handleAddFeed}
          onAddGas={handleAddGas}
          onAddSolar={handleAddSolar}
          onAddExpense={handleAddExpense}
          onAddMedication={handleAddMedication}
          onTrackMedicationUsage={handleTrackMedicationUsage}
          onAddWorker={handleAddWorker}
          onAddWorkerExpense={handleAddWorkerExpense}
          onAddSale={handleAddSale}
          onDownloadSaleInvoice={handleDownloadSaleInvoice}
          onExportLedger={handleExportLedger}
          onAddDailyConsumption={handleAddDailyConsumption}
          onAddWeight={handleAddWeight}
          onUpdateChickArrival={handleUpdateChickArrival}
          onDeleteChickArrival={handleDeleteChickArrival}
          onUpdateMortality={handleUpdateMortality}
          onDeleteMortality={handleDeleteMortality}
          onUpdateFeed={handleUpdateFeed}
          onDeleteFeed={handleDeleteFeed}
          onUpdateGas={handleUpdateGas}
          onDeleteGas={handleDeleteGas}
          onUpdateSolar={handleUpdateSolar}
          onDeleteSolar={handleDeleteSolar}
          onUpdateExpense={handleUpdateExpense}
          onDeleteExpense={handleDeleteExpense}
          onUpdateMedication={handleUpdateMedication}
          onDeleteMedication={handleDeleteMedication}
          onUpdateWorker={handleUpdateWorker}
          onDeleteWorker={handleDeleteWorker}
          onUpdateWorkerExpense={handleUpdateWorkerExpense}
          onDeleteWorkerExpense={handleDeleteWorkerExpense}
          onUpdateSale={handleUpdateSale}
          onDeleteSale={handleDeleteSale}
          onUpdateDailyConsumption={handleUpdateDailyConsumption}
          onDeleteDailyConsumption={handleDeleteDailyConsumption}
          onUpdateWeightEntry={handleUpdateWeightEntry}
          onDeleteWeightEntry={handleDeleteWeightEntry}
          onUpdateSupplier={handleUpdateSupplier}
          onDeleteSupplier={handleDeleteSupplier}
          onUpdateTrader={handleUpdateTrader}
          onDeleteTrader={handleDeleteTrader}
          onUpdateBroker={handleUpdateBroker}
          onDeleteBroker={handleDeleteBroker}
          onOpenReports={handleOpenReports}
          onBack={() => {
            navigate('/')
            setSelectedFarm(null)
          }}
          onToggleCycle={handleToggleCycle}
          sectionSlug={farmViewSectionSlug}
          tradingTabHint={tradingTabHint}
          onFarmSectionNavigate={(key) => navigate(`/farm/${selectedFarm.id}/${key}`)}
          onFarmHomeNavigate={() => navigate(`/farm/${selectedFarm.id}`)}
        />
        </AppChrome>
        {canInstall && (
          <button type="button" onClick={handleInstallApp} className="app-fab-install">
            تثبيت التطبيق
          </button>
        )}
      </>
    )
  }

  if (farmPathParts.farmId && farmFromPath && !selectedFarm && !showPartners && !showSupervisors) {
    return (
      <>
        <AppChrome
          variant="loading"
          isOffline={isOffline}
          error={error}
          onDismissError={() => setError('')}
          onNavigateHome={() => navigate('/')}
        >
          <div className="app-page flex flex-1 flex-col justify-center py-12">
            <LoadingState title="جاري فتح المزرعة…" subtitle="مزامنة البيانات مع الخادم" />
          </div>
        </AppChrome>
        {canInstall && (
          <button type="button" onClick={handleInstallApp} className="app-fab-install">
            تثبيت التطبيق
          </button>
        )}
      </>
    )
  }

  if (showPartners) {
    return (
      <>
        <AppChrome
          variant="partners"
          isOffline={isOffline}
          error={error}
          onDismissError={() => setError('')}
          onNavigateHome={() => {
            setShowPartners(false)
            navigate('/')
          }}
          onOpenPartners={() => setShowPartners(true)}
          onOpenSupervisors={() => setShowSupervisors(true)}
          onBackFromPartners={() => setShowPartners(false)}
        >
          <PartnersPage
            farms={farms}
            partners={partners}
            onAddPartner={handleAddPartner}
            onDeletePartner={handleDeletePartner}
            onUpdatePartner={handleUpdatePartner}
          />
        </AppChrome>
        {canInstall && (
          <button type="button" onClick={handleInstallApp} className="app-fab-install">
            تثبيت التطبيق
          </button>
        )}
      </>
    )
  }

  if (showSupervisors) {
    return (
      <>
        <AppChrome
          variant="supervisors"
          isOffline={isOffline}
          error={error}
          onDismissError={() => setError('')}
          onNavigateHome={() => {
            setShowSupervisors(false)
            navigate('/')
          }}
          onOpenPartners={() => setShowPartners(true)}
          onOpenSupervisors={() => setShowSupervisors(true)}
          onBackFromSupervisors={() => setShowSupervisors(false)}
        >
          <SupervisorsPage
            farms={farms}
            supervisors={supervisors}
            onAddSupervisor={handleAddSupervisor}
            onDeleteSupervisor={handleDeleteSupervisor}
            onUpdateSupervisor={handleUpdateSupervisor}
          />
        </AppChrome>
        {canInstall && (
          <button type="button" onClick={handleInstallApp} className="app-fab-install">
            تثبيت التطبيق
          </button>
        )}
      </>
    )
  }

  return (
    <>
      <AppChrome
        variant="dashboard"
        isOffline={isOffline}
        error={error}
        onDismissError={() => setError('')}
        onNavigateHome={() => navigate('/')}
        onOpenPartners={() => setShowPartners(true)}
        onOpenSupervisors={() => setShowSupervisors(true)}
      >
        <Dashboard
          farms={farms}
          alerts={dashboardAlerts}
          farmComparison={farmComparison}
          onAddFarm={handleAddFarm}
          onUpdateFarm={handleUpdateFarm}
          onDeleteFarm={handleDeleteFarm}
          onClearAlerts={handleClearAlerts}
          onOpenFarm={handleOpenFarm}
          onOpenPartners={() => setShowPartners(true)}
          onOpenSupervisors={() => setShowSupervisors(true)}
          loading={loading}
        />
      </AppChrome>
      {canInstall && (
        <button type="button" onClick={handleInstallApp} className="app-fab-install">
          تثبيت التطبيق
        </button>
      )}
    </>
  )
}

export default App
