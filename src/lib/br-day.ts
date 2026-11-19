// Dias no fuso de Brasília (UTC-3, sem horário de verão). O servidor roda em
// UTC, então "hoje"/"ontem" precisam ser calculados aqui, não com new Date().

/** YYYY-MM-DD de hoje (offsetDays=0), ontem (1)... em Brasília. */
export function brYmd(offsetDays = 0): string {
  return new Date(Date.now() - 3 * 3600_000 - offsetDays * 86400_000).toISOString().slice(0, 10)
}

/** Início e fim (inclusive) de um dia em Brasília: 0 = hoje, 1 = ontem. */
export function brDayRange(offsetDays = 0): { start: Date; end: Date; ymd: string } {
  const ymd = brYmd(offsetDays)
  return {
    ymd,
    start: new Date(`${ymd}T00:00:00-03:00`),
    end:   new Date(`${ymd}T23:59:59.999-03:00`),
  }
}
