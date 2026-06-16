function LoadingState({ title = 'جاري التحميل…', subtitle = 'يرجى الانتظار لحظات', className = '' }) {
  return (
    <div
      className={`app-card flex flex-col items-center justify-center gap-5 border-slate-200/90 py-14 ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="app-spinner" aria-hidden />
      <div className="text-center">
        <p className="text-lg font-bold text-slate-900">{title}</p>
        {subtitle && <p className="mt-1 text-sm font-medium text-slate-600">{subtitle}</p>}
      </div>
      <div className="flex w-full max-w-md flex-col gap-2 px-4">
        <div className="app-skeleton h-3 w-full rounded-full" />
        <div className="app-skeleton h-3 w-4/5 rounded-full" />
        <div className="app-skeleton h-3 w-3/5 rounded-full" />
      </div>
    </div>
  )
}

export default LoadingState
