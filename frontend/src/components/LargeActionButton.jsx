function LargeActionButton({ icon, label, onClick, isActive = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex min-h-[7.25rem] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border px-3 py-4 text-center shadow-md shadow-slate-900/[0.06] ring-1 outline-none transition duration-200 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-teal-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
        isActive
          ? 'border-teal-400/90 bg-gradient-to-br from-teal-50/95 via-white to-cyan-50/50 shadow-lg shadow-teal-900/12 ring-teal-300/70 hover:border-teal-500 hover:shadow-xl md:hover:-translate-y-0.5'
          : 'border-slate-200/95 bg-white/98 ring-slate-900/[0.03] hover:border-teal-300/70 hover:bg-gradient-to-br hover:from-teal-50/30 hover:to-white hover:shadow-lg md:hover:-translate-y-0.5'
      }`}
    >
      <span
        className={`absolute left-3 top-3 h-2.5 w-2.5 rounded-full ring-2 ring-white ${isActive ? 'bg-teal-500 shadow-sm shadow-teal-600/30' : 'bg-slate-300 group-hover:bg-teal-400/80'} transition-colors`}
      />
      <span className="flex h-[3.65rem] w-[3.65rem] items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-slate-50 text-[1.65rem] shadow-inner ring-1 ring-teal-100/90 transition group-hover:from-teal-100 group-hover:to-white group-hover:shadow-md sm:text-3xl">
        {icon}
      </span>
      <span className="px-1 text-[0.95rem] font-extrabold leading-snug text-slate-800 sm:text-base">{label}</span>
    </button>
  )
}

export default LargeActionButton
