import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FileText, Download, Filter, Search, BarChart, Map as MapIcon, Shield, AlertTriangle, Users, CheckSquare, Square, Calendar, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Segnalazione } from '../types';
import { cn } from '../lib/utils';
import { MODUS_OPERANDI_CATEGORIES } from '../lib/modusOperandi';
import { HermesLogo } from './HermesLogo';

// Fix for default marker icons in Leaflet
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface AnalysisReportProps {
  segnalazioni: Segnalazione[];
}

type ReportScope = 'FULL' | 'SEGNALAZIONI';

export default function AnalysisReport({ segnalazioni }: AnalysisReportProps) {
  const [selectedScopes, setSelectedScopes] = useState<ReportScope[]>(['FULL']);
  
  // Filters for Report
  const [filterProvincia, setFilterProvincia] = useState('');
  const [filterComune, setFilterComune] = useState('');
  const [filterModus, setFilterModus] = useState('');
  const [filterSoggetto, setFilterSoggetto] = useState('');

  const reportMapRef = useRef<L.Map | null>(null);
  const reportMarkerLayerRef = useRef<L.LayerGroup | null>(null);
  const geoCacheRef = useRef<Record<string, { lat: number, lon: number }>>({});

  const geocode = async (city: string) => {
    if (geoCacheRef.current[city]) return geoCacheRef.current[city];
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=it&q=${encodeURIComponent(city)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        geoCacheRef.current[city] = coords;
        localStorage.setItem('aasp_geocache', JSON.stringify(geoCacheRef.current));
        return coords;
      }
    } catch (err) {}
    return null;
  };

  useEffect(() => {
    const savedCache = localStorage.getItem('aasp_geocache');
    if (savedCache) geoCacheRef.current = JSON.parse(savedCache);
  }, []);

  const filteredSegnalazioni = useMemo(() => {
    return segnalazioni.filter(s => {
      if (filterProvincia && s.provincia_evento !== filterProvincia) return false;
      if (filterComune && s.comune_evento?.toUpperCase() !== filterComune.toUpperCase()) return false;
      if (filterModus && !s.modus_operandi.toLowerCase().includes(filterModus.toLowerCase())) return false;
      return true;
    });
  }, [segnalazioni, filterProvincia, filterComune, filterModus]);

  const filteredSoggetti = useMemo(() => {
    return [];
  }, []);

  useEffect(() => {
    const initMap = () => {
      const container = document.getElementById('report-map');
      if (!container || reportMapRef.current) return;

      reportMapRef.current = L.map('report-map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false
      }).setView([41.8719, 12.5674], 6);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(reportMapRef.current);
      reportMarkerLayerRef.current = L.layerGroup().addTo(reportMapRef.current);
    };

    initMap();

    const updateMap = async () => {
      if (!reportMapRef.current || !reportMarkerLayerRef.current) return;
      reportMarkerLayerRef.current.clearLayers();
      
      const cityCounts: Record<string, number> = {};
      filteredSegnalazioni.forEach(s => {
        if (s.comune_evento && s.comune_evento !== "N/D") {
          const city = s.comune_evento.split(/[\(\-\,]/)[0].trim().toUpperCase();
          cityCounts[city] = (cityCounts[city] || 0) + 1;
        }
      });

      const markers: L.Marker[] = [];
      for (const [city, count] of Object.entries(cityCounts)) {
        const coords = await geocode(city);
        if (coords) {
          const marker = L.circleMarker([coords.lat, coords.lon], {
            radius: Math.min(15, 4 + (count as number) * 1.5),
            fillColor: "#3b82f6",
            color: "#1d4ed8",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.7
          });
          marker.addTo(reportMarkerLayerRef.current);
          markers.push(marker as any);
        }
      }

      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        reportMapRef.current.fitBounds(group.getBounds(), { padding: [20, 20] });
      }
      
      setTimeout(() => {
        reportMapRef.current?.invalidateSize();
      }, 500);
    };

    updateMap();
  }, [filteredSegnalazioni]);

  const toggleScope = (scope: ReportScope) => {
    setSelectedScopes(prev => {
      if (prev.includes(scope)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(s => s !== scope);
      }
      return [...prev, scope];
    });
  };

  const province = Array.from(new Set(segnalazioni.map(s => s.provincia_evento))).filter(p => p && p !== "N/D").sort();
  const comuni = Array.from(new Set(segnalazioni
    .filter(s => !filterProvincia || s.provincia_evento === filterProvincia)
    .map(s => s.comune_evento?.toUpperCase())
  )).filter(c => c && c !== "N/D").sort();
  const modiOperandi = Array.from(new Set(segnalazioni.map(s => s.modus_operandi))).filter(m => m && m !== "N/D").sort();

  const generateReport = () => {
    window.focus();
    window.print();
  };

  // Helper to extract dates from filtered segnalazioni
  const dateRange = useMemo(() => {
    if (filteredSegnalazioni.length === 0) return "N/D";
    const dates = filteredSegnalazioni.map(s => {
      const d = s.dataOra.split(' ')[0];
      const parts = d.split('/');
      return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
    }).filter(t => !isNaN(t));
    if (dates.length === 0) return "N/D";
    const min = new Date(Math.min(...dates)).toLocaleDateString();
    const max = new Date(Math.max(...dates)).toLocaleDateString();
    return `${min} - ${max}`;
  }, [filteredSegnalazioni]);

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Configuration Panel */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6 no-print">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2">
            <FileText className="text-blue-600" size={24} />
            <h2 className="text-xl font-bold text-slate-800">Report Investigativo</h2>
          </div>
          <button 
            onClick={generateReport}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md"
          >
            <Download size={18} />
            Esporta Report (A4)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Ambiti del Report (Seleziona uno o più)</label>
            <div className="flex flex-col gap-2">
              {[
                { id: 'FULL', label: 'Analisi Integrata Fenomenologica', icon: BarChart },
                { id: 'SEGNALAZIONI', label: 'Dettaglio Segnalazioni Operative', icon: AlertTriangle },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => toggleScope(t.id as any)}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-sm text-left",
                    selectedScopes.includes(t.id as any) 
                      ? "bg-blue-50 border-blue-200 text-blue-700 font-bold shadow-sm" 
                      : "border-slate-100 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <t.icon size={18} />
                    {t.label}
                  </div>
                  {selectedScopes.includes(t.id as any) ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 space-y-4">
            <label className="text-xs font-bold text-slate-500 uppercase">Filtri di Selezione Dati</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select 
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white"
                value={filterProvincia}
                onChange={(e) => { setFilterProvincia(e.target.value); setFilterComune(''); }}
              >
                <option value="">Tutte le Province</option>
                {province.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select 
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white"
                value={filterComune}
                onChange={(e) => setFilterComune(e.target.value)}
                disabled={!filterProvincia}
              >
                <option value="">Tutti i Comuni</option>
                {comuni.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input 
                type="text" 
                placeholder="Modus Operandi..." 
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none bg-white"
                value={filterModus}
                onChange={(e) => setFilterModus(e.target.value)}
                list="modus-operandi-list-report"
              />
              <datalist id="modus-operandi-list-report">
                {MODUS_OPERANDI_CATEGORIES.map(cat => <option key={cat} value={cat} />)}
              </datalist>
              <input 
                type="text" 
                placeholder="Filtra per Soggetto (Cognome)..." 
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none"
                value={filterSoggetto}
                onChange={(e) => setFilterSoggetto(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-slate-400 italic">
              * Il report includerà solo i dati che rispettano i filtri sopra impostati.
            </p>
          </div>
        </div>
      </div>

      {/* Report Preview (A4 Vertical) */}
      <div className="flex-1 bg-slate-200 p-8 overflow-y-auto flex justify-center no-print">
        <div className="bg-white w-[210mm] min-h-[297mm] shadow-2xl p-[20mm] font-serif text-slate-900 flex flex-col gap-8 print-view">
          {/* Header */}
          <div className="border-b-4 border-slate-900 pb-4 flex justify-between items-start">
            <div className="flex gap-4">
              <HermesLogo size={48} className="text-slate-900" />
              <div className="space-y-1">
                <h1 className="text-2xl font-black uppercase tracking-tighter">Relazione Tecnica di Analisi Investigativa</h1>
                <p className="text-sm font-bold text-slate-600">Sistema H.E.R.M.E.S. - HUB Elaborativo Ricerca Metadati e Eventi Segnalati</p>
              </div>
            </div>
            <div className="text-right text-xs font-mono">
              <p>DATA: {new Date().toLocaleDateString()}</p>
              <p>PROT: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
            </div>
          </div>

          {/* Georeferencing Section */}
          <section className="space-y-4 break-inside-avoid">
            <h3 className="text-lg font-bold uppercase border-b border-slate-300 pb-1">0. Georeferenziazione dei Dati Elaborati</h3>
            <div className="text-xs grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <p className="font-bold text-slate-500 uppercase mb-1">Ambiti Territoriali Coinvolti:</p>
                <p className="text-slate-700">
                  {province.length > 0 ? `Province: ${province.join(', ')}` : 'Nessuna provincia specifica.'} <br/>
                  {comuni.length > 0 ? `Comuni: ${comuni.join(', ')}` : 'Nessun comune specifico.'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <p className="font-bold text-slate-500 uppercase mb-1">Coordinate di Riferimento:</p>
                <p className="text-slate-700 italic">
                  Dati geospaziali estratti da {filteredSegnalazioni.length} segnalazioni operative.
                </p>
              </div>
            </div>
            
            {/* Map Section for Report */}
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Visualizzazione Spaziale degli Eventi:</p>
              <div id="report-map" className="aspect-[2/1] bg-slate-100 border border-slate-300 rounded relative z-0" />
              <p className="text-[8px] text-slate-400 italic text-center">Mappa georeferenziata dei cluster criminali rilevati (OpenStreetMap Data)</p>
            </div>
          </section>

          {/* Statistics and Charts Section */}
          <section className="space-y-4 break-inside-avoid">
            <h3 className="text-lg font-bold uppercase border-b border-slate-300 pb-1">0.1 Analisi Quantitativa e Distribuzione</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Distribuzione per Categoria</p>
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border p-1 text-left">Categoria</th>
                      <th className="border p-1 text-center">Eventi</th>
                      <th className="border p-1 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      filteredSegnalazioni.reduce((acc, s) => {
                        acc[s.categoria] = (acc[s.categoria] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([cat, count]) => (
                      <tr key={cat}>
                        <td className="border p-1">{cat}</td>
                        <td className="border p-1 text-center font-bold">{count}</td>
                        <td className="border p-1 text-right">
                          {filteredSegnalazioni.length > 0 ? (((count as number) / filteredSegnalazioni.length) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase">Top 5 Comuni Interessati</p>
                <div className="space-y-1">
                  {Object.entries(
                    filteredSegnalazioni.reduce((acc, s) => {
                      acc[s.comune_evento] = (acc[s.comune_evento] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  )
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .slice(0, 5)
                    .map(([comune, count]) => (
                      <div key={comune} className="flex items-center gap-2">
                        <div className="text-[10px] w-24 truncate font-medium">{comune}</div>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500" 
                            style={{ width: `${filteredSegnalazioni.length > 0 ? ((count as number) / filteredSegnalazioni.length) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-bold">{count}</div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>

          {/* Executive Summary & Phenomenon Explanation */}
          {(selectedScopes.includes('FULL') || selectedScopes.includes('SEGNALAZIONI')) && (
            <section className="space-y-4 break-inside-avoid">
              <h3 className="text-lg font-bold uppercase border-b border-slate-300 pb-1">1. Analisi del Fenomeno e Sintesi Esecutiva</h3>
              <div className="text-sm leading-relaxed text-justify space-y-3">
                <p>
                  La presente relazione analizza il fenomeno criminale rilevato nel territorio di 
                  {filterProvincia ? ` Provincia di ${filterProvincia}${filterComune ? `, Comune di ${filterComune}` : ''}` : ' competenza'}. 
                  Il periodo temporale analizzato intercorre tra il <strong>{dateRange}</strong>.
                </p>
                <p>
                  <strong>Relazione Esplicativa:</strong> L'analisi dei dati evidenzia una concentrazione di eventi riconducibili a 
                  {filterModus ? ` modus operandi di tipo "${filterModus}"` : ' diverse tipologie delittuose'}. 
                  Si osserva una ricorrenza sistematica di elementi analoghi, in particolare per quanto concerne le modalità esecutive e le fasce orarie di commissione.
                </p>
                <div className="bg-slate-50 p-3 border border-slate-200 rounded">
                  <p className="font-bold mb-1">Elementi Emersi:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Totale Segnalazioni Analizzate: {filteredSegnalazioni.length}</li>
                    <li>Principali Hotspot: {Array.from(new Set(filteredSegnalazioni.map(s => s.comune_evento))).slice(0, 3).join(', ')}</li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Recurrences and Characteristics */}
          {selectedScopes.includes('SEGNALAZIONI') && (
            <section className="space-y-4 break-inside-avoid">
              <h3 className="text-lg font-bold uppercase border-b border-slate-300 pb-1">2. Ricorrenze e Caratteristiche del Fenomeno</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border border-slate-200 rounded">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Caratteristiche Autori/Vittime</h4>
                    <p className="text-xs leading-relaxed">
                      Dall'analisi delle segnalazioni emerge una prevalenza di autori {
                        filteredSegnalazioni.some(s => Array.isArray(s.indagati) && s.indagati.length > 0) 
                        ? "già noti alle FF.PP." 
                        : "in corso di identificazione"
                      }. Le vittime risultano prevalentemente {
                        filteredSegnalazioni.filter(s => Array.isArray(s.vittime) && s.vittime.some(v => v && v.eta && parseInt(v.eta) > 65)).length > 0 
                        ? "appartenenti a fasce d'età vulnerabili (Over 65)" 
                        : "eterogenee"
                      }.
                    </p>
                  </div>
                  <div className="p-3 border border-slate-200 rounded">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Refurtiva e Corpi di Reato</h4>
                    <p className="text-xs leading-relaxed">
                      Gli elementi di interesse (refurtiva/stupefacenti) segnalati includono: {
                        Array.from(new Set(filteredSegnalazioni.map(s => s.sintesi.match(/(denaro|oro|gioielli|auto|droga|cocaina|eroina|hashish)/gi)).flat())).filter(Boolean).join(', ') || "Dati non esplicitati nelle sintesi brevi."
                      }
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-bold">Ricorrenze Investigative di Elementi Analoghi:</p>
                  <div className="text-xs space-y-2">
                    {filteredSegnalazioni.slice(0, 2).map((s, i) => (
                      <div key={s.idUnivoco} className="p-2 bg-slate-50 border-l-2 border-slate-400">
                        <strong>Evento {i+1}:</strong> {s.oggetto} - {s.dataOra}. <br/>
                        <span className="italic text-slate-500">Analogie: {s.modus_operandi} in area {s.comune_evento}.</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Investigative Prospectus */}
          <section className="space-y-4 break-inside-avoid">
            <h3 className="text-lg font-bold uppercase border-b border-slate-300 pb-1">4. Prospetto Attività Investigative e Spunti per la P.G.</h3>
            <div className="text-sm leading-relaxed space-y-4">
              <div className="bg-blue-50/50 p-4 border-l-4 border-blue-600 rounded-r">
                <h4 className="font-bold text-blue-900 mb-2 uppercase text-xs">Spunti Investigativi Suggeriti:</h4>
                <ul className="list-disc pl-5 space-y-2 text-xs text-blue-900">
                  <li><strong>Incrocio Dati Targhe:</strong> Verificare il transito di veicoli sospetti segnalati nei varchi O.C.S.A. (Omologazione Controllo Sosta e Accessi) nelle fasce orarie critiche.</li>
                  <li><strong>Analisi Relazionale:</strong> Approfondire i legami tra i soggetti co-identificati nei controlli del territorio per mappare la rete di contatti degli indagati.</li>
                  <li><strong>Sopralluoghi Tecnici:</strong> Effettuare rilievi fotogrammetrici e acquisizione filmati di videosorveglianza urbana e privata nei punti di interesse georeferenziati.</li>
                  <li><strong>Accertamenti Patrimoniali:</strong> Per i soggetti con ricorrenze in reati contro il patrimonio, avviare verifiche su tenore di vita e possedimenti non giustificati.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-xs uppercase text-slate-500">Attività da Esperire:</p>
                <ul className="list-decimal pl-5 space-y-1 text-xs">
                  <li><strong>Monitoraggio Territoriale:</strong> Intensificazione dei servizi di controllo nelle aree di {Array.from(new Set(filteredSegnalazioni.map(s => s.comune_evento))).slice(0, 2).join(' e ')}.</li>
                  <li><strong>Analisi Tecnica:</strong> Acquisizione e analisi dei tabulati telefonici e delle celle asservite nei periodi di massima ricorrenza.</li>
                  <li><strong>Verifiche Incrociate:</strong> Confronto dei profili biologici/impronte (se disponibili) con le banche dati nazionali per i soggetti con precedenti specifici.</li>
                  <li><strong>Attività Informativa:</strong> Sviluppo di fonti fiduciarie per l'individuazione dei canali di ricettazione della refurtiva segnalata.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="mt-auto pt-8 flex justify-between items-end border-t border-slate-200 no-print">
            <div className="text-[10px] text-slate-400 italic">
              Relazione Tecnica Riservata - Sistema H.E.R.M.E.S.
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold">Fine della Relazione</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          
          body, html { 
            height: auto !important; 
            overflow: visible !important; 
            background: white !important; 
            margin: 0 !important;
            padding: 0 !important;
          }

          #root, #root > div, main, .flex-1, .overflow-y-auto, .overflow-hidden { 
            overflow: visible !important; 
            height: auto !important;
            min-height: auto !important;
            position: static !important;
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .bg-slate-200 { 
            background: white !important; 
            padding: 0 !important; 
            display: block !important; 
            height: auto !important;
            overflow: visible !important;
          }

          .print-view { 
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            margin: 0 !important;
            padding: 15mm !important;
            box-shadow: none !important;
            visibility: visible !important;
            overflow: visible !important;
            position: relative !important;
            border: none !important;
          }

          .break-inside-avoid { 
            break-inside: avoid;
            page-break-inside: avoid;
          }

          section {
            margin-bottom: 20px !important;
            break-inside: auto;
          }

          h3 {
            break-after: avoid;
          }

          .leaflet-control-container {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
