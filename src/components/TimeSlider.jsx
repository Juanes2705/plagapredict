// HU-19: Filtro temporal por slider — últimos N días (1–90)
/**
 * @param {{ dias: number, onChange: (n: number) => void }} props
 */
export default function TimeSlider({ dias, onChange }) {
  const marcas = [1, 7, 14, 30, 60, 90]

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Etiqueta */}
      <span className="text-[#8b949e] text-xs shrink-0">🕐 Últimos</span>

      {/* Slider */}
      <div className="flex-1 min-w-[120px] relative">
        <input
          type="range"
          min={1}
          max={90}
          step={1}
          value={dias}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer
            bg-[#30363d] accent-[#10b981]"
          style={{
            background: `linear-gradient(to right, #10b981 ${((dias - 1) / 89) * 100}%, #30363d ${((dias - 1) / 89) * 100}%)`,
          }}
        />
      </div>

      {/* Valor actual */}
      <span className="text-[#10b981] text-xs font-semibold w-14 shrink-0 text-right">
        {dias === 1 ? '1 día' : `${dias} días`}
      </span>

      {/* Accesos rápidos */}
      <div className="flex items-center gap-1 shrink-0">
        {marcas.map(m => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${
              dias === m
                ? 'border-[#10b981]/50 bg-[#10b981]/15 text-[#10b981]'
                : 'border-[#30363d] text-[#484f58] hover:border-[#484f58] hover:text-[#8b949e]'
            }`}
          >
            {m === 1 ? '1d' : m === 7 ? '7d' : m === 14 ? '14d' : m === 30 ? '1m' : m === 60 ? '2m' : '3m'}
          </button>
        ))}
      </div>
    </div>
  )
}
