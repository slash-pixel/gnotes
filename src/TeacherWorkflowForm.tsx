import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  BookOpen, 
  GraduationCap, 
  UserCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ArrowLeft, 
  AlertCircle,
  Loader2 
} from 'lucide-react';
import type { SessionInfo } from './App';
import { fetchApi } from './services/api';

type Step = 'form' | 'password';

interface TeacherWorkflowFormProps {
  onLoginSuccess: (info: SessionInfo & { id_classe?: string; id_matiere?: string; id_sequence?: string }, token: string) => void;
}

interface TrimestreSequence {
  id_sequence: string;
}

interface Trimestre {
  id_trimestre: string;
  numero_trimestre: number;
  sequences?: TrimestreSequence[];
}

interface Classe {
  id_classe: string;
  nom_classe: string;
}

interface Matiere {
  id_matiere: string;
  libelle_matiere: string;
}

interface Teacher {
  id_enseignant: string;
  nom_complet: string;
}

interface LoginResponse {
  token: string;
  message?: string;
}

export const TeacherWorkflowForm: React.FC<TeacherWorkflowFormProps> = ({ onLoginSuccess }) => {
  const [selectedTrimester, setSelectedTrimester] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');

  // États pour les listes dynamiques de la BDD
  const [trimesters, setTrimesters] = useState<Trimestre[]>([]);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [subjects, setSubjects] = useState<Matiere[]>([]);
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);

  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingTeachers, setLoadingTeachers] = useState<boolean>(false);
  const [step, setStep] = useState<Step>('form');
  const [password, setPassword] = useState<string>('saintcharles');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loadingLogin, setLoadingLogin] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState<boolean>(false);

  // Charger les classes et trimestres actifs au montage
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [trimData, classData] = await Promise.all([
          fetchApi('/trimestres') as Promise<Trimestre[]>,
          fetchApi('/classes') as Promise<Classe[]>
        ]);
        setTrimesters(trimData);
        setClasses(classData);
      } catch {
        setErrorMsg("Impossible de charger les données de l'année active.");
      } finally {
        setLoadingInitial(false);
      }
    }
    loadInitialData();
  }, []);

  // Charger les matières lorsque la classe change (sans setState synchrone direct dans le corps de l'effet)
  useEffect(() => {
    async function loadSubjects() {
      if (!selectedClass) {
        setSubjects([]);
        setSelectedSubject('');
        return;
      }
      try {
        const data = await fetchApi(`/classes/${selectedClass}/matieres`) as Matiere[];
        setSubjects(data);
      } catch (err) {
        console.error("Erreur chargement matières", err);
      }
    }
    loadSubjects();
  }, [selectedClass]);

  // Charger l'enseignant filtré lorsque classe et matière sont sélectionnées
  useEffect(() => {
    async function loadTeachers() {
      if (!selectedClass || !selectedSubject) {
        setAvailableTeachers([]);
        setSelectedTeacher('');
        return;
      }
      setLoadingTeachers(true);
      try {
        const data = await fetchApi(`/enseignants/filtres?id_classe=${selectedClass}&id_matiere=${selectedSubject}`) as Teacher[];
        setAvailableTeachers(data);
        if (data.length === 1) {
          setSelectedTeacher(data[0].id_enseignant);
        }
      } catch (err) {
        console.error("Erreur chargement enseignants", err);
      } finally {
        setLoadingTeachers(false);
      }
    }
    loadTeachers();
  }, [selectedClass, selectedSubject]);

  const isFormComplete = Boolean(selectedTrimester && selectedClass && selectedSubject && selectedTeacher);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormComplete) {
      setStep('password');
    }
  };

  const currentTeacherObj = availableTeachers.find((t) => t.id_enseignant === selectedTeacher);
  const currentClassName = classes.find((c) => c.id_classe === selectedClass)?.nom_classe || '';
  const currentSubjectName = subjects.find((s) => s.id_matiere === selectedSubject)?.libelle_matiere || '';
  
  const currentTrimesterObj = trimesters.find((t) => t.id_trimestre === selectedTrimester);
  const currentTrimesterName = currentTrimesterObj ? `Trimestre ${currentTrimesterObj.numero_trimestre}` : '';

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingLogin(true);
    setErrorMsg(null);

    try {
      const response = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          id_enseignant: selectedTeacher,
          mot_de_passe: password
        })
      }) as LoginResponse;

      if (!response.token) {
        throw new Error("Aucun token reçu du serveur.");
      }

      localStorage.setItem('token', response.token);
      localStorage.setItem('jwt_token', response.token);

      onLoginSuccess({
        id_classe: selectedClass,
        id_matiere: selectedSubject,
        id_sequence: currentTrimesterObj?.sequences?.[0]?.id_sequence || '',
        trimester: currentTrimesterName,
        className: currentClassName,
        subjectName: currentSubjectName,
        teacherName: currentTeacherObj?.nom_complet || '',
      }, response.token);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Mot de passe incorrect ou accès refusé.';
      setErrorMsg(errorMessage);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoadingLogin(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#0B1F4B] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A227]" />
        <span className="ml-3 font-medium text-sm">Chargement de l'année scolaire active...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F4B] text-[#0B1F4B] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-blue-900/10 overflow-hidden">
        
        {/* En-tête épuré sans indicateur d'étape */}
        <div className="bg-[#0B1F4B] text-white p-6 flex items-center justify-between border-b-4 border-[#C9A227]">
          <div>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-[#C9A227]">
              Collège Catholique Saint Charles Borromée
            </h1>
            <p className="text-xs text-blue-200 mt-1">Espace Enseignants · Saisie des Notes</p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {step === 'form' && (
              <motion.form 
                key="form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                onSubmit={handleFormSubmit}
                className="space-y-6"
              >
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#0B1F4B]">Identification de l'enseignant</h2>
                  <p className="text-sm text-gray-500 mt-1">Sélectionnez vos critères pour accéder à votre carnet de notes.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Trimestre */}
                  <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                      <Calendar className="w-4 h-4 text-[#C9A227]" />
                      <span>Trimestre</span>
                    </label>
                    <select
                      value={selectedTrimester}
                      onChange={(e) => setSelectedTrimester(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
                    >
                      <option value="" disabled>-- Choisir le trimestre --</option>
                      {trimesters.map((t) => <option key={t.id_trimestre} value={t.id_trimestre}>Trimestre {t.numero_trimestre}</option>)}
                    </select>
                  </div>

                  {/* Classe */}
                  <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                      <GraduationCap className="w-4 h-4 text-[#C9A227]" />
                      <span>Classe</span>
                    </label>
                    <select
                      value={selectedClass}
                      onChange={(e) => { setSelectedClass(e.target.value); setSelectedSubject(''); }}
                      required
                      className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
                    >
                      <option value="" disabled>-- Choisir la classe --</option>
                      {classes.map((c) => <option key={c.id_classe} value={c.id_classe}>{c.nom_classe}</option>)}
                    </select>
                  </div>
                </div>

                {/* Matière */}
                <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                  <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                    <BookOpen className="w-4 h-4 text-[#C9A227]" />
                    <span>Matière enseignée</span>
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    disabled={!selectedClass}
                    required
                    className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227] disabled:bg-gray-100"
                  >
                    <option value="" disabled>{!selectedClass ? "Sélectionnez d'abord une classe" : "-- Choisir la matière --"}</option>
                    {subjects.map((s) => <option key={s.id_matiere} value={s.id_matiere}>{s.libelle_matiere}</option>)}
                  </select>
                </div>

                {/* Enseignant */}
                <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                  <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                    <UserCheck className="w-4 h-4 text-[#C9A227]" />
                    <span>Votre nom (Enseignant affecté)</span>
                  </label>
                  <select
                    value={selectedTeacher}
                    onChange={(e) => setSelectedTeacher(e.target.value)}
                    disabled={!selectedSubject || loadingTeachers}
                    required
                    className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227] disabled:bg-gray-100"
                  >
                    <option value="" disabled>
                      {!selectedSubject ? "Sélectionnez d'abord une matière" : loadingTeachers ? "Recherche..." : "-- Choisir votre nom --"}
                    </option>
                    {availableTeachers.map((t) => <option key={t.id_enseignant} value={t.id_enseignant}>{t.nom_complet}</option>)}
                  </select>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={!isFormComplete}
                    className={`px-8 py-3 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-md ${
                      isFormComplete ? 'bg-[#C9A227] hover:bg-[#b08e20] text-[#0B1F4B] cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <span>Valider et continuer</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.form>
            )}

            {step === 'password' && (
              <motion.form
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                onSubmit={handleLoginSubmit}
                className={`space-y-6 max-w-md mx-auto ${shake ? 'animate-bounce' : ''}`}
              >
                <div>
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="text-xs font-medium text-[#0B1F4B] hover:underline flex items-center space-x-1 mb-4 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    <span>Modifier mes sélections</span>
                  </button>
                  <h2 className="font-serif text-2xl font-bold text-[#0B1F4B]">Connexion Sécurisée</h2>
                  <p className="text-sm text-gray-500 mt-1">Entrez votre mot de passe pour confirmer votre identité.</p>
                </div>

                <div className="bg-[#eef2f9] p-4 rounded-xl border border-[#d6e0f1] space-y-1 text-xs text-[#0B1F4B]">
                  <p><span className="font-bold">Trimestre :</span> {currentTrimesterName}</p>
                  <p><span className="font-bold">Classe :</span> {currentClassName}</p>
                  <p><span className="font-bold">Matière :</span> {currentSubjectName}</p>
                  <p><span className="font-bold">Enseignant :</span> {currentTeacherObj?.nom_complet}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#0B1F4B] flex items-center space-x-2">
                    <Lock className="w-4 h-4 text-[#C9A227]" />
                    <span>Mot de passe</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Entrez votre mot de passe"
                      autoFocus
                      required
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C9A227] text-sm pr-12 bg-white text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div className="flex items-center space-x-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium hover:bg-gray-50 cursor-pointer"
                  >
                    Retour
                  </button>

                  <button
                    type="submit"
                    disabled={loadingLogin || !password}
                    className={`px-7 py-3 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-md ${
                      password && !loadingLogin ? 'bg-[#C9A227] hover:bg-[#b08e20] text-[#0B1F4B] cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {loadingLogin && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                    <span>Se connecter</span>
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};