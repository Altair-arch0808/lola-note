import { useEffect, useState } from 'react'

// Текущее время, обновляется раз в ms миллисекунд
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}
