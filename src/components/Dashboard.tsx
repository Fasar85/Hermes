import React, { useState, useRef } from 'react';
import { 
  FileJson, 
  Upload, 
  Eye, 
  User as UserIcon, 
  Calendar, 
  MapPin, 
  Clock, 
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Shield,
  Zap
} from 'lucide-react';
import { Segnalazione, AppDatabase, Persona, ModusOperandiStore } from '../types';
import { analyzeJsonReports } from '../lib/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate } from '../lib/utils';

interface DashboardProps {
  reports: Segnalazione[];
  db: AppDatabase;
  setDb: React.Dispatch<React.SetStateAction<AppDatabase | null>>;
  onImport: (newData: AppDatabase) => void;
  onUpdateTaxonomy?: (newData: Partial<ModusOperandiStore>) => void;
  apiKey?: string;
  canEdit?: boolean;
  onViewReport: (report: Segnalazione) => void;
  onViewPersona: (persona: Persona) => void;
}

// Applies the same auto-fix logic as VerificaDB "Risolvi Tutte" on newly imported reports
const autoFixReport = (r: Segnalazione): Segnalazione => {
  const normalizeDateStr = (val?: string): string => {
    if (!val) return '01/01/2000';
    const clean = val.replace(/[.\-]/g, '/');
    const parts = clean.split('/');
    if (parts.length === 3) {
      let d = parts[0], m = parts[1], y = parts[2];
      if (d.length === 4) { const tmp = d; d = y; y = tmp; }
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.padStart(4, '0')}`;
    }
    return val;
  };

  let fixed = { ...r };

  // Normalize dataOra → DD/MM/YYYY HH:MM
  const timeParts = (fixed.dataOra || '').split(/[ T]/);
  const fixedDate = normalizeDateStr(timeParts[0]);
  let fixedTime = timeParts[1] || '00:00';
  const hm = fixedTime.split(':');
  if (hm.length >= 2) fixedTime = `${hm[0].padStart(2, '0')}:${hm[1].padStart(2, '0')}`;
  fixed.dataOra = `${fixedDate} ${fixedTime}`;

  // Normalize birth dates for all subjects
  fixed.indagati = (fixed.indagati || []).map(p => ({
    ...p,
    dataNascita: p.dataNascita ? normalizeDateStr(p.dataNascita) : p.dataNascita
  }));
  fixed.vittime = (fixed.vittime || []).map(p => ({
    ...p,
    dataNascita: p.dataNascita ? normalizeDateStr(p.dataNascita) : p.dataNascita
  }));

  // Fill missing required fields with safe defaults
  if (!fixed.comune || fixed.comune.trim() === '') fixed.comune = 'N/D';
  if (!fixed.provincia || fixed.provincia.trim() === '') fixed.provincia = 'ND';
  if (!fixed.oggetto || fixed.oggetto.trim() === '') fixed.oggetto = 'EVENTO DA DEFINIRE';

  return fixed;
};

const Dashboard: React.FC<DashboardProps> = ({ 
  reports, 
  db, 
  setDb, 
  onImport, 
  onUpdateTaxonomy, 
  apiKey, 
  canEdit = false,
  onViewReport,
  onViewPersona
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setStatus] = useState('');
  const [importProgress, setProgress] = useState(0);
  const [reviewData, setReviewData] = useState<Segnalazione[] | null>(null);
  const [isProcessingSave, setIsProcessingSave] = useState(false);
  
  const [dragging, setDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prevent browser from opening dropped file globally for this component
  const preventDefaults = (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const wrapOnDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const wrapOnDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    setShowImportModal(false);
    if (!canEdit) {
      alert("Permessi insufficienti per importare dati.");
      return;
    }

    const filesArray = Array.from(files);
    try {
      setIsImporting(true);
      setProgress(0);
      let allExtracted: Segnalazione[] = [];
      const totalFiles = filesArray.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = filesArray[i];
        const fileBaseProgress = (i / totalFiles) * 100;
        
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext !== 'json' && ext !== 'txt' && ext !== 'md') {
           alert(`Il file "${file.name}" non è un formato supportato (usa JSON, TXT o MD).`);
           continue;
        }

        setStatus(`Lettura ${file.name}...`);
        setProgress(fileBaseProgress + (10 / totalFiles));
        
        const text = await file.text();
        let json;
        try {
          if (ext === 'json') {
            json = JSON.parse(text);
          }
        } catch (e) {
          console.warn(`File "${file.name}": Fallito parsing JSON strutturato, procedo come testo grezzo per AI.`, e);
        }

        if (json && json.segnalazioni && Array.isArray(json.segnalazioni) && json.segnalazioni.length > 0 && json.segnalazioni[0].idUnivoco) {
          setStatus(`${file.name}: Dati già strutturati.`);
          allExtracted = [...allExtracted, ...json.segnalazioni];
          setProgress(fileBaseProgress + (100 / totalFiles));
        } else {
          // Build a list of individual AI-ready payloads, one per report.
          // Case 1: SDI/police export format { Documenti: { Segnalazioni: [...] } }
          // Strip heavy RTF and Destinatari fields to keep input tokens minimal
          // so the AI can process every single record reliably.
          let itemsToProcess: string[] = [];

          if (json && json.Documenti && Array.isArray(json.Documenti.Segnalazioni) && json.Documenti.Segnalazioni.length > 0) {
            itemsToProcess = json.Documenti.Segnalazioni.map((item: any) => {
              const { TestoRtf: _rtf, TestoArmaRtf: _artf, Destinatari: _dest, ...stripped } = item;
              return JSON.stringify(stripped);
            });
          // Case 2: Top-level JSON array
          } else if (json && Array.isArray(json) && json.length > 0) {
            const BATCH_SIZE = 3;
            for (let b = 0; b < json.length; b += BATCH_SIZE) {
              itemsToProcess.push(JSON.stringify(json.slice(b, b + BATCH_SIZE)));
            }
          // Case 3: { segnalazioni: [...] } without idUnivoco
          } else if (json && json.segnalazioni && Array.isArray(json.segnalazioni) && json.segnalazioni.length > 0) {
            const BATCH_SIZE = 3;
            for (let b = 0; b < json.segnalazioni.length; b += BATCH_SIZE) {
              itemsToProcess.push(JSON.stringify(json.segnalazioni.slice(b, b + BATCH_SIZE)));
            }
          // Case 4: raw text or unrecognised structure
          } else {
            itemsToProcess = [text];
          }

          const numItems = itemsToProcess.length;
          for (let ci = 0; ci < numItems; ci++) {
            setStatus(`Analisi AI ${file.name}${numItems > 1 ? ` (${ci + 1}/${numItems})` : ''}...`);
            setProgress(fileBaseProgress + (30 / totalFiles) + (ci / numItems) * (60 / totalFiles));
            const result = await analyzeJsonReports(itemsToProcess[ci], db.configuratore, apiKey);
            if (result && result.segnalazioni && Array.isArray(result.segnalazioni)) {
              allExtracted = [...allExtracted, ...result.segnalazioni];
            }
          }
          setProgress(fileBaseProgress + (100 / totalFiles));
        }
      }

      setProgress(100);
      if (allExtracted.length > 0) {
        
        // Filter out existing duplicates from the extracted dataset
        const existingIds = new Set(db.segnalazioni.map(s => s.idUnivoco));
        const existingProtocols = new Set(db.segnalazioni.map(s => s.protocollo.toUpperCase().trim()));
        
        const filteredExtracted = allExtracted.filter(r => {
           const idExist = r.idUnivoco && existingIds.has(r.idUnivoco);
           const protoExist = r.protocollo && existingProtocols.has(r.protocollo.toUpperCase().trim());
           return !idExist && !protoExist;
        });

        if (filteredExtracted.length === 0) {
           alert("I dati estratti sono già presenti a sistema (doppioni saltati). Non c'è nulla di nuovo da validare.");
           return;
        }

        // Clean taxomony values from AI tags in case they persist
        const cleaned = filteredExtracted.map(r => ({
          ...r,
          categoria: (r.categoria || '').replace(' [NUOVO]', '').toUpperCase().trim(),
          modus_operandi_dettaglio: (r.modus_operandi_dettaglio || '').replace(' [NUOVO]', '').toUpperCase().trim(),
          tipo_modus_operandi: (r.tipo_modus_operandi || '').replace(' [NUOVO]', '').toUpperCase().trim(),
        }));
        setReviewData(cleaned);
      } else {
        alert("Non è stato possibile estrarre dati validi.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Errore AI: ${err.message || 'Si è verificato un errore imprevisto durante l\'elaborazione.'}`);
    } finally {
      setTimeout(() => {
        setIsImporting(false);
        setStatus('');
        setProgress(0);
      }, 500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmReview = () => {
    // Basic guards
    if (!reviewData) {
      console.warn("Save attempted with no reviewData");
      return;
    }
    if (!db) {
      alert("Errore: Database non caricato correttamente.");
      return;
    }
    if (isProcessingSave) return;
    
    setIsProcessingSave(true);
    console.log("Starting confirmReview operation...");
    
    try {
      const currentReviewData = [...reviewData];
      
      // 1. Duplicate check (safe version)
      const existingReports = db.segnalazioni || [];
      const existingProtocols = new Set(
        existingReports
          .filter(s => s && s.protocollo)
          .map(s => String(s.protocollo).toLowerCase().trim())
      );
      
      const uniqueNewReports = currentReviewData.filter(newReport => {
        if (!newReport.protocollo) return true;
        return !existingProtocols.has(String(newReport.protocollo).toLowerCase().trim());
      });

      if (uniqueNewReports.length === 0 && currentReviewData.length > 0) {
        alert("Tutte le segnalazioni caricate sono già presenti nel sistema (duplicati di protocollo).");
        setReviewData(null);
        setIsProcessingSave(false);
        return;
      }

      // 2. Prepare data with defaults and auto-fix integrity issues (same as VerificaDB "Risolvi Tutte")
      const preparedReports = uniqueNewReports.map(rev => {
        const cat = String(rev.categoria || '').toUpperCase().trim() || 'VARIE';
        const mo = String(rev.modus_operandi_dettaglio || '').toUpperCase().trim() || 'ALTRO';
        const tmo = String(rev.tipo_modus_operandi || '').toUpperCase().trim() || 'GENERALE';
        
        return autoFixReport({
          ...rev,
          categoria: cat,
          modus_operandi_dettaglio: mo,
          tipo_modus_operandi: tmo,
          requiresRevision: false
        });
      });

      // 3. Consolidated functional update
      setDb(prev => {
        if (!prev) return null;
        
        // Clone state
        const newSegnalazioni = [...(prev.segnalazioni || []), ...preparedReports];
        const newConfig = { ...prev.configuratore };
        if (!newConfig.categorie) newConfig.categorie = [];

        const getSafeId = () => Math.random().toString(36).substring(2, 9);

        // Update taxonomy correctly
        preparedReports.forEach(rep => {
          const cName = rep.categoria;
          const mName = rep.modus_operandi_dettaglio;
          const tName = rep.tipo_modus_operandi;

          let cat = newConfig.categorie.find(c => c.nome.toUpperCase() === cName);
          if (!cat) {
            cat = {
              id: getSafeId(),
              nome: cName,
              modusOperandi: []
            };
            newConfig.categorie.push(cat);
          }

          let mo = cat.modusOperandi.find(m => m.nome.toUpperCase() === mName);
          if (!mo) {
            mo = {
              id: getSafeId(),
              nome: mName,
              tipi: []
            };
            cat.modusOperandi.push(mo);
          }

          if (!mo.tipi.some(t => t.nome.toUpperCase() === tName)) {
            mo.tipi.push({
              id: getSafeId(),
              nome: tName
            });
          }
        });

        return {
          ...prev,
          segnalazioni: newSegnalazioni,
          configuratore: newConfig
        };
      });

      // 4. Close session
      console.log("Archive successful, closing review modal.");
      setReviewData(null);
      
      // Small delayed alert to ensure UI re-renders first
      setTimeout(() => {
        alert(`Operazione completata: ${preparedReports.length} nuove segnalazioni archiviate.`);
      }, 200);

    } catch (error) {
      console.error("FATAL Error in confirmReview:", error);
      alert("Errore critico durante l'archiviazione. Consulta la console del browser per i dettagli tecnici.");
    } finally {
      setIsProcessingSave(false);
    }
  };

  const sortedReports = [...reports].sort((a, b) => {
    const parse = (dStr: string) => {
       if (!dStr) return 0;
       if (dStr.includes('T')) {
         const d = new Date(dStr);
         return isNaN(d.getTime()) ? 0 : d.getTime();
       }
       const parts = dStr.split('/');
       if (parts.length < 3) return 0;
       
       const d = parts[0];
       const m = parts[1];
       const rest = parts[2].split(' ');
       const y = rest[0];
       const hM = rest[1] || '00:00';
       
       const [h, min] = hM.split(':');
       const date = new Date(Number(y), Number(m)-1, Number(d), Number(h) || 0, Number(min) || 0);
       return isNaN(date.getTime()) ? 0 : date.getTime();
    };
    return parse(b.dataOra) - parse(a.dataOra);
  });

  return (
    <div 
      className="space-y-6 min-h-[600px] relative"
      onDragEnter={(e) => { preventDefaults(e); setDragging(true); }}
      onDragOver={(e) => { preventDefaults(e); setDragging(true); }}
      onDragLeave={(e) => { preventDefaults(e); setDragging(false); }}
      onDrop={(e) => {
        preventDefaults(e);
        setDragging(false);
        if (!canEdit) {
          alert("Non hai i permessi per inserire nuovi dati.");
          return;
        }
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 bg-indigo-600/10 border-4 border-dashed border-indigo-600 rounded-3xl backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
               <Upload className="text-indigo-600 w-8 h-8 animate-bounce" />
            </div>
            <div>
              <p className="text-xl font-black text-slate-800 tracking-tight">Rilascia per Analizzare</p>
              <p className="text-sm text-slate-500">Il Motore AI HERMES estrarrà i metadati dai tuoi file.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <FileText className="text-indigo-600" />
            Schedario Segnalazioni
          </h2>
          <p className="text-sm text-slate-500">Gestione e consultazione dell'archivio informativo SDI.</p>
        </div>

        <div className="flex items-center gap-3">
          <input 
            type="file" 
            multiple
            ref={fileInputRef} 
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            accept=".json"
            className="hidden"
          />
          <button 
            onClick={() => {
              if (!canEdit) alert("Non hai i permessi per inserire nuovi dati.");
              else setShowImportModal(true);
            }}
            disabled={isImporting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex flex-col items-center shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 relative overflow-hidden min-w-[200px]"
          >
            <div className="flex items-center space-x-2 z-10">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{isImporting ? `Importazione: ${Math.round(importProgress)}%` : 'Importa JSON (Multi)'}</span>
            </div>
            {isImporting && (
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${importProgress}%` }}
                className="absolute left-0 bottom-0 h-1 bg-white/30 z-0"
              />
            )}
            {isImporting && <span className="text-[9px] mt-0.5 opacity-80 z-10">{importStatus}</span>}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden p-10 flex flex-col items-center text-center relative"
            >
              <button 
                onClick={() => setShowImportModal(false)}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:bg-slate-100 rounded-full"
              >
                <X size={24} />
              </button>

              <div className="bg-indigo-600 p-6 rounded-3xl mb-6 shadow-xl shadow-indigo-200">
                <Upload className="text-white w-10 h-10" />
              </div>

              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Importa Segnalazioni JSON</h2>
              <p className="text-slate-500 mb-10 max-w-sm">Carica uno o più file JSON. L'intelligenza artificiale estrarrà automaticamente i dati strutturati per l'analisi.</p>

              <div 
                onDragEnter={wrapOnDrag}
                onDragOver={wrapOnDrag}
                onDragLeave={wrapOnDrag}
                onDrop={wrapOnDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full h-64 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center cursor-pointer transition-all ${
                  dragActive ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-4">
                  <FileJson className="text-slate-400 w-8 h-8" />
                </div>
                <p className="text-sm font-bold text-slate-600">Trascina i file qui o clicca per sfogliare</p>
                <p className="text-[10px] text-slate-400 uppercase mt-2 font-black tracking-widest">Supporta JSON Multipli</p>
              </div>

              <input 
                type="file" 
                ref={fileInputRef}
                multiple
                accept=".json"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files as any)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {reports.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileJson className="text-slate-300 w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-700">Database Vuoto</h3>
            <p className="text-slate-500 text-sm max-w-xs mx-auto mt-2">
              Trascina qui un file JSON o clicca sul pulsante in alto per iniziare l'analisi.
            </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sortedReports.map((report) => (
            <motion.div 
              layout
              key={report.idUnivoco}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow group flex flex-col md:flex-row gap-6 relative"
            >
              {report.requiresRevision && (
                <div className="absolute top-4 right-4 bg-amber-50 text-amber-600 text-[10px] font-black px-2 py-1 rounded flex items-center gap-1 border border-amber-200">
                  <AlertCircle size={12} />
                  DA REVISIONARE
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase">
                    {report.categoria}
                  </span>
                  {report.modus_operandi_dettaglio && (
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold rounded uppercase border border-indigo-100">
                      {report.modus_operandi_dettaglio}
                    </span>
                  )}
                  {report.tipo_modus_operandi && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded uppercase border border-emerald-100">
                      {report.tipo_modus_operandi}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-mono">
                    PROT: {report.protocollo || 'N/D'}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-800 mb-1 truncate uppercase">{report.oggetto}</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Clock size={14} className="text-indigo-400" />
                    <span className="text-xs font-medium">{formatDate(report.dataOra)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <MapPin size={14} className="text-indigo-400" />
                    <span className="text-xs font-medium uppercase">{report.comune} ({report.provincia})</span>
                  </div>
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="flex items-center gap-2 overflow-hidden flex-wrap max-w-md">
                         {[...report.indagati.map(p => ({...p, isIndagato: true})), ...report.vittime.map(p => ({...p, isIndagato: false}))].slice(0, 4).map((p, idx) => (
                           <div 
                             key={idx}
                             onClick={(e) => {
                               e.stopPropagation();
                               onViewPersona(p);
                             }}
                             className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform uppercase ${
                               p.isIndagato ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-green-100 text-green-700 border border-green-200'
                             }`}
                             title={`${p.cognome} ${p.nome} - ${p.ruolo || (p.isIndagato ? 'INDAGATO' : 'VITTIMA')} - Nato il ${p.dataNascita || 'N/D'} a ${p.luogoNascita || 'N/D'}`}
                           >
                             <UserIcon size={10} />
                             <span className="truncate max-w-[250px]">{p.cognome} {p.nome}</span>
                           </div>
                         ))}
                         {([...report.vittime, ...report.indagati].length > 4) && (
                           <span className="text-[10px] text-slate-400 font-bold">
                             +{([...report.vittime, ...report.indagati].length - 4)}
                           </span>
                         )}
                      </div>
                    </div>
                </div>

                <p className="text-sm text-slate-600 line-clamp-2 mt-4 bg-slate-50 p-3 rounded-lg border-l-4 border-indigo-200">
                  {report.sunto}
                </p>
              </div>

              <div className="flex flex-row md:flex-col justify-end gap-2 md:w-32">
                 <button 
                  onClick={() => onViewReport(report)}
                  className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Eye size={14} />
                  Dettagli
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {reviewData && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xl">
             <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-5xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
               <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <Shield className="w-6 h-6" />
                   <div>
                     <h2 className="text-xl font-black uppercase tracking-tight">Validazione Analisi AI</h2>
                     <p className="text-xs text-indigo-200">Revisiona la sintesi e la classificazione prodotta dal motore Gemini.</p>
                   </div>
                 </div>
                 <div className="bg-indigo-500 px-4 py-1.5 rounded-full text-xs font-bold">
                   {reviewData.length} Elementi Estratti
                 </div>
               </div>

               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 {reviewData.map((rev, idx) => (
                   <div key={idx} className="bg-slate-50 rounded-2xl p-6 border border-slate-200 relative group">
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* LEFT COL: Content */}
                        <div className="lg:col-span-2 space-y-4">
                           <div className="flex items-center gap-2">
                             <div className="bg-indigo-100 p-2 rounded-lg">
                               <FileText size={16} className="text-indigo-600" />
                             </div>
                             <input 
                              type="text" 
                              value={rev.oggetto}
                              onChange={(e) => {
                                const newRev = [...reviewData];
                                newRev[idx].oggetto = e.target.value;
                                setReviewData(newRev);
                              }}
                              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 shadow-sm"
                             />
                             {rev.requiresRevision && (
                               <div className="flex items-center gap-1 bg-rose-100 text-rose-700 px-3 py-2 rounded-lg border border-rose-200 text-[10px] font-black uppercase whitespace-nowrap">
                                 <AlertCircle size={14} />
                                 Segnalato
                               </div>
                             )}
                           </div>
                           <textarea 
                             value={rev.sunto}
                             onChange={(e) => {
                               const newRev = [...reviewData];
                               newRev[idx].sunto = e.target.value;
                               setReviewData(newRev);
                             }}
                             className="w-full h-32 bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-600 focus:ring-2 focus:ring-indigo-500 shadow-sm leading-relaxed"
                             placeholder="Sunto dell'evento..."
                           />
                        </div>

                        {/* RIGHT COL: Taxonomy */}
                        <div className="space-y-4">
                           {/* CATEGORIA */}
                           <div className="flex flex-col gap-1.5">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Categoria</label>
                             <div className="relative">
                               <input 
                                 list={`cat-options-${idx}`}
                                 value={rev.categoria}
                                 onChange={(e) => {
                                   const newRev = [...reviewData];
                                   const newVal = e.target.value.toUpperCase();
                                   newRev[idx].categoria = newVal;
                                   newRev[idx].modus_operandi_dettaglio = '';
                                   newRev[idx].tipo_modus_operandi = '';
                                   setReviewData(newRev);
                                 }}
                                 className={`w-full bg-white border rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500 uppercase transition-all ${
                                   db.configuratore.categorie.some(c => c.nome.toUpperCase() === rev.categoria.toUpperCase()) 
                                   ? 'border-slate-200' : 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
                                 }`}
                               />
                               <datalist id={`cat-options-${idx}`}>
                                 {db.configuratore.categorie.map(c => <option key={c.id} value={c.nome} />)}
                               </datalist>
                               {!db.configuratore.categorie.some(c => c.nome.toUpperCase() === rev.categoria.toUpperCase()) && rev.categoria && (
                                 <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 animate-pulse" title="Nuovo valore">
                                   <AlertCircle size={12} className="text-amber-600" />
                                   <span className="text-[8px] font-black text-amber-700">NUOVO</span>
                                 </div>
                               )}
                             </div>
                             {/* Similar Suggestions for Category */}
                             {!db.configuratore.categorie.some(c => c.nome.toUpperCase() === rev.categoria.toUpperCase()) && rev.categoria && (
                               <div className="bg-amber-50 p-2 rounded-lg border border-amber-100">
                                 <p className="text-[9px] font-black text-amber-700 mb-1.5 flex items-center gap-1 uppercase">
                                   <Shield size={10} /> Valore non presente
                                 </p>
                                 <div className="flex flex-wrap gap-1">
                                   {db.configuratore.categorie
                                     .filter(c => c.nome.toUpperCase().includes(rev.categoria.toUpperCase()) || rev.categoria.toUpperCase().includes(c.nome.toUpperCase()))
                                     .slice(0, 3)
                                     .map(c => (
                                       <button 
                                         key={c.id}
                                         onClick={() => {
                                           const newRev = [...reviewData];
                                           newRev[idx].categoria = c.nome.toUpperCase();
                                           newRev[idx].modus_operandi_dettaglio = '';
                                           newRev[idx].tipo_modus_operandi = '';
                                           setReviewData(newRev);
                                         }}
                                         className="text-[9px] bg-white border border-slate-200 hover:border-indigo-400 px-2 py-0.5 rounded text-slate-500 hover:text-indigo-600 transition-colors shadow-sm"
                                       >
                                         USA: {c.nome}
                                       </button>
                                     ))
                                   }
                                   {db.configuratore.categorie.filter(c => c.nome.toUpperCase().includes(rev.categoria.toUpperCase()) || rev.categoria.toUpperCase().includes(c.nome.toUpperCase())).length === 0 && (
                                      <span className="text-[9px] text-amber-600 font-bold italic">Nessun valore simile trovato</span>
                                   )}
                                 </div>
                               </div>
                             )}
                           </div>

                           {/* MODUS OPERANDI */}
                           <div className="flex flex-col gap-1.5">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Modus Operandi</label>
                             <div className="relative">
                               <input 
                                 list={`mo-options-${idx}`}
                                 value={rev.modus_operandi_dettaglio}
                                 onChange={(e) => {
                                   const newRev = [...reviewData];
                                   const newVal = e.target.value.toUpperCase();
                                   newRev[idx].modus_operandi_dettaglio = newVal;
                                   newRev[idx].tipo_modus_operandi = '';
                                   setReviewData(newRev);
                                 }}
                                 className={`w-full bg-white border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 uppercase transition-all ${
                                   db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.some(mo => mo.nome.toUpperCase() === rev.modus_operandi_dettaglio.toUpperCase())
                                   ? 'border-slate-200' : 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
                                 }`}
                               />
                               <datalist id={`mo-options-${idx}`}>
                                 {db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.map(mo => (
                                   <option key={mo.id} value={mo.nome} />
                                 ))}
                               </datalist>
                               {rev.modus_operandi_dettaglio && !db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.some(mo => mo.nome.toUpperCase() === rev.modus_operandi_dettaglio.toUpperCase()) && (
                                 <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 animate-pulse" title="Nuovo valore">
                                   <AlertCircle size={12} className="text-amber-600" />
                                   <span className="text-[8px] font-black text-amber-700">NUOVO</span>
                                 </div>
                               )}
                             </div>
                             {/* Similar Suggestions for MO */}
                             {rev.modus_operandi_dettaglio && !db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.some(mo => mo.nome.toUpperCase() === rev.modus_operandi_dettaglio.toUpperCase()) && (
                               <div className="bg-amber-50 p-2 rounded-lg border border-amber-100">
                                 <p className="text-[9px] font-black text-amber-700 mb-1 flex items-center gap-1 uppercase tracking-tighter">
                                    <Clock size={10} /> MO non a sistema
                                 </p>
                                 <div className="flex flex-wrap gap-1">
                                   {db.configuratore.categorie.flatMap(c => c.modusOperandi)
                                     .filter(m => m.nome.toUpperCase().includes(rev.modus_operandi_dettaglio.toUpperCase()) || rev.modus_operandi_dettaglio.toUpperCase().includes(m.nome.toUpperCase()))
                                     .slice(0, 3)
                                     .map(m => (
                                       <button 
                                         key={m.id}
                                         onClick={() => {
                                           const newRev = [...reviewData];
                                           newRev[idx].modus_operandi_dettaglio = m.nome.toUpperCase();
                                           newRev[idx].tipo_modus_operandi = '';
                                           setReviewData(newRev);
                                         }}
                                         className="text-[9px] bg-white border border-slate-200 hover:border-indigo-400 px-2 py-0.5 rounded text-slate-500 hover:text-indigo-600 transition-colors shadow-sm"
                                       >
                                         USA: {m.nome}
                                       </button>
                                     ))
                                   }
                                 </div>
                               </div>
                             )}
                           </div>

                           {/* TIPOLOGIA OPERATIVA */}
                           <div className="flex flex-col gap-1.5">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tipologia Operativa</label>
                             <div className="relative">
                               <input 
                                 list={`type-options-${idx}`}
                                 value={rev.tipo_modus_operandi}
                                 onChange={(e) => {
                                   const newRev = [...reviewData];
                                   const newVal = e.target.value.toUpperCase();
                                   newRev[idx].tipo_modus_operandi = newVal;
                                   setReviewData(newRev);
                                 }}
                                 className={`w-full bg-white border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 uppercase transition-all ${
                                   db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.find(mo => mo.nome.toUpperCase() === rev.modus_operandi_dettaglio.toUpperCase())?.tipi.some(t => t.nome.toUpperCase() === rev.tipo_modus_operandi.toUpperCase())
                                   ? 'border-slate-200' : 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
                                 }`}
                               />
                               <datalist id={`type-options-${idx}`}>
                                 {db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.find(mo => mo.nome.toUpperCase() === rev.modus_operandi_dettaglio.toUpperCase())?.tipi.map(t => (
                                   <option key={t.id} value={t.nome} />
                                 ))}
                               </datalist>
                               {rev.tipo_modus_operandi && !db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.find(mo => mo.nome.toUpperCase() === rev.modus_operandi_dettaglio.toUpperCase())?.tipi.some(t => t.nome.toUpperCase() === rev.tipo_modus_operandi.toUpperCase()) && (
                                 <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 animate-pulse" title="Nuovo valore">
                                   <AlertCircle size={12} className="text-amber-600" />
                                   <span className="text-[8px] font-black text-amber-700">NUOVO</span>
                                 </div>
                               )}
                             </div>
                             {/* Similar Suggestions for Type */}
                             {rev.tipo_modus_operandi && !db.configuratore.categorie.find(c => c.nome.toUpperCase() === rev.categoria.toUpperCase())?.modusOperandi.find(mo => mo.nome.toUpperCase() === rev.modus_operandi_dettaglio.toUpperCase())?.tipi.some(t => t.nome.toUpperCase() === rev.tipo_modus_operandi.toUpperCase()) && (
                               <div className="bg-amber-50 p-2 rounded-lg border border-amber-100">
                                 <p className="text-[9px] font-black text-amber-700 mb-1 flex items-center gap-1 uppercase tracking-tighter">
                                    <Zap size={10} /> Tipologia Nuova
                                 </p>
                                 <div className="flex flex-wrap gap-1">
                                   {db.configuratore.categorie.flatMap(c => c.modusOperandi).flatMap(m => m.tipi)
                                     .filter(t => t.nome.toUpperCase().includes(rev.tipo_modus_operandi.toUpperCase()) || rev.tipo_modus_operandi.toUpperCase().includes(t.nome.toUpperCase()))
                                     .slice(0, 3)
                                     .map(t => (
                                       <button 
                                         key={t.id}
                                         onClick={() => {
                                           const newRev = [...reviewData];
                                           newRev[idx].tipo_modus_operandi = t.nome.toUpperCase();
                                           setReviewData(newRev);
                                         }}
                                         className="text-[9px] bg-white border border-slate-200 hover:border-indigo-400 px-2 py-0.5 rounded text-slate-500 hover:text-indigo-600 transition-colors shadow-sm"
                                       >
                                         USA: {t.nome}
                                       </button>
                                     ))
                                   }
                                 </div>
                               </div>
                             )}
                           </div>
                        </div>
                     </div>
                   </div>
                 ))}
               </div>

               <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                  <button 
                    onClick={() => setReviewData(null)}
                    className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Annulla Tutto
                  </button>
                  <button 
                    onClick={confirmReview}
                    disabled={isProcessingSave}
                    className={`${isProcessingSave ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all text-sm uppercase tracking-widest`}
                  >
                    <CheckCircle2 size={18} className={isProcessingSave ? 'animate-spin' : ''} />
                    {isProcessingSave ? 'Salvataggio...' : 'Conferma e Archivia'}
                  </button>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
