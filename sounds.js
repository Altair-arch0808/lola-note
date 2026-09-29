/* Мелодии уведомлений. Играют, пока приложение открыто (Web Audio, файлов не нужно).
   Звук системного уведомления, когда приложение закрыто, браузер менять не даёт — он задаётся в настройках телефона. */
const AC = window.AudioContext || window.webkitAudioContext
let ctx

// [частота Гц, начало с, длительность с, тип волны, громкость, атака с]
const NOTES = {
  bell:   [[880, 0, 1.0, 'sine', 0.26, 0.005], [1318.5, 0.12, 1.2, 'sine', 0.18, 0.005]],
  soft:   [[523.25, 0, 0.9, 'sine', 0.22, 0.08]],
  double: [[740, 0, 0.14, 'triangle', 0.28, 0.01], [740, 0.2, 0.14, 'triangle', 0.28, 0.01]],
  rise:   [[523.25, 0, 0.28, 'sine', 0.24, 0.01], [659.25, 0.16, 0.28, 'sine', 0.24, 0.01], [783.99, 0.32, 0.6, 'sine', 0.24, 0.01]],
  alarm:  [[988, 0, 0.12, 'square', 0.09, 0.005], [988, 0.2, 0.12, 'square', 0.09, 0.005], [988, 0.4, 0.12, 'square', 0.09, 0.005]]
}

function getCtx() {
  if (!AC) return null
  if (!ctx) { try { ctx = new AC() } catch { return null } }
  return ctx
}
// Браузеры разрешают звук только после касания — «будим» звук при первом нажатии где угодно в приложении
export function unlockAudio() { const c = getCtx(); if (c && c.state === 'suspended') c.resume().catch(() => {}) }
;['pointerdown', 'keydown', 'touchend'].forEach(ev => window.addEventListener(ev, unlockAudio, { passive: true }))

export function playSound(id) {
  const notes = NOTES[id]
  const c = notes && getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  const t0 = c.currentTime + 0.03
  for (const [f, at, dur, type, vol, atk] of notes) {
    const o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t0 + at)
    g.gain.linearRampToValueAtTime(vol, t0 + at + atk)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur)
    o.connect(g); g.connect(c.destination)
    o.start(t0 + at); o.stop(t0 + at + dur + 0.05)
  }
}
export const buzz = pattern => { try { if (pattern?.length) navigator.vibrate?.(pattern) } catch { /* не поддерживается */ } }
