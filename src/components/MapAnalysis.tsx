import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Filter, Loader2, Trash2, RefreshCw, FileText, User, Shield, AlertTriangle, Car, Users, X, Eye, User as UserIcon } from 'lucide-react';
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

interface MapAnalysisProps {
  segnalazioni: Segnalazione[];
}

export default function MapAnalysis({ segnalazioni }: MapAnalysisProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProvincia, setFilterProvincia] = useState('');
  const [filterComune, setFilterComune] = useState('');
  const [filterModus, setFilterModus] = useState('');
  const [filterSoggetto, setFilterSoggetto] = useState('');
  const [activeLayers, setActiveLayers] = useState<string[]>(['SEGNALAZIONI', 'NASCITA', 'FATTI', 'INFO', 'CTRL']);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const geoCacheRef = useRef<Record<string, { lat: number, lon: number }>>({});

  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map('map-container').setView([41.8719, 12.5674], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current);
      markerLayerRef.current = L.layerGroup().addTo(mapRef.current);
    }

    // Load geoCache from localStorage
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
    } catch (err) {
      console.error("Geocoding failed for:", city);
    }
    return null;
  };

  const syncMap = async () => {
    if (!mapRef.current || !markerLayerRef.current) return;

    setIsLoading(true);
    markerLayerRef.current.clearLayers();

    const locations: Record<string, string[]> = {};

    // Filtered Segnalazioni
    const filteredSegnalazioni = segnalazioni.filter(s => {
      if (searchTerm && !s.oggetto.toLowerCase().includes(searchTerm.toLowerCase()) && !s.sintesi.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterProvincia && s.provincia_evento !== filterProvincia) return false;
      if (filterComune && s.comune_evento?.toUpperCase() !== filterComune.toUpperCase()) return false;
      if (filterModus && !s.modus_operandi.toLowerCase().includes(filterModus.toLowerCase())) return false;
      if (filterSoggetto && 
          !(Array.isArray(s.vittime) ? s.vittime : []).some(v => v && v.cognome && v.cognome.toLowerCase().includes(filterSoggetto.toLowerCase())) && 
          !(Array.isArray(s.indagati) ? s.indagati : []).some(i => i && i.cognome && i.cognome.toLowerCase().includes(filterSoggetto.toLowerCase()))) return false;
      return true;
    });

    // Process Segnalazioni
    if (activeLayers.includes("SEGNALAZIONI")) {
      filteredSegnalazioni.forEach(s => {
        if (s.comune_evento && s.comune_evento !== "N/D") {
          const city = s.comune_evento.split(/[\(\-\,]/)[0].trim().toUpperCase();
          if (!locations[city]) locations[city] = [];
          locations[city].push(`<b class="text-blue-600">SEGNALAZIONE:</b> ${s.oggetto} (${s.dataOra})`);
        }
      });
    }

    const cities = Object.keys(locations);
    const markers: L.Marker[] = [];

    for (const city of cities) {
      const coords = await geocode(city);
      if (coords) {
        const popupContent = document.createElement('div');
        popupContent.className = "p-3 min-w-[250px] max-w-[350px]";
        popupContent.innerHTML = `
          <h4 class="font-bold border-b-2 border-amber-500 pb-1 mb-3 text-slate-900 flex items-center gap-2">
            📍 ${city}
          </h4>
          <div class="max-h-60 overflow-y-auto text-xs space-y-3 pr-1 mb-3">
            ${locations[city].map(ev => `
              <div class="p-2 bg-slate-50 rounded border border-slate-100 shadow-sm">
                ${ev}
              </div>
            `).join('')}
          </div>
        `;

        const btn = document.createElement('button');
        btn.className = "w-full py-2 bg-slate-900 text-white text-[10px] font-bold rounded-lg hover:bg-slate-800 transition-colors uppercase tracking-wider";
        btn.innerText = "Apri Dettagli Area";
        btn.onclick = () => {
          const citySegnalazioni = filteredSegnalazioni.filter(s => s.comune_evento?.split(/[\(\-\,]/)[0].trim().toUpperCase() === city);
          setSelectedEvent({ city, segnalazioni: citySegnalazioni });
        };
        popupContent.appendChild(btn);

        const marker = L.marker([coords.lat, coords.lon]).bindPopup(popupContent);
        marker.addTo(markerLayerRef.current);
        markers.push(marker);
        await new Promise(r => setTimeout(r, 100));
      }
    }

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      mapRef.current.fitBounds(group.getBounds(), { padding: [50, 50] });
    }

    setIsLoading(false);
  };

  const toggleLayer = (layer: string) => {
    setActiveLayers(prev => 
      prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]
    );
  };

  const province = Array.from(new Set(segnalazioni.map(s => s.provincia_evento))).filter(p => p && p !== "N/D").sort();
  const comuni = Array.from(new Set(segnalazioni
    .filter(s => !filterProvincia || s.provincia_evento === filterProvincia)
    .map(s => s.comune_evento?.toUpperCase())
  )).filter(c => c && c !== "N/D").sort();
  const modiOperandi = Array.from(new Set(segnalazioni.map(s => s.modus_operandi))).filter(m => m && m !== "N/D").sort();

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-2">
            <MapPin className="text-amber-500" size={20} />
            <h3 className="font-bold text-slate-800">Georeferenziazione Avanzata</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'SEGNALAZIONI', label: 'Segnalazioni', color: 'blue' },
            ].map(layer => (
              <button
                key={layer.id}
                onClick={() => toggleLayer(layer.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-all border",
                  activeLayers.includes(layer.id) 
                    ? `bg-${layer.color}-100 text-${layer.color}-700 border-${layer.color}-200 shadow-sm` 
                    : "bg-slate-50 text-slate-400 border-slate-200"
                )}
              >
                {layer.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Cerca oggetto o sintesi..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <input 
            type="text" 
            placeholder="Cerca Soggetto..." 
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
            value={filterSoggetto}
            onChange={(e) => setFilterSoggetto(e.target.value)}
          />

          <input 
            type="text" 
            placeholder="Modus Operandi..." 
            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-sm"
            value={filterModus}
            onChange={(e) => setFilterModus(e.target.value)}
            list="modus-operandi-list-map"
          />
          <datalist id="modus-operandi-list-map">
            {MODUS_OPERANDI_CATEGORIES.map(cat => <option key={cat} value={cat} />)}
          </datalist>

          <select 
            className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-sm"
            value={filterProvincia}
            onChange={(e) => { setFilterProvincia(e.target.value); setFilterComune(''); }}
          >
            <option value="">Tutte le Province</option>
            {province.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select 
            className="px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-sm"
            value={filterComune}
            onChange={(e) => setFilterComune(e.target.value)}
            disabled={!filterProvincia && province.length > 0}
          >
            <option value="">Tutti i Comuni</option>
            {comuni.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="md:col-span-2 flex gap-2">
            <button 
              onClick={syncMap}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
              Sincronizza Mappa
            </button>
            <button 
              onClick={() => {
                setSearchTerm(''); setFilterProvincia(''); setFilterComune(''); setFilterModus(''); setFilterSoggetto('');
                markerLayerRef.current?.clearLayers();
              }}
              className="px-4 py-2 border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"
              title="Reset e Pulisci"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-amber-500 mb-2" size={48} />
            <p className="font-bold text-amber-700">Georeferenziazione in corso...</p>
          </div>
        )}
        <div id="map-container" className="w-full h-full z-0" />
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
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-amber-500 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Dettagli Territoriali: {selectedEvent.city}</h3>
                    <p className="text-xs text-white/80 font-medium">Analisi incrociata di segnalazioni e fascicoli</p>
                  </div>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {selectedEvent.segnalazioni.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText size={14} /> Segnalazioni in Area ({selectedEvent.segnalazioni.length})
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                      {selectedEvent.segnalazioni.map((ev: Segnalazione, i: number) => (
                        <div key={i} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">{ev.dataOra}</p>
                              <h5 className="font-bold text-slate-900">{ev.oggetto}</h5>
                            </div>
                            <span className="text-[10px] font-mono bg-white px-2 py-1 rounded border border-slate-200">{ev.protocollo}</span>
                          </div>
                          <p className="text-xs text-slate-600 italic mb-4">"{ev.sintesi}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

      </AnimatePresence>
    </div>
  );
}
