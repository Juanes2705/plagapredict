/**
 * plagasEconomia.js
 *
 * Lógica de evaluación económica de plagas según metodología MIP / ICA Colombia.
 *
 * Implementa la fórmula estándar del Nivel de Daño Económico (NDE):
 *   NDE (% incidencia) = C / (V_ha × D_factor × K) × 100
 *
 * Referencias:
 *   - ICA Colombia – Resolución 3593 de 2015 (lista plagas reglamentadas)
 *   - CIMMYT / ICA – Niveles Económicos de Decisión en MIP
 *   - Pedigo et al. (1986) – Economic Injury Levels in Theory and Practice
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. CLASIFICACIÓN ICA (Resolución 3593 de 2015 y modificaciones)
//    Fuente: https://www.ica.gov.co/areas/agricola/servicios/epidemiologia-agricola/plagas-reglamentadas
// ─────────────────────────────────────────────────────────────────────────────

export const CLASIFICACION_ICA = {
  // Plagas Cuarentenarias Presentes en Colombia (bajo control oficial)
  'Spodoptera frugiperda':       'cuarentenaria_presente',   // Gusano cogollero
  'Liriomyza huidobrensis':      'cuarentenaria_presente',   // Minador de hojas

  // Plagas No Cuarentenarias Reglamentadas (PNCR) – afectan comercio internacional
  'Hypothenemus hampei':         'no_cuarentenaria_reglamentada',  // Broca del café
  'Bemisia tabaci':              'no_cuarentenaria_reglamentada',  // Mosca blanca
  'Frankliniella occidentalis':  'no_cuarentenaria_reglamentada',  // Trips occidental
  'Anastrepha obliqua':          'no_cuarentenaria_reglamentada',  // Mosca de la fruta
  'Cosmopolites sordidus':       'no_cuarentenaria_reglamentada',  // Picudo del plátano
  'Tetranychus urticae':         'no_cuarentenaria_reglamentada',  // Ácaro rojo

  // Plagas de importancia económica local
  'Diatraea saccharalis':        'importancia_economica_local',  // Barrenador caña
  'Atta cephalotes':             'importancia_economica_local',  // Hormiga arriera
  'Phyllophaga spp.':            'importancia_economica_local',  // Chisa
  'Leptopharsa gibbicarina':     'importancia_economica_local',  // Chinche aguacate
  'Sitotroga cerealella':        'importancia_economica_local',  // Palomilla
}

export const CLASIFICACION_LABEL = {
  cuarentenaria_ausente:          '🚫 Cuarentenaria Ausente — notificar ICA inmediatamente',
  cuarentenaria_presente:         '⚠️ Cuarentenaria Presente — bajo control oficial ICA',
  no_cuarentenaria_reglamentada:  '📋 No Cuarentenaria Reglamentada — restricciones de comercio',
  importancia_economica_local:    '📍 Importancia Económica Local',
  desconocida:                    '❓ No clasificada en lista ICA',
}

export const CLASIFICACION_COLOR = {
  cuarentenaria_ausente:          '#a855f7',  // purple
  cuarentenaria_presente:         '#ef4444',  // red
  no_cuarentenaria_reglamentada:  '#f97316',  // orange
  importancia_economica_local:    '#f59e0b',  // yellow
  desconocida:                    '#6b7280',  // gray
}

/**
 * Busca la clasificación ICA de una plaga por su nombre científico o común.
 * @param {string} nombreCientifico
 * @param {string} nombreComun
 * @returns {string} clave de clasificación
 */
export function obtenerClasificacionICA(nombreCientifico, nombreComun) {
  if (nombreCientifico) {
    // Búsqueda exacta
    if (CLASIFICACION_ICA[nombreCientifico]) return CLASIFICACION_ICA[nombreCientifico]
    // Búsqueda parcial (ej: "Phyllophaga spp." vs "Phyllophaga sp.")
    const key = Object.keys(CLASIFICACION_ICA).find(k =>
      nombreCientifico.toLowerCase().includes(k.split(' ')[0].toLowerCase())
    )
    if (key) return CLASIFICACION_ICA[key]
  }
  return 'desconocida'
}

