/**
 * Whisper transcription helper.
 *
 * Recebe áudio em base64 (do MediaRecorder do navegador) e devolve transcrição
 * em português via OpenAI Whisper.
 *
 * Custo: $0.006 por minuto. Áudio típico de comando (5-15s) custa ~R$ 0,005.
 */

import OpenAI from 'openai'
import { toFile } from 'openai/uploads'

export type TranscribeResult =
  | { ok: true;  text: string; durationSeconds: number; costMicrosUsd: number }
  | { ok: false; error: string }

const COST_MICROS_PER_SECOND = 100  // $0.006/min = 100 micros/s

const BIASED_PROMPT =
  'Comando de voz pra ERP: lançar despesa (motoboy, frete, combustível, limpeza, escritório, manutenção, anúncios, brindes, lanche, prejuízo, multa), ' +
  'dar entrada em produto no estoque (iPhone, Xiaomi, Samsung, capinha, película, bateria, fone, carregador), ' +
  'fazer balanço de estoque. Valores em reais, formas de pagamento: dinheiro, pix, cartão.'

export async function transcribeAudio(
  base64: string,
  mimetype: string,
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY não configurada no servidor' }

  try {
    const buffer = Buffer.from(base64, 'base64')

    const ext =
      mimetype.includes('ogg')   ? 'ogg' :
      mimetype.includes('mp4')   ? 'mp4' :
      mimetype.includes('mpeg')  ? 'mp3' :
      mimetype.includes('webm')  ? 'webm' :
      mimetype.includes('wav')   ? 'wav' :
                                   'webm'

    const file = await toFile(buffer, `audio.${ext}`, { type: mimetype })

    const openai = new OpenAI({ apiKey })
    const startedAt = Date.now()
    const result = await openai.audio.transcriptions.create({
      file,
      model:           'whisper-1',
      language:        'pt',
      response_format: 'verbose_json',
      prompt:          BIASED_PROMPT,
    })
    const elapsedMs = Date.now() - startedAt

    const dur = (result as unknown as { duration?: number }).duration
    const durationSeconds = typeof dur === 'number' ? dur : Math.max(1, Math.round(elapsedMs / 1000))
    const text = (result as unknown as { text: string }).text ?? ''

    return {
      ok:               true,
      text:             text.trim(),
      durationSeconds,
      costMicrosUsd:    Math.round(durationSeconds * COST_MICROS_PER_SECOND),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro desconhecido'
    console.error('[whisper] failed:', msg, e)
    return { ok: false, error: msg }
  }
}
