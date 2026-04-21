import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Search, 
  User, 
  Map as MapIcon, 
  Settings, 
  FolderOpen, 
  Save, 
  Trash2,
  Menu,
  X,
  FileText,
  AlertTriangle,
  Shield,
  Plus,
  Key,
  LogOut,
  Users,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Segnalazione, UserProfile } from './types';
import { cn } from './lib/utils';

// Components
import { HermesLogo } from './components/HermesLogo';
import Dashboard from './components/Dashboard';
import PdfAnalysis from './components/PdfAnalysis';
import MapAnalysis from './components/MapAnalysis';
import AnalysisReport from './components/AnalysisReport';
import Analysis from './components/Analysis';

export default function App() {
  const [activeRoom, setActiveRoom] = useState('dashboard');
  const [databaseSegnalazioni, setDatabaseSegnalazioni] = useState<Segnalazione[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [lastImportedFileName, setLastImportedFileName] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [fileHandle, setFileHandle] = useState<any>(null);
  const [loginCip, setLoginCip] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // User Management State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Recovery of session only if we have everything
  useEffect(() => {
    const savedData = localStorage.getItem('aasp_db');
    const savedFileName = localStorage.getItem('aasp_last_file');
    if (savedData && savedFileName) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.segnalazioni) setDatabaseSegnalazioni(parsed.segnalazioni);
        if (parsed.users) setUsers(parsed.users);
        setLastImportedFileName(savedFileName);
        // Important: we don't set hasLoadedData automatically to true here if we want to FORCE the file upload/new every time?
        // But the user said: "la prima schermata che deve aprirsi è quella di caricare il database json o crearne uno nuovo".
        // This implies even if there is a session, we might want to ask.
        // However, usually "restore session" is a shortcut. 
        // Let's stick to the user's specific request: "la prima schermata che deve aprirsi è quella di caricare il database json o crearne uno nuovo".
        // So I'll keep hasLoadedData as false initially.
      } catch (e) {
        console.error("Session recovery failed", e);
      }
    }
  }, []);

  const handleRestoreSession = () => {
    const savedData = localStorage.getItem('aasp_db');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.segnalazioni) setDatabaseSegnalazioni(parsed.segnalazioni);
        if (parsed.users) setUsers(parsed.users);
        setHasLoadedData(true);
      } catch (e) {
        alert("Errore nel ripristino della sessione.");
      }
    } else {
      alert("Nessuna sessione trovata.");
    }
  };

  const syncToLocalStorage = (segnalazioni: Segnalazione[], usersList: UserProfile[]) => {
    const dataToSave = {
      segnalazioni: segnalazioni,
      users: usersList
    };
    localStorage.setItem('aasp_db', JSON.stringify(dataToSave));
  };

  useEffect(() => {
    syncToLocalStorage(databaseSegnalazioni, users);
  }, [databaseSegnalazioni, users]);

  const handleNewDb = () => {
    setDatabaseSegnalazioni([]);
    setUsers([]);
    setLastImportedFileName("nuovo_database_investigativo.json");
    setHasLoadedData(true);
    setFileHandle(null);
    setIsDirty(true);
  };

  const handleExportDb = async () => {
    if (!lastImportedFileName) {
      alert("Attenzione: È possibile salvare il database solo dopo aver caricato un file JSON tramite il pulsante 'Carica DB'.");
      return;
    }

    const dataToSave = {
      segnalazioni: databaseSegnalazioni,
      users: users // Persist users and their API keys
    };

    const jsonString = JSON.stringify(dataToSave, null, 2);

    // Try to overwrite if handle exists
    if (fileHandle) {
      try {
        // @ts-ignore
        const writable = await fileHandle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        setIsDirty(false);
        alert(`Database sovrascritto con successo su: ${lastImportedFileName}`);
        return;
      } catch (err: any) {
        console.error("Errore durante il salvataggio diretto:", err);
        // Fallback to download if overwrite fails
      }
    }

    // Fallback to standard download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = lastImportedFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsDirty(false);
    alert("Database salvato (download).");
  };

  const handleImportDb = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (hasLoadedData) {
      alert("Un database è già caricato. Per caricarne uno nuovo, azzera prima i dati con 'Nuovo DB'.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        
        if (parsed.segnalazioni) {
          setDatabaseSegnalazioni(parsed.segnalazioni);
          setIsDirty(false); // Imported is clean (synced with file)
        }
        if (parsed.users) {
          setUsers(parsed.users);
          const updatedCurrent = parsed.users.find((u: any) => u.cip === currentUser?.cip);
          if (updatedCurrent) {
            setCurrentUser(updatedCurrent);
            if (updatedCurrent.apiKey) {
              localStorage.setItem('aasp_gemini_key', updatedCurrent.apiKey);
            }
          }
        }
        
        setHasLoadedData(true);
        setLastImportedFileName(file.name);
        localStorage.setItem('aasp_last_file', file.name);
        alert("Database caricato con successo!");
      } catch (err) {
        alert("Errore nell'importazione del file JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportDbAdvanced = async () => {
    if (hasLoadedData) {
      alert("Un database è già caricato. Per caricarne uno nuovo, azzera prima i dati con 'Nuovo DB'.");
      return;
    }
    try {
      // @ts-ignore
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON Database', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      setFileHandle(handle);
      const file = await handle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed.segnalazioni) {
        setDatabaseSegnalazioni(parsed.segnalazioni);
        setIsDirty(false);
      }
      if (parsed.users) {
        setUsers(parsed.users);
        const updatedCurrent = parsed.users.find((u: any) => u.cip === currentUser?.cip);
        if (updatedCurrent) {
          setCurrentUser(updatedCurrent);
          if (updatedCurrent.apiKey) {
            localStorage.setItem('aasp_gemini_key', updatedCurrent.apiKey);
          }
        }
      }
      
      setHasLoadedData(true);
      setLastImportedFileName(file.name);
      localStorage.setItem('aasp_last_file', file.name);
      alert("Database caricato con successo!");
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        alert("Errore nell'importazione avanzata. Assicurati di usare un browser moderno.");
      }
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find(u => u.cip.toUpperCase() === loginCip.toUpperCase());
    if (user) {
      setCurrentUser(user);
      setIsLoggedIn(true);
    } else {
      alert("CIP non riconosciuto in questo database. Accesso negato.");
    }
  };

  const handleAdminSetup = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const newAdmin: UserProfile = {
      grado: formData.get('grado') as string,
      nome: formData.get('nome') as string,
      cognome: formData.get('cognome') as string,
      cip: (formData.get('cip') as string).toUpperCase(),
      role: 'admin',
      apiKey: ''
    };
    
    setUsers([newAdmin]);
    setCurrentUser(newAdmin);
    setIsLoggedIn(true);
    setIsDirty(true);
    alert("Profilo Amministratore configurato correttamente.");
  };

  const geminiKey = currentUser?.apiKey || '';

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginCip('');
  };

  const handleSaveKey = (key: string) => {
    localStorage.setItem('aasp_gemini_key', key);
    if (!currentUser) return;
    const updatedUser = { ...currentUser, apiKey: key };
    setCurrentUser(updatedUser);
    setUsers(prev => prev.map(u => u.cip === currentUser.cip ? updatedUser : u));
  };

  const handleUpdateAdmin = (oldCip: string, newData: UserProfile) => {
    if (currentUser?.role !== 'admin') return;
    if (currentUser.cip !== oldCip) {
      alert("Il CIP inserito non corrisponde all'Admin attuale.");
      return;
    }
    const updatedUsers = users.map(u => u.cip === oldCip ? { ...newData, role: 'admin' as const } : u);
    setUsers(updatedUsers);
    setCurrentUser({ ...newData, role: 'admin' });
    alert("Profilo Admin aggiornato con successo.");
  };

  const handleAddOperator = (op: UserProfile) => {
    if (users.find(u => u.cip === op.cip)) {
      alert("Esiste già un utente con questo CIP.");
      return;
    }
    setUsers(prev => [...prev, { ...op, role: 'operatore' }]);
    alert("Operatore aggiunto correttamente.");
  };

  const handleRemoveOperator = (cip: string) => {
    setUsers(prev => prev.filter(u => u.cip !== cip));
    alert("Operatore rimosso.");
  };

  const isAiLocal = !geminiKey;

  const menuItems = [
    { id: 'dashboard', label: 'Cruscotto Operativo', icon: BarChart3 },
    { id: 'analisi', label: 'Schedario Segnalazioni', icon: Search },
    { id: 'mappa', label: 'Mappa Georeferenziata', icon: MapIcon },
    { id: 'report', label: 'Report', icon: FileText },
    { id: 'intelligence', label: 'Analisi', icon: TrendingUp },
  ];

  if (!hasLoadedData) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-800"
        >
          <div className="bg-slate-800 p-12 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-slate-900 rounded-[2rem] shadow-2xl shadow-blue-900/50 mb-2 border border-blue-500/30">
              <HermesLogo className="text-blue-500" size={56} />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black text-white uppercase tracking-tighter">SISTEMA H.E.R.M.E.S.</h1>
              <p className="text-blue-400 text-xs font-bold uppercase tracking-[0.2em] leading-relaxed">
                HUB Elaborativo Ricerca Metadati e Eventi Segnalati
              </p>
            </div>
          </div>

          <div className="p-10 space-y-8">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-800">Inizializzazione Workspace</h3>
              <p className="text-sm text-slate-500">Per procedere è necessario caricare un database esistente o inizializzarne uno nuovo.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={handleImportDbAdvanced}
                className="flex flex-col items-center gap-4 p-6 bg-blue-50 border-2 border-blue-100 rounded-[2rem] hover:border-blue-500 hover:bg-blue-100 transition-all group active:scale-95"
              >
                <div className="p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                  <FolderOpen size={24} />
                </div>
                <div className="text-center">
                  <p className="font-black text-blue-900 text-sm uppercase">Carica Database</p>
                  <p className="text-[10px] text-blue-600 font-bold mt-1 uppercase">Seleziona file .json</p>
                </div>
              </button>

              <button 
                onClick={handleNewDb}
                className="flex flex-col items-center gap-4 p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] hover:border-slate-400 hover:bg-slate-100 transition-all group active:scale-95"
              >
                <div className="p-4 bg-slate-800 text-white rounded-2xl shadow-lg shadow-slate-200">
                  <Plus size={24} />
                </div>
                <div className="text-center">
                  <p className="font-black text-slate-900 text-sm uppercase">Nuovo Database</p>
                  <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">Inizia da zero</p>
                </div>
              </button>
            </div>

            {localStorage.getItem('aasp_db') && (
              <button 
                onClick={handleRestoreSession}
                className="w-full py-3 text-xs font-bold text-slate-400 hover:text-blue-500 transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
              >
                Ripristina sessione precedente
              </button>
            )}

            <div className="pt-4 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                Riservato Forze di Polizia
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const hasAdmin = users.some(u => u.role === 'admin');

  if (!isLoggedIn) {
    if (!hasAdmin) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-800"
          >
            <div className="bg-slate-800 p-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-900 rounded-3xl shadow-lg shadow-blue-900/50 mb-2 border border-blue-500/30">
                <Shield className="text-blue-500" size={40} />
              </div>
              <h1 className="text-xl font-black text-white uppercase tracking-tighter">Configurazione Admin</h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Nessun amministratore trovato nel DB</p>
            </div>
            
            <form onSubmit={handleAdminSetup} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Grado</label>
                  <input name="grado" required placeholder="Es: Ten." className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">C.I.P.</label>
                  <input name="cip" required placeholder="Es: 356979KM" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-mono font-bold uppercase" />
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nome</label>
                <input name="nome" required placeholder="Nome" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Cognome</label>
                <input name="cognome" required placeholder="Cognome" className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-bold" />
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200 text-xs mt-4"
              >
                Inizializza Profilo Admin
              </button>
            </form>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-800"
        >
          <div className="bg-slate-800 p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-900 rounded-3xl shadow-lg shadow-blue-900/50 mb-2 border border-blue-500/30">
              <HermesLogo className="text-blue-500" size={48} />
            </div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">SISTEMA H.E.R.M.E.S.</h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Database: {lastImportedFileName}</p>
          </div>
          
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[10px] font-black text-slate-500 uppercase">Codice Identificativo (CIP)</label>
                <button 
                  type="button"
                  onClick={() => setHasLoadedData(false)}
                  className="text-[10px] font-bold text-blue-500 hover:underline uppercase"
                >
                  Cambia DB
                </button>
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password"
                  required
                  value={loginCip}
                  onChange={(e) => setLoginCip(e.target.value)}
                  placeholder="Inserisci il tuo CIP"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-mono uppercase"
                />
              </div>
            </div>
            
            <button 
              type="submit"
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200 text-xs"
            >
              Accedi al Workspace
            </button>

            <div className="pt-4 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Accesso Riservato Personale Autorizzato
              </p>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Settings size={20} className="text-blue-600" />
                  </div>
                  <h3 className="font-black text-slate-800 uppercase tracking-tight">Impostazioni e Gestione Utenti</h3>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto max-h-[70vh] space-y-8">
                {/* Current Profile */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <User size={16} /> Profilo Corrente
                    </h4>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{currentUser?.grado} {currentUser?.cognome} {currentUser?.nome}</p>
                      <p className="text-xs text-slate-500">CIP: {currentUser?.cip} | Ruolo: <span className="uppercase font-bold text-blue-600">{currentUser?.role}</span></p>
                    </div>
                    <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase">
                      ATTIVO
                    </div>
                  </div>
                </section>

                {/* API Key Management */}
                <section className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Key size={16} /> Gestione Chiave API Gemini
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="password"
                          value={currentUser?.apiKey || ''}
                          onChange={(e) => handleSaveKey(e.target.value)}
                          placeholder="Inserisci o modifica Chiave API Gemini..."
                          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          if (window.confirm("Sei sicuro di voler eliminare la chiave API salvata?")) {
                            handleSaveKey('');
                          }
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-slate-200"
                        title="Elimina Chiave"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex items-start gap-3">
                      <Shield className="text-blue-500 mt-0.5" size={14} />
                      <p className="text-[10px] text-blue-700 leading-tight">
                        La <strong>Gemini API Key</strong> abilita l'elaborazione intelligente dei documenti.
                        Sarà salvata internamente al tuo profilo nel database JSON corrente. 
                        In mancanza della chiave, le funzionalità AI saranno disabilitate.
                      </p>
                    </div>
                  </div>
                </section>

                {currentUser?.role === 'admin' && (
                  <>
                    {/* Admin Management */}
                    <section className="space-y-4 pt-4 border-t border-slate-100">
                      <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Shield size={16} /> Gestione Amministratore
                      </h4>
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          const oldCip = formData.get('oldCip') as string;
                          const newData: UserProfile = {
                            grado: formData.get('grado') as string,
                            cognome: formData.get('cognome') as string,
                            nome: formData.get('nome') as string,
                            cip: formData.get('cip') as string,
                            role: 'admin',
                            apiKey: currentUser.apiKey
                          };
                          handleUpdateAdmin(oldCip, newData);
                        }}
                        className="grid grid-cols-2 gap-3"
                      >
                        <input name="oldCip" placeholder="CIP Attuale per conferma" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500" required />
                        <div className="grid grid-cols-3 gap-2 col-span-2">
                          <input name="grado" placeholder="Nuovo Grado" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs" required />
                          <input name="cognome" placeholder="Nuovo Cognome" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs" required />
                          <input name="nome" placeholder="Nuovo Nome" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs" required />
                        </div>
                        <input name="cip" placeholder="Nuovo CIP" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs" required />
                        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">
                          AGGIORNA ADMIN
                        </button>
                      </form>
                    </section>

                    {/* Operators Management */}
                    <section className="space-y-4 pt-4 border-t border-slate-100">
                      <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Users size={16} /> Gestione Operatori
                      </h4>
                      <div className="space-y-3">
                        {users.filter(u => u.role === 'operatore').map(op => (
                          <div key={op.cip} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div>
                              <p className="text-xs font-bold text-slate-900">{op.grado} {op.cognome} {op.nome}</p>
                              <p className="text-[10px] text-slate-500">CIP: {op.cip}</p>
                            </div>
                            <button onClick={() => handleRemoveOperator(op.cip)} className="text-rose-500 hover:text-rose-700">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          const formData = new FormData(e.currentTarget);
                          const op: UserProfile = {
                            grado: formData.get('grado') as string,
                            cognome: formData.get('cognome') as string,
                            nome: formData.get('nome') as string,
                            cip: formData.get('cip') as string,
                            role: 'operatore',
                            apiKey: ''
                          };
                          handleAddOperator(op);
                          (e.target as HTMLFormElement).reset();
                        }}
                        className="grid grid-cols-2 gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100"
                      >
                        <input name="grado" placeholder="Grado" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" required />
                        <input name="cognome" placeholder="Cognome" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" required />
                        <input name="nome" placeholder="Nome" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" required />
                        <input name="cip" placeholder="CIP" className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" required />
                        <button type="submit" className="col-span-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center justify-center gap-2">
                          <Plus size={14} /> AGGIUNGI OPERATORE
                        </button>
                      </form>
                    </section>
                  </>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full px-4 py-3 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-all"
                >
                  CHIUDI IMPOSTAZIONI
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-slate-900 text-slate-200 flex flex-col z-20 shadow-xl no-print"
      >
        <div className="p-6 flex items-center justify-between border-b border-slate-800">
          {isSidebarOpen ? (
            <div className="flex items-center gap-3">
              <HermesLogo size={32} className="text-blue-500" />
              <div className="flex flex-col">
                <span className="font-black text-xl tracking-tighter text-white leading-none">H.E.R.M.E.S.</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">SISTEMA</span>
              </div>
            </div>
          ) : (
            <HermesLogo size={32} className="text-blue-500 mx-auto" />
          )}
          {isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1 hover:bg-slate-800 rounded-md transition-colors text-slate-400"
            >
              <X size={20} />
            </button>
          )}
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="absolute left-6 top-6 p-1 hover:bg-slate-800 rounded-md transition-colors text-slate-400"
            >
              <Menu size={20} />
            </button>
          )}
        </div>

        <nav className="flex-1 py-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveRoom(item.id)}
              className={cn(
                "w-full flex items-center px-6 py-4 transition-all duration-200 border-l-4",
                activeRoom === item.id 
                  ? "bg-slate-800 border-blue-500 text-white font-semibold" 
                  : "border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <item.icon size={20} className={cn(activeRoom === item.id ? "text-blue-400" : "text-slate-500")} />
              {isSidebarOpen && <span className="ml-4 truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center px-4 py-3 text-slate-400 hover:text-white transition-colors"
          >
            <Settings size={20} />
            {isSidebarOpen && <span className="ml-4">Impostazioni</span>}
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-3 text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={20} />
            {isSidebarOpen && <span className="ml-4">Esci dal Sistema</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Topbar */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm z-10 no-print">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-3">
            {menuItems.find(m => m.id === activeRoom)?.label}
            {isDirty && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-black uppercase border border-amber-200"
                title="Il database locale contiene nuove importazioni non ancora salvate sul file JSON"
              >
                <AlertTriangle size={12} /> Database non salvato
              </motion.div>
            )}
          </h1>
          
          <div className="flex items-center gap-3">
            <div className="mr-4 text-right hidden lg:block">
              <p className="text-xs font-bold text-slate-900 leading-none">{currentUser?.grado} {currentUser?.cognome}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">{currentUser?.role}</p>
            </div>

            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 mr-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
              title="Mio Profilo e Configurazione AI"
            >
              <Settings size={20} />
            </button>

            {/* API Key Input in Header */}
            <div className="relative flex items-center mr-2">
              <Key className="absolute left-2 text-slate-400" size={14} />
              <input 
                type="password"
                placeholder="Gemini API Key"
                value={geminiKey}
                onChange={(e) => handleSaveKey(e.target.value)}
                className="pl-7 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs w-40 focus:w-60 focus:bg-white focus:border-blue-400 transition-all outline-none font-mono"
                title="Inserisci la tua chiave API Gemini (verrà salvata nel DB)"
              />
            </div>

            <button 
              onClick={handleNewDb}
              className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-md text-sm font-medium hover:bg-rose-100 transition-colors"
              title="Nuovo Database"
            >
              <Trash2 size={16} />
              <span className="hidden md:inline">Nuovo DB</span>
            </button>
            
            <button 
              onClick={handleImportDbAdvanced}
              disabled={hasLoadedData}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                hasLoadedData 
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                  : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
              )}
              title={hasLoadedData ? "Database già caricato" : "Carica DB (Abilita salvataggio diretto)"}
            >
              <FolderOpen size={16} />
              <span className="hidden md:inline">Carica DB</span>
            </button>
            
            <button 
              onClick={handleExportDb}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
              title="Salva Database (Sovrascrive ultimo file caricato)"
            >
              <Save size={16} />
              <span className="hidden md:inline">Salva DB</span>
            </button>

            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Esci dal Sistema"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRoom}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeRoom === 'dashboard' && (
                <Dashboard 
                  segnalazioniCount={databaseSegnalazioni.length} 
                  isAiLocal={isAiLocal}
                  onRestoreSession={handleRestoreSession}
                  hasLoadedData={hasLoadedData}
                />
              )}
              {activeRoom === 'analisi' && (
                <PdfAnalysis 
                  database={databaseSegnalazioni} 
                  setDatabase={setDatabaseSegnalazioni} 
                  onDataChange={() => setIsDirty(true)}
                />
              )}
              {activeRoom === 'mappa' && (
                <MapAnalysis 
                  segnalazioni={databaseSegnalazioni} 
                />
              )}
              {activeRoom === 'report' && (
                <AnalysisReport 
                  segnalazioni={databaseSegnalazioni} 
                />
              )}
              {activeRoom === 'intelligence' && (
                <Analysis 
                  segnalazioni={databaseSegnalazioni} 
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
