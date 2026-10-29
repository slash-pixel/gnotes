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
interface StudentGradeRow {
  id_eleve: string;
  nom_complet: string;
  valeur_note: number | null;
  note_x_coefficient: number | null;
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
  sequences: {
    id_sequence: string;
    numero_sequence: number;
    libelle_sequence: string;
  }[];
}

interface SequenceItem {
  id_sequence: string;
  numero_sequence: number;
  libelle_sequence: string;
}

interface GridResponse {
  grille?: StudentGradeRow[];
  coefficient?: number;
  est_verrouille?: boolean;
  date_verrouillage?: string | null;
}

interface AuthResponse {
  token: string;
  message?: string;
  est_verrouille?: boolean;
}

export const GradeEntrySheet: React.FC<GradeEntrySheetProps> = ({ sessionData, token, userRole, onLogout }) => {
  const [classes, setClasses] = useState<Classe[]>([]);
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [trimestres, setTrimestres] = useState<TrimestreGroup[]>([]);

  const session = sessionData as (SessionInfo & { id_classe?: string; id_matiere?: string; id_sequence?: string }) | null;

  const [selectedClasse, setSelectedClasse] = useState<string>(session?.id_classe || '');
  const [selectedMatiere, setSelectedMatiere] = useState<string>(session?.id_matiere || '');
  const [selectedSequence, setSelectedSequence] = useState<string>(session?.id_sequence || '');

  const [students, setStudents] = useState<StudentGradeRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingGrid, setLoadingGrid] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [validating, setValidating] = useState<boolean>(false);
  const [unlocking, setUnlocking] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [coefficient, setCoefficient] = useState<number>(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [, setDateVerrouillage] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modal de déverrouillage Admin
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [adminId, setAdminId] = useState<string>('');
   const [adminPassword, setAdminPassword] = useState<string>('');

  // 0. Garantit que le token reçu en prop est celui utilisé par fetchApi
  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);
  
  // 1. Charger les classes et séquences au démarrage
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
        
        if (session?.id_sequence) {
          setSelectedSequence(session.id_sequence);
        } else if (sequencesRes?.[0]?.sequences?.[0]?.id_sequence) {
          setSelectedSequence(sequencesRes[0].sequences[0].id_sequence);
        }
      } catch (error: unknown) {
        const errMessage = error instanceof Error ? error.message : "Erreur lors du chargement des données initiales.";
        setNotification({ type: 'error', message: errMessage });
      } finally {
        setLoading(false);
      }
    }
    initMetadata();
  }, [token, session?.id_classe, session?.id_matiere, session?.id_sequence]);

  // 2. Charger les matières lorsque la classe change (sans setState synchrone direct dans le corps de l'effet)
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
        setNotification({ type: 'error', message: "Erreur lors du chargement des matières." });
      }
    }
    loadMatieres();
  }, [selectedClasse, token]);

  // 3. Charger la grille dès que Classe, Matière et Séquence sont sélectionnés
  useEffect(() => {
    async function loadGrille() {
      if (!selectedClasse || !selectedMatiere || !selectedSequence) return;
      try {
        setLoadingGrid(true);
        setNotification(null);
        
        const data = await fetchApi(
          `/notes/grille?id_classe=${selectedClasse}&id_matiere=${selectedMatiere}&id_sequence=${selectedSequence}`
        ) as GridResponse;
        
        setStudents(data.grille ?? []);
        setCoefficient(data.coefficient ?? 1);
        setHasUnsavedChanges(false);
        setIsLocked(data.est_verrouille ?? false);
        setDateVerrouillage(data.date_verrouillage || null);
      } catch (error: unknown) {
        setStudents([]);
        const errMessage = error instanceof Error ? error.message : "Erreur lors du chargement de la grille des notes.";
        setNotification({ type: 'error', message: errMessage });
      } finally {
        setLoadingGrid(false);
      }
    }
    loadGrille();
  }, [selectedClasse, selectedMatiere, selectedSequence, token]);

  // Modifier le coefficient et recalculer les notes pondérées affichées.
  const handleCoefficientChange = (value: number) => {
    if (isLocked) return;
    setCoefficient(value);
    setHasUnsavedChanges(true);
    setStudents(prev => prev.map(student => ({
      ...student,
      note_x_coefficient: student.valeur_note !== null && Number.isFinite(value)
        ? Number((student.valeur_note * value).toFixed(2))
        : null
    })));
  };

  const handleGradeChange = (id_eleve: string, value: string) => {
    if (isLocked) return;
    setHasUnsavedChanges(true);
    setStudents(prev =>
      prev.map(student => {
        if (student.id_eleve === id_eleve) {
          const val = value === '' ? null : parseFloat(value);
          const nxc = val !== null && !isNaN(val) ? Number((val * coefficient).toFixed(2)) : null;
          return { ...student, valeur_note: val, note_x_coefficient: nxc };
        }
        return student;
      })
    );
  };

  // Enregistrer en mode brouillon
  const handleSaveDraft = async () => {
    if (!selectedClasse || !selectedMatiere || !selectedSequence || isLocked) return;
    setSaving(true);
    setNotification(null);

    try {
      if (!Number.isFinite(coefficient) || coefficient < 0.01 || coefficient > 99.99 || Number(coefficient.toFixed(2)) !== coefficient) {
        setNotification({ type: 'error', message: 'Le coefficient doit être compris entre 0,01 et 99,99 (deux décimales maximum).' });
        return;
      }
      const notesPayload = students
        .filter(s => s.valeur_note !== null && !isNaN(s.valeur_note))
        .map(s => ({
          id_eleve: s.id_eleve,
          valeur_note: Number(s.valeur_note)
        }));
        if (notesPayload.length === 0) {
  setNotification({ type: 'error', message: 'Saisissez au moins une note avant d’enregistrer.' });
  setSaving(false);
  return;
}
if (notesPayload.some(n => n.valeur_note < 0 || n.valeur_note > 20)) {
  setNotification({ type: 'error', message: 'Toutes les notes doivent être comprises entre 0 et 20.' });
  setSaving(false);
  return;
}

      await fetchApi('/notes/sauvegarder', {
        method: 'POST',
        body: JSON.stringify({
          id_classe: selectedClasse,
          id_matiere: selectedMatiere,
          id_sequence: selectedSequence,
          coefficient,
          notes: notesPayload
        })
      });

      setHasUnsavedChanges(false);
      setNotification({ type: 'success', message: 'Brouillon et coefficient enregistrés avec succès !' });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : "Erreur lors de la sauvegarde.";
      setNotification({ type: 'error', message: errMessage });
    } finally {
      setSaving(false);
    }
  };

  // Valider et verrouiller définitivement la séquence
  const handleValidateSequence = async () => {
    if (!selectedClasse || !selectedMatiere || !selectedSequence) return;
    if (hasUnsavedChanges) {
      setNotification({ type: 'error', message: 'Enregistrez le brouillon et le coefficient avant de valider.' });
      return;
    }
    if (!window.confirm("Attention : La validation définitive verrouillera la saisie pour tous les élèves. Êtes-vous sûr ?")) return;

    setValidating(true);
    setNotification(null);

    try {
      const res = await fetchApi('/notes/valider', {
        method: 'POST',
        body: JSON.stringify({
          id_classe: selectedClasse,
          id_matiere: selectedMatiere,
          id_sequence: selectedSequence
        })
      }) as AuthResponse;

      setIsLocked(res.est_verrouille ?? true);
      setNotification({ type: 'success', message: res.message || 'Notes validées et verrouillées avec succès !' });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : "Erreur lors de la validation.";
      setNotification({ type: 'error', message: errMessage });
    } finally {
      setValidating(false);
    }
  };

  // Déverrouillage par l'administrateur
  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentMatiereObj = matieres.find(m => m.id_matiere === selectedMatiere);
    if (!currentMatiereObj?.id_affectation_cours) {
      setNotification({ type: 'error', message: "Affectation du cours introuvable." });
      return;
    }

    setUnlocking(true);
    setNotification(null);

    try {
      const loginRes = await fetchApi('/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ id_admin: adminId, mot_de_passe: adminPassword })
      }) as AuthResponse;

      const adminToken = loginRes.token;

      const unlockRes = await fetchApi('/notes/admin/deverrouiller', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          id_affectation_cours: currentMatiereObj.id_affectation_cours,
          id_sequence: selectedSequence
        })
      }) as AuthResponse;

      setIsLocked(unlockRes.est_verrouille ?? false);
      setShowAdminModal(false);
      setAdminPassword('');
      setNotification({ type: 'success', message: 'Saisie rouverte par l\'administration avec succès !' });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : "Échec du déverrouillage administrateur.";
      setNotification({ type: 'error', message: errMessage });
    } finally {
      setUnlocking(false);
    }
  };

  const filteredStudents = students.filter(s =>
    s.nom_complet.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const notesSaisiesCount = students.filter(s => s.valeur_note !== null && !isNaN(s.valeur_note)).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
        <span className="text-sm font-medium tracking-wide">Chargement de l'espace pédagogique...</span>
      </div>
    );
  }

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
            <span className={`text-xs px-3 py-1 rounded-full font-semibold border flex items-center gap-1.5 ${isLocked ? 'bg-rose-500/20 text-rose-200 border-rose-400/40' : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'}`}>
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              {isLocked ? 'Séquence Verrouillée' : 'Saisie Ouverte'}
            </span>
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
                onChange={(e) => setSelectedMatiere(e.target.value)}
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
              <label className="block text-[10px] font-bold text-amber-300 uppercase mb-1">Séquence</label>
              <select
                value={selectedSequence}
                onChange={(e) => setSelectedSequence(e.target.value)}
                className="w-full bg-white text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">-- Choisir une séquence --</option>
                {trimestres.map(t => (
                  <optgroup key={t.id_trimestre} label={t.libelle_trimestre}>
                    {t.sequences.map((s: SequenceItem) => (
                      <option key={s.id_sequence} value={s.id_sequence}>{s.libelle_sequence}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* Barre de recherche et actions */}
          {selectedClasse && selectedMatiere && selectedSequence && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher un élève..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white text-slate-800 placeholder-slate-400 border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 shadow"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {!isLocked ? (
                  <>
                    <button 
                      onClick={handleSaveDraft}
                      disabled={saving || students.length === 0}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Enregistrer Brouillon</span>
                    </button>

                    <button 
                      onClick={handleValidateSequence}
                      disabled={validating || saving || hasUnsavedChanges || students.length === 0}
                      className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer disabled:opacity-50"
                    >
                      {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      <span>Valider & Verrouiller</span>
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => setShowAdminModal(true)}
                    className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition shadow cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-amber-200" />
                    <span>Déverrouiller (Admin)</span>
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
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <Users className="w-3.5 h-3.5 text-blue-900" />
              <span>Effectif : <strong className="text-blue-900">{filteredStudents.length} élèves</strong></span>
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Notes saisies : <strong className="text-emerald-700">{notesSaisiesCount} / {students.length}</strong></span>
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
              disabled={isLocked || loadingGrid || saving || validating}
              onChange={(e) => handleCoefficientChange(e.target.valueAsNumber)}
              className="w-24 rounded-lg border border-amber-400 px-3 py-2 text-center font-bold text-blue-900 disabled:bg-slate-100"
            />
            {hasUnsavedChanges && <span className="text-amber-700">Non enregistré</span>}
          </div>
        </div>

        {/* Tableau des notes et élèves */}
        <div className="overflow-x-auto max-h-125 border-b border-slate-200">
          {!selectedClasse || !selectedMatiere || !selectedSequence ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Filter className="w-10 h-10 mx-auto opacity-40 text-blue-900" />
              <p className="text-xs font-semibold">Veuillez sélectionner une Classe, une Matière et une Séquence pour afficher la grille.</p>
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
                  <th className="p-3.5 border-b border-slate-300 w-44 text-center bg-blue-900 font-bold text-amber-300 tracking-wider">Note / 20</th>
                  <th className="p-3.5 border-b border-slate-300 w-44 text-center bg-indigo-950 font-bold text-emerald-300 tracking-wider">NxC (Note × Coef)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredStudents.map((student, index) => {
                  const noteValide = student.valeur_note !== null && !isNaN(student.valeur_note);
                  const nxcCalculé = noteValide && student.note_x_coefficient !== null ? Number(student.note_x_coefficient).toFixed(2) : '—';

                  return (
                    <tr key={student.id_eleve} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-amber-50/40 transition-colors`}>
                      <td className="p-3.5 text-center text-slate-500 font-mono font-bold">
                        {index + 1}
                      </td>
                      <td className="p-3.5 font-bold text-slate-800 uppercase tracking-wide">
                        {student.nom_complet}
                      </td>
                      <td className="p-2 text-center bg-amber-50/20">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="20"
                          disabled={isLocked}
                          value={student.valeur_note ?? ''}
                          onChange={(e) => handleGradeChange(student.id_eleve, e.target.value)}
                          className={`w-32 text-center font-bold rounded-xl py-2 shadow-sm text-sm transition ${isLocked ? 'bg-slate-100 text-slate-500 border border-slate-300 cursor-not-allowed' : 'bg-white text-slate-900 border border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500'}`}
                          placeholder="—"
                        />
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20 text-sm">
                        {nxcCalculé}
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
      {showAdminModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" />
                Accès Administrateur requis
              </h3>
              <button 
                onClick={() => setShowAdminModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <p className="text-xs text-slate-600">
              Veuillez saisir l'identifiant (UUID) et le mot de passe administrateur pour déverrouiller cette séquence.
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
                  onClick={() => setShowAdminModal(false)}
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