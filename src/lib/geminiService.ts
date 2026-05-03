import { GoogleGenAI, Type } from "@google/genai";
import { ModusOperandiStore, Segnalazione } from "../types";

const GEMINI_MODEL = "gemini-3-flash-preview"; 

class RequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 1000; 

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

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 5000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = JSON.stringify(error).toLowerCase();
    const is429 = errorStr.includes("429") || error.status === 429 || (error.message && error.message.includes("429"));
    const isTransient = is429 || errorStr.includes("503") || errorStr.includes("high demand");
                        
    if (retries > 0 && isTransient) {
      const actualDelay = is429 ? 60000 : delay;
      console.warn(`Gemini API occupata, riprovo tra ${actualDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, actualDelay));
      return withRetry(fn, retries - 1, actualDelay * 1.5);
    }
    throw error;
  }
};

export const analyzeJsonReports = async (jsonContent: string, configMO: ModusOperandiStore, apiKey?: string) => {
  return aiQueue.add(async () => {
    const effectiveKey = (apiKey || "").trim();

    if (!effectiveKey) {
      throw new Error("Chiave API Gemini non configurata per questo profilo.");
    }

    // Costruzione stringa tassonomia per il prompt
    let taxonomyStr = "TASSONOMIA OBBLIGATORIA:\n";
    configMO.categorie.forEach(cat => {
      taxonomyStr += `- CATEGORIA: ${cat.nome}\n`;
      cat.modusOperandi.forEach(mo => {
        taxonomyStr += `  - MODUS OPERANDI: ${mo.nome}\n`;
        mo.tipi.forEach(t => {
          taxonomyStr += `    - TIPO: ${t.nome}\n`;
        });
      });
    });

    return withRetry(async () => {
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: jsonContent,
        config: {
          maxOutputTokens: 65536,
          systemInstruction: `Sei un esperto di analisi criminale della Polizia.
Leggi il contenuto fornito (può contenere una o più segnalazioni in formato testo o JSON grezzo).
Il tuo compito è estrarre e strutturare i dati secondo lo schema richiesto.

${taxonomyStr}

VINCOLI TASSATIVI:
1. In fase di classificazione, devi dare priorità assoluta ai valori (categoria, modus_operandi_dettaglio, tipo_modus_operandi) presenti nella TASSONOMIA sopra.
2. Scegli il valore più vicino o coerente se non c'è una corrispondenza esatta.
3. Se un fatto è assolutamente incompatibile con i valori esistenti e richiede una nuova voce tassonomica, puoi proporne una nuova. In questo caso devi rigorosamente:
   - Impostare "requiresRevision": true.
   - Proporre il valore più accurato (l'applicazione lo gestirà come nuova voce).
4. I VALORI DI CATEGORIA, MODUS OPERANDI E TIPO DEVONO ESSERE SEMPRE IN MAIUSCOLO.
5. È VIETATO usare valori generici come "VARIE", "ALTRO", "N/D" o simili.
6. Per ogni segnalazione produci un sunto di poche righe (max 4).
7. Estrai generalità complete (Cognome, Nome, Data Nascita, Luogo Nascita) per indagati e vittime. Cognome e Nome devono essere in MAIUSCOLO.
8. REGOLA CRITICA SUGLI INDAGATI: Se non ci sono indagati (se i responsabili sono ignoti), L'ARRAY indagati DEVE ESSERE VUOTO []. NON inserire mai indagati chiamati "Ignoto", "Sconosciuto" o "N/D".
9. Localizzazione: estrai Provincia (sigla 2 lettere) e Comune (IN MAIUSCOLO).
10. OGGETTO (Titolo): Deve essere un titolo pulito che descriva il fatto senza metadati.
11. Salva il testo originale integrale in "testoIntegrale".
12. Ritorna un JSON con un array "segnalazioni".`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segnalazioni: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    idUnivoco: { type: Type.STRING },
                    protocollo: { type: Type.STRING },
                    categoria: { type: Type.STRING },
                    comando: { type: Type.STRING },
                    dataOra: { type: Type.STRING },
                    provincia: { type: Type.STRING },
                    comune: { type: Type.STRING },
                    oggetto: { type: Type.STRING },
                    dinamica: { type: Type.STRING },
                    sunto: { type: Type.STRING },
                    testoIntegrale: { type: Type.STRING },
                    modus_operandi_generale: { type: Type.STRING },
                    modus_operandi_dettaglio: { type: Type.STRING },
                    tipo_modus_operandi: { type: Type.STRING },
                    requiresRevision: { type: Type.BOOLEAN },
                    vittime: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          cognome: { type: Type.STRING },
                          nome: { type: Type.STRING },
                          dataNascita: { type: Type.STRING },
                          luogoNascita: { type: Type.STRING },
                          ruolo: { type: Type.STRING }
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
                          dataNascita: { type: Type.STRING },
                          luogoNascita: { type: Type.STRING },
                          ruolo: { type: Type.STRING }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      let responseString = response.text || "{}";
      // Pulizia eventuale del wrapper markdown
      responseString = responseString.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      
      try {
        return JSON.parse(responseString);
      } catch (parseError) {
        console.error("Failed to parse Gemini response:", responseString);
        throw parseError;
      }
    });
  });
};

export const generateInvestigativeIntelligence = async (summaryData: string, apiKey?: string) => {
   return aiQueue.add(async () => {
    const effectiveKey = (apiKey || "").trim();
    if (!effectiveKey) throw new Error("Chiave API Gemini non configurata per questo profilo.");

    return withRetry(async () => {
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Analizza questi dati statistici di polizia e produci una relazione di Intelligence Investigativa professionale:
        
        DATI AGGREGATI:
        ${summaryData}
        
        La relazione deve essere strutturata in:
        1. ANALISI DEI TREND: Evoluzione temporale e dinamiche ricorrenti.
        2. FOCUS TERRITORIALE: Zone a maggior rischio e criticità locali.
        3. MODUS OPERANDI E TECNICHE: Analisi delle metodologie criminali emergenti.
        4. STRATEGIE DI CONTRASTO SUGGERITE: Attività preventive e repressive consigliate.
        5. SPUNTI INVESTIGATIVI: Ipotesi di collegamento tra eventi o soggetti.
        
        Usa un linguaggio tecnico, giuridico e formale tipico della Polizia Giudiziaria. 
        Evita generalizzazioni. Sii schematico e incisivo.
        MOLTO IMPORTANTE: Non usare alcun tipo di formattazione markdown (niente asterischi, cancelletti, grassetti, ecc.). Produci solo testo pulito con titoli numerati.`,
        config: {
          responseMimeType: "text/plain"
        }
      });

      return response.text;
    });
  });
}
