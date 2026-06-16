/**
 * إطار التطبيق: شريط علوي (زجاجي) + محتوى + تذييل
 * variant: dashboard | farm | farm-reports | partners | supervisors | loading
 */
function AppChrome({
  children,
  isOffline,
  error,
  onDismissError,
  variant = 'dashboard',
  farmId,
  farmName,
  onNavigateHome,
  onNavigateFarmRoot,
  onOpenPartners,
  onOpenSupervisors,
  onBackFromReports,
  onBackFromPartners,
  onBackFromSupervisors,
}) {
  const showPartnerLinks = variant === 'dashboard'
  const showFarmCrumb = variant === 'farm' || variant === 'farm-reports'

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <header className="app-nav sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 shadow-sm shadow-slate-900/[0.04] backdrop-blur-xl backdrop-saturate-150">
        <div className="app-page flex max-w-full flex-wrap items-center justify-between gap-3 py-3 md:py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onNavigateHome}
              className="group flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-right transition hover:opacity-90"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-emerald-700 text-lg shadow-md shadow-teal-900/20 ring-1 ring-white/20 transition group-hover:scale-[1.03]">
                🌾
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold tracking-tight text-slate-900">مزرعة</span>
                <span className="hidden text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500 sm:block">
                  إدارة الدورات
                </span>
              </span>
            </button>

            {showFarmCrumb && farmName && (
              <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />
            )}

            {showFarmCrumb && farmName && (
              <div className="min-w-0">
                <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">المزرعة الحالية</p>
                <p className="truncate text-sm font-bold text-slate-800">{farmName}</p>
              </div>
            )}
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2" aria-label="التنقل الرئيسي">
            {variant === 'farm' && farmId && (
              <button type="button" onClick={onNavigateFarmRoot} className="app-nav-link">
                نظرة عامة
              </button>
            )}

            {showPartnerLinks && (
              <>
                <button type="button" onClick={onOpenPartners} className="app-nav-link">
                  الشركاء
                </button>
                <button type="button" onClick={onOpenSupervisors} className="app-nav-link">
                  المشرفين
                </button>
              </>
            )}

            {variant === 'farm-reports' && (
              <button type="button" onClick={onBackFromReports} className="app-nav-link app-nav-link--primary">
                العودة للمزرعة
              </button>
            )}

            {variant === 'partners' && (
              <button type="button" onClick={onBackFromPartners} className="app-nav-link app-nav-link--primary">
                ← لوحة التحكم
              </button>
            )}

            {variant === 'supervisors' && (
              <button type="button" onClick={onBackFromSupervisors} className="app-nav-link app-nav-link--primary">
                ← لوحة التحكم
              </button>
            )}
          </nav>
        </div>
      </header>

      <div className="app-content flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-7xl space-y-2 px-4 sm:px-5 md:px-8">
          {isOffline && (
            <div className="app-banner-offline animate-app-in border-amber-300/40 shadow-sm">
              أنت غير متصل — سيتم حفظ العمليات في الطابور عند العودة
            </div>
          )}
        </div>

        {error && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4">
            <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 text-center shadow-2xl shadow-slate-950/25">
              <h2 className="mb-3 text-xl font-extrabold text-rose-700">تنبيه</h2>
              <p className="mb-5 text-base font-semibold leading-7 text-slate-800">{error}</p>
              <button
                type="button"
                onClick={onDismissError}
                className="rounded-xl bg-rose-600 px-8 py-2.5 text-base font-bold text-white shadow-sm transition hover:bg-rose-700"
              >
                OK
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-1 flex-col">{children}</div>

        <footer className="app-footer mt-auto border-t border-slate-200/80 bg-white/60 py-8 backdrop-blur-sm">
          <div className="app-page flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-extrabold text-slate-900">مزرعة</p>
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-600">إدارة احترافية للدورات، التكاليف، والمخزون.</p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm font-semibold text-slate-600">
              <button type="button" onClick={onNavigateHome} className="transition hover:text-teal-700">
                الرئيسية
              </button>
              {showPartnerLinks && (
                <>
                  <button type="button" onClick={onOpenPartners} className="transition hover:text-teal-700">
                    الشركاء
                  </button>
                  <button type="button" onClick={onOpenSupervisors} className="transition hover:text-teal-700">
                    المشرفين
                  </button>
                </>
              )}
            </div>
            <p className="text-xs font-medium text-slate-400">© {new Date().getFullYear()} — واجهة جاهزة للإنتاج</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default AppChrome
