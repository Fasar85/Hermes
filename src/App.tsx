import React, { useState, useEffect, useMemo } from 'react';
import { formatDate, getAge } from './lib/utils';
import { 
  FileText, 
  Map as MapIcon, 
  BarChart2, 
  ClipboardCheck, 
  Settings, 
  LogOut,
  ChevronRight,
  LayoutDashboard,
  Key,
  Cpu,
  Save,
  AlertCircle,
  ShieldAlert,
  Users,
  X,
  ExternalLink,
  Calendar,
  Clock,
  MapPin
} from 'lucide-react';
import { Segnalazione, FilterState, AppDatabase, User, ModusOperandiStore } from './types';
import Dashboard from './components/Dashboard';
import Analysis from './components/Analysis';
import AnalysisReport from './components/AnalysisReport';
import ConfiguratorView from './components/ConfiguratorView';
import SharedFilterBar from './components/SharedFilterBar';
import CruscottoView from './components/CruscottoView';
import UserManager from './components/UserManager';
import GestioneSegnalazioni from './components/GestioneSegnalazioni';
import VerificaDB from './components/VerificaDB';
import LoginFlow from './components/LoginFlow';
import { HermesLogo } from './components/HermesLogo';
import { motion, AnimatePresence } from 'motion/react';

const App: React.FC = () => {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [dbHandle, setDbHandle] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'cruscotto' | 'schedario' | 'analisi' | 'report' | 'gestione' | 'config' | 'utenti' | 'verifica'>('cruscotto');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [searchingReportId, setSearchingReportId] = useState<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState(currentUser?.apiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Segnalazione | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<any | null>(null);

  const getAgeInternal = getAge;
  
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    categoria: '',
    soggetto: '',
    provincia: '',
    comune: '',
    modusOperandi: '',
    tipoModusOperandi: '',
    dataDa: '',
    dataA: '',
    fasciaEta: '',
    presenzaIndagati: ''
  });

  // Try to load DB from server on mount
  useEffect(() => {
    const loadDbFromServer = async () => {
      try {
        const response = await fetch('/api/load-database');
        if (response.ok) {
          const loadedDb = await response.json();
          setDb(loadedDb);
        }
      } catch (error) {
        console.log("Nessun database pre-caricato.");
      }
    };
    loadDbFromServer();
  }, []);

  // Track changes
  useEffect(() => {
    if (db) setHasUnsavedChanges(true);
  }, [db?.segnalazioni, db?.configuratore, db?.utenti]);

  const filteredReports = useMemo(() => {
    if (!db) return [];
    return db.segnalazioni.filter(r => {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const matchesSearch = 
          r.oggetto.toLowerCase().includes(s) || 
          r.dinamica.toLowerCase().includes(s) || 
          r.protocollo.toLowerCase().includes(s) || 
          r.comando.toLowerCase().includes(s) ||
          r.comune.toLowerCase().includes(s);
        if (!matchesSearch) return false;
      }
      
      if (filters.categoria && (r.categoria || '').toUpperCase().trim() !== filters.categoria.toUpperCase().trim()) return false;
      if (filters.provincia && (r.provincia || '').toUpperCase().trim() !== filters.provincia.toUpperCase().trim()) return false;
      if (filters.comune && (r.comune || '').toUpperCase().trim() !== filters.comune.toUpperCase().trim()) return false;
      if (filters.modusOperandi && (r.modus_operandi_dettaglio || '').toUpperCase().trim() !== filters.modusOperandi.toUpperCase().trim()) return false;
      if (filters.tipoModusOperandi && (r.tipo_modus_operandi || '').toUpperCase().trim() !== filters.tipoModusOperandi.toUpperCase().trim()) return false;
      
      if (filters.presenzaIndagati === 'si' && r.indagati.length === 0) return false;
      if (filters.presenzaIndagati === 'no' && r.indagati.length > 0) return false;

      if (filters.fasciaEta) {
        const range = filters.fasciaEta;
        const allSoggetti = [...r.indagati, ...r.vittime];
        const matchAge = allSoggetti.some(p => {
          const age = getAgeInternal(p.dataNascita);
          if (age < 0) return false;
          if (range === '0-18') return age <= 18;
          if (range === '19-30') return age >= 19 && age <= 30;
          if (range === '31-50') return age >= 31 && age <= 50;
          if (range === '51-65') return age >= 51 && age <= 65;
          if (range === '65+') return age > 65;
          return false;
        });
        if (!matchAge) return false;
      }

      if (filters.soggetto) {
        const s = filters.soggetto.toLowerCase();
        const hasSogetto = [...r.vittime, ...r.indagati].some(p => 
          `${p.cognome} ${p.nome}`.toLowerCase().includes(s) || 
          `${p.nome} ${p.cognome}`.toLowerCase().includes(s)
        );
        if (!hasSogetto) return false;
      }

      if (filters.dataDa || filters.dataA) {
        // Parse dd/mm/yyyy
        const parseDate = (dStr: string) => {
           if (!dStr) return new Date(0);
           const parts = dStr.split('/');
           if (parts.length < 3) return new Date(0);
           const [d, m, y] = parts.map(Number);
           return new Date(y, m - 1, d);
        };
        const dateStr = (r.dataOra || '').split(' ')[0];
        if (!dateStr) return false;
        const rDate = parseDate(dateStr);
        if (isNaN(rDate.getTime())) return false;
        if (filters.dataDa) {
          const dDa = new Date(filters.dataDa);
          if (rDate < dDa) return false;
        }
        if (filters.dataA) {
          const dA = new Date(filters.dataA);
          if (rDate > dA) return false;
        }
      }

      return true;
    });
  }, [db?.segnalazioni, filters]);

  // Utility to update taxonomy globaly if a new value is found
  const handleUpdateTaxonomy = (newData: Partial<ModusOperandiStore>) => {
    setDb(prev => {
      if (!prev) return null;
      const updatedConfig = { ...prev.configuratore };
      
      // Always convert to uppercase when updating taxonomy
      if (newData.categorie) {
        newData.categorie.forEach(newCat => {
          const catNameInput = newCat.nome.toUpperCase();
          const existingCatIdx = updatedConfig.categorie.findIndex(c => c.nome.toUpperCase() === catNameInput);
          if (existingCatIdx === -1) {
            updatedConfig.categorie.push({ ...newCat, nome: catNameInput });
          } else {
            // Merge MOs
            newCat.modusOperandi.forEach(newMo => {
              const moNameInput = newMo.nome.toUpperCase();
              const existingMoIdx = updatedConfig.categorie[existingCatIdx].modusOperandi.findIndex(mo => mo.nome.toUpperCase() === moNameInput);
              if (existingMoIdx === -1) {
                updatedConfig.categorie[existingCatIdx].modusOperandi.push({ ...newMo, nome: moNameInput });
              } else {
                // Merge Types
                newMo.tipi.forEach(newType => {
                  const typeNameInput = newType.nome.toUpperCase();
                  const existingType = updatedConfig.categorie[existingCatIdx].modusOperandi[existingMoIdx].tipi.find(t => t.nome.toUpperCase() === typeNameInput);
                  if (!existingType) {
                     updatedConfig.categorie[existingCatIdx].modusOperandi[existingMoIdx].tipi.push({ ...newType, nome: typeNameInput });
                  }
                });
              }
            });
          }
        });
      }
      return { ...prev, configuratore: updatedConfig };
    });
    setHasUnsavedChanges(true);
  };

  const handleSetComandoName = (name: string) => {
    setDb(prev => prev ? { ...prev, comandoName: name } : null);
  };

  const handleGlobalSave = async (isQuiet = false) => {
    if (!db) return;
    if (!isQuiet) setIsSaving(true);
    try {
      const finalDb = { ...db, lastModified: new Date().toLocaleString() };
      
      if (dbHandle) {
         // Use File System Access API
         const writable = await dbHandle.createWritable();
         await writable.write(JSON.stringify(finalDb, null, 2));
         await writable.close();
         setHasUnsavedChanges(false);
         if (!isQuiet) alert("Database salvato e aggiornato con successo sul tuo dispositivo!");
      } else {
         // Fallback to old download logic if no handle
         const blob = new Blob([JSON.stringify(finalDb, null, 2)], { type: 'application/json' });
         const url = URL.createObjectURL(blob);
         const link = document.createElement('a');
         link.href = url;
         link.download = `hermes_database_${new Date().toISOString().split('T')[0]}.json`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         URL.revokeObjectURL(url);
         
         setHasUnsavedChanges(false);
         if (!isQuiet) alert("Database scaricato con successo. Sovrascrivi il file originale sul tuo dispositivo.");
      }
    } catch (error) {
      console.error(error);
      if (!isQuiet) alert("Errore durante il salvataggio dei dati in locale.");
    } finally {
      if (!isQuiet) setIsSaving(false);
    }
  };

  const handleUpdateApiKey = () => {
    if (!db || !currentUser) return;
    
    const updatedUsers = db.utenti.map(u => 
      u.cip === currentUser.cip ? { ...u, apiKey: newApiKey } : u
    );
    
    const updatedDb = { ...db, utenti: updatedUsers };
    setDb(updatedDb);
    setCurrentUser({ ...currentUser, apiKey: newApiKey });
    setIsApiKeyModalOpen(false);
    // Trigger save automatically after key update
    setTimeout(() => handleGlobalSave(), 500);
  };

  const handleLogout = () => {
    if (hasUnsavedChanges && !confirm("Hai modifiche non salvate. Disconnettere comunque?")) return;
    setDb(null);
    setCurrentUser(null);
    setActiveTab('cruscotto');
  };

  if (!db || !currentUser) {
    return <LoginFlow 
      initialDb={db}
      onSuccess={(database, user, handle) => {
        setDb(database);
        setCurrentUser(user);
        if (handle) setDbHandle(handle);
        setHasUnsavedChanges(false);
      }} 
    />;
  }

  const menuItems = [
    { id: 'cruscotto', label: 'Cruscotto Operativo', icon: LayoutDashboard },
    { id: 'schedario', label: 'Schedario Segnalazioni', icon: FileText },
    { id: 'analisi', label: 'Analisi Fenomenologica', icon: BarChart2 },
    { id: 'report', label: 'Report Investigativo', icon: ClipboardCheck },
    { id: 'verifica', label: 'Verifica DB', icon: ShieldAlert },
    { id: 'gestione', label: 'Gestione Segnalazioni', icon: Key },
    { id: 'config', label: 'Configuratore MO', icon: Settings },
    ...(currentUser.ruolo === 'admin' ? [{ id: 'utenti', label: 'Gestione Utenti', icon: Users }] : []),
  ];

  const canEdit = currentUser.permessi === 'write';

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden print:h-auto print:block print:overflow-visible">
      {/* Sidebar */}
      <aside className="w-72 bg-[#0a192f] text-white flex flex-col shadow-2xl z-50 print:hidden">
        <div className="p-6 border-b border-white/10">
          <HermesLogo size={40} className="text-white" />
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                activeTab === item.id 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-white' : 'group-hover:text-white'}`} />
                <span className="font-medium text-sm">{item.label}</span>
              </div>
              {item.badge && item.badge > 0 ? (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              ) : (
                <ChevronRight className={`w-4 h-4 opacity-0 transition-opacity ${activeTab === item.id ? 'opacity-50' : 'group-hover:opacity-100'}`} />
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="bg-white/5 rounded-xl p-4 mb-4">
             <div className="flex items-center space-x-3 mb-3">
               <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${currentUser.ruolo === 'admin' ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                 {currentUser.cognome[0]}{currentUser.nome[0]}
               </div>
               <div className="min-w-0">
                 <p className="text-xs font-bold truncate">{currentUser.grado} {currentUser.cognome}</p>
                 <p className="text-[10px] text-slate-500 truncate">CIP: {currentUser.cip}</p>
               </div>
             </div>
             <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
             >
               <LogOut className="w-3 h-3" />
               <span>Sconnetti</span>
             </button>
             <div className="mt-4 pt-4 border-t border-white/5 text-center">
               <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                 HERMES Intelligence Suite <span className="text-indigo-500">v0.4.0</span>
               </p>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden print:h-auto print:block print:overflow-visible">
        {/* Top Header with Save Action */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-40 print:hidden">
           <div className="flex items-center gap-6">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                Database: <span className="text-slate-800">Operativo</span>
              </span>
              
              <div className="h-6 w-px bg-slate-200" />

              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${currentUser.apiKey ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  Motore AI: <span className={currentUser.apiKey ? 'text-green-600' : 'text-slate-400'}>
                    {currentUser.apiKey ? 'Funzionante' : 'Non Configurato'}
                  </span>
                </span>
              </div>

              {hasUnsavedChanges && (
                <div className="flex items-center gap-2 text-amber-600 text-[10px] font-black uppercase bg-amber-50 px-2 py-1 rounded">
                  <AlertCircle size={12} />
                  Modifiche non salvate
                </div>
              )}
           </div>
           
           <div className="flex items-center gap-3">
             <button 
              onClick={() => {
                setNewApiKey(currentUser.apiKey || '');
                setIsApiKeyModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all font-bold text-xs"
             >
               <Key size={16} className="text-indigo-600" />
               <span>Configura API Key</span>
             </button>

             <button 
              onClick={handleGlobalSave}
              disabled={isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-xs ${
                hasUnsavedChanges 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 animate-pulse' 
                : 'bg-slate-100 text-slate-400'
              } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
               <Save size={16} />
               <span>{isSaving ? 'Salvataggio...' : 'Salva Database'}</span>
             </button>
           </div>
        </header>

        {/* API Key Modal */}
        <AnimatePresence>
          {isApiKeyModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-200"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                    <Cpu className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Motore AI Gemini</h3>
                    <p className="text-xs text-slate-500">Configura la tua chiave API personale.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Google Gemini API Key</label>
                    <input 
                      type="password"
                      placeholder="AIzaSy..."
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-mono text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                    />
                  </div>

                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <p className="text-[10px] text-blue-800 leading-relaxed italic">
                      "La chiave API verrà salvata nel database JSON crittografato e associata esclusivamente al tuo profilo CIP."
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setIsApiKeyModalOpen(false)}
                      className="flex-1 h-12 rounded-xl font-bold text-xs text-slate-500 hover:bg-slate-100 transition-all"
                    >
                      Annulla
                    </button>
                    <button 
                      onClick={handleUpdateApiKey}
                      className="flex-1 h-12 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                    >
                      Salva Configurazione
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Universal Filter Bar (only for relevant tabs) */}
        {['schedario', 'analisi', 'report', 'gestione'].includes(activeTab) && (
          <div className="print:hidden">
            <SharedFilterBar 
              reports={db.segnalazioni} 
              config={db.configuratore} 
              filters={filters} 
              setFilters={setFilters} 
            />
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
          <div className="max-w-[1600px] mx-auto h-full">
            {activeTab === 'cruscotto' && <CruscottoView db={db} currentUser={currentUser} />}
            {activeTab === 'schedario' && (
              <Dashboard 
                reports={filteredReports} 
                db={db}
                setDb={(newDb: any) => {
                  if (canEdit) {
                    setDb(newDb);
                    setHasUnsavedChanges(true);
                  }
                  else alert("Permessi insufficienti per modificare i dati.");
                }}
                onImport={(newData) => {
                  if (canEdit) {
                    setDb(prev => ({ ...prev!, segnalazioni: [...prev!.segnalazioni, ...newData.segnalazioni] }));
                    setHasUnsavedChanges(true);
                  }
                  else alert("Permessi insufficienti per importare dati.");
                }}
                onUpdateTaxonomy={handleUpdateTaxonomy}
                apiKey={currentUser.apiKey}
                canEdit={canEdit}
                onViewReport={setSelectedReport}
                onViewPersona={setSelectedPersona}
              />
            )}
            {activeTab === 'analisi' && <Analysis reports={filteredReports} apiKey={currentUser.apiKey} onViewDetails={setSelectedReport} />}
            {activeTab === 'report' && <AnalysisReport reports={filteredReports} apiKey={currentUser.apiKey} comandoName={db.comandoName} />}
            {activeTab === 'gestione' && (
              <GestioneSegnalazioni 
                reports={filteredReports} 
                initialSearchId={searchingReportId}
                onClearInitialSearch={() => setSearchingReportId(null)}
                onUpdateReport={(updated) => {
                  setDb(prev => {
                    const newSeg = prev!.segnalazioni.map(s => s.idUnivoco === updated.idUnivoco ? updated : s);
                    return { ...prev!, segnalazioni: newSeg };
                  });
                  setHasUnsavedChanges(true);
                }}
                onDeleteReport={(id) => {
                  setDb(prev => {
                    const newSeg = prev!.segnalazioni.filter(s => s.idUnivoco !== id);
                    return { ...prev!, segnalazioni: newSeg };
                  });
                  setHasUnsavedChanges(true);
                }}
                onViewReport={setSelectedReport}
                onViewPersona={setSelectedPersona}
                config={db.configuratore}
                setConfig={(newConf) => {
                  setDb(prev => ({...prev!, configuratore: newConf}));
                  setHasUnsavedChanges(true);
                }}
              />
            )}
            {activeTab === 'verifica' && (
              <VerificaDB 
                db={db} 
                setDb={setDb} 
                onEditReport={(report) => {
                  setSearchingReportId(report.idUnivoco);
                  setActiveTab('gestione');
                }} 
                onViewReport={setSelectedReport}
                onAutoSave={() => handleGlobalSave(true)}
              />
            )}
            {activeTab === 'config' && (
              <ConfiguratorView 
                config={db.configuratore} 
                canEdit={canEdit}
                comandoName={db.comandoName || ''}
                setComandoName={handleSetComandoName}
                setConfig={(c) => {
                   if (canEdit) {
                     setDb(prev => ({...prev!, configuratore: c}));
                     setHasUnsavedChanges(true);
                   } else {
                     alert("Permessi insufficienti.");
                   }
                }}
                onCascadeRename={(type, oldVal, newVal) => {
                  if (canEdit && oldVal !== newVal) {
                    setDb(prev => {
                      if (!prev) return null;
                      const newSeg = prev.segnalazioni.map(s => {
                         let changed = false;
                         let updatedS = { ...s };
                         if (type === 'CATEGORIA' && s.categoria === oldVal) {
                           updatedS.categoria = newVal;
                           changed = true;
                         }
                         if (type === 'MODUS_OPERANDI' && s.modus_operandi_dettaglio === oldVal) {
                           updatedS.modus_operandi_dettaglio = newVal;
                           changed = true;
                         }
                         if (type === 'TIPO_MO' && s.tipo_modus_operandi === oldVal) {
                           updatedS.tipo_modus_operandi = newVal;
                           changed = true;
                         }
                         if (changed) {
                           updatedS.requiresRevision = true; 
                         }
                         return updatedS;
                      });
                      return { ...prev, segnalazioni: newSeg };
                    });
                    setHasUnsavedChanges(true);
                  }
                }}
              />
            )}
            {activeTab === 'utenti' && currentUser.ruolo === 'admin' && (
              <UserManager db={db} setDb={(newDb: any) => setDb(newDb)} />
            )}
          </div>
        </div>

        {/* Global Report Detail Modal */}
        <AnimatePresence>
          {selectedReport && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="bg-slate-900 px-10 py-8 flex items-center justify-between text-white sticky top-0 z-10">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                      <FileText size={32} className="text-indigo-400" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-3 mb-1">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-1 rounded">
                          Protocollo: {selectedReport.protocollo}
                        </span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedReport.categoria}</span>
                        {selectedReport.modus_operandi_dettaglio && <><ChevronRight size={12} className="text-slate-400" /><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedReport.modus_operandi_dettaglio}</span></>}
                        {selectedReport.tipo_modus_operandi && <><ChevronRight size={12} className="text-slate-400" /><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedReport.tipo_modus_operandi}</span></>}
                      </div>
                      <h3 className="text-2xl font-black tracking-tight uppercase">{selectedReport.oggetto}</h3>
                    </div>
                  </div>
                  <button onClick={() => setSelectedReport(null)} className="p-3 hover:bg-white/10 rounded-2xl transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Data e Ora</p>
                      <p className="text-sm font-bold text-slate-700">{formatDate(selectedReport.dataOra)}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Luogo</p>
                      <p className="text-sm font-bold text-slate-700 uppercase">{selectedReport.comune} ({selectedReport.provincia})</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Comando</p>
                      <p className="text-sm font-bold text-slate-700 uppercase">{selectedReport.comando}</p>
                    </div>
                  </div>

                  <div>
                     <h4 className="text-xs font-black text-indigo-600 uppercase mb-3 tracking-widest">Sunto AI</h4>
                     <p className="text-sm text-slate-600 leading-relaxed bg-indigo-50/30 p-4 rounded-xl border border-indigo-100">
                       {selectedReport.sunto}
                     </p>
                  </div>

                  <div>
                     <h4 className="text-xs font-black text-indigo-600 uppercase mb-3 tracking-widest">Modus Operandi</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white border border-slate-200 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Dettaglio</p>
                          <p className="text-sm font-bold text-slate-800 uppercase">{selectedReport.modus_operandi_dettaglio}</p>
                        </div>
                        <div className="bg-white border border-slate-200 p-3 rounded-lg">
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Tipologia Operativa</p>
                          <p className="text-sm font-bold text-slate-800 uppercase">{selectedReport.tipo_modus_operandi}</p>
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-orange-600 uppercase tracking-widest">Indagati ({selectedReport.indagati.length})</h4>
                      <div className="space-y-2">
                         {selectedReport.indagati.map((p, idx) => (
                           <div 
                            key={idx} 
                            onClick={() => setSelectedPersona(p)}
                            className="flex items-center justify-between p-3 bg-orange-50/50 border border-orange-100 rounded-lg cursor-pointer hover:bg-orange-50 transition-colors uppercase"
                          >
                             <span className="text-sm font-bold text-slate-700">{p.cognome} {p.nome}</span>
                             <ExternalLink size={12} className="text-orange-400" />
                           </div>
                         ))}
                         {selectedReport.indagati.length === 0 && <p className="text-xs text-slate-400 italic">Nessun indagato identificato.</p>}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-green-600 uppercase tracking-widest">Vittime ({selectedReport.vittime.length})</h4>
                      <div className="space-y-2">
                         {selectedReport.vittime.map((p, idx) => (
                           <div 
                            key={idx} 
                            onClick={() => setSelectedPersona(p)}
                            className="flex items-center justify-between p-3 bg-green-50/50 border border-green-100 rounded-lg cursor-pointer hover:bg-green-50 transition-colors uppercase"
                          >
                             <span className="text-sm font-bold text-slate-700">{p.cognome} {p.nome}</span>
                             <ExternalLink size={12} className="text-green-400" />
                           </div>
                         ))}
                         {selectedReport.vittime.length === 0 && <p className="text-xs text-slate-400 italic">Nessuna vittima identificata.</p>}
                      </div>
                    </div>
                  </div>

                  <div>
                     <h4 className="text-xs font-black text-slate-400 uppercase mb-3 tracking-widest text-center italic">Contenuto Testuale Integrale</h4>
                     <p className="text-[11px] text-slate-500 leading-relaxed font-mono whitespace-pre-wrap bg-slate-50 p-6 rounded-2xl border border-slate-200 border-dashed">
                       {selectedReport.testoIntegrale || selectedReport.dinamica}
                     </p>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Persona Detail Sub-Modal */}
        <AnimatePresence>
          {selectedPersona && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
               <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
              >
                 <div className="bg-slate-50 p-8 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center font-black text-xl">
                          {selectedPersona.cognome[0]}
                       </div>
                       <div>
                          <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">{selectedPersona.cognome} {selectedPersona.nome}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scheda Anagrafica Soggetto</p>
                       </div>
                    </div>
                    <button onClick={() => setSelectedPersona(null)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
                      <X size={20} className="text-slate-400" />
                    </button>
                 </div>
                 <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Ruolo</p>
                          <p className="text-sm font-bold text-slate-700 uppercase">{selectedPersona.ruolo || 'N/D'}</p>
                       </div>
                       <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Data di Nascita</p>
                          <p className="text-sm font-bold text-slate-700">{selectedPersona.dataNascita || 'N/D'}</p>
                       </div>
                       <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Luogo di Nascita</p>
                          <p className="text-sm font-bold text-slate-700 uppercase">{selectedPersona.luogoNascita || 'N/D'}</p>
                       </div>
                    </div>
                    <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 flex items-center gap-3">
                       <div className="bg-white p-2 rounded-xl border border-indigo-100">
                          <Calendar className="text-indigo-600 w-4 h-4" />
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Età Calcolata all'evento</p>
                          <p className="text-lg font-black text-indigo-700">{getAgeInternal(selectedPersona.dataNascita)} Anni</p>
                       </div>
                    </div>
                 </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
