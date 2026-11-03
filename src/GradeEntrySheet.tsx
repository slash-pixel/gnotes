import React, { useState, useEffect } from 'react';
import {
  Save,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  BookOpen,
  Users,
  Lock,
  Unlock,
  ShieldCheck,
  KeyRound,
  Filter
} from 'lucide-react';
import type { SessionInfo } from './App';
import { fetchApi, setAuthToken } from './services/api';

// Pondération d'un trimestre : CC = 30 %, Éva de niveau = 70 %
const POIDS_CC = 0.3;
const POIDS_EVA = 0.7;

type Champ = 'note_cc' | 'note_eva';
type Partie = 'cc' | 'eva';

interface StudentGradeRow {
  id_eleve: string;
  nom_complet: string;
  note_cc: number | null;
  note_eva: number | null;
}

interface Colonne {
  id_sequence: string;
  type: Partie;
  libelle: string;
  poids: number;
  est_verrouille: boolean;
  date_verrouillage: string | null;
}

interface GrilleTrimestreResponse {
  id_affectation_cours: string;
  coefficient: number;
  coefficient_modifiable: boolean;
  colonnes: { cc: Colonne; eva: Colonne };
  grille: StudentGradeRow[];
}

interface GradeEntrySheetProps {
  sessionData: SessionInfo | null;
  token: string;
  userRole: 'enseignant' | 'admin';
  onLogout: () => void;
}

interface Classe {
  id_classe: string;
  nom_classe: string;
}

interface Matiere {
  id_matiere: string;
  libelle_matiere: string;
  coefficient: number;
  id_affectation_cours: string;
}

interface TrimestreGroup {
  id_trimestre: string;
  numero_trimestre: number;
  libelle_trimestre: string;
  sequences: { id_sequence: string; numero_sequence: number; libelle_sequence: string }[];
}

interface AuthResponse {
  token: string;
  message?: string;
  est_verrouille?: boolean;
}

const estNote = (v: number | null): v is number => v !== null && Number.isFinite(v);
const arrondi = (n: number) => Math.round(n * 100) / 100;

// Aperçu instantané : moyenne = 30 % CC + 70 % Éva, puis × coefficient (le serveur recalcule à l'enregistrement)
const calculer = (s: StudentGradeRow, coefficient: number) => {
  if (!estNote(s.note_cc) || !estNote(s.note_eva) || !Number.isFinite(coefficient)) return null;
  const moyenne = arrondi(s.note_cc * POIDS_CC + s.note_eva * POIDS_EVA);
  return { moyenne, nxc: arrondi(moyenne * coefficient) };
};

