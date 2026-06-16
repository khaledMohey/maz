export default function LedgerExportButtons({ onExport, disabled = false, compact = false }) {
  const btnClass = compact
    ? 'rounded-lg px-2.5 py-1.5 text-xs font-bold'
    : 'rounded-lg px-3 py-1.5 text-sm font-bold'

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onExport('pdf')}
        className={`${btnClass} bg-rose-100 text-rose-900 hover:bg-rose-200 disabled:opacity-50`}
        title="تصدير PDF"
      >
        PDF
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onExport('xlsx')}
        className={`${btnClass} bg-emerald-100 text-emerald-900 hover:bg-emerald-200 disabled:opacity-50`}
        title="تصدير Excel"
      >
        Excel
      </button>
    </div>
  )
}
