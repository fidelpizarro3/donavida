import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function App() {
  const [estadoApi, setEstadoApi] = useState('verificando...')

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setEstadoApi(data.ok ? 'conectada' : 'respondió con error'))
      .catch(() => setEstadoApi(`sin conexión (¿está levantada en ${API_URL}?)`))
  }, [])

  return (
    <main>
      <h1>DonaVida</h1>
      <p>API: {estadoApi}</p>
    </main>
  )
}

export default App
