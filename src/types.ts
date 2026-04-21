export interface Subject {
  cognome: string;
  nome: string;
  data_nascita: string;
  luogo_nascita: string;
  indirizzo: string;
}

export interface Segnalazione {
  idUnivoco: string;
  protocollo: string;
  oggetto: string;
  comando: string;
  categoria: string;
  dataOra: string;
  provincia_evento: string;
  comune_evento: string;
  modus_operandi: string;
  vittima_eta: string;
  vittima_sesso: string;
  vittime: Subject[];
  indagati: Subject[];
  sintesi: string;
  testoIntegrale: string;
}

export interface UserProfile {
  grado: string;
  cognome: string;
  nome: string;
  cip: string;
  role: 'admin' | 'operatore';
  apiKey?: string;
}
