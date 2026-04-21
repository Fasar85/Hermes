import React from 'react';
import { 
  Shield, 
  AlertTriangle, 
  Users, 
  Map as MapIcon, 
  TrendingUp, 
  Clock, 
  FileText,
  Activity,
  ChevronRight,
  Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { HermesLogo } from './HermesLogo';

interface DashboardProps {
  segnalazioniCount: number;
  isAiLocal?: boolean;
  onRestoreSession: () => void;
  hasLoadedData: boolean;
}

export default function Dashboard({ segnalazioniCount, isAiLocal, onRestoreSession, hasLoadedData }: DashboardProps) {
  const stats = [
    { label: 'Segnalazioni Totali', value: segnalazioniCount, icon: AlertTriangle, color: 'blue' },
    { label: 'Analisi Territoriale', value: 'Attiva', icon: MapIcon, color: 'emerald' },
    { label: 'Livello Allerta', value: 'Monitoraggio', icon: Shield, color: 'amber' },
  ];

  return (
    <div className="space-y-8">
      {/* AI Warning Banner when Local */}
      {isAiLocal && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl shadow-sm flex items-start gap-4"
        >
          <div className="p-2 bg-amber-100 rounded-lg">
            <AlertTriangle className="text-amber-600" size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-900 uppercase tracking-tight">Modalità AI Locale Attiva</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              La chiave API Gemini non è presente nel profilo. Il sistema sta operando in modalità <strong>Offline/Locale</strong>: 
              l'analisi dei documenti è meno precisa, più lenta e i risultati potrebbero essere approssimativi. 
              Inserisci una chiave API valida nella barra superiore per abilitare il motore avanzato.
            </p>
          </div>
        </motion.div>
      )}

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-slate-900 rounded-[2rem] p-10 text-white shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
          <div className="p-4 bg-blue-500/10 rounded-3xl border border-blue-500/20 backdrop-blur-sm self-start">
            <HermesLogo size={80} className="text-blue-500" />
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-3 py-1 bg-blue-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest">Piattaforma Ibrida Intelligence</span>
              <span className="px-3 py-1 bg-white/10 text-slate-300 text-[10px] font-bold rounded-full uppercase tracking-widest border border-white/5">v3.5 Stable</span>
            </div>
            
            <h2 className="text-5xl font-black tracking-tighter mb-4 leading-none">
              SISTEMA <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">H.E.R.M.E.S.</span>
            </h2>
            
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-[2px] bg-blue-500" />
              <p className="text-blue-400 font-bold uppercase tracking-[0.2em] text-xs">
                HUB Elaborativo Ricerca Metadati e Eventi Segnalati
              </p>
            </div>

            <p className="text-slate-400 max-w-2xl text-lg leading-relaxed mb-10">
              Infrastruttura avanzata per l'analisi dei dati di polizia. Sfrutta il motore AI Gemini per la decodifica dei carichi informativi SDI, 
              arricchendo i flussi operativi con cartografia analitica e correlazione automatizzata degli eventi.
            </p>

            <div className="flex flex-wrap gap-4">
              {!hasLoadedData && (
                <button 
                  onClick={onRestoreSession}
                  className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-2xl font-black transition-all shadow-xl shadow-blue-500/20 active:scale-95 text-xs uppercase tracking-widest"
                >
                  <Clock size={18} />
                  Ripristina Ultima Sessione
                </button>
              )}
              <div className="flex items-center gap-3 bg-white/5 px-6 py-3 rounded-2xl backdrop-blur-md border border-white/10">
                <Activity size={18} className="text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Status: Integrale</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-blue-600/10 to-transparent pointer-events-none" />
        <HermesLogo className="absolute -bottom-20 -right-20 text-white/5 w-96 h-96 rotate-12" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-slate-50">
                <stat.icon className="text-slate-600" size={24} />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity / Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-600" />
            Flusso Operativo Recente
          </h3>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y">
            <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <FileText size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Analisi PDF Segnalazioni</p>
                  <p className="text-xs text-slate-500">Importa e processa nuovi documenti di polizia</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
            </div>
            
            <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <MapIcon size={18} className="text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Monitoraggio Territoriale</p>
                  <p className="text-xs text-slate-500">Visualizza hotspot criminali sulla mappa</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="space-y-6">
          <h3 className="text-xl font-black text-slate-800">Integrità Sistema</h3>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Database Locale</span>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase">Sincronizzato</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Motore AI</span>
                <span className={cn(
                  "px-2 py-1 text-[10px] font-black rounded uppercase",
                  isAiLocal ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                )}>
                  {isAiLocal ? "NON ATTIVA (Configurare Key)" : "Online (Gemini)"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">Servizio Mappe</span>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded uppercase">Attivo</span>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 leading-tight">
                  {isAiLocal 
                    ? "ATTENZIONE: AI locale attiva. Precisione ridotta e analisi approssimativa dei contenuti complessi."
                    : "Tutti i dati sono criptati e salvati localmente nel browser. Assicurarsi di esportare periodicamente il database."
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
