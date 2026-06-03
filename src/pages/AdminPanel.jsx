// HU-06 + HU-18 + HU-CONSENSO: Panel Admin con detalle de reportes
import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, query, orderBy, addDoc, Timestamp, updateDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import Sidebar from '../components/Sidebar'
import {
  calcularEstadosConsenso,
  detectarClusters,
  ESTADO_LABEL,
  ESTADO_COLOR,
  CONSENSUS_CONFIG,
} from '../utils/consensusValidation'

const SEED_REPORTES = [
  { plaga: 'Mosca del mediterráneo', finca: 'Finca La Esperanza',  nivel: 'alto',  lat: 3.8801, lng: -76.3000, temp_c: 27, humedad: 72, viento_kmh: 14, viento_dir: 45,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Trips de la cebolla',    finca: 'Finca El Paraíso',    nivel: 'medio', lat: 3.9200, lng: -76.2800, temp_c: 25, humedad: 80, viento_kmh: 8,  viento_dir: 90,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Áfidos / Pulgones',      finca: 'Finca Santa Rosa',    nivel: 'bajo',  lat: 3.8500, lng: -76.3300, temp_c: 24, humedad: 85, viento_kmh: 6,  viento_dir: 180, email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Mosca del mediterráneo', finca: 'Finca Los Álamos',    nivel: 'alto',  lat: 3.9000, lng: -76.3500, temp_c: 28, humedad: 68, viento_kmh: 18, viento_dir: 30,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Gusano cogollero',       finca: 'Hacienda San Pedro',  nivel: 'medio', lat: 3.8300, lng: -76.2500, temp_c: 26, humedad: 75, viento_kmh: 12, viento_dir: 270, email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Ácaro rojo',             finca: 'Finca Bella Vista',   nivel: 'alto',  lat: 3.8650, lng: -76.3150, temp_c: 29, humedad: 65, viento_kmh: 20, viento_dir: 60,  email_reportador: 'campo@plagapredict.com' },
  { plaga: 'Chinche de encaje',      finca: 'Hacienda El Roble',   nivel: 'bajo',  lat: 3.9100, lng: -76.3400, temp_c: 23, humedad: 88, viento_kmh: 5,  viento_dir: 135, email_reportador: 'campo@plagapredict.com' },
]

const nivelBadge = {
  alto:  'bg-red-500/20 text-red-400 border border-red-500/30',
  medio: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  bajo:  'bg-green-500/20 text-green-400 border border-green-500/30',
}

// ── Modal de detalle de reporte ───────────────────────────────────────────────
function ModalDetalle({ reporte, estadoConsenso, onClose, onConfirmar, onDescartar, onRevertir, validando }) {
  if (!reporte) return null

  const ev        = estadoConsenso ?? 'sospechoso'
  const label     = ESTADO_LABEL[ev] ?? ev
  const color     = ESTADO_COLOR[ev] ?? '#8b949e'
  const enVal     = validando
  const ia        = reporte.ia_identificacion
  const fecha     = reporte.fecha?.toDate?.()?.toLocaleDateString('es-CO', {
    year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'
  }) ?? '—'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-[#30363d]">
          <div>
            <h3 className="text-lg font-bold text-white">{reporte.plaga}</h3>
            <p className="text-[#8b949e] text-sm mt-0.5">{reporte.finca}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border" style={{ color, borderColor: color + '40' }}>
              {label}
            </span>
            <button onClick={onClose}
              className="text-[#484f58] hover:text-white text-xl leading-none transition-colors">✕</button>
          </div>
        </div>

        {/* Galería de imágenes */}
        {(() => {
          // Soporta: imagenesBase64 (array nuevo) o imagenBase64 (campo legacy)
          const imgs = reporte.imagenesBase64?.length > 0
            ? reporte.imagenesBase64
            : reporte.imagenBase64
            ? [reporte.imagenBase64]
            : []

          if (imgs.length === 0) return (
            <div className="mx-5 mt-4 rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] flex items-center justify-center py-8">
              <div className="text-center text-[#484f58]">
                <span className="text-3xl block mb-1">📷</span>
                <span className="text-xs">Sin fotografía adjunta</span>
              </div>
            </div>
          )

          return (
            <div className="mx-5 mt-4 space-y-2">
              {/* Foto principal grande */}
              <div className="rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117]">
                <img
                  src={imgs[0]}
                  alt={`Fotografía de ${reporte.plaga}`}
                  className="w-full max-h-64 object-cover"
                />
              </div>
              {/* Fotos adicionales en fila */}
              {imgs.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {imgs.slice(1).map((src, i) => (
                    <div key={i} className="rounded-lg overflow-hidden border border-[#30363d]">
                      <img src={src} alt={`Foto ${i + 2}`} className="w-full h-20 object-cover" />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-center text-[#484f58] text-xs">
                {imgs.length} fotografía{imgs.length !== 1 ? 's' : ''} del avistamiento
              </p>
            </div>
          )
        })()}

        {/* Datos del reporte */}
        <div className="p-5 space-y-4">

          {/* Grid de datos básicos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#484f58] text-xs mb-1">📍 Coordenadas</p>
              <p className="text-[#c9d1d9] text-sm font-mono">
                {reporte.lat?.toFixed(6)}, {reporte.lng?.toFixed(6)}
              </p>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#484f58] text-xs mb-1">⚠️ Nivel de riesgo</p>
              <span className={`text-xs px-2 py-0.5 rounded capitalize ${nivelBadge[reporte.nivel] ?? ''}`}>
                {reporte.nivel ?? '—'}
              </span>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#484f58] text-xs mb-1">👤 Reportado por</p>
              <p className="text-[#c9d1d9] text-sm truncate">{reporte.email_reportador ?? '—'}</p>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#484f58] text-xs mb-1">📅 Fecha</p>
              <p className="text-[#c9d1d9] text-sm">{fecha}</p>
            </div>
          </div>

          {/* Clima */}
          {(reporte.temp_c || reporte.humedad || reporte.viento_kmh) && (
            <div className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#484f58] text-xs mb-2">🌤️ Condiciones climáticas al momento del reporte</p>
              <div className="flex gap-4 text-sm text-[#c9d1d9]">
                {reporte.temp_c    != null && <span>🌡️ {reporte.temp_c}°C</span>}
                {reporte.humedad   != null && <span>💧 {reporte.humedad}%</span>}
                {reporte.viento_kmh != null && <span>🌬️ {reporte.viento_kmh} km/h</span>}
              </div>
            </div>
          )}

          {/* Criterios MIP */}
          {reporte.mip && (
            <div className="bg-[#0d1117] rounded-lg p-3 space-y-3">
              <p className="text-[#484f58] text-xs font-semibold mb-2">📊 Evaluación MIP (ICA Colombia)</p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[#484f58] text-[10px]">Cultivo afectado</p>
                  <p className="text-[#c9d1d9] text-xs font-medium">{reporte.mip.cultivo ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[#484f58] text-[10px]">Tipo de organismo (ICA)</p>
                  <p className="text-[#c9d1d9] text-xs font-medium">{reporte.mip.tipoOrganismo ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[#484f58] text-[10px]">Fase fenológica</p>
                  <p className="text-[#c9d1d9] text-xs font-medium">{reporte.mip.faseFenologica ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[#484f58] text-[10px]">Parte afectada</p>
                  <p className="text-[#c9d1d9] text-xs font-medium">
                    {Array.isArray(reporte.mip.parteAfectada) ? reporte.mip.parteAfectada.join(', ') : '—'}
                  </p>
                </div>
              </div>

              {/* Incidencia */}
              <div className={`rounded-lg px-3 py-2 border ${
                (reporte.mip.incidencia_pct ?? 0) >= 30 ? 'border-red-500/30 bg-red-500/5'
                : (reporte.mip.incidencia_pct ?? 0) >= 10 ? 'border-yellow-500/30 bg-yellow-500/5'
                : 'border-green-500/30 bg-green-500/5'
              }`}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[#484f58] text-[10px]">Incidencia</span>
                  <span className={`text-sm font-bold ${
                    (reporte.mip.incidencia_pct ?? 0) >= 30 ? 'text-red-400'
                    : (reporte.mip.incidencia_pct ?? 0) >= 10 ? 'text-yellow-400' : 'text-green-400'
                  }`}>{reporte.mip.incidencia_pct ?? '—'}%</span>
                </div>
                <p className="text-[#484f58] text-[10px]">
                  {reporte.mip.plantasAfectadas ?? '?'} de {reporte.mip.plantasEvaluadas ?? '?'} plantas evaluadas presentan síntomas
                </p>
              </div>

              {/* Severidad */}
              <div className="flex gap-2 items-center">
                <span className="text-[#484f58] text-[10px]">Severidad:</span>
                {[1,2,3,4].map(n => (
                  <span key={n} className={`w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${
                    n === reporte.mip.severidad
                      ? n >= 3 ? 'bg-red-500/30 text-red-400' : n >= 2 ? 'bg-yellow-500/30 text-yellow-400' : 'bg-green-500/30 text-green-400'
                      : 'bg-[#161b22] text-[#484f58]'
                  }`}>{n}</span>
                ))}
                <span className="text-[#484f58] text-[10px] ml-1">
                  {reporte.mip.severidad === 1 ? '— Leve' : reporte.mip.severidad === 2 ? '— Moderado' : reporte.mip.severidad === 3 ? '— Severo' : reporte.mip.severidad === 4 ? '— Muy severo' : ''}
                </span>
              </div>

              <p className="text-[#484f58] text-[10px]">
                Nivel calculado automáticamente según umbrales de daño económico ICA:
                <span className={`ml-1 font-semibold ${
                  reporte.mip.nivelCalculado === 'alto' ? 'text-red-400'
                  : reporte.mip.nivelCalculado === 'medio' ? 'text-yellow-400' : 'text-green-400'
                }`}>{(reporte.mip.nivelCalculado ?? reporte.nivel ?? '—').toUpperCase()}</span>
              </p>

              {/* Estadio biológico + distribución espacial */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#21262d]">
                <div>
                  <p className="text-[#484f58] text-[10px]">Estadio biológico</p>
                  <p className="text-[#c9d1d9] text-xs font-medium capitalize">{reporte.mip.estadioBiologico ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[#484f58] text-[10px]">Distribución espacial</p>
                  <p className="text-[#c9d1d9] text-xs font-medium capitalize">{reporte.mip.distribucionEspacial ?? '—'}</p>
                </div>
                {reporte.mip.densidadPoblacional != null && (
                  <div className="col-span-2">
                    <p className="text-[#484f58] text-[10px]">Densidad poblacional</p>
                    <p className="text-[#c9d1d9] text-xs font-medium">
                      {reporte.mip.densidadPoblacional} individuos/{reporte.mip.unidadMuestreo ?? 'planta'}
                    </p>
                  </div>
                )}
              </div>

              {/* Clasificación ICA */}
              {reporte.mip.clasificacionICA && reporte.mip.clasificacionICA !== 'desconocida' && (
                <div className={`rounded-lg px-3 py-2 border text-xs mt-1 ${
                  reporte.mip.clasificacionICA.startsWith('cuarentenaria')
                    ? 'border-purple-500/40 bg-purple-500/10'
                    : 'border-[#30363d] bg-[#0d1117]'
                }`}>
                  <p className="text-[#484f58] text-[10px] mb-0.5">Clasificación ICA (Res. 3593/2015)</p>
                  <p className={`font-semibold ${
                    reporte.mip.clasificacionICA.startsWith('cuarentenaria') ? 'text-purple-400'
                    : reporte.mip.clasificacionICA === 'no_cuarentenaria_reglamentada' ? 'text-yellow-400'
                    : 'text-[#c9d1d9]'
                  }`}>
                    {reporte.mip.clasificacionICA.startsWith('cuarentenaria') && '🟣 '}
                    {reporte.mip.clasificacionICA.replace(/_/g, ' ')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Evaluación Económica NDE */}
          {reporte.mip?.evaluacionEconomica && (() => {
            const eco = reporte.mip.evaluacionEconomica
            const esPlaga = eco.estadoEconomico === 'plaga'
            const esUmbral = eco.estadoEconomico === 'umbral'
            return (
              <div className={`bg-[#0d1117] rounded-lg p-3 border ${
                esPlaga  ? 'border-red-500/30'
                : esUmbral ? 'border-yellow-500/30'
                : 'border-[#30363d]'
              }`}>
                <p className={`text-xs font-semibold mb-3 ${
                  esPlaga ? 'text-red-400' : esUmbral ? 'text-yellow-400' : 'text-[#484f58]'
                }`}>
                  💰 Evaluación Económica NDE (ICA Colombia)
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    esPlaga  ? 'bg-red-500/20 text-red-400'
                    : esUmbral ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-green-500/20 text-green-400'
                  }`}>
                    {esPlaga ? '⚠️ PLAGA ECONÓMICA' : esUmbral ? '⚡ EN UMBRAL' : '✓ Bajo umbral'}
                  </span>
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="bg-[#161b22] rounded p-2">
                    <p className="text-[#484f58] text-[10px]">NDE (Umbral de Daño)</p>
                    <p className="text-white font-bold text-sm">{eco.nde ?? '—'}%</p>
                    <p className="text-[#484f58] text-[10px]">de incidencia</p>
                  </div>
                  <div className="bg-[#161b22] rounded p-2">
                    <p className="text-[#484f58] text-[10px]">Umbral de Acción (75%)</p>
                    <p className="text-yellow-400 font-bold text-sm">{eco.umbralAccion ?? '—'}%</p>
                    <p className="text-[#484f58] text-[10px]">intervenir antes de aquí</p>
                  </div>
                  <div className="bg-[#161b22] rounded p-2">
                    <p className="text-[#484f58] text-[10px]">Pérdida estimada/ha</p>
                    <p className={`font-bold text-sm ${esPlaga ? 'text-red-400' : 'text-[#c9d1d9]'}`}>
                      ${eco.perdidaEstimada != null ? eco.perdidaEstimada.toLocaleString('es-CO') : '—'}
                    </p>
                    <p className="text-[#484f58] text-[10px]">COP/ha</p>
                  </div>
                  <div className="bg-[#161b22] rounded p-2">
                    <p className="text-[#484f58] text-[10px]">Ratio Beneficio/Costo</p>
                    <p className={`font-bold text-sm ${
                      (eco.ratioBenefCosto ?? 0) >= 1 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {eco.ratioBenefCosto != null ? eco.ratioBenefCosto.toFixed(2) : '—'}
                    </p>
                    <p className="text-[#484f58] text-[10px]">
                      {(eco.ratioBenefCosto ?? 0) >= 1 ? 'Intervención rentable' : 'No rentable aún'}
                    </p>
                  </div>
                </div>

                {/* Barra incidencia vs NDE */}
                {eco.nde != null && reporte.mip?.incidencia_pct != null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-[#484f58]">
                      <span>Incidencia actual: <strong className="text-white">{reporte.mip.incidencia_pct}%</strong></span>
                      <span>NDE: <strong className="text-white">{eco.nde}%</strong></span>
                    </div>
                    <div className="relative h-3 bg-[#21262d] rounded-full overflow-hidden">
                      {/* Barra de incidencia */}
                      <div
                        className="absolute top-0 left-0 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (reporte.mip.incidencia_pct / Math.max(eco.nde, reporte.mip.incidencia_pct, 1)) * 100)}%`,
                          background: esPlaga ? '#ef4444' : esUmbral ? '#f59e0b' : '#10b981',
                        }}
                      />
                      {/* Línea umbral de acción */}
                      {eco.umbralAccion != null && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-yellow-400 opacity-80"
                          style={{ left: `${Math.min(100, (eco.umbralAccion / Math.max(eco.nde, reporte.mip.incidencia_pct, 1)) * 100)}%` }}
                        />
                      )}
                    </div>
                    <p className="text-[#484f58] text-[10px]">
                      Fórmula NDE: C / (V × D × K) — ICA Colombia
                    </p>
                  </div>
                )}

                {eco.decision && (
                  <p className={`text-xs mt-2 pt-2 border-t border-[#21262d] font-medium ${
                    esPlaga ? 'text-red-400' : esUmbral ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    📋 {eco.decision}
                  </p>
                )}
              </div>
            )
          })()}

          {/* Placeholder para reportes sin evaluación económica */}
          {reporte.mip && !reporte.mip.evaluacionEconomica && (
            <div className="bg-[#0d1117] rounded-lg p-3 border border-dashed border-[#30363d]">
              <p className="text-[#484f58] text-xs text-center">
                💰 Sin evaluación económica NDE — reporte anterior al módulo MIP
              </p>
            </div>
          )}

          {/* Nota de monitoreo para reportes bajo umbral */}
          {(() => {
            const eco = reporte.mip?.evaluacionEconomica
            if (!eco?.nde || !eco?.umbralAccion) return null
            const inc = reporte.mip?.incidencia_pct
            if (inc == null) return null
            const pct = Math.min(100, Math.round((inc / eco.nde) * 100))
            const enVigilancia = inc >= eco.umbralAccion
            if (estadoConsenso === 'alerta_preventiva' || estadoConsenso === 'confirmado') return null
            return (
              <div className={`rounded-lg p-3 border ${enVigilancia ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-[#30363d] bg-[#0d1117]'}`}>
                <p className={`text-xs font-semibold mb-2 ${enVigilancia ? 'text-yellow-400' : 'text-[#8b949e]'}`}>
                  {enVigilancia ? '⚡ En zona de vigilancia — preparar intervención' : '👁 En monitoreo — por debajo del umbral de acción'}
                </p>
                <div className="mb-1">
                  <div className="flex justify-between text-[9px] text-[#484f58] mb-1">
                    <span>0%</span>
                    <span className="text-yellow-400">UA {eco.umbralAccion}%</span>
                    <span className="text-red-400">NDE {eco.nde}%</span>
                    <span>100%</span>
                  </div>
                  <div className="relative h-3 bg-[#21262d] rounded-full overflow-hidden">
                    <div className="absolute h-full bg-green-500/20"
                      style={{ width: `${Math.min((eco.umbralAccion / eco.nde) * 100, 100)}%` }} />
                    <div className="absolute h-full bg-yellow-500/20"
                      style={{ left: `${Math.min((eco.umbralAccion / eco.nde) * 100, 100)}%`, right: 0 }} />
                    <div className="absolute h-full rounded-full"
                      style={{ width: `${pct}%`, background: enVigilancia ? '#f59e0b' : '#10b981' }} />
                  </div>
                </div>
                <p className="text-[10px] text-[#8b949e]">
                  Incidencia actual <strong>{inc}%</strong> representa el <strong>{pct}%</strong> del NDE ({eco.nde}%).
                  {enVigilancia
                    ? ' Ha superado el Umbral de Acción — la intervención debe planificarse antes de alcanzar el NDE.'
                    : ` Faltan ${Math.max(0, eco.umbralAccion - inc).toFixed(1)} puntos porcentuales para alcanzar el Umbral de Acción.`}
                </p>
              </div>
            )
          })()}

          {/* Descripción */}
          {reporte.descripcion && reporte.descripcion.trim() && (
            <div className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#484f58] text-xs mb-1">📝 Descripción del trabajador</p>
              <p className="text-[#c9d1d9] text-sm leading-relaxed">{reporte.descripcion}</p>
            </div>
          )}

          {/* Identificación por IA */}
          {ia && (
            <div className="bg-[#10b981]/5 border border-[#10b981]/30 rounded-lg p-3">
              <p className="text-[#10b981] text-xs font-semibold mb-2">🤖 Identificación por IA</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[#484f58] text-xs">Nombre común</p>
                  <p className="text-[#c9d1d9]">{ia.nombreComun}</p>
                </div>
                <div>
                  <p className="text-[#484f58] text-xs">Nombre científico</p>
                  <p className="text-[#c9d1d9] italic">{ia.nombreCientifico}</p>
                </div>
                <div>
                  <p className="text-[#484f58] text-xs">Confianza</p>
                  <p className="text-[#c9d1d9] font-semibold">{ia.porcentajeConfianza}%</p>
                </div>
                <div>
                  <p className="text-[#484f58] text-xs">Modelo usado</p>
                  <p className="text-[#484f58] text-xs">{ia.modelo ?? '—'}</p>
                </div>
              </div>
              {ia.descripcionDano && (
                <p className="text-[#8b949e] text-xs mt-2 pt-2 border-t border-[#10b981]/20">
                  💡 {ia.descripcionDano}
                </p>
              )}
              {ia.confirmadaPorUsuario && (
                <p className="text-[#10b981] text-xs mt-1">✅ Confirmada por el trabajador de campo</p>
              )}
            </div>
          )}

          {/* Nota profesional */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
            <p className="text-blue-400 text-xs font-semibold mb-1">👨‍🔬 Acción del profesional</p>
            <p className="text-[#8b949e] text-xs">
              Solo un agrónomo o profesional certificado puede confirmar oficialmente este avistamiento.
              La confirmación activa alertas a todos los trabajadores de la zona.
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-2 pt-2">
            {ev === 'descartado' ? (
              <button onClick={onRevertir} disabled={enVal}
                className="flex-1 py-2.5 text-sm border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58] rounded-lg transition-colors disabled:opacity-50">
                {enVal ? '⏳' : '↩ Reactivar reporte'}
              </button>
            ) : ev === 'confirmado' ? (
              <button onClick={onRevertir} disabled={enVal}
                className="flex-1 py-2.5 text-sm border border-[#30363d] text-[#484f58] hover:text-yellow-400 hover:border-yellow-500/40 rounded-lg transition-colors disabled:opacity-50">
                {enVal ? '⏳' : '↩ Revertir confirmación'}
              </button>
            ) : (
              <>
                <button onClick={onConfirmar} disabled={enVal}
                  className="flex-1 py-2.5 text-sm bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 rounded-lg font-semibold transition-colors disabled:opacity-50">
                  {enVal ? '⏳' : '✅ Confirmar como plaga real'}
                </button>
                <button onClick={onDescartar} disabled={enVal}
                  className="py-2.5 px-4 text-sm border border-[#30363d] text-[#484f58] hover:border-red-500/40 hover:text-red-400 rounded-lg transition-colors disabled:opacity-50">
                  ✕ Descartar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AdminPanel() {
  const [reportes,        setReportes]        = useState([])
  const [filtro,          setFiltro]          = useState('')
  const [seeding,         setSeeding]         = useState(false)
  const [seedDone,        setSeedDone]        = useState(false)
  const [archivando,      setArchivando]      = useState(new Set())
  const [validando,       setValidando]       = useState(new Set())
  const [detalleReporte,  setDetalleReporte]  = useState(null)   // reporte abierto en modal

  // ── Archivo ────────────────────────────────────────────────────────────────
  const toggleArchivo = async (r) => {
    const nuevoEstado = r.estado === 'archivado' ? 'activo' : 'archivado'
    setArchivando(s => new Set(s).add(r.id))
    try {
      await updateDoc(doc(db, 'reportes', r.id), { estado: nuevoEstado })
    } finally {
      setArchivando(s => { const n = new Set(s); n.delete(r.id); return n })
    }
  }

  // ── Validación profesional ─────────────────────────────────────────────────
  const cambiarValidacion = async (r, nuevoEstado) => {
    setValidando(s => new Set(s).add(r.id))
    try {
      await updateDoc(doc(db, 'reportes', r.id), { estado_validacion: nuevoEstado })
      // Actualizar el reporte en el modal si está abierto
      if (detalleReporte?.id === r.id) {
        setDetalleReporte(prev => ({ ...prev, estado_validacion: nuevoEstado }))
      }
    } finally {
      setValidando(s => { const n = new Set(s); n.delete(r.id); return n })
    }
  }

  // ── Consenso ───────────────────────────────────────────────────────────────
  const estadosConsenso = useMemo(() => calcularEstadosConsenso(reportes), [reportes])
  const clusters        = useMemo(() => detectarClusters(reportes, estadosConsenso), [reportes, estadosConsenso])

  const countSospechosos = reportes.filter(r => (estadosConsenso.get(r.id) ?? 'sospechoso') === 'sospechoso').length
  const countPreventivos = reportes.filter(r => estadosConsenso.get(r.id) === 'alerta_preventiva').length
  const countConfirmados = reportes.filter(r => estadosConsenso.get(r.id) === 'confirmado').length

  // ── Datos de prueba ────────────────────────────────────────────────────────
  const handleSeed = async () => {
    setSeeding(true)
    try {
      const col = collection(db, 'reportes')
      for (let i = 0; i < SEED_REPORTES.length; i++) {
        const fecha = new Date()
        fecha.setDate(fecha.getDate() - i)
        await addDoc(col, {
          ...SEED_REPORTES[i],
          uid_reportador: 'seed',
          precision_m: 10,
          descripcion: '',
          fecha: Timestamp.fromDate(fecha),
        })
      }
      setSeedDone(true)
    } catch (e) { console.error(e) }
    setSeeding(false)
  }

  useEffect(() => {
    const q = query(collection(db, 'reportes'), orderBy('fecha', 'desc'))
    return onSnapshot(q, snap => setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [])

  const filtrados = filtro ? reportes.filter(r => r.nivel === filtro) : reportes
  const counts = {
    total: reportes.length,
    alto:  reportes.filter(r => r.nivel === 'alto').length,
    medio: reportes.filter(r => r.nivel === 'medio').length,
    bajo:  reportes.filter(r => r.nivel === 'bajo').length,
  }

  return (
    <div className="flex h-screen bg-[#0d1117] text-white overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Todos los Reportes</h2>
            <p className="text-[#8b949e] text-sm">Avistamientos registrados desde campo. Solo un profesional puede confirmar una plaga.</p>
          </div>
          {!seedDone ? (
            <button onClick={handleSeed} disabled={seeding}
              className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-[#8b949e] hover:text-white text-xs rounded-lg transition-colors disabled:opacity-50">
              {seeding ? '⏳ Cargando...' : '🧪 Cargar datos de prueba'}
            </button>
          ) : (
            <span className="text-green-400 text-xs flex items-center gap-1">✓ Datos cargados</span>
          )}
        </div>

        {/* Focos activos */}
        {clusters.length > 0 && (
          <div className="mb-6 bg-[#161b22] border border-orange-500/30 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              🔬 Focos Detectados por Consenso Espacio-Temporal
              <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">
                {clusters.length}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {clusters.slice(0, 4).map((c, i) => (
                <div key={i} className={`rounded-lg p-3 border text-xs ${
                  c.estado === 'confirmado'
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-orange-500/10 border-orange-500/30'
                }`}>
                  <p className={`font-semibold ${c.estado === 'confirmado' ? 'text-red-400' : 'text-orange-400'}`}>
                    {c.estado === 'confirmado' ? '🔴' : '🟠'} {c.plaga}
                  </p>
                  <p className="text-[#8b949e] mt-1">{c.cantidad} reportes · radio {CONSENSUS_CONFIG.radioKm} km</p>
                  <p className="text-[#484f58]">{ESTADO_LABEL[c.estado]}</p>
                </div>
              ))}
            </div>
            <p className="text-[#484f58] text-xs mt-2 pt-2 border-t border-[#21262d]">
              La confirmación definitiva requiere validación de un profesional agrónomo.
            </p>
          </div>
        )}

        {/* KPIs de nivel */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total',       value: counts.total, color: 'text-white' },
            { label: 'Alto riesgo', value: counts.alto,  color: 'text-red-400' },
            { label: 'Medio',       value: counts.medio, color: 'text-yellow-400' },
            { label: 'Bajo',        value: counts.bajo,  color: 'text-green-400' },
          ].map(c => (
            <div key={c.label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-[#8b949e] text-xs mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        {/* KPIs de consenso */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
            <p className="text-2xl font-bold text-yellow-400">{countSospechosos}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">🟡 Sospechosos</p>
          </div>
          <div className="bg-[#161b22] border border-orange-500/30 rounded-xl p-4">
            <p className="text-2xl font-bold text-orange-400">{countPreventivos}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">🟠 Alerta Preventiva</p>
          </div>
          <div className="bg-[#161b22] border border-red-500/30 rounded-xl p-4">
            <p className="text-2xl font-bold text-red-400">{countConfirmados}</p>
            <p className="text-[#8b949e] text-xs mt-0.5">🔴 Confirmados por Profesional</p>
          </div>
        </div>

        {/* Filtro */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[#8b949e] text-sm">Filtrar:</span>
          {['', 'alto', 'medio', 'bajo'].map(n => (
            <button key={n} onClick={() => setFiltro(n)}
              className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors border ${
                filtro === n
                  ? 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/40'
                  : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
              }`}>
              {n === '' ? 'Todos' : n}
            </button>
          ))}
        </div>

        {/* Tabla */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d] text-[#8b949e] text-xs">
                <th className="text-left px-4 py-3">Plaga / Organismo</th>
                <th className="text-left px-4 py-3">Finca</th>
                <th className="text-left px-4 py-3">Veredicto NDE</th>
                <th className="text-left px-4 py-3">Incidencia</th>
                <th className="text-left px-4 py-3">Reportado por</th>
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">Foto</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-left px-4 py-3">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[#484f58] py-10">
                    No hay reportes registrados.
                  </td>
                </tr>
              )}
              {filtrados.map(r => {
                const archivado = r.estado === 'archivado'
                const enCurso   = archivando.has(r.id)
                const ev        = estadosConsenso.get(r.id) ?? 'sospechoso'
                const enVal     = validando.has(r.id)
                const ecoEstado = r.mip?.evaluacionEconomica?.estadoEconomico
                const incPct    = r.mip?.incidencia_pct
                const nde       = r.mip?.evaluacionEconomica?.nde
                return (
                  <tr key={r.id}
                    className={`border-b border-[#21262d] hover:bg-[#1c2128] transition-colors ${archivado ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="text-[#c9d1d9] font-medium text-sm">{r.plaga}</p>
                      {r.mip?.tipoOrganismo && (
                        <p className="text-[#484f58] text-[10px] mt-0.5">{r.mip.tipoOrganismo} · {r.mip.cultivo ?? '—'}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#8b949e] text-sm">{r.finca}</td>
                    <td className="px-4 py-3">
                      {ecoEstado ? (
                        <span className={`px-2 py-1 rounded text-[10px] font-semibold ${
                          ecoEstado === 'plaga'      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : ecoEstado === 'vigilancia' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-green-500/20 text-green-400 border border-green-500/30'
                        }`}>
                          {ecoEstado === 'plaga' ? '🔴 Plaga' : ecoEstado === 'vigilancia' ? '🟡 Vigilancia' : '🟢 Bajo umbral'}
                        </span>
                      ) : (
                        <span className="text-[#484f58] text-xs">Sin NDE</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {incPct != null ? (
                        <div>
                          <span className={`text-sm font-bold ${incPct >= (nde ?? 100) ? 'text-red-400' : incPct >= (nde ?? 100) * 0.75 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {incPct}%
                          </span>
                          {nde != null && (
                            <p className="text-[#484f58] text-[10px]">NDE: {nde}%</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#484f58] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#8b949e] text-xs truncate max-w-[130px]">
                      {r.email_reportador}
                    </td>
                    <td className="px-4 py-3 text-[#484f58] text-xs">
                      {r.fecha?.toDate?.()?.toLocaleDateString('es-CO') ?? '—'}
                    </td>

                    {/* Miniatura foto */}
                    <td className="px-4 py-3">
                      {(() => {
                        const src = r.imagenesBase64?.[0] ?? r.imagenBase64 ?? null
                        const total = r.imagenesBase64?.length ?? (r.imagenBase64 ? 1 : 0)
                        return src ? (
                          <button onClick={() => setDetalleReporte(r)} title="Ver fotos" className="relative">
                            <img src={src} alt="foto"
                              className="w-10 h-10 object-cover rounded-lg border border-[#30363d] hover:border-[#10b981] transition-colors" />
                            {total > 1 && (
                              <span className="absolute -top-1 -right-1 bg-[#10b981] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                {total}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span className="text-[#484f58] text-xs">—</span>
                        )
                      })()}
                    </td>

                    {/* Validación */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium" style={{ color: ESTADO_COLOR[ev] }}>
                        {{
                          sospechoso:        '🟡',
                          alerta_preventiva: '🟠',
                          confirmado:        '🔴',
                          descartado:        '⬛',
                        }[ev] ?? '●'}{' '}
                        {ESTADO_LABEL[ev]?.replace(/^[^ ]+ /, '') ?? ev}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* Ver detalle */}
                        <button onClick={() => setDetalleReporte(r)}
                          className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:border-[#10b981]/40 hover:text-[#10b981] transition-colors">
                          👁 Ver
                        </button>

                        {/* Archivar */}
                        <button onClick={() => toggleArchivo(r)} disabled={enCurso}
                          title={archivado ? 'Restaurar' : 'Archivar'}
                          className={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                            archivado
                              ? 'border-[#10b981]/40 text-[#10b981] hover:bg-[#10b981]/10'
                              : 'border-[#30363d] text-[#484f58] hover:border-red-500/40 hover:text-red-400'
                          }`}>
                          {enCurso ? '⏳' : archivado ? '↩' : '📦'}
                        </button>

                        {/* Confirmar/Descartar rápido */}
                        {ev !== 'descartado' && ev !== 'confirmado' && (
                          <>
                            <button onClick={() => cambiarValidacion(r, 'confirmado')} disabled={enVal}
                              title="Confirmar como plaga real"
                              className="text-xs px-2 py-1 rounded border border-green-500/40 text-green-400 hover:bg-green-500/10 disabled:opacity-50">
                              {enVal ? '⏳' : '✅'}
                            </button>
                            <button onClick={() => cambiarValidacion(r, 'descartado')} disabled={enVal}
                              title="Descartar"
                              className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#484f58] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50">
                              ✕
                            </button>
                          </>
                        )}
                        {ev === 'confirmado' && (
                          <button onClick={() => cambiarValidacion(r, 'sospechoso')} disabled={enVal}
                            className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#484f58] hover:text-yellow-400 hover:border-yellow-500/40 disabled:opacity-50">
                            ↩
                          </button>
                        )}
                        {ev === 'descartado' && (
                          <button onClick={() => cambiarValidacion(r, 'sospechoso')} disabled={enVal}
                            className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58] disabled:opacity-50">
                            ↩
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal de detalle */}
      {detalleReporte && (
        <ModalDetalle
          reporte={detalleReporte}
          estadoConsenso={estadosConsenso.get(detalleReporte.id)}
          onClose={() => setDetalleReporte(null)}
          validando={validando.has(detalleReporte.id)}
          onConfirmar={() => cambiarValidacion(detalleReporte, 'confirmado')}
          onDescartar={() => cambiarValidacion(detalleReporte, 'descartado')}
          onRevertir={() => cambiarValidacion(detalleReporte, 'sospechoso')}
        />
      )}
    </div>
  )
}