/** Determina si una clasificación requiere alerta cuarentenaria inmediata */
export function esCuarentenaria(clasificacion) {
  return clasificacion === 'cuarentenaria_ausente' || clasificacion === 'cuarentenaria_presente'
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARÁMETROS ECONÓMICOS TÍPICOS POR CULTIVO
//    Valores orientativos para Valle del Cauca (Colombia, 2024-2025)
//    Fuente: Agronet DANE, Fedecafé, Cenicaña, AUGURA, ICA
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULTS_ECONOMICOS = {
  'Caña de azúcar': {
    costoControlHa:   180_000,   // $ COP por ha (producto + aplicación + mano de obra)
    precioKg:         110,       // $ COP por kg en campo
    rendimientoTha:   80,        // toneladas/ha promedio
    eficienciaControl: 0.80,     // proporción de reducción de daño lograda
    unidadRendimiento: 't/ha',
  },
  'Café': {
    costoControlHa:   250_000,
    precioKg:         3_000,
    rendimientoTha:   1.2,
    eficienciaControl: 0.85,
    unidadRendimiento: 't/ha (café pergamino)',
  },
  'Maíz': {
    costoControlHa:   140_000,
    precioKg:         850,
    rendimientoTha:   4.5,
    eficienciaControl: 0.75,
    unidadRendimiento: 't/ha',
  },
  'Plátano / Banano': {
    costoControlHa:   200_000,
    precioKg:         600,
    rendimientoTha:   14,
    eficienciaControl: 0.80,
    unidadRendimiento: 't/ha',
  },
  'Soya': {
    costoControlHa:   160_000,
    precioKg:         1_400,
    rendimientoTha:   2.5,
    eficienciaControl: 0.75,
    unidadRendimiento: 't/ha',
  },
  'Fríjol': {
    costoControlHa:   130_000,
    precioKg:         3_500,
    rendimientoTha:   1.2,
    eficienciaControl: 0.75,
    unidadRendimiento: 't/ha',
  },
  'Tomate': {
    costoControlHa:   300_000,
    precioKg:         900,
    rendimientoTha:   45,
    eficienciaControl: 0.85,
    unidadRendimiento: 't/ha',
  },
  'Pimentón': {
    costoControlHa:   280_000,
    precioKg:         2_000,
    rendimientoTha:   20,
    eficienciaControl: 0.80,
    unidadRendimiento: 't/ha',
  },
  'Aguacate': {
    costoControlHa:   220_000,
    precioKg:         2_200,
    rendimientoTha:   10,
    eficienciaControl: 0.75,
    unidadRendimiento: 't/ha',
  },
  'Mango': {
    costoControlHa:   180_000,
    precioKg:         800,
    rendimientoTha:   12,
    eficienciaControl: 0.75,
    unidadRendimiento: 't/ha',
  },
  'Cítricos (naranja, limón, mandarina)': {
    costoControlHa:   190_000,
    precioKg:         700,
    rendimientoTha:   18,
    eficienciaControl: 0.75,
    unidadRendimiento: 't/ha',
  },
  'Arroz': {
    costoControlHa:   150_000,
    precioKg:         1_100,
    rendimientoTha:   5.5,
    eficienciaControl: 0.80,
    unidadRendimiento: 't/ha',
  },
  'Papa': {
    costoControlHa:   260_000,
    precioKg:         1_000,
    rendimientoTha:   22,
    eficienciaControl: 0.80,
    unidadRendimiento: 't/ha',
  },
  'Flores (rosas, crisantemo, clavel)': {
    costoControlHa:   400_000,
    precioKg:         4_500,
    rendimientoTha:   8,
    eficienciaControl: 0.85,
    unidadRendimiento: 't/ha (tallo equivalente)',
  },
}

/**
 * Retorna los parámetros económicos por defecto para un cultivo.
 * Si no está en el catálogo, retorna valores conservadores genéricos.
 */
export function getDefaultsEconomicos(cultivo) {
  return DEFAULTS_ECONOMICOS[cultivo] ?? {
    costoControlHa:    180_000,
    precioKg:          1_500,
    rendimientoTha:    5,
    eficienciaControl: 0.75,
    unidadRendimiento: 't/ha',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FACTOR DE DAÑO POR SEVERIDAD
//    Daño como fracción del valor de la cosecha por cada 1% de incidencia.
//    Fuente: Pedigo et al. (1986) adaptado a cultivos tropicales colombianos.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factor D (daño por 1% de incidencia como fracción del valor de la cosecha)
 * según escala de severidad 1-4.
 *
 * Interpretación: a 100% de incidencia con sev=4, se pierde el 100% del valor.
 *   Sev 1 →  <10% tejido afectado/planta → pérdida total posible ~10%
 *   Sev 2 → 10-30% tejido afectado/planta → pérdida total posible ~35%
 *   Sev 3 → 30-60% tejido afectado/planta → pérdida total posible ~65%
 *   Sev 4 →  >60% tejido afectado/planta → pérdida total posible ~100%
 */
export const D_FACTOR_POR_SEVERIDAD = {
  1: 0.001,   // 0.1% de V_ha perdido por cada 1% de incidencia
  2: 0.0035,  // 0.35% de V_ha perdido por cada 1% de incidencia
  3: 0.0065,  // 0.65% de V_ha perdido por cada 1% de incidencia
  4: 0.010,   // 1.0% de V_ha perdido por cada 1% de incidencia
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CÁLCULO NDE Y UMBRAL ECONÓMICO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula el Nivel de Daño Económico (NDE) en % de incidencia.
 *
 * Fórmula: NDE = C / (V_ha × D_factor × K)
 * Donde:
 *   C       = Costo del control por hectárea ($ COP/ha)
 *   V_ha    = Valor de la cosecha por hectárea ($ COP/ha) = precioKg × rendKgHa
 *   D_factor= Fracción del valor perdida por 1% de incidencia (según severidad)
 *   K       = Eficiencia del control (0-1)
 *
 * @returns {number|null} NDE en % de incidencia, o null si los datos son insuficientes
 */
export function calcularNDE({ costoControlHa, precioKg, rendimientoTha, eficienciaControl, severidad }) {
  const V_ha = precioKg * rendimientoTha * 1000  // kg por tonelada
  const D    = D_FACTOR_POR_SEVERIDAD[severidad] ?? D_FACTOR_POR_SEVERIDAD[2]
  const K    = eficienciaControl

  if (!costoControlHa || !V_ha || !D || !K) return null

  const nde = (costoControlHa / (V_ha * D * K)) * 100
  return Math.round(nde * 10) / 10  // 1 decimal
}

/**
 * Umbral de Acción (UA) o Umbral Económico (UE).
 * Convención MIP: actuar al 75% del NDE como margen de seguridad.
 */
export function calcularUmbralAccion(nde) {
  if (nde == null) return null
  return Math.round(nde * 0.75 * 10) / 10
}

/**
 * Calcula la pérdida económica estimada en $/ha si no se toma acción.
 */
export function calcularPerdidaEstimada({ precioKg, rendimientoTha, incidencia_pct, severidad }) {
  const V_ha   = precioKg * rendimientoTha * 1000
  const D      = D_FACTOR_POR_SEVERIDAD[severidad] ?? D_FACTOR_POR_SEVERIDAD[2]
  const perdida = V_ha * (incidencia_pct * D)
  return Math.round(perdida)
}

/**
 * Determina si la incidencia actual supera el umbral de acción (= es plaga económica).
 * @returns {'plaga' | 'vigilancia' | 'bajo_umbral'}
 */
export function evaluarEstadoEconomico(incidencia_pct, nde, umbralAccion) {
  if (nde == null || umbralAccion == null) return null
  if (incidencia_pct >= nde)           return 'plaga'         // supera NDE
  if (incidencia_pct >= umbralAccion)  return 'vigilancia'    // en zona de alerta
  return 'bajo_umbral'
}

/**
 * Formatea un valor en pesos COP de forma legible.
 */
export function formatPesos(valor) {
  if (valor == null) return '—'
  if (valor >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1)}M`
  if (valor >= 1_000)     return `$${Math.round(valor / 1_000)}k`
  return `$${valor}`
}

/**
 * Calcula el ratio beneficio/costo (B/C) de la intervención.
 * B/C > 1 → la intervención se justifica económicamente.
 */
export function calcularRatioBeneficioCosto(perdidaEstimada, costoControlHa, eficienciaControl) {
  if (!costoControlHa || !perdidaEstimada) return null
  const beneficio = perdidaEstimada * eficienciaControl
  const ratio     = beneficio / costoControlHa
  return Math.round(ratio * 10) / 10
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ESTADIOS BIOLÓGICOS
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADIOS_BIOLOGICOS = [
  { valor: 'huevo',    label: 'Huevo',           desc: 'Masa de huevos visible en planta' },
  { valor: 'larva',    label: 'Larva / Oruga',   desc: 'Estado larval (insectos con metamorfosis)' },
  { valor: 'ninfa',    label: 'Ninfa',            desc: 'Estado juvenil (insectos sin metamorfosis: áfidos, trips, chinches)' },
  { valor: 'pupa',     label: 'Pupa / Crisálida', desc: 'Estado de reposo entre larva y adulto' },
  { valor: 'adulto',   label: 'Adulto',           desc: 'Organismo completamente desarrollado' },
  { valor: 'micelio',  label: 'Micelio / Espora', desc: 'Estructuras de hongos o oomicetos visibles' },
  { valor: 'mixto',    label: 'Varios estadios',  desc: 'Se observan múltiples estadios simultáneamente' },
]

// ─────────────────────────────────────────────────────────────────────────────
// 6. DISTRIBUCIÓN ESPACIAL EN EL LOTE
// ─────────────────────────────────────────────────────────────────────────────

export const DISTRIBUCIONES_ESPACIALES = [
  {
    valor: 'foco',
    label: 'Foco definido',
    desc: 'La plaga está concentrada en una zona específica del lote. Permite intervención localizada.',
    recomendacion: 'Aplicar control focalizado. Delimitar y monitorear borde del foco.',
    icono: '🎯',
  },
  {
    valor: 'disperso',
    label: 'Disperso / Irregular',
    desc: 'La plaga se presenta en varios puntos sin patrón claro. Requiere monitoreo ampliado.',
    recomendacion: 'Monitoreo intensivo. Evaluar aplicación en todo el lote si supera umbral.',
    icono: '🔀',
  },
  {
    valor: 'uniforme',
    label: 'Uniforme / Generalizado',
    desc: 'La plaga está distribuida en todo el lote. Requiere intervención general.',
    recomendacion: 'Intervención en todo el lote. Evaluar causas sistémicas (suelo, variedad).',
    icono: '📊',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 7. FUNCIÓN RESUMEN: NDE COMPLETO
//    Devuelve todos los indicadores económicos calculados en un solo objeto.
// ─────────────────────────────────────────────────────────────────────────────

export function calcularResumenEconomico({
  costoControlHa,
  precioKg,
  rendimientoTha,
  eficienciaControl,
  severidad,
  incidencia_pct,
}) {
  const nde             = calcularNDE({ costoControlHa, precioKg, rendimientoTha, eficienciaControl, severidad })
  const umbralAccion    = calcularUmbralAccion(nde)
  const perdidaEstimada = calcularPerdidaEstimada({ precioKg, rendimientoTha, incidencia_pct, severidad })
  const estadoEconomico = evaluarEstadoEconomico(incidencia_pct, nde, umbralAccion)
  const V_ha            = precioKg * rendimientoTha * 1000
  const ratioBenefCosto = calcularRatioBeneficioCosto(perdidaEstimada, costoControlHa, eficienciaControl)

  return {
    nde,
    umbralAccion,
    perdidaEstimada,
    estadoEconomico,
    valorCosechaHa: Math.round(V_ha),
    ratioBenefCosto,
    // Texto de decisión
    decision: estadoEconomico === 'plaga'
      ? '🔴 SE CLASIFICA COMO PLAGA — Incidencia supera el NDE. Intervención económicamente justificada.'
      : estadoEconomico === 'vigilancia'
      ? '🟡 ZONA DE VIGILANCIA — Incidencia superó el Umbral de Acción. Preparar intervención antes de alcanzar el NDE.'
      : estadoEconomico === 'bajo_umbral'
      ? '🟢 POR DEBAJO DEL UMBRAL — No justifica acción de control. Continuar monitoreo.'
      : null,
  }
}
