// TAREA-19: el informe para presentar fuera del sistema, como CSV que se abre en Excel.
// Va separado con ";" y con BOM al principio: así el Excel en español respeta las columnas y las tildes.
import { grupoConFactor } from '../necesidades/textos'

const FORMAS = {
  donantes: 'Con donantes', transferencia: 'Con transferencia', ambas: 'Con donantes y transferencia', sinRegistrar: 'Sin registrar',
}

function armarFilas(datos) {
  const { necesidades: n, donantes: d, tiempoHastaCubrir: t } = datos
  const grupo = datos.filtros.grupoSanguineo ? grupoConFactor(datos.filtros.grupoSanguineo, datos.filtros.factorRh) : 'Todos'
  const filas = [
    ['Informe de convocatorias y donaciones - DonaVida'],
    ['Alcance', datos.alcance === 'red' ? 'Toda la red' : 'Mi institución'],
    ['Período', `${datos.periodo.desde} a ${datos.periodo.hasta}`],
    ['Grupo sanguíneo', grupo],
    [],
    ['Necesidades', 'Cantidad'],
    ['Publicadas', n.publicadas],
    ['Cubiertas', n.cubiertas],
    ['Porcentaje cubiertas', n.porcentajeCubiertas === null ? '-' : `${n.porcentajeCubiertas}%`],
    ['Vencieron sin cubrirse', n.vencidasSinCubrir],
    ['Cerradas a mano', n.cerradasAMano],
    ['Abiertas', n.abiertas],
    [],
    ['Tiempo hasta cubrir', 'Horas'],
    ['Promedio', t ? t.horasPromedio : '-'],
    ['La más rápida', t ? t.horasMinimo : '-'],
    ['La más lenta', t ? t.horasMaximo : '-'],
    [],
    ['Cómo se cubrieron', 'Cantidad'],
    ...Object.entries(FORMAS).map(([clave, texto]) => [texto, datos.cubiertasCon[clave]]),
    [],
    ['Donantes', 'Cantidad'],
    ['Convocados', d.convocados],
    ['Respondieron', d.respondieron],
    ['Aceptaron', d.aceptaron],
    ['Fueron al turno', d.fueronAlTurno],
    ['Faltaron al turno', d.faltaronAlTurno],
    [],
    ['Unidades vencidas por grupo', 'Cantidad'],
    ...datos.unidadesVencidas.porGrupo.map((g) => [grupoConFactor(g.grupoSanguineo, g.factorRh), g.cantidad]),
    ['Total', datos.unidadesVencidas.total],
    [],
    ['Mes', 'Publicadas', 'Cubiertas', 'Unidades vencidas'],
    ...datos.porMes.map((m) => [m.mes, m.publicadas, m.cubiertas, m.vencidas]),
  ]
  return filas
}

// Un valor con ";" o comillas va entre comillas, como pide el formato CSV
const celda = (valor) => {
  const texto = String(valor ?? '')
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function descargarCsv(datos) {
  const csv = armarFilas(datos).map((fila) => fila.map(celda).join(';')).join('\r\n')
  const archivo = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(archivo)
  enlace.download = `donavida-estadisticas-${datos.periodo.desde}-a-${datos.periodo.hasta}.csv`
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}
