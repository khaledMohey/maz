import { useMemo, useState } from "react"
import PageHeader from "./ui/PageHeader"

function PartnersPage({ farms, partners, onAddPartner, onDeletePartner, onUpdatePartner }) {
  const [farmIdInput, setFarmIdInput] = useState("")
  const [nameInput, setNameInput] = useState("")
  const [shareTypeInput, setShareTypeInput] = useState("PERCENT")
  const [shareValueInput, setShareValueInput] = useState("")
  const [formError, setFormError] = useState("")
  const [editPartner, setEditPartner] = useState(null)

  const groupedPartners = useMemo(() => {
    const groups = {}
    for (const partner of partners || []) {
      const farmName = partner.farm?.name || "مزرعة غير معروفة"
      if (!groups[farmName]) groups[farmName] = []
      groups[farmName].push(partner)
    }
    return groups
  }, [partners])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError("")
    const payload = {
      farmId: farmIdInput,
      name: nameInput.trim(),
      shareType: shareTypeInput,
      shareValue: Number(shareValueInput),
    }
    if (!payload.farmId) return setFormError("اختر المزرعة")
    if (!payload.name) return setFormError("أدخل اسم الشريك")
    if (Number.isNaN(payload.shareValue) || payload.shareValue <= 0) {
      return setFormError("أدخل قيمة صحيحة")
    }
    const result = await onAddPartner(payload)
    if (result?.ok) {
      setFarmIdInput("")
      setNameInput("")
      setShareTypeInput("PERCENT")
      setShareValueInput("")
      return
    }
    setFormError(result?.message || "تعذر إضافة الشريك")
  }

  return (
    <section className="app-page animate-app-in">
      <PageHeader
        eyebrow="إدارة الحصص"
        title="الشركاء"
        description="ربط الشركاء بالمزارع وتحديد نوع الحصة (نسبة أو مبلغ ثابت). استخدم «لوحة التحكم» في الشريط العلوي للرجوع."
      />

      <form onSubmit={handleSubmit} className="app-card mb-8 border-indigo-100/60 p-5 md:p-6">
        <h2 className="mb-4 text-xl font-bold text-slate-900">إضافة شريك</h2>
        {formError && (
          <div className="mb-3 rounded-xl bg-rose-100 px-4 py-2 text-base font-semibold text-rose-800">{formError}</div>
        )}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <select
            value={farmIdInput}
            onChange={(e) => setFarmIdInput(e.target.value)}
            className="app-input"
          >
            <option value="">اختر المزرعة</option>
            {(farms || []).map((farm) => (
              <option key={farm.id} value={farm.id}>
                {farm.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="app-input"
            placeholder="اسم الشريك"
          />
          <select
            value={shareTypeInput}
            onChange={(e) => setShareTypeInput(e.target.value)}
            className="app-input"
          >
            <option value="PERCENT">نسبة مئوية</option>
            <option value="FIXED">مبلغ ثابت</option>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={shareValueInput}
            onChange={(e) => setShareValueInput(e.target.value)}
            className="app-input"
            placeholder={shareTypeInput === "PERCENT" ? "النسبة %" : "المبلغ"}
          />
        </div>
        <button type="submit" className="app-btn-primary mt-4">
          حفظ الشريك
        </button>
      </form>

      <div className="space-y-4">
        {Object.entries(groupedPartners).map(([farmName, farmPartners]) => (
          <div key={farmName} className="app-card border-indigo-100/50 p-5">
            <h3 className="mb-3 text-xl font-bold text-slate-900">{farmName}</h3>
            <div className="app-table-wrap">
              <table className="w-full min-w-[640px] text-right">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-700">
                    <th className="px-3 py-2">الشريك</th>
                    <th className="px-3 py-2">نوع الحصة</th>
                    <th className="px-3 py-2">القيمة</th>
                    <th className="px-3 py-2">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {farmPartners.map((partner) => (
                    <tr key={partner.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-900">{partner.name}</td>
                      <td className="px-3 py-2">{partner.shareType === "PERCENT" ? "نسبة مئوية" : "مبلغ ثابت"}</td>
                      <td className="px-3 py-2">
                        {partner.shareType === "PERCENT"
                          ? `${Number(partner.shareValue || 0).toFixed(2)}%`
                          : Number(partner.shareValue || 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setEditPartner({
                                id: partner.id,
                                name: partner.name || "",
                                shareType: partner.shareType || "PERCENT",
                                shareValue: Number(partner.shareValue || 0),
                              })
                            }
                            className="rounded-lg bg-slate-200 px-3 py-1 text-sm font-bold text-slate-800"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePartner(partner.id)}
                            className="rounded-lg bg-rose-100 px-3 py-1 text-sm font-bold text-rose-800"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {(!partners || partners.length === 0) && (
          <div className="app-card p-8 text-center text-lg font-semibold text-slate-600">
            لا يوجد شركاء مضافون بعد.
          </div>
        )}
      </div>
      {editPartner && (
        <div className="app-modal-overlay">
          <div className="app-modal !max-w-lg">
            <h3 className="app-modal-title mb-4">تعديل الشريك</h3>
            <div className="grid gap-3">
              <input
                type="text"
                value={editPartner.name}
                onChange={(e) => setEditPartner((prev) => ({ ...prev, name: e.target.value }))}
                className="app-input"
              />
              <select
                value={editPartner.shareType}
                onChange={(e) => setEditPartner((prev) => ({ ...prev, shareType: e.target.value }))}
                className="app-input"
              >
                <option value="PERCENT">نسبة مئوية</option>
                <option value="FIXED">مبلغ ثابت</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editPartner.shareValue}
                onChange={(e) => setEditPartner((prev) => ({ ...prev, shareValue: e.target.value }))}
                className="app-input"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const result = await onUpdatePartner(editPartner.id, {
                    name: editPartner.name,
                    shareType: editPartner.shareType,
                    shareValue: Number(editPartner.shareValue),
                  })
                  if (result?.ok) setEditPartner(null)
                }}
                className="app-btn-primary py-2 text-base"
              >
                حفظ
              </button>
              <button type="button" onClick={() => setEditPartner(null)} className="app-btn-outline">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default PartnersPage
