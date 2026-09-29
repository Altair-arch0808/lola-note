import { WifiOff, RefreshCw } from 'lucide-react'
import { useSync } from './store'

// Показывается только когда есть что сказать: нет сети или записи ещё не отправлены
export default function SyncBadge() {
  const { online, pending, syncing } = useSync()
  if (online && !pending) return null
  const text = !online
    ? (pending ? `Без сети · ${pending} в очереди` : 'Без сети')
    : (syncing ? 'Отправляю…' : `Ждут отправки: ${pending}`)
  return (
    <span role="status" className="inline-flex items-center gap-1 rounded-full bg-cream border border-beige px-3 py-1 text-xs whitespace-nowrap">
      {online ? <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> : <WifiOff size={13} />} {text}
    </span>
  )
}
