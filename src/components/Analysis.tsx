import React, { useMemo, useState, useEffect, useRef } from 'react';
import { BarChart3, TrendingUp, Map as MapIcon, Users, AlertTriangle, Shield, Calendar, MapPin, Search, Filter, RefreshCw, X, Eye, FileText, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Segnalazione } from '../types';
import { cn } from '../lib/utils';
import { MODUS_OPERANDI_CATEGORIES } from '../lib/modusOperandi';

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

interface AnalysisProps {
  segnalazioni: Segnalazione[];
}

export default function Analysis({ segnalazioni }: AnalysisProps) {
  const [filterProvincia, setFilterProvincia] = useState('');
  const [filterComune, setFilterComune] = useState('');
  const [filterModus, setFilterModus] = useState('');
  const [filterSoggetto, setFilterSoggetto] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterDataDal, setFilterDataDal] = useState('');
  const [filterDataAl, setFilterDataAl] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const geoCacheRef = useRef<Record<string, { lat: number, lon: number }>>({});

  useEffect(() => {
    const initMap = () => {
      if (mapRef.current) return;
      const container = document.getElementById('analysis-map');
      if (!container) return;

      mapRef.current = L.map('analysis-map').setView([41.8719, 12.5674], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current);
      markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
      
      // Force refresh size after a short delay to ensure container is fully rendered
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 500);
    };

    initMap();

    const savedCache = localStorage.getItem('aasp_geocache');
    if (savedCache) geoCacheRef.current = JSON.parse(savedCache);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

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

  const filteredSegnalazioni = useMemo(() => {
    return segnalazioni.filter(s => {
      if (filterProvincia && s.provincia_evento !== filterProvincia) return false;
      if (filterComune && s.comune_evento !== filterComune) return false;
      if (filterCategoria && s.categoria !== filterCategoria) return false;
      if (filterModus && !s.modus_operandi.toLowerCase().includes(filterModus.toLowerCase())) return false;
      
      if (filterDataDal || filterDataAl) {
        const parseDateToISO = (dStr: string) => {
          try {
            if (dStr.includes('/')) {
              const [d, m, y] = dStr.split(' ')[0].split('/');
              const fullYear = y.length === 2 ? `20${y}` : y;
              return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
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

        const date = parseDateToISO(s.dataOra);
        if (date) {
          if (filterDataDal && date < filterDataDal) return false;
          if (filterDataAl && date > filterDataAl) return false;
        }
      }

      if (filterSoggetto && 
          !(Array.isArray(s.vittime) ? s.vittime : []).some(v => v && v.cognome && v.cognome.toLowerCase().includes(filterSoggetto.toLowerCase())) && 
          !(Array.isArray(s.indagati) ? s.indagati : []).some(i => i && i.cognome && i.cognome.toLowerCase().includes(filterSoggetto.toLowerCase()))) return false;
      return true;
    });
  }, [segnalazioni, filterProvincia, filterComune, filterModus, filterSoggetto, filterCategoria, filterDataDal, filterDataAl]);

  const filteredSoggetti = useMemo(() => {
    return [];
  }, []);

  useEffect(() => {
    const updateMap = async () => {
      if (!mapRef.current || !markerLayerRef.current) return;
      markerLayerRef.current.clearLayers();
      
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
          const cityEvents = filteredSegnalazioni.filter(s => s.comune_evento?.split(/[\(\-\,]/)[0].trim().toUpperCase() === city);
          
          const popupContent = document.createElement('div');
          popupContent.className = "p-2 min-w-[200px]";
          popupContent.innerHTML = `
            <div class="font-bold text-slate-900 border-b mb-2 pb-1">📍 ${city}</div>
            <div class="text-xs text-slate-600 mb-2">Eventi rilevati: <b>${count}</b></div>
            <div class="max-h-40 overflow-y-auto space-y-2 mb-2">
              ${cityEvents.slice(0, 3).map(ev => `
                <div class="p-2 bg-slate-50 rounded border border-slate-100">
                  <div class="font-bold text-[10px] text-blue-600 truncate">${ev.oggetto}</div>
                  <div class="text-[9px] text-slate-400">${ev.dataOra}</div>
                </div>
              `).join('')}
              ${cityEvents.length > 3 ? `<div class="text-[9px] text-center text-slate-400 italic">+ altri ${cityEvents.length - 3} eventi</div>` : ''}
            </div>
          `;
          
          const btn = document.createElement('button');
          btn.className = "w-full py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700 transition-colors uppercase";
          btn.innerText = "Vedi Dettagli Area";
          btn.onclick = () => {
            // Open a list of events for this city
            setSelectedEvent({ type: 'CITY_LIST', city, events: cityEvents });
          };
          popupContent.appendChild(btn);

          const marker = L.circleMarker([coords.lat, coords.lon], {
            radius: Math.min(20, 5 + (count as number) * 2),
            fillColor: "#ef4444",
            color: "#b91c1c",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.6
          }).bindPopup(popupContent);
          marker.addTo(markerLayerRef.current);
          markers.push(marker as any);
        }
      }

      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        mapRef.current.fitBounds(group.getBounds(), { padding: [30, 30] });
      }
    };
    updateMap();
  }, [filteredSegnalazioni]);

  const stats = useMemo(() => {
    const categories = filteredSegnalazioni.reduce((acc, s) => {
      acc[s.categoria] = (acc[s.categoria] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const comuni = filteredSegnalazioni.reduce((acc, s) => {
      const normalizedComune = s.comune_evento?.toUpperCase().trim() || "N/D";
      acc[normalizedComune] = (acc[normalizedComune] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const modus = filteredSegnalazioni.reduce((acc, s) => {
      acc[s.modus_operandi] = (acc[s.modus_operandi] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      categories: Object.entries(categories).sort((a, b) => (b[1] as number) - (a[1] as number)),
      topComuni: Object.entries(comuni).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5),
      topModus: Object.entries(modus).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5)
    };
  }, [filteredSegnalazioni]);

  const province = Array.from(new Set(segnalazioni.map(s => s.provincia_evento))).filter(p => p && p !== "N/D").sort();
  const comuniList = Array.from(new Set(segnalazioni
    .filter(s => !filterProvincia || s.provincia_evento === filterProvincia)
    .map(s => s.comune_evento?.toUpperCase())
  )).filter(c => c && c !== "N/D").sort();
  const categorie = Array.from(new Set(segnalazioni.map(s => s.categoria))).filter(c => c && c !== "N/D").sort();
  const modiOperandi = Array.from(new Set(segnalazioni.map(s => s.modus_operandi))).filter(m => m && m !== "N/D").sort();

  return (
    <div className="space-y-6 h-full overflow-y-auto pb-10 pr-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Analisi Investigativa</h2>
          <p className="text-slate-500 text-sm">Dashboard di Intelligence e Analisi Fenomenologica</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setFilterProvincia(''); setFilterComune(''); setFilterModus(''); 
              setFilterSoggetto(''); setFilterCategoria(''); setFilterDataDal(''); setFilterDataAl('');
            }}
            className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors uppercase tracking-wider"
          >
            Reset Filtri
          </button>
          <div className="bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Shield size={18} className="text-blue-400" />
            <span className="font-bold text-xs uppercase tracking-wider">P.G. Intelligence</span>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Filtra per Soggetto (Cognome)..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={filterSoggetto}
              onChange={(e) => setFilterSoggetto(e.target.value)}
            />
          </div>
          <select 
            className="px-4 py-2 border border-slate-200 rounded-xl outline-none bg-white text-sm"
            value={filterProvincia}
            onChange={(e) => { setFilterProvincia(e.target.value); setFilterComune(''); }}
          >
            <option value="">Tutte le Province</option>
            {province.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select 
            className="px-4 py-2 border border-slate-200 rounded-xl outline-none bg-white text-sm"
            value={filterComune}
            onChange={(e) => setFilterComune(e.target.value)}
            disabled={!filterProvincia}
          >
            <option value="">Tutti i Comuni</option>
            {comuniList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-slate-50">
          <select 
            className="px-4 py-2 border border-slate-200 rounded-xl outline-none bg-white text-sm"
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
          >
            <option value="">Tutte le Categorie</option>
            {categorie.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          
          <div className="md:col-span-2 flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <input 
              type="date" 
              className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
              value={filterDataDal}
              onChange={(e) => setFilterDataDal(e.target.value)}
            />
            <span className="text-slate-400">-</span>
            <input 
              type="date" 
              className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
              value={filterDataAl}
              onChange={(e) => setFilterDataAl(e.target.value)}
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Modus Operandi..." 
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              value={filterModus}
              onChange={(e) => setFilterModus(e.target.value)}
              list="modus-operandi-list-analysis"
            />
            <datalist id="modus-operandi-list-analysis">
              {MODUS_OPERANDI_CATEGORIES.map(cat => <option key={cat} value={cat} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Eventi Filtrati', value: filteredSegnalazioni.length, icon: AlertTriangle, color: 'blue' },
          { label: 'Modus Analizzati', value: stats.topModus.length, icon: TrendingUp, color: 'amber' },
          { label: 'Hotspots Attivi', value: stats.topComuni.length, icon: MapPin, color: 'emerald' },
        ].map((kpi, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4"
          >
            <div className={`p-3 rounded-xl bg-${kpi.color}-50 text-${kpi.color}-600`}>
              <kpi.icon size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</p>
              <p className="text-2xl font-black text-slate-900">{kpi.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Phenomenon Analysis */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-3 uppercase text-sm tracking-wider">
            <BarChart3 size={18} className="text-blue-600" />
            Distribuzione Fenomenologica
          </h3>
          
          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Incidenza per Categoria</p>
              <div className="space-y-3">
                {stats.categories.map(([cat, count]) => (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-slate-700">{cat}</span>
                      <span className="text-blue-600">{(count as number)} ({filteredSegnalazioni.length > 0 ? (((count as number) / filteredSegnalazioni.length) * 100).toFixed(1) : 0}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full" 
                        style={{ width: `${filteredSegnalazioni.length > 0 ? ((count as number) / filteredSegnalazioni.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Ricorrenze Modus Operandi</p>
              <div className="grid grid-cols-1 gap-2">
                {stats.topModus.map(([m, count]) => (
                  <div key={m} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-xs font-bold text-slate-700">{m}</span>
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-[10px] font-black">{(count as number)} EVENTI</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Territorial Analysis */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-3 uppercase text-sm tracking-wider">
            <MapIcon size={18} className="text-emerald-600" />
            Mappa di Calore Territoriale
          </h3>

          <div className="space-y-6">
            <div id="analysis-map" className="aspect-video bg-slate-100 rounded-xl border border-slate-200 z-0" />

            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Hotspots (Top 5 Comuni)</p>
              <div className="space-y-2">
                {stats.topComuni.map(([comune, count]) => (
                  <div key={comune} className="flex items-center gap-4">
                    <div className="text-[11px] font-bold text-slate-700 w-24 truncate">{comune}</div>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full" 
                        style={{ width: `${filteredSegnalazioni.length > 0 ? ((count as number) / filteredSegnalazioni.length) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="text-xs font-black text-slate-900">{(count as number)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Intelligence Insights */}
      <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-2xl space-y-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 blur-[100px] -ml-32 -mb-32" />
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-2xl">
              <Shield className="text-blue-400" size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter">Intelligence Investigativa Avanzata</h3>
              <p className="text-slate-400 text-sm font-medium">Analisi predittiva e relazionale dei fenomeni criminali</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-md">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Sistema di Analisi Attivo</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-amber-400" size={20} />
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-[0.2em]">Analisi Dinamiche e Trend</h4>
            </div>
            <div className="space-y-4">
              <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-400/10 rounded-lg">
                    <Calendar className="text-amber-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold">Focus Territoriale</p>
                    <p className="text-[10px] text-slate-400">Basato su {filteredSegnalazioni.length} eventi analizzati</p>
                  </div>
                </div>
                <div className="text-xs leading-relaxed text-slate-300 space-y-3">
                  <p>
                    L'analisi automatizzata rileva una criticità emergente nel comune di <span className="text-amber-400 font-bold">{stats.topComuni[0]?.[0] || 'N/D'}</span>, 
                    con una prevalenza di reati classificati come <span className="text-blue-400 font-bold">{stats.topModus[0]?.[0] || 'N/D'}</span>.
                  </p>
                  <p className="p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 italic">
                    "Si suggerisce l'intensificazione dei servizi di controllo del territorio nelle fasce orarie serali e il monitoraggio dei soggetti co-identificati nelle aree hotspot."
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Tasso Recidività</p>
                  <p className="text-xl font-black text-white">
                    {filteredSoggetti.length > 0 ? ((filteredSoggetti.filter(s => s.precedenti.length > 0).length / filteredSoggetti.length) * 100).toFixed(0) : 0}%
                  </p>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Densità Eventi</p>
                  <p className="text-xl font-black text-white">
                    {stats.topComuni.length > 0 ? (filteredSegnalazioni.length / stats.topComuni.length).toFixed(1) : 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-emerald-400" size={20} />
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em]">Strategie di Contrasto</h4>
            </div>
            <div className="space-y-3">
              {[
                { title: "Monitoraggio Hotspot", desc: "Incremento pattugliamenti nelle zone a densità > 5 eventi/mese." },
                { title: "Analisi Relazionale", desc: "Verifica legami tra soggetti co-identificati in diversi controlli." },
                { title: "Verifica Varchi", desc: "Incrocio transiti targhe segnalate con sistemi O.C.S.A." },
                { title: "Targeting Soggetti", desc: "Focus investigativo su profili con > 3 precedenti specifici." }
              ].map((strategy, i) => (
                <div key={i} className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 flex gap-4 items-start">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  <div>
                    <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1">{strategy.title}</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{strategy.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modals */}
      <AnimatePresence>
        {selectedEvent && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-slate-200"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-xl">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Dettagli Area: {selectedEvent.city}</h3>
                    <p className="text-xs text-slate-500 font-medium">Elenco eventi georeferenziati in questa zona</p>
                  </div>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-4">
                {selectedEvent.events.map((ev: Segnalazione, i: number) => (
                  <div key={i} className="p-6 bg-white border border-slate-200 rounded-2xl hover:border-blue-500/50 transition-all shadow-sm group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-black rounded uppercase tracking-widest">Segnalazione</span>
                          <span className="text-[10px] text-slate-400 font-bold">{ev.dataOra}</span>
                        </div>
                        <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{ev.oggetto}</h4>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Protocollo</p>
                        <p className="text-xs font-mono font-bold text-slate-700">{ev.protocollo}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                            <TrendingUp size={10} /> Modus Operandi
                          </p>
                          <p className="text-xs font-bold text-slate-700">{ev.modus_operandi}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                            <FileText size={10} /> Sintesi Investigativa
                          </p>
                          <p className="text-xs text-slate-600 leading-relaxed italic">"{ev.sintesi}"</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                            <Users size={10} /> Soggetti Coinvolti
                          </p>
                          <div className="space-y-2">
                            {(Array.isArray(ev.indagati) ? ev.indagati : []).map((ind, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-rose-50 border border-rose-100 rounded-lg">
                                <span className="text-[10px] font-bold text-rose-700">INDAGATO: {ind.cognome} {ind.nome}</span>
                              </div>
                            ))}
                            {(Array.isArray(ev.vittime) ? ev.vittime : []).map((vit, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                <span className="text-[10px] font-bold text-emerald-700">VITTIMA: {vit.cognome} {vit.nome}</span>
                              </div>
                            ))}
                            {(!Array.isArray(ev.indagati) || ev.indagati.length === 0) && (!Array.isArray(ev.vittime) || ev.vittime.length === 0) && <p className="text-[10px] text-slate-400 italic">Nessun soggetto censito in questa segnalazione.</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}

      </AnimatePresence>
    </div>
  );
}
