/**
 * عرض المبالغ بالألوان: آلاف (أحمر) | جنيهات (أزرق) | قروش (أسود)
 * مثال: ١٢٬٣٤٥٫٦٧ ← ١٢ أحمر | ٣٤٥ أزرق | ٦٧ أسود
 */
export default function ColoredMoney({
  value,
  className = '',
  fractionDigits = 2,
  showDecimals = true,
}) {
  const n = Number(value)
  if (Number.isNaN(n)) {
    return <span className={className}>—</span>
  }

  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(n)
  const factor = 10 ** fractionDigits
  const totalMinor = Math.round(abs * factor)
  const intPart = Math.floor(totalMinor / factor)
  const fracPart = totalMinor % factor

  const thousands = Math.floor(intPart / 1000)
  const pounds = intPart % 1000

  const fmtInt = (num, opts = {}) =>
    num.toLocaleString('ar-EG', { useGrouping: false, maximumFractionDigits: 0, ...opts })

  const poundsDisplay = thousands > 0 ? fmtInt(pounds, { minimumIntegerDigits: 3 }) : fmtInt(intPart)

  return (
    <span className={`money-colored tabular-nums ${className}`.trim()} dir="ltr">
      {sign}
      {thousands > 0 && (
        <>
          <span className="money-thousands">{fmtInt(thousands)}</span>
          <span className="money-separator">{'\u066C'}</span>
        </>
      )}
      <span className="money-pounds">{poundsDisplay}</span>
      {showDecimals && fractionDigits > 0 && (
        <>
          <span className="money-separator">{'\u066B'}</span>
          <span className="money-piastres">
            {fmtInt(fracPart, { minimumIntegerDigits: fractionDigits })}
          </span>
        </>
      )}
    </span>
  )
}
