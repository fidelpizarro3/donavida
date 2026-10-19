// TAREA-8: qué donantes le sirven a una necesidad según su grupo y factor.
//
// Reglas estándar de compatibilidad ABO/Rh (falta citar la norma que elija el equipo):
//   - Glóbulos rojos: el donante no puede tener un antígeno que el paciente no tenga.
//     O dona a todos, A a A y AB, B a B y AB, AB solo a AB.
//   - Sangre entera y plaquetas: llevan plasma, así que se pide el MISMO grupo ABO (lo más simple y seguro).
//   - Factor Rh (para todos los componentes): un paciente negativo solo recibe negativo;
//     un paciente positivo recibe positivo o negativo.

// Para cada grupo del PACIENTE, qué grupos de DONANTE sirven en glóbulos rojos
const GRUPOS_QUE_LE_DONAN = {
  O: ['O'],
  A: ['A', 'O'],
  B: ['B', 'O'],
  AB: ['AB', 'A', 'B', 'O'],
};

// Lista de { grupoSanguineo, factorRh } de donantes que sirven. El primero siempre es el grupo exacto.
function gruposCompatibles({ grupoSanguineo, factorRh, componente }) {
  const grupos = componente === 'globulos_rojos' ? GRUPOS_QUE_LE_DONAN[grupoSanguineo] : [grupoSanguineo];
  const factores = factorRh === 'negativo' ? ['negativo'] : ['positivo', 'negativo'];

  const resultado = [];
  for (const grupo of grupos) {
    for (const factor of factores) {
      resultado.push({ grupoSanguineo: grupo, factorRh: factor });
    }
  }
  return resultado;
}

// true si el donante tiene exactamente el mismo grupo y factor que pide la necesidad
function esGrupoExacto(donante, necesidad) {
  return donante.grupoSanguineo === necesidad.grupoSanguineo && donante.factorRh === necesidad.factorRh;
}

module.exports = { gruposCompatibles, esGrupoExacto };