export const GradeEntrySheet: React.FC<GradeEntrySheetProps> = ({ sessionData, token, userRole, onLogout }) => {
  const [classes, setClasses] = useState<Classe[]>([]);
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [trimestres, setTrimestres] = useState<TrimestreGroup[]>([]);

  const session = sessionData as (SessionInfo & { id_classe?: string; id_matiere?: string; id_sequence?: string }) | null;

  const [selectedClasse, setSelectedClasse] = useState<string>(session?.id_classe || '');
  const [selectedMatiere, setSelectedMatiere] = useState<string>(session?.id_matiere || '');
  const [selectedTrimestre, setSelectedTrimestre] = useState<string>('');

  const [students, setStudents] = useState<StudentGradeRow[]>([]);
  const [colonnes, setColonnes] = useState<{ cc: Colonne; eva: Colonne } | null>(null);
  const [idAffectationCours, setIdAffectationCours] = useState<string>('');
  const [coefficientModifiable, setCoefficientModifiable] = useState<boolean>(true);
  const [coefficient, setCoefficient] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingGrid, setLoadingGrid] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [validating, setValidating] = useState<boolean>(false);
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modal de déverrouillage Admin (une colonne à la fois)
  const [unlockTarget, setUnlockTarget] = useState<Partie | null>(null);
  const [adminId, setAdminId] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');

  const ccLocked = colonnes?.cc.est_verrouille ?? false;
  const evaLocked = colonnes?.eva.est_verrouille ?? false;
  const libelleCC = colonnes?.cc.libelle ?? 'CC';
  const libelleEva = colonnes?.eva.libelle ?? 'Éva de niveau';

  // 0. Garantit que le token reçu en prop est celui utilisé par fetchApi
  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  // 1. Charger les classes et trimestres au démarrage
  useEffect(() => {
    async function initMetadata() {
      if (!token) return;
      try {
        setLoading(true);
        const [classesRes, sequencesRes] = await Promise.all([
          fetchApi('/classes') as Promise<Classe[]>,
          fetchApi('/sequences') as Promise<TrimestreGroup[]>
        ]);
        setClasses(classesRes || []);
        setTrimestres(sequencesRes || []);

        if (session?.id_classe) {
          setSelectedClasse(session.id_classe);
          const matieresRes = await fetchApi(`/classes/${session.id_classe}/matieres`) as Matiere[];
          setMatieres(matieresRes || []);
        }
        if (session?.id_matiere) setSelectedMatiere(session.id_matiere);

        // Trimestre choisi à l'écran de connexion (retrouvé grâce à sa séquence), sinon le premier
        const depuisSession = (sequencesRes || []).find(t => t.sequences.some(s => s.id_sequence === session?.id_sequence));
        setSelectedTrimestre(prev => prev || depuisSession?.id_trimestre || sequencesRes?.[0]?.id_trimestre || '');
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : 'Erreur lors du chargement des données initiales.';
        setNotification({ type: 'error', message: errMessage });
      } finally {
        setLoading(false);
      }
    }
    initMetadata();
  }, [token, session?.id_classe, session?.id_matiere, session?.id_sequence]);

  // 2. Charger les matières lorsque la classe change
  useEffect(() => {
    async function loadMatieres() {
      if (!selectedClasse) {
        setMatieres([]);
        return;
      }
      try {
        const data = await fetchApi(`/classes/${selectedClasse}/matieres`) as Matiere[];
        setMatieres(data || []);
      } catch {
        setNotification({ type: 'error', message: 'Erreur lors du chargement des matières.' });
      }
    }
    loadMatieres();
  }, [selectedClasse, token]);

  // 3. Charger la grille du trimestre (CC + Éva) dès que Classe, Matière et Trimestre sont choisis
  useEffect(() => {
    async function loadGrille() {
      if (!selectedClasse || !selectedMatiere || !selectedTrimestre) return;
      try {
        setLoadingGrid(true);
        const data = await fetchApi(
          `/notes/grille-trimestre?id_classe=${selectedClasse}&id_matiere=${selectedMatiere}&id_trimestre=${selectedTrimestre}`
        ) as GrilleTrimestreResponse;

        setStudents(data.grille ?? []);
        setColonnes(data.colonnes);
        setIdAffectationCours(data.id_affectation_cours);
        setCoefficient(data.coefficient ?? 1);
        setCoefficientModifiable(data.coefficient_modifiable);
        setHasUnsavedChanges(false);
      } catch (error: unknown) {
        setStudents([]);
        setColonnes(null);
        const errMessage = error instanceof Error ? error.message : 'Erreur lors du chargement de la grille des notes.';
        setNotification({ type: 'error', message: errMessage });
      } finally {
        setLoadingGrid(false);
      }
    }
    loadGrille();
  }, [selectedClasse, selectedMatiere, selectedTrimestre, refreshKey, token]);

  const handleCoefficientChange = (value: number) => {
    if (!coefficientModifiable) return;
    setCoefficient(value);
    setHasUnsavedChanges(true);
  };

  const handleGradeChange = (id_eleve: string, champ: Champ, value: string) => {
    if ((champ === 'note_cc' && ccLocked) || (champ === 'note_eva' && evaLocked)) return;
    setHasUnsavedChanges(true);
    setStudents(prev =>
      prev.map(student => {
        if (student.id_eleve !== id_eleve) return student;
        const val = value === '' ? null : parseFloat(value);
        return { ...student, [champ]: val !== null && Number.isNaN(val) ? null : val };
      })
    );
  };

  // Enregistrer en brouillon : n'envoie que les colonnes non verrouillées, et jamais de note vide
  const handleSaveDraft = async () => {
    if (!selectedClasse || !selectedMatiere || !selectedTrimestre || (ccLocked && evaLocked)) return;
    setSaving(true);
    setNotification(null);

    try {
      if (!Number.isFinite(coefficient) || coefficient < 0.01 || coefficient > 99.99 || Number(coefficient.toFixed(2)) !== coefficient) {
        setNotification({ type: 'error', message: 'Le coefficient doit être compris entre 0,01 et 99,99 (deux décimales maximum).' });
        return;
      }

      const notesPayload = students
        .map(s => ({
          id_eleve: s.id_eleve,
          ...(!ccLocked && estNote(s.note_cc) ? { note_cc: s.note_cc } : {}),
          ...(!evaLocked && estNote(s.note_eva) ? { note_eva: s.note_eva } : {})
        }))
        .filter(n => 'note_cc' in n || 'note_eva' in n);

      if (notesPayload.length === 0) {
        setNotification({ type: 'error', message: 'Saisissez au moins une note avant d’enregistrer.' });
        return;
      }
      const horsLimites = notesPayload.some(n =>
(typeof n.note_cc === 'number' &&
  (n.note_cc < 0 || n.note_cc > 20)) ||
(typeof n.note_eva === 'number' &&
  (n.note_eva < 0 || n.note_eva > 20))
      );
      if (horsLimites) {
        setNotification({ type: 'error', message: 'Toutes les notes doivent être comprises entre 0 et 20.' });
        return;
      }

      await fetchApi('/notes/sauvegarder-trimestre', {
        method: 'POST',
        body: JSON.stringify({
          id_classe: selectedClasse,
          id_matiere: selectedMatiere,
          id_trimestre: selectedTrimestre,
          coefficient,
          notes: notesPayload
        })
      });

      setNotification({ type: 'success', message: 'Brouillon enregistré avec succès !' });
      setRefreshKey(k => k + 1);
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde.';
      setNotification({ type: 'error', message: errMessage });
    } finally {
      setSaving(false);
    }
  };

  const ccComplet = students.length > 0 && students.every(s => estNote(s.note_cc));
  const evaComplet = students.length > 0 && students.every(s => estNote(s.note_eva));

  // Verrouiller CC seul, Éva seule, ou tout ce qui ne l'est pas encore
  const handleValidate = async (parties: Partie | 'tout') => {
    if (!selectedClasse || !selectedMatiere || !selectedTrimestre) return;
    if (hasUnsavedChanges) {
      setNotification({ type: 'error', message: 'Enregistrez le brouillon avant de verrouiller.' });
      return;
    }
    const quoi = parties === 'cc' ? libelleCC : parties === 'eva' ? libelleEva : 'tout ce qui n’est pas encore verrouillé';
    if (!window.confirm(`Attention : le verrouillage de « ${quoi} » bloque la saisie pour tous les élèves. Êtes-vous sûr ?`)) return;

    setValidating(true);
    setNotification(null);
    try {
      const res = await fetchApi('/notes/valider-trimestre', {
        method: 'POST',
        body: JSON.stringify({
          id_classe: selectedClasse,
          id_matiere: selectedMatiere,
          id_trimestre: selectedTrimestre,
          parties
        })
      }) as AuthResponse;
      setNotification({ type: 'success', message: res.message || 'Notes verrouillées avec succès !' });
      setRefreshKey(k => k + 1);
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : 'Erreur lors de la validation.';
      setNotification({ type: 'error', message: errMessage });
    } finally {
      setValidating(false);
    }
  };

  // Déverrouillage par l'administrateur (une colonne à la fois)
  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const colonne = unlockTarget && colonnes ? colonnes[unlockTarget] : null;
    if (!colonne || !idAffectationCours) {
      setNotification({ type: 'error', message: 'Affectation du cours introuvable.' });
      return;
    }

    setUnlocking(true);
    setNotification(null);
    try {
      const loginRes = await fetchApi('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ id_admin: adminId, mot_de_passe: adminPassword })
      }) as AuthResponse;

      await fetchApi('/notes/admin/deverrouiller', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${loginRes.token}` },
        body: JSON.stringify({ id_affectation_cours: idAffectationCours, id_sequence: colonne.id_sequence })
      });

      setUnlockTarget(null);
      setAdminPassword('');
      setNotification({ type: 'success', message: `Saisie de « ${colonne.libelle} » rouverte par l'administration.` });
      setRefreshKey(k => k + 1);
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : 'Échec du déverrouillage administrateur.';
      setNotification({ type: 'error', message: errMessage });
    } finally {
      setUnlocking(false);
    }
  };

  const filteredStudents = students.filter(s =>
    s.nom_complet.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ccSaisies = students.filter(s => estNote(s.note_cc)).length;
  const evaSaisies = students.filter(s => estNote(s.note_eva)).length;

  const toutVerrouillable =
    (!ccLocked || !evaLocked) && (ccLocked || ccComplet) && (evaLocked || evaComplet);

  const badge = (verrouille: boolean, libelle: string) => (
    <span className={`text-xs px-3 py-1 rounded-full font-semibold border flex items-center gap-1.5 ${verrouille ? 'bg-rose-500/20 text-rose-200 border-rose-400/40' : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'}`}>
      {verrouille ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
      {libelle} : {verrouille ? 'verrouillé' : 'saisie ouverte'}
    </span>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
        <span className="text-sm font-medium tracking-wide">Chargement de l'espace pédagogique...</span>
      </div>
    );
  }

  const inputClass = (verrouille: boolean) =>
    `w-28 text-center font-bold rounded-xl py-2 shadow-sm text-sm transition ${verrouille ? 'bg-slate-100 text-slate-500 border border-slate-300 cursor-not-allowed' : 'bg-white text-slate-900 border border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500'}`;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">

        {/* EN-TÊTE ET SÉLECTEURS DE FILTRES */}
        <div className="bg-linear-to-r from-blue-900 via-indigo-900 to-blue-950 p-6 text-white border-b-4 border-amber-500 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" /> Collège Catholique Saint Charles Borromée
              </span>
              <h1 className="text-lg font-bold text-white mt-1">
                Carnet de Notes · {sessionData?.subjectName || 'Matière'} ({sessionData?.className || 'Classe'})
              </h1>
            </div>
            {colonnes && (
              <div className="flex flex-wrap gap-2">
                {badge(ccLocked, libelleCC)}
                {badge(evaLocked, libelleEva)}
              </div>
            )}
          </div>

          {/* Sélecteurs dynamiques */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 bg-black/20 p-4 rounded-2xl border border-white/10">
            <div>
              <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">Classe</label>
              <select
                value={selectedClasse}
                onChange={(e) => {
                  setSelectedClasse(e.target.value);
                  setSelectedMatiere('');
                  setNotification(null);
                }}
                className="w-full bg-white text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">-- Choisir une classe --</option>
                {classes.map(c => (
                  <option key={c.id_classe} value={c.id_classe}>{c.nom_classe}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">Matière</label>
              <select
                value={selectedMatiere}
                onChange={(e) => { setSelectedMatiere(e.target.value); setNotification(null); }}
                disabled={!selectedClasse}
                className="w-full bg-white text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
              >
                <option value="">-- Choisir une matière --</option>
                {matieres.map(m => (
                  <option key={m.id_matiere} value={m.id_matiere}>
                    {m.libelle_matiere} (Coef {m.coefficient})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">Trimestre</label>
              <select
                value={selectedTrimestre}
                onChange={(e) => { setSelectedTrimestre(e.target.value); setNotification(null); }}
                className="w-full bg-white text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">-- Choisir un trimestre --</option>
                {trimestres.map(t => (
                  <option key={t.id_trimestre} value={t.id_trimestre}>{t.libelle_trimestre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Barre de recherche et actions */}
          {selectedClasse && selectedMatiere && selectedTrimestre && colonnes && (
            <div className="flex flex-col lg:flex-row justify-between items-center gap-3 pt-2">
              <div className="relative w-full lg:w-72">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher un élève..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white text-slate-800 placeholder-slate-400 border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 shadow"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {!(ccLocked && evaLocked) && (
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving || validating || students.length === 0}
                    className="flex-1 lg:flex-none flex items-center justify-center space-x-1.5 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Enregistrer Brouillon</span>
                  </button>
                )}

                {!ccLocked && (
                  <button
                    onClick={() => handleValidate('cc')}
                    disabled={validating || saving || hasUnsavedChanges || !ccComplet}
                    title={!ccComplet ? `Toutes les notes de ${libelleCC} doivent être saisies` : undefined}
                    className="flex-1 lg:flex-none flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer disabled:opacity-50"
                  >
                    {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Verrouiller {libelleCC}</span>
                  </button>
                )}

                {!evaLocked && (
                  <button
                    onClick={() => handleValidate('eva')}
                    disabled={validating || saving || hasUnsavedChanges || !evaComplet}
                    title={!evaComplet ? `Toutes les notes de ${libelleEva} doivent être saisies` : undefined}
                    className="flex-1 lg:flex-none flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer disabled:opacity-50"
                  >
                    {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    <span>Verrouiller {libelleEva}</span>
                  </button>
                )}

                {!ccLocked && !evaLocked && (
                  <button
                    onClick={() => handleValidate('tout')}
                    disabled={validating || saving || hasUnsavedChanges || !toutVerrouillable}
                    className="flex-1 lg:flex-none flex items-center justify-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Tout verrouiller</span>
                  </button>
                )}

               {/* ccLocked && (
                  <button
                    onClick={() => setUnlockTarget('cc')}
                    className="flex-1 lg:flex-none flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-amber-200" />
                    <span>Déverrouiller {libelleCC} (Admin)</span>
                  </button>
                )*/}
                {evaLocked && (
                  <button
                    onClick={() => setUnlockTarget('eva')}
                    className="flex-1 lg:flex-none flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-amber-200" />
                    <span>Déverrouiller {libelleEva} (Admin)</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        {notification && (
          <div className={`p-4 text-xs flex items-center space-x-3 border-b ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : notification.type === 'info' ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            <span className="font-semibold">{notification.message}</span>
          </div>
        )}

        {/* Barre de stats */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center text-xs gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <Users className="w-3.5 h-3.5 text-blue-900" />
              <span>Effectif : <strong className="text-blue-900">{students.length} élèves</strong></span>
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{libelleCC} : <strong className="text-emerald-700">{ccSaisies} / {students.length}</strong></span>
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{libelleEva} : <strong className="text-emerald-700">{evaSaisies} / {students.length}</strong></span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 font-medium">
            <label htmlFor="course-coefficient" className="text-xs font-bold text-slate-700">Coefficient du cours :</label>
            <input
              id="course-coefficient"
              type="number"
              min="0.01"
              max="99.99"
              step="0.01"
              value={Number.isFinite(coefficient) ? coefficient : ''}
              disabled={!coefficientModifiable || loadingGrid || saving || validating}
              onChange={(e) => handleCoefficientChange(e.target.valueAsNumber)}
              className="w-24 rounded-lg border border-amber-400 px-3 py-2 text-center font-bold text-blue-900 disabled:bg-slate-100"
            />
            {!coefficientModifiable && <span className="text-slate-500">Figé (séquence verrouillée)</span>}
            {hasUnsavedChanges && <span className="text-amber-700">Non enregistré</span>}
          </div>
        </div>

        {/* Tableau des notes et élèves */}
        <div className="overflow-x-auto max-h-125 border-b border-slate-200">
          {!selectedClasse || !selectedMatiere || !selectedTrimestre ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Filter className="w-10 h-10 mx-auto opacity-40 text-blue-900" />
              <p className="text-xs font-semibold">Veuillez sélectionner une Classe, une Matière et un Trimestre pour afficher la grille.</p>
            </div>
          ) : loadingGrid ? (
            <div className="py-16 text-center text-slate-500 space-y-2 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-900" />
              <span className="text-xs">Chargement des élèves et des notes...</span>
            </div>
          ) : students.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs space-y-1">
              <p className="font-bold text-slate-700">Aucun élève trouvé.</p>
              <p className="text-slate-400">Vérifiez que des élèves sont bien inscrits dans cette classe pour l'année active.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-blue-950 text-white sticky top-0 z-10 shadow-md">
                <tr>
                  <th className="p-3.5 border-b border-slate-300 w-16 text-center font-bold tracking-wider">N°</th>
                  <th className="p-3.5 border-b border-slate-300 font-bold tracking-wider">Nom et Prénom (s) de l'élève</th>
                  <th className="p-3.5 border-b border-slate-300 w-40 text-center bg-blue-900 font-bold text-amber-300 tracking-wider">
                    {libelleCC} / 20 <span className="block text-[10px] font-semibold text-amber-200/80">30 % du trimestre</span>
                  </th>
                  <th className="p-3.5 border-b border-slate-300 w-40 text-center bg-blue-900 font-bold text-amber-300 tracking-wider">
                    {libelleEva} / 20 <span className="block text-[10px] font-semibold text-amber-200/80">70 % du trimestre</span>
                  </th>
                  <th className="p-3.5 border-b border-slate-300 w-36 text-center bg-indigo-950 font-bold text-sky-300 tracking-wider">Moyenne trimestre</th>
                  <th className="p-3.5 border-b border-slate-300 w-40 text-center bg-indigo-950 font-bold text-emerald-300 tracking-wider">NxC (Moy. × Coef)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredStudents.map((student, index) => {
                  const r = calculer(student, coefficient);
                  return (
                    <tr key={student.id_eleve} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-amber-50/40 transition-colors`}>
                      <td className="p-3.5 text-center text-slate-500 font-mono font-bold">{index + 1}</td>
                      <td className="p-3.5 font-bold text-slate-800 uppercase tracking-wide">{student.nom_complet}</td>
                      <td className="p-2 text-center bg-amber-50/20">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="20"
                          disabled={ccLocked}
                          value={student.note_cc ?? ''}
                          onChange={(e) => handleGradeChange(student.id_eleve, 'note_cc', e.target.value)}
                          className={inputClass(ccLocked)}
                          placeholder="—"
                          aria-label={`${libelleCC} de ${student.nom_complet}`}
                        />
                      </td>
                      <td className="p-2 text-center bg-amber-50/20">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="20"
                          disabled={evaLocked}
                          value={student.note_eva ?? ''}
                          onChange={(e) => handleGradeChange(student.id_eleve, 'note_eva', e.target.value)}
                          className={inputClass(evaLocked)}
                          placeholder="—"
                          aria-label={`${libelleEva} de ${student.nom_complet}`}
                        />
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-sky-800 bg-sky-50/30 text-sm">
                        {r ? r.moyenne.toFixed(2) : '—'}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20 text-sm">
                        {r ? r.nxc.toFixed(2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pied de page */}
        <div className="bg-slate-50 p-4 sm:px-6 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
          <div className="flex items-center space-x-2 text-slate-700 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Connecté en tant que : <strong className="text-blue-900">{userRole} ({sessionData?.teacherName})</strong></span>
          </div>
          <button
            onClick={onLogout}
            className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl transition flex items-center space-x-2 font-semibold shadow-md cursor-pointer"
          >
            <XCircle className="w-4 h-4" />
            <span>Fermer / Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Modal de Déverrouillage Administrateur */}
      {unlockTarget && colonnes && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" />
                Accès Administrateur requis
              </h3>
              <button
                onClick={() => setUnlockTarget(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Saisissez l'identifiant (UUID) et le mot de passe administrateur pour déverrouiller « {colonnes[unlockTarget].libelle} ». Les notes déjà saisies sont conservées.
            </p>

            <form onSubmit={handleAdminUnlock} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Identifiant Admin (UUID)</label>
                <input
                  type="text"
                  required
                  placeholder="ID administrateur"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mot de passe Administrateur</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUnlockTarget(null)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={unlocking}
                  className="flex-1 bg-blue-900 hover:bg-blue-950 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {unlocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>Déverrouiller</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
