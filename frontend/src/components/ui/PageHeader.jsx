/**
 * رأس صفحة موحّد: عنوان، وصف اختياري، إجراءات
 */
function PageHeader({ eyebrow, title, description, children, className = '' }) {
  return (
    <header className={`app-page-hero mb-8 ${className}`.trim()}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="app-eyebrow">{eyebrow}</p>}
          <h1 className="app-title-page">{title}</h1>
          {description && <p className="app-lead mt-2 max-w-2xl">{description}</p>}
        </div>
        {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  )
}

export default PageHeader
