import { useState, useEffect, useRef } from 'react'
import { leerQrDeArchivo, leerQrDeVideo } from './qr'
import { CODIGO_QR, normalizarCodigo } from './textos'

const NO_ES_DE_DONAVIDA = 'Ese QR no es de un carné de DonaVida.'
const CADA_MS = 200 // cada cuánto se mira el video buscando un QR

// Por qué no se pudo prender la cámara, en palabras
function problemaDeCamara(err) {
  if (err.name === 'NotAllowedError') return 'No diste permiso para usar la cámara. Podés habilitarla en el candado de la barra de direcciones.'
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'No encontramos una cámara en esta computadora.'
  if (err.name === 'NotReadableError') return 'La cámara la está usando otro programa. Cerralo y probá de nuevo.'
  return 'No se pudo prender la cámara.'
}

// TAREA-18: el lector del carné en la PC del hospital. Lee el QR de tres maneras:
//   - un lector de códigos USB o el teclado: el lector "escribe" el código y aprieta Enter en el campo
//   - pegando (Ctrl+V) una imagen del QR o eligiéndola de la computadora
//   - con la cámara de la computadora
// Con un código válido llama a onCodigo(codigo), que busca el turno. Si falla (QR vencido, de otra institución...)
// se muestra el motivo acá mismo
export function LectorQr({ onCodigo }) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [camara, setCamara] = useState(false) // la cámara está prendida
  const [pidiendoCamara, setPidiendoCamara] = useState(false) // esperando que el navegador dé permiso
  const campoRef = useRef(null)
  const archivoRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const flujoRef = useRef(null) // lo que manda la cámara (MediaStream), para poder apagarla
  const montadoRef = useRef(false)

  const apagarCamara = () => {
    flujoRef.current?.getTracks().forEach((pista) => pista.stop())
    flujoRef.current = null
    setCamara(false)
  }

  // Al abrir el lector el cursor queda en el campo: el lector USB escribe ahí y Ctrl+V pega la imagen.
  // Al cerrarlo se apaga la cámara
  useEffect(() => {
    montadoRef.current = true
    campoRef.current?.focus()
    return () => {
      montadoRef.current = false
      flujoRef.current?.getTracks().forEach((pista) => pista.stop())
      flujoRef.current = null
    }
  }, [])

  // Después de cada lectura el cursor vuelve al campo, listo para el próximo carné. Si falló, el texto queda
  // seleccionado: así la próxima lectura del lector USB lo reemplaza en vez de sumarse a lo que había
  const volverAlCampo = () => {
    campoRef.current?.focus()
    campoRef.current?.select()
  }

  const entregar = async (leido) => {
    const codigo = normalizarCodigo(leido)
    if (!codigo) return
    if (!CODIGO_QR.test(codigo)) {
      setError(NO_ES_DE_DONAVIDA)
      volverAlCampo()
      return
    }
    setError(null)
    setBuscando(true)
    try {
      await onCodigo(codigo)
      setTexto('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBuscando(false)
      volverAlCampo()
    }
  }

  // La cámara mira el video cada 200 ms; entregar cambia en cada dibujo, así que se usa siempre la última
  const entregarRef = useRef(entregar)
  useEffect(() => {
    entregarRef.current = entregar
  })

  useEffect(() => {
    if (!camara) return undefined
    const video = videoRef.current
    video.srcObject = flujoRef.current
    video.play().catch(() => {}) // si el navegador lo frena, el lector igual sigue intentando
    const intervalo = setInterval(() => {
      const leido = leerQrDeVideo(video, canvasRef.current)
      if (!leido) return
      if (!CODIGO_QR.test(normalizarCodigo(leido))) {
        setError(NO_ES_DE_DONAVIDA) // otro QR cualquiera: se sigue mirando
        return
      }
      clearInterval(intervalo)
      flujoRef.current?.getTracks().forEach((pista) => pista.stop())
      flujoRef.current = null
      setCamara(false)
      entregarRef.current(leido)
    }, CADA_MS)
    return () => clearInterval(intervalo)
  }, [camara])

  const prenderCamara = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no deja usar la cámara en esta página (hace falta abrir DonaVida con https).')
      return
    }
    setPidiendoCamara(true)
    try {
      // En una notebook queda la cámara de adelante; en un celular o tablet, la de atrás
      const flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      if (!montadoRef.current) {
        flujo.getTracks().forEach((pista) => pista.stop()) // cerraron el lector mientras se pedía permiso
        return
      }
      flujoRef.current = flujo
      setCamara(true)
    } catch (err) {
      if (montadoRef.current) setError(problemaDeCamara(err))
    } finally {
      if (montadoRef.current) setPidiendoCamara(false)
    }
  }

  const leerImagen = async (archivo) => {
    setError(null)
    try {
      const leido = await leerQrDeArchivo(archivo)
      if (leido) await entregar(leido)
      else setError('No encontramos un código QR en esa imagen.')
    } catch {
      setError('No se pudo abrir esa imagen.')
    }
  }

  // Ctrl+V: si lo que se pega es una imagen (una captura del QR), se lee el QR; si es texto, va al campo
  const pegar = (e) => {
    const imagen = [...(e.clipboardData?.items ?? [])].find((item) => item.type.startsWith('image/'))
    if (!imagen) return
    e.preventDefault()
    leerImagen(imagen.getAsFile())
  }

  const elegirArchivo = (e) => {
    const archivo = e.target.files[0]
    e.target.value = '' // así se puede volver a elegir la misma imagen
    if (archivo) leerImagen(archivo)
  }

  return (
    <div className="lector-qr" onPaste={pegar}>
      <form onSubmit={(e) => { e.preventDefault(); entregar(texto) }}>
        <label htmlFor="lector-qr-codigo">Escaneá el carné del donante</label>
        <div className="lector-qr-fila">
          <input
            id="lector-qr-codigo"
            ref={campoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Con el lector de códigos, o pegá el código o la imagen del QR"
            autoComplete="off"
            spellCheck={false}
            readOnly={buscando}
          />
          <button type="submit" className="btn btn-primary btn-chico" disabled={buscando}>
            {buscando ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </form>

      <div className="necesidad-acciones">
        <button
          type="button"
          className="btn btn-secondary btn-chico"
          onClick={camara ? apagarCamara : prenderCamara}
          disabled={buscando || pidiendoCamara}
        >
          {camara ? 'Apagar la cámara' : '📷 Usar la cámara'}
        </button>
        <button type="button" className="btn btn-secondary btn-chico" onClick={() => archivoRef.current.click()} disabled={buscando}>
          🖼️ Elegir una imagen
        </button>
        <input ref={archivoRef} type="file" accept="image/*" hidden onChange={elegirArchivo} />
      </div>

      {camara && (
        <div className="lector-qr-video">
          <video ref={videoRef} muted playsInline aria-label="Lo que ve la cámara" />
          <small className="texto-suave">Acercá el QR del carné a la cámara.</small>
        </div>
      )}
      <canvas ref={canvasRef} hidden />

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
    </div>
  )
}
