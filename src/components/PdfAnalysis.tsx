import React, { useState, useRef } from 'react';
import { Upload, FileText, Search, Filter, Loader2, Eye, Shield, AlertTriangle, User, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
import { Segnalazione } from '../types';
import { analyzePdfContent } from '../lib/geminiService';
import { cn, parseAndFormatDate } from '../lib/utils';
import { normalizeModusOperandi, MODUS_OPERANDI_CATEGORIES } from '../lib/modusOperandi';

// Set worker source using a more reliable method for Vite
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfAnalysisProps {
  database: Segnalazione[];
  setDatabase: React.Dispatch<React.SetStateAction<Segnalazione[]>>;
  onDataChange: () => void;
}

export default function PdfAnalysis({ database, setDatabase, onDataChange }: PdfAnalysisProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: boolean, message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCognome, setFilterCognome] = useState('');
  const [filterNome, setFilterNome] = useState('');
  const [filterProvincia, setFilterProvincia] = useState('');
  const [filterComune, setFilterComune] = useState('');
  const [filterModus, setFilterModus] = useState('');
  const [filterDataDal, setFilterDataDal] = useState('');
  const [filterDataAl, setFilterDataAl] = useState('');
  const [filterEta, setFilterEta] = useState('');
  const [filterSesso, setFilterSesso] = useState('');
  
  const [selectedSegnalazione, setSelectedSegnalazione] = useState<Segnalazione | null>(null);
  const [quickViewSubject, setQuickViewSubject] = useState<{ cognome: string, nome: string, data_nascita: string, luogo_nascita: string, tipo: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [editingModus, setEditingModus] = useState<{ id: string, value: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
  };

  const extractTextFromPdf = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Ensure worker is ready or use a local one if possible
      const loadingTask = pdfjs.getDocument({ 
        data: arrayBuffer,
        useWorkerFetch: true,
        isEvalSupported: false
      });
      const pdf = await loadingTask.promise;
      let fullText = "";
      
      // Limit to first 30 pages for better coverage
      const maxPages = Math.min(pdf.numPages, 30);
      
      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Better text reconstruction from PDF items with positioning awareness
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ")
          .replace(/\s+/g, ' ');
          
        fullText += `--- PAGINA ${i} ---\n${pageText}\n\n`;
      }
      return fullText.trim();
    } catch (err) {
      console.error("PDF Extraction Error:", err);
      throw new Error("Impossibile leggere il contenuto del PDF. Il file potrebbe essere protetto, scansionato come immagine o danneggiato.");
    }
  };

  const processFiles = async (files: File[]) => {
    setIsUploading(true);
    setProgress(0);
    setImportResult(null);
    let totalAdded = 0;
    try {
      const totalSteps = files.length * 2;
      let currentStep = 0;

      for (const file of files) {
        let text = "";
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith('.txt')) {
          setStatus(`Lettura TXT: ${file.name}...`);
          text = await file.text();
        } else if (fileName.endsWith('.json')) {
          setStatus(`Lettura JSON: ${file.name}...`);
          const jsonText = await file.text();
          try {
            const jsonData = JSON.parse(jsonText);
            const newSegs = Array.isArray(jsonData) ? jsonData : (jsonData.segnalazioni || []);
            if (newSegs.length > 0) {
              setDatabase(prev => [...prev, ...newSegs]);
              totalAdded += newSegs.length;
              currentStep += 2;
              continue;
            }
          } catch (e) {
            console.error("JSON Parse Error", e);
          }
          currentStep += 2;
          continue;
        } else if (fileName.endsWith('.pdf')) {
          setStatus(`Lettura PDF: ${file.name}...`);
          text = await extractTextFromPdf(file);
        } else {
          console.warn(`Formato file non supportato: ${file.name}`);
          currentStep += 2;
          continue;
        }

        currentStep++;
        setProgress(Math.round((currentStep / totalSteps) * 100));
        
        if (!text || text.length < 20) {
          console.warn(`File ${file.name} vuoto o troppo corto.`);
          currentStep++;
          continue;
        }

        setStatus(`Analisi AI: ${file.name}...`);
        
        const maxChars = 35000;
        const textChunks = [];
        if (text.length > maxChars) {
          for (let i = 0; i < text.length; i += maxChars) {
            textChunks.push(text.substring(i, i + maxChars));
          }
        } else {
          textChunks.push(text);
        }

        for (let i = 0; i < textChunks.length; i++) {
          if (textChunks.length > 1) {
            setStatus(`Analisi AI - Blocco ${i + 1}/${textChunks.length}: ${file.name}...`);
          }
          
          const result = await analyzePdfContent(textChunks[i]);
          
          if (result.segnalazioni && Array.isArray(result.segnalazioni)) {
            const newSegnalazioni = result.segnalazioni.map((s: any) => ({
              ...s,
              dataOra: parseAndFormatDate(s.dataOra),
              vittime: Array.isArray(s.vittime) ? s.vittime : [],
              indagati: Array.isArray(s.indagati) ? s.indagati : [],
              idUnivoco: s.protocollo && s.protocollo !== "N/D" ? s.protocollo : `AI-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
            }));
            
            setDatabase(prev => {
              const existingProtocols = new Set(prev.map(item => item.protocollo).filter(p => p && p !== "N/D"));
              const existingKeys = new Set(prev.map(item => `${item.oggetto}-${item.dataOra}`));
              
              const filtered = newSegnalazioni.filter((s: any) => {
                const isDuplicateProtocol = s.protocollo && s.protocollo !== "N/D" && existingProtocols.has(s.protocollo);
                const isDuplicateContent = existingKeys.has(`${s.oggetto}-${s.dataOra}`);
                return !isDuplicateProtocol && !isDuplicateContent;
              });
              
              totalAdded += filtered.length;
              if (filtered.length > 0) onDataChange();
              return [...prev, ...filtered];
            });
          }
        }
        currentStep++;
        setProgress(Math.round((currentStep / totalSteps) * 100));
      }
      
      if (totalAdded > 0) {
        setImportResult({ success: true, message: `Importazione completata: aggiunte ${totalAdded} nuove segnalazioni.` });
      } else {
        setImportResult({ success: false, message: "Nessuna nuova segnalazione trovata o file già importati." });
      }
      setStatus('Completato');
      setProgress(100);
    } catch (err) {
      console.error("Upload/Analysis Error:", err);
      setImportResult({ success: false, message: "Errore: " + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setIsUploading(false);
      setStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
  };

  const handleNormalizeAll = () => {
    if (window.confirm("Vuoi normalizzare tutti i Modus Operandi e le Date nel database? Questa operazione convertirà i valori in formati standardizzati.")) {
      setIsNormalizing(true);
      setTimeout(() => {
        setDatabase(prev => prev.map(s => ({
          ...s,
          modus_operandi: normalizeModusOperandi(s.modus_operandi),
          dataOra: parseAndFormatDate(s.dataOra)
        })));
        onDataChange();
        setIsNormalizing(false);
        setImportResult({ success: true, message: "Normalizzazione completata con successo." });
      }, 500);
    }
  };

  const handleUpdateModus = (id: string, newValue: string) => {
    setDatabase(prev => prev.map(s => s.idUnivoco === id ? { ...s, modus_operandi: newValue.toUpperCase() } : s));
    onDataChange();
    setEditingModus(null);
    if (selectedSegnalazione?.idUnivoco === id) {
      setSelectedSegnalazione(prev => prev ? { ...prev, modus_operandi: newValue.toUpperCase() } : null);
    }
  };

  const filteredData = database.filter(s => {
    const matchSearch = (s.oggetto.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        s.testoIntegrale.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchCat = !filterCategory || s.categoria === filterCategory;
    
    // Check victims and suspects for name/surname filters
    const vittime = Array.isArray(s.vittime) ? s.vittime : [];
    const indagati = Array.isArray(s.indagati) ? s.indagati : [];
    const allSubjects = [...vittime, ...indagati];
    const matchCognome = !filterCognome || allSubjects.some(sub => sub && sub.cognome && sub.cognome.toLowerCase().includes(filterCognome.toLowerCase()));
    const matchNome = !filterNome || allSubjects.some(sub => sub && sub.nome && sub.nome.toLowerCase().includes(filterNome.toLowerCase()));
    const matchProvincia = !filterProvincia || s.provincia_evento === filterProvincia;
    const matchComune = !filterComune || s.comune_evento?.toUpperCase() === filterComune.toUpperCase();
    const matchModus = !filterModus || s.modus_operandi.toLowerCase().includes(filterModus.toLowerCase());
    
    // Date range filter for the report itself
    const matchDataRange = (() => {
      if (!filterDataDal && !filterDataAl) return true;
      
      const parseDateToISO = (dStr: string) => {
        try {
          // Handle DD/MM/YYYY
          if (dStr.includes('/')) {
            const [d, m, y] = dStr.split(' ')[0].split('/');
            const fullYear = y.length === 2 ? `20${y}` : y;
            return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          // Handle "10 apr 2026"
          const months: Record<string, string> = {
            'gen': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'mag': '05', 'giu': '06',
            'lug': '07', 'ago': '08', 'set': '09', 'ott': '10', 'nov': '11', 'dic': '12'
          };
          const parts = dStr.toLowerCase().split(' ');
          if (parts.length >= 3) {
            const day = parts[0].padStart(2, '0');
            const month = months[parts[1].substring(0, 3)] || '01';
            const year = parts[2];
            return `${year}-${month}-${day}`;
          }
          return null;
        } catch (e) { return null; }
      };

      const reportDateISO = parseDateToISO(s.dataOra);
      if (!reportDateISO) return true; // If we can't parse it, don't filter it out by date

      if (filterDataDal && reportDateISO < filterDataDal) return false;
      if (filterDataAl && reportDateISO > filterDataAl) return false;
      return true;
    })();

    const matchEta = !filterEta || (s.vittima_eta && s.vittima_eta.includes(filterEta));
    const matchSesso = !filterSesso || (s.vittima_sesso && s.vittima_sesso.toUpperCase() === filterSesso.toUpperCase());

    return matchSearch && matchCat && matchCognome && matchNome && matchDataRange && matchEta && matchSesso && matchProvincia && matchComune && matchModus;
  }).sort((a, b) => {
    const parseDate = (dStr: string) => {
      try {
        // Handle DD/MM/YYYY HH:mm
        if (dStr.includes('/')) {
          const [d, t] = dStr.split(' ');
          const [day, month, year] = d.split('/');
          const time = t || '00:00';
          const fullYear = year.length === 2 ? `20${year}` : year;
          return new Date(`${fullYear}-${month}-${day}T${time}:00`).getTime();
        }
        // Handle "10 apr 2026"
        const months: Record<string, number> = {
          'gen': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mag': 4, 'giu': 5,
          'lug': 6, 'ago': 7, 'set': 8, 'ott': 9, 'nov': 10, 'dic': 11
        };
        const parts = dStr.toLowerCase().split(' ');
        if (parts.length >= 3) {
          const day = parseInt(parts[0]);
          const month = months[parts[1].substring(0, 3)] || 0;
          const year = parseInt(parts[2]);
          const timePart = parts.find(p => p.includes(':')) || '00:00';
          const [h, m] = timePart.split(':');
          return new Date(year, month, day, parseInt(h || '0'), parseInt(m || '0')).getTime();
        }
        return 0;
      } catch (e) {
        return 0;
      }
    };
    return parseDate(b.dataOra) - parseDate(a.dataOra);
  });

  const categories = Array.from(new Set(database.map(s => s.categoria))).filter(Boolean);
  const province = Array.from(new Set(database.map(s => s.provincia_evento))).filter(p => p && p !== "N/D").sort();
  const comuni = Array.from(new Set(database
    .filter(s => !filterProvincia || s.provincia_evento === filterProvincia)
    .map(s => s.comune_evento?.toUpperCase())
  )).filter(c => c && c !== "N/D").sort();
  const modiOperandi = Array.from(new Set(database.map(s => s.modus_operandi))).filter(m => m && m !== "N/D").sort();

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Import Status Notification */}
      <AnimatePresence>
        {importResult && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "p-4 rounded-xl border flex items-center justify-between shadow-sm",
              importResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
            )}
          >
            <div className="flex items-center gap-3">
              {importResult.success ? <Shield size={20} className="text-emerald-500" /> : <AlertTriangle size={20} className="text-rose-500" />}
              <p className="text-sm font-bold">{importResult.message}</p>
            </div>
            <button onClick={() => setImportResult(null)} className="p-1 hover:bg-black/5 rounded-full">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-1">
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center transition-all h-full flex flex-col justify-center items-center gap-3 bg-white shadow-sm",
              isUploading ? "border-blue-400 bg-blue-50/30" : (isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50")
            )}
          >
            {isUploading ? (
              <div className="w-full space-y-4">
                <Loader2 className="animate-spin text-blue-500 mx-auto" size={32} />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">{status}</p>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="bg-blue-500 h-full"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold">{progress}%</p>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                  <Upload size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Importa Documenti</h3>
                  <p className="text-[10px] text-slate-500">TXT o JSON (Trascina o clicca)</p>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                >
                  Sfoglia
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  multiple 
                  accept=".txt,.json" 
                  className="hidden" 
                />
              </>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="lg:col-span-3 bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Filter size={16} />
              Filtri Avanzati
            </h3>
            <button 
              onClick={() => {
                setSearchTerm(''); setFilterCategory(''); setFilterCognome(''); setFilterNome('');
                setFilterDataDal(''); setFilterDataAl(''); setFilterEta(''); setFilterSesso('');
                setFilterProvincia(''); setFilterComune(''); setFilterModus('');
              }}
              className="text-[10px] font-bold text-blue-600 hover:underline"
            >
              RESET FILTRI
            </button>
            <button 
              onClick={handleNormalizeAll}
              disabled={isNormalizing || database.length === 0}
              className="text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              <Shield size={12} />
              NORMALIZZA MODUS OPERANDI
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Cerca oggetto o contenuto..." 
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <input 
              type="text" 
              placeholder="Cognome..." 
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              value={filterCognome}
              onChange={(e) => setFilterCognome(e.target.value)}
            />
            <input 
              type="text" 
              placeholder="Nome..." 
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              value={filterNome}
              onChange={(e) => setFilterNome(e.target.value)}
            />

            <select 
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={filterProvincia}
              onChange={(e) => { setFilterProvincia(e.target.value); setFilterComune(''); }}
            >
              <option value="">Tutte le Province</option>
              {province.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select 
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={filterComune}
              onChange={(e) => setFilterComune(e.target.value)}
              disabled={!filterProvincia && province.length > 0}
            >
              <option value="">Tutti i Comuni</option>
              {comuni.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <input 
              type="text" 
              placeholder="Modus Operandi..." 
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={filterModus}
              onChange={(e) => setFilterModus(e.target.value)}
              list="modus-operandi-list"
            />
            <datalist id="modus-operandi-list">
              {MODUS_OPERANDI_CATEGORIES.map(cat => <option key={cat} value={cat} />)}
            </datalist>
            
            <div className="flex items-center gap-2 md:col-span-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase min-w-fit">Data Evento:</span>
              <div className="flex-1 relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-400 uppercase">Dal</span>
                <input 
                  type="date" 
                  className="w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  value={filterDataDal}
                  onChange={(e) => setFilterDataDal(e.target.value)}
                />
              </div>
              <div className="flex-1 relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-slate-400 uppercase">Al</span>
                <input 
                  type="date" 
                  className="w-full pl-8 pr-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  value={filterDataAl}
                  onChange={(e) => setFilterDataAl(e.target.value)}
                />
              </div>
            </div>

            <select 
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={filterEta}
              onChange={(e) => setFilterEta(e.target.value)}
            >
              <option value="">Tutte le età</option>
              <option value="Minorenne">Minorenne</option>
              <option value="18-35">18-35 anni</option>
              <option value="36-65">36-65 anni</option>
              <option value="Over 65">Over 65</option>
            </select>

            <select 
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              value={filterSesso}
              onChange={(e) => setFilterSesso(e.target.value)}
            >
              <option value="">Tutti i sessi</option>
              <option value="M">Maschio</option>
              <option value="F">Femmina</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Riferimenti</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Oggetto / Modus Operandi</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider">Sintesi</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-xs uppercase tracking-wider text-center">Azioni / Coinvolti</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((s) => (
                <tr key={s.idUnivoco} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{s.protocollo}</div>
                    <div className="text-[10px] text-slate-500 mt-1 font-medium">📅 {s.dataOra}</div>
                    <div className="text-[10px] text-blue-600 font-bold mt-1">🏢 {s.comando}</div>
                    <div className="mt-2">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold uppercase tracking-wider">
                        {s.categoria}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-xs">
                    <div className="font-bold text-slate-800 text-sm">{s.oggetto}</div>
                    <div className="mt-2 p-2 bg-amber-50 border-l-2 border-amber-400 rounded text-[11px]">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-amber-700">M.O.:</span>
                        <button 
                          onClick={() => setEditingModus({ id: s.idUnivoco, value: s.modus_operandi })}
                          className="text-[9px] text-blue-600 hover:underline font-bold"
                        >
                          Modifica
                        </button>
                      </div>
                      {editingModus?.id === s.idUnivoco ? (
                        <div className="flex gap-1">
                          <select 
                            className="flex-1 text-[10px] p-0.5 border rounded bg-white"
                            value={editingModus.value}
                            onChange={(e) => setEditingModus({ ...editingModus, value: e.target.value })}
                          >
                            {MODUS_OPERANDI_CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            {!MODUS_OPERANDI_CATEGORIES.includes(editingModus.value) && (
                              <option value={editingModus.value}>{editingModus.value}</option>
                            )}
                          </select>
                          <button 
                            onClick={() => handleUpdateModus(s.idUnivoco, editingModus.value)}
                            className="px-1 bg-blue-600 text-white text-[9px] rounded font-bold"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-700 font-medium">{s.modus_operandi}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed max-h-32 overflow-y-auto">
                      {s.sintesi}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => setSelectedSegnalazione(s)}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md text-[10px] font-bold hover:bg-blue-700 transition-colors"
                      >
                        <Eye size={12} /> LEGGI TUTTO
                      </button>
                      
                      <div className="flex flex-wrap gap-1 justify-center">
                        {(Array.isArray(s.vittime) ? s.vittime : []).map((v, i) => (
                          <button 
                            key={`v-${i}`}
                            onClick={() => setQuickViewSubject({ ...v, tipo: 'VITTIMA' })}
                            className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold hover:bg-emerald-200 transition-colors flex items-center gap-1"
                          >
                            <Shield size={8} /> {v.cognome}
                          </button>
                        ))}
                        {(Array.isArray(s.indagati) ? s.indagati : []).map((v, i) => (
                          <button 
                            key={`i-${i}`}
                            onClick={() => setQuickViewSubject({ ...v, tipo: 'INDAGATO' })}
                            className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-bold hover:bg-rose-200 transition-colors flex items-center gap-1"
                          >
                            <AlertTriangle size={8} /> {v.cognome}
                          </button>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                    Nessuna segnalazione trovata con i filtri attuali.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick View Subject Modal */}
      {quickViewSubject && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[70] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border-t-4",
              quickViewSubject.tipo === 'VITTIMA' ? "border-emerald-500" : "border-rose-500"
            )}
          >
            <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest",
                quickViewSubject.tipo === 'VITTIMA' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              )}>
                {quickViewSubject.tipo}
              </span>
              <button onClick={() => setQuickViewSubject(null)} className="p-1 hover:bg-slate-100 rounded-full">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 text-center">
              <div className={cn(
                "w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4",
                quickViewSubject.tipo === 'VITTIMA' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                <User size={32} />
              </div>
              <h3 className="font-bold text-xl text-slate-900 uppercase">{quickViewSubject.cognome} {quickViewSubject.nome}</h3>
              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p><b>Data Nascita:</b> {quickViewSubject.data_nascita}</p>
                <p><b>Luogo Nascita:</b> {quickViewSubject.luogo_nascita}</p>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-center">
              <button 
                onClick={() => setQuickViewSubject(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                CHIUDI
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal for details */}
      {selectedSegnalazione && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="font-bold text-lg text-slate-800">Dettaglio Segnalazione: {selectedSegnalazione.protocollo}</h2>
              <button onClick={() => setSelectedSegnalazione(null)} className="p-1 hover:bg-slate-200 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 border-b pb-2">Informazioni Generali</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-slate-500">Oggetto:</span> <span className="font-medium">{selectedSegnalazione.oggetto}</span></p>
                    <p><span className="text-slate-500">Comando:</span> <span className="font-medium">{selectedSegnalazione.comando}</span></p>
                    <p><span className="text-slate-500">Data/Ora:</span> <span className="font-medium">{selectedSegnalazione.dataOra}</span></p>
                    <p><span className="text-slate-500">Luogo:</span> <span className="font-medium">{selectedSegnalazione.comune_evento} ({selectedSegnalazione.provincia_evento})</span></p>
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-900 border-b pb-2">Analisi AI</h3>
                  <div className="space-y-4 text-sm">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-slate-500">Modus Operandi:</span>
                        <button 
                          onClick={() => setEditingModus({ id: selectedSegnalazione.idUnivoco, value: selectedSegnalazione.modus_operandi })}
                          className="text-[10px] text-blue-600 hover:underline font-bold"
                        >
                          Modifica
                        </button>
                      </div>
                      {editingModus?.id === selectedSegnalazione.idUnivoco ? (
                        <div className="flex gap-2">
                          <select 
                            className="flex-1 text-xs p-1.5 border rounded bg-white"
                            value={editingModus.value}
                            onChange={(e) => setEditingModus({ ...editingModus, value: e.target.value })}
                          >
                            {MODUS_OPERANDI_CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            {!MODUS_OPERANDI_CATEGORIES.includes(editingModus.value) && (
                              <option value={editingModus.value}>{editingModus.value}</option>
                            )}
                          </select>
                          <button 
                            onClick={() => handleUpdateModus(selectedSegnalazione.idUnivoco, editingModus.value)}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded font-bold"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span className="font-bold text-amber-600 block">{selectedSegnalazione.modus_operandi}</span>
                      )}
                    </div>
                    <p><span className="text-slate-500">Vittima:</span> <span className="font-medium">{selectedSegnalazione.vittima_sesso} | {selectedSegnalazione.vittima_eta}</span></p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 border-b pb-2">Soggetti Coinvolti</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                    <h4 className="text-xs font-bold text-emerald-700 uppercase mb-3 flex items-center gap-2">
                      <Shield size={14} /> Vittime ({(Array.isArray(selectedSegnalazione.vittime) ? selectedSegnalazione.vittime : []).length})
                    </h4>
                    <div className="space-y-3">
                      {(Array.isArray(selectedSegnalazione.vittime) ? selectedSegnalazione.vittime : []).map((v, i) => (
                        <div key={i} className="text-sm bg-white p-2 rounded border border-emerald-200">
                          <p className="font-bold text-slate-800">{v.cognome} {v.nome}</p>
                          <p className="text-xs text-slate-500">Nato il {v.data_nascita} a {v.luogo_nascita}</p>
                        </div>
                      ))}
                      {(!Array.isArray(selectedSegnalazione.vittime) || selectedSegnalazione.vittime.length === 0) && <p className="text-xs text-slate-400 italic">Nessuna vittima identificata</p>}
                    </div>
                  </div>
                  <div className="bg-rose-50 p-4 rounded-lg border border-rose-100">
                    <h4 className="text-xs font-bold text-rose-700 uppercase mb-3 flex items-center gap-2">
                      <AlertTriangle size={14} /> Indagati ({(Array.isArray(selectedSegnalazione.indagati) ? selectedSegnalazione.indagati : []).length})
                    </h4>
                    <div className="space-y-3">
                      {(Array.isArray(selectedSegnalazione.indagati) ? selectedSegnalazione.indagati : []).map((v, i) => (
                        <div key={i} className="text-sm bg-white p-2 rounded border border-rose-200">
                          <p className="font-bold text-slate-800">{v.cognome} {v.nome}</p>
                          <p className="text-xs text-slate-500">Nato il {v.data_nascita} a {v.luogo_nascita}</p>
                        </div>
                      ))}
                      {(!Array.isArray(selectedSegnalazione.indagati) || selectedSegnalazione.indagati.length === 0) && <p className="text-xs text-slate-400 italic">Nessun indagato identificato</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 border-b pb-2">Testo Integrale</h3>
                <div className="bg-slate-900 text-emerald-400 p-6 rounded-lg font-mono text-xs leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {selectedSegnalazione.testoIntegrale}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Removed XIcon custom component to use lucide-react X
