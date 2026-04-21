import { GoogleGenAI, Type } from "@google/genai";
import { MODUS_OPERANDI_CATEGORIES } from "./modusOperandi";

const GEMINI_MODEL = "gemini-3-flash-preview"; 
// Service Version: 2.0.0 - Cache Buster

// Simple request queue to handle rate limits (429)
class RequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 2000; // 2 seconds between requests to stay safe

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const waitTime = Math.max(0, this.minInterval - (now - this.lastRequestTime));
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const fn = this.queue.shift();
      if (fn) {
        this.lastRequestTime = Date.now();
        await fn();
      }
    }

    this.processing = false;
  }
}

const aiQueue = new RequestQueue();

const withRetry = async <T>(fn: () => Promise<T>, retries = 5, delay = 5000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    const is429 = errorStr.includes("429") || error.status === 429 || (error.message && error.message.includes("429"));
    const isTransient = is429 || 
                        errorStr.includes("503") || 
                        errorStr.includes("high demand") || 
                        errorStr.includes("unavailable") ||
                        errorStr.includes("overloaded") ||
                        error.status === 503 ||
                        (error.message && (
                          error.message.toLowerCase().includes("503") || 
                          error.message.toLowerCase().includes("high demand") ||
                          error.message.toLowerCase().includes("unavailable")
                        ));
                        
    if (retries > 0 && isTransient) {
      // If it's a 429, wait longer
      const actualDelay = is429 ? Math.max(delay, 60000) : delay;
      console.warn(`Gemini API occupata o limite raggiunto (429/503), riprovo tra ${actualDelay}ms... (${retries} tentativi rimasti)`);
      await new Promise(resolve => setTimeout(resolve, actualDelay));
      return withRetry(fn, retries - 1, actualDelay * 1.5);
    }
    throw error;
  }
};

export const analyzePdfContent = async (text: string) => {
  return aiQueue.add(async () => {
    console.log("Using Gemini Model:", GEMINI_MODEL);
    const userKey = localStorage.getItem('aasp_gemini_key');
    const effectiveKey = userKey || process.env.GEMINI_API_KEY || "";

    if (!effectiveKey) {
      throw new Error("API KEY mancante. Inserire la chiave nelle impostazioni per l'analisi avanzata.");
    }

    return withRetry(async () => {
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: text,
        config: {
          systemInstruction: `Sei un AI specializzato. Leggi il testo estratto da un PDF della Polizia.
Estrai OGNI SINGOLA segnalazione come elemento separato.
Per ogni segnalazione estrai:
- LUOGO EVENTO: provincia (solo sigla 2 lettere) e comune.
- MODUS OPERANDI: Classifica il reato in modo estremamente specifico usando ESCLUSIVAMENTE una di queste categorie (in MAIUSCOLO):
${MODUS_OPERANDI_CATEGORIES.join(", ")}.
È ASSOLUTAMENTE VIETATO USARE "ALTRO" O CATEGORIE NON PRESENTI NELL'ELENCO. Se il fatto non è perfettamente identico, scegli la categoria che più si avvicina per dinamica o tipologia di reato. Sii il più preciso possibile analizzando ogni dettaglio della dinamica.
- SOGGETTI (Vittime e Indagati): Estrai generalità complete. Se non ci sono soggetti restituisci un array vuoto [].
- VITTIMA ETA/SESSO: Scegli "Minorenne", "18-35", "36-65", "Over 65", "N/D" e "M", "F", "N/D".
- PRECISIONE DATE: Le date sono nel formato GG.MM.AAAA o GG/MM/AAAA. Convertile sempre in GG/MM/AAAA.
- SINTESI: Riassunto fluido di 4 riga della dinamica del fatto.
- TESTO INTEGRALE: Trascrivi la parte testuale originale relativa all'evento.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segnalazioni: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    protocollo: { type: Type.STRING },
                    oggetto: { type: Type.STRING },
                    comando: { type: Type.STRING },
                    categoria: { type: Type.STRING },
                    dataOra: { type: Type.STRING },
                    provincia_evento: { type: Type.STRING },
                    comune_evento: { type: Type.STRING },
                    modus_operandi: { type: Type.STRING },
                    vittima_eta: { type: Type.STRING },
                    vittima_sesso: { type: Type.STRING },
                    vittime: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          cognome: { type: Type.STRING },
                          nome: { type: Type.STRING },
                          data_nascita: { type: Type.STRING },
                          luogo_nascita: { type: Type.STRING },
                          indirizzo: { type: Type.STRING },
                        }
                      }
                    },
                    indagati: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          cognome: { type: Type.STRING },
                          nome: { type: Type.STRING },
                          data_nascita: { type: Type.STRING },
                          luogo_nascita: { type: Type.STRING },
                          indirizzo: { type: Type.STRING },
                        }
                      }
                    },
                    sintesi: { type: Type.STRING },
                    testoIntegrale: { type: Type.STRING },
                  }
                }
              }
            }
          },
        }
      });

      try {
        return JSON.parse(response.text || "{}");
      } catch (e) {
        console.error("JSON Parse Error in analyzePdfContent, attempting repair...", e);
        let text = response.text || "{}";
        if (text.includes('"segnalazioni": [') && !text.endsWith(']}')) {
          if (!text.endsWith(']')) text += ']';
          if (!text.endsWith('}')) text += '}';
        }
        try {
          return JSON.parse(text);
        } catch (e2) {
          throw new Error("Errore nella formattazione dei dati PDF. Il file potrebbe essere troppo complesso.");
        }
      }
    });
  });
};
