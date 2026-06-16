const ACCENT = {
  violet: {
    ring: 'ring-violet-300',
    bg: 'bg-violet-600',
    bgSoft: 'bg-violet-100',
    text: 'text-violet-800',
    btn: 'bg-violet-600 hover:bg-violet-700',
  },
  amber: {
    ring: 'ring-amber-300',
    bg: 'bg-amber-600',
    bgSoft: 'bg-amber-100',
    text: 'text-amber-900',
    btn: 'bg-amber-600 hover:bg-amber-700',
  },
}

export function WizardNextButton({ onClick, disabled = false, accent = 'violet', label = 'الخطوة التالية ←', className = '' }) {
  const colors = ACCENT[accent] || ACCENT.violet
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${colors.btn} ${className || 'mt-4'}`}
    >
      {label}
    </button>
  )
}

export default function SequentialPurchaseWizard({
  title,
  description,
  stepLabels,
  activeStep,
  onStepChange,
  accent = 'violet',
  children,
}) {
  const colors = ACCENT[accent] || ACCENT.violet
  const total = stepLabels.length
  const progress = total > 0 ? Math.round(((activeStep + 1) / total) * 100) : 0

  return (
    <div className="max-w-2xl">
      <h3 className="mb-2 text-xl font-bold text-slate-900">{title}</h3>
      {description && <p className="mb-4 text-sm text-slate-600">{description}</p>}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
          <span>
            الخطوة {activeStep + 1} من {total}
          </span>
          <span className={colors.text}>{stepLabels[activeStep]}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${colors.bg}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {stepLabels.map((label, index) => {
            const done = index < activeStep
            const current = index === activeStep
            return (
              <span
                key={label}
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  current
                    ? `${colors.bg} text-white ring-2 ${colors.ring}`
                    : done
                      ? `${colors.bgSoft} ${colors.text}`
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {index + 1}. {label}
              </span>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border-2 border-violet-200 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${colors.bg}`}
          >
            {activeStep + 1}
          </span>
          {stepLabels[activeStep]}
        </p>
        {children}
      </div>

      {activeStep > 0 && (
        <button
          type="button"
          onClick={() => onStepChange(activeStep - 1)}
          className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          ← الخطوة السابقة
        </button>
      )}
    </div>
  )
}
