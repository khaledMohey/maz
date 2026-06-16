function EmptyState({ icon = '📭', title, description, children, className = '' }) {
  return (
    <div
      className={`app-empty flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/90 bg-slate-50/50 px-6 py-14 text-center ${className}`.trim()}
    >
      <span className="mb-3 text-4xl opacity-90" aria-hidden>
        {icon}
      </span>
      <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-600">{description}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

export default EmptyState
