import { useState, useEffect } from 'react'
import { fechaLegible, grupoConFactor } from '../necesidades/textos'
import { fechaLarga, guardarSinConexion, leerSinConexion } from '../agenda/textos'
import { AvisoFlotante } from '../comunes/AvisoFlotante'
import { dibujarQr } from './qr'
import { agruparCodigo, claveCarne } from './textos'
import { compartirTarjeta, puedeCompartirImagenes } from './tarjetaCompartir'

// "2026-11-24T18:30:00Z" → "24/11 a las 15:30" (cuándo se guardó la copia sin conexión)
function cuandoSeGuardo(momento) {
  const fecha = new Date(momento)
  const dia = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${dia} a las ${hora}`
}

// Pide el carné a la API. Si no llega a conectarse (sin internet o la API caída) el error lo dice con "sinRed"
async function pedirCarne(apiUrl, token) {
  let res
  try {
    res = await fetch(`${apiUrl}/api/donantes/carne`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw Object.assign(new Error('Sin conexión'), { sinRed: true })
  }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.mensaje || 'No se pudo cargar tu carné')
  return data
}

// TAREA-18: "Mi carné". Nombre, grupo, cuántas veces donó, desde cuándo puede volver a donar y el QR de su
// próximo turno, que el hospital escanea. Se guarda en el navegador para verlo sin conexión (una copia por usuario).
// "actualizar" lo cambia el perfil cuando cambia el turno (reservó, reprogramó o canceló)
export function CarneDonante({ token, apiUrl, idUsuario, actualizar = 0 }) {
  const [carne, setCarne] = useState(null)
  const [sinConexion, setSinConexion] = useState(null) // { guardadoEn } si se muestra la copia guardada
  const [qr, setQr] = useState(null) // { codigo, url }: la imagen del QR del código que se está mostrando
  const [mensaje, setMensaje] = useState(null)
  const [problema, setProblema] = useState(null) // no se pudo copiar o compartir (el carné se sigue viendo)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let activo = true
    pedirCarne(apiUrl, token)
      .then((datos) => {
        if (!activo) return
        setCarne(datos)
        setSinConexion(null)
        setError(null)
        if (idUsuario) guardarSinConexion(claveCarne(idUsuario), datos)
      })
      .catch((err) => {
        if (!activo) return
        const sinRed = err.sinRed || !navigator.onLine
        // Criterio: el carné se ve sin conexión. Se usa la copia guardada solo si es de este mismo usuario
        const guardado = idUsuario ? leerSinConexion(claveCarne(idUsuario)) : null
        if (sinRed && guardado?.datos?.idUsuario === idUsuario) {
          setCarne(guardado.datos)
          setSinConexion(guardado)
        } else {
          setError(sinRed ? 'Estás sin conexión y todavía no hay un carné guardado en este dispositivo.' : err.message)
        }
      })
    return () => {
      activo = false
    }
  }, [apiUrl, token, idUsuario, actualizar])

  // El QR se dibuja en el navegador a partir del código del turno, así se ve también sin conexión
  const codigo = carne?.proximoTurno?.codigoQr
  useEffect(() => {
    if (!codigo) return undefined
    let activo = true
    dibujarQr(codigo)
      .then((url) => { if (activo) setQr({ codigo, url }) })
      .catch(() => { if (activo) setQr(null) })
    return () => {
      activo = false
    }
  }, [codigo])
  const urlQr = qr && qr.codigo === codigo ? qr.url : null

  const copiarCodigo = async () => {
    setProblema(null)
    try {
      await navigator.clipboard.writeText(codigo)
      setMensaje('Código copiado.')
    } catch {
      setProblema('No se pudo copiar: seleccioná el código y copialo a mano.')
    }
  }

  const compartir = async (soloDescargar) => {
    setOcupado(true)
    setProblema(null)
    try {
      const resultado = await compartirTarjeta(
        { nombre: carne.nombre, totalDonaciones: carne.totalDonaciones },
        { soloDescargar }
      )
      if (resultado === 'compartida') setMensaje('¡Gracias por compartir! Así más gente se suma a donar.')
      if (resultado === 'descargada') setMensaje('Descargamos la tarjeta con tus donaciones.')
    } catch {
      setProblema('No se pudo armar la tarjeta. Probá de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  if (error) {
    return <section className="card carne"><div className="alert alert-danger">{error}</div></section>
  }
  if (!carne) return null

  const { nombre, apellido, grupoSanguineo, factorRh, totalDonaciones, habilitado, aptoDesde, motivo, proximoTurno } = carne
  const compartirConMenu = puedeCompartirImagenes()

  return (
    <section className="card carne" aria-labelledby="titulo-carne">
      <AvisoFlotante mensaje={mensaje} onCerrar={() => setMensaje(null)} />

      <div className="carne-cabecera">
        <div>
          <span className="carne-marca">Carné de donante · DonaVida</span>
          <h3 id="titulo-carne">{nombre} {apellido}</h3>
        </div>
        <span className={`grupo-chip ${grupoSanguineo ? '' : 'grupo-chip-vacio'}`} title="Grupo sanguíneo">
          {grupoSanguineo ? grupoConFactor(grupoSanguineo, factorRh) : '?'}
        </span>
      </div>

      {sinConexion && (
        <div className="alert alert-warning">
          Estás sin conexión: te mostramos tu carné guardado el {cuandoSeGuardo(sinConexion.guardadoEn)}.
        </div>
      )}
      {problema && <div className="alert alert-danger">{problema}</div>}

      {/* Criterio: nombre, grupo, cantidad de donaciones y la fecha desde la que vuelve a estar habilitado */}
      <div className="carne-datos">
        <div className="carne-dato">
          <strong>{totalDonaciones}</strong>
          <span>{totalDonaciones === 1 ? 'donación' : 'donaciones'}</span>
        </div>
        <div className={`carne-dato ${habilitado ? 'carne-dato-ok' : ''}`}>
          {habilitado ? (
            <><strong>✓ Podés donar</strong><span>Te avisamos cuando un hospital cercano te necesite</span></>
          ) : aptoDesde ? (
            <><strong>Desde el {fechaLegible(aptoDesde)}</strong><span>podés volver a donar</span></>
          ) : (
            <><strong>Todavía no podés donar</strong><span>{motivo}</span></>
          )}
        </div>
      </div>
      {!grupoSanguineo && <p className="texto-suave">Tu grupo sanguíneo se confirma en tu primera donación.</p>}

      {/* Criterio: el QR es el del próximo turno (cambia en cada turno, así no sirve una captura vieja) */}
      {proximoTurno ? (
        <div className="carne-qr">
          {urlQr
            ? <img src={urlQr} alt="Código QR de tu turno" width="200" height="200" />
            : <div className="carne-qr-cargando" aria-hidden="true" />}
          <div className="carne-qr-datos">
            <strong>Mostrá este QR en el hospital</strong>
            <span className="texto-suave">Lo escanean y aparecen tu ficha y tu turno, sin buscarte a mano.</span>
            <span>🗓️ {fechaLarga(proximoTurno.fecha)}, de {proximoTurno.horaInicio} a {proximoTurno.horaFin}</span>
            {proximoTurno.institucion && <span>📍 {proximoTurno.institucion.nombre}</span>}
            <span className="carne-codigo-fila">
              <code className="carne-codigo">{agruparCodigo(codigo)}</code>
              <button type="button" className="btn-link" onClick={copiarCodigo}>Copiar código</button>
            </span>
          </div>
        </div>
      ) : (
        <p className="carne-sin-turno">Cuando reserves un turno, acá va a aparecer tu código QR para mostrar en el hospital.</p>
      )}

      {/* Criterio: compartir una tarjeta con la cantidad de donaciones (sin datos personales sensibles) */}
      {totalDonaciones > 0 && (
        <div className="necesidad-acciones">
          <button type="button" className="btn btn-secondary btn-chico" onClick={() => compartir(false)} disabled={ocupado}>
            {compartirConMenu ? 'Compartir mis donaciones' : 'Descargar la tarjeta de mis donaciones'}
          </button>
          {compartirConMenu && (
            <button type="button" className="btn-link" onClick={() => compartir(true)} disabled={ocupado}>
              Descargar la imagen
            </button>
          )}
        </div>
      )}
    </section>
  )
}
