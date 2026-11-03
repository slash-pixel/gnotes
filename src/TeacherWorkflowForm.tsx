
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
import { fetchApi, setAuthToken } from './services/api';

type Step = 'form' | 'password';

interface TeacherWorkflowFormProps {
  onLoginSuccess: (
    info: SessionInfo & {
      id_classe?: string;
      id_matiere?: string;
      id_sequence?: string;
    },
    token: string
  ) => void;
  onNavigateAdmin?: () => void;
}

interface TrimestreSequence {
  id_sequence: string;
}

interface Trimestre {
  id_trimestre: string;
  numero_trimestre: number;
  sequences?: TrimestreSequence[];
}

interface Niveau {
  id_niveau: string;
  libelle_niveau: string;
  nombre_matieres?: number;
}

interface Classe {
  id_classe: string;
  nom_classe: string;
  id_niveau?: string | null;
}

interface Matiere {
  id_matiere: string;
  libelle_matiere: string;
}

interface ProgrammeNiveauResponse {
  id_niveau: string;
  libelle_niveau: string;
  matieres: Matiere[];
}

interface Teacher {
  id_enseignant: string;
  nom_complet: string;
}

interface LoginResponse {
  token: string;
  message?: string;
}

export const TeacherWorkflowForm: React.FC<TeacherWorkflowFormProps> = ({
  onLoginSuccess,
  onNavigateAdmin
}) => {
  // Sélections
  const [selectedTrimester, setSelectedTrimester] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedClass, setSelectedClass] = useState('');

  // Données de la base
  const [trimesters, setTrimesters] = useState<Trimestre[]>([]);
  const [levels, setLevels] = useState<Niveau[]>([]);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  // Matières autorisées pour l'enseignant
  const [teacherSubjects, setTeacherSubjects] = useState<Matiere[]>([]);

  // Matières du programme du niveau sélectionné
  const [programmeSubjects, setProgrammeSubjects] = useState<Matiere[]>([]);

  // Chargements
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingProgramme, setLoadingProgramme] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);

  // Connexion
  const [step, setStep] = useState<Step>('form');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Chargement initial des données
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const [
          trimData,
          classData,
          teacherData,
          levelData
        ] = await Promise.all([
          fetchApi('/trimestres') as Promise<Trimestre[]>,
          fetchApi('/classes') as Promise<Classe[]>,
          fetchApi('/enseignants') as Promise<Teacher[]>,
          fetchApi('/niveaux') as Promise<Niveau[]>
        ]);

        if (!cancelled) {
          setTrimesters(trimData);
          setClasses(classData);
          setTeachers(teacherData);
          setLevels(levelData);
        }
      } catch (err) {
        console.error('Erreur chargement initial', err);

        if (!cancelled) {
          setErrorMsg(
            "Impossible de charger les données de l'année active."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingInitial(false);
        }
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Chargement des matières autorisées pour l'enseignant
  useEffect(() => {
    let cancelled = false;

    async function loadTeacherSubjects() {
      setTeacherSubjects([]);
      setSelectedSubject('');
      setSelectedClass('');

      if (!selectedTeacher) {
        setLoadingSubjects(false);
        return;
      }

      setErrorMsg(null);
      setLoadingSubjects(true);

      try {
        const data = await fetchApi(
          `/enseignants/${selectedTeacher}/matieres`
        ) as Matiere[];

        if (!cancelled) {
          setTeacherSubjects(data);
        }
      } catch (err) {
        console.error('Erreur chargement matières enseignant', err);

        if (!cancelled) {
          setErrorMsg(
            "Impossible de charger les matières autorisées pour cet enseignant."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSubjects(false);
        }
      }
    }

    loadTeacherSubjects();

    return () => {
      cancelled = true;
    };
  }, [selectedTeacher]);

  // Chargement du programme du niveau sélectionné
  useEffect(() => {
    let cancelled = false;

    async function loadProgramme() {
      setProgrammeSubjects([]);
      setSelectedSubject('');
      setSelectedClass('');

      if (!selectedLevel) {
        setLoadingProgramme(false);
        return;
      }

      setLoadingProgramme(true);
      setErrorMsg(null);

      try {
        const data = await fetchApi(
          `/niveaux/${selectedLevel}/programme`
        ) as ProgrammeNiveauResponse;

        if (!cancelled) {
          setProgrammeSubjects(data.matieres || []);
        }
      } catch (err) {
        console.error('Erreur chargement programme du niveau', err);

        if (!cancelled) {
          setErrorMsg(
            'Impossible de charger le programme de ce niveau.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingProgramme(false);
        }
      }
    }

    loadProgramme();

    return () => {
      cancelled = true;
    };
  }, [selectedLevel]);

  // Matières communes entre le programme du niveau
  // et les matières autorisées pour l'enseignant
  const availableSubjects = teacherSubjects.filter((teacherSubject) =>
    programmeSubjects.some(
      (programmeSubject) =>
        programmeSubject.id_matiere === teacherSubject.id_matiere
    )
  );

  // Récupération du niveau sélectionné
  const currentLevel = levels.find(
    (level) => level.id_niveau === selectedLevel
  );

  // Filtrage des classes selon le niveau sélectionné
  const filteredClasses = classes.filter((classe) => {
    if (!currentLevel) return false;

    // Méthode prioritaire : comparaison avec l'identifiant du niveau
    if (classe.id_niveau) {
      return classe.id_niveau === currentLevel.id_niveau;
    }

    // Solution de secours si /classes ne renvoie pas id_niveau
    // Exemple : 1ère A4 ESP, 2nde C, 6ème M1
    if (currentLevel.libelle_niveau === 'Terminale') {
      return classe.nom_classe.startsWith('Tle ');
    }

    return (
      classe.nom_classe === currentLevel.libelle_niveau ||
      classe.nom_classe.startsWith(
        `${currentLevel.libelle_niveau} `
      )
    );
  });

  const isFormComplete = Boolean(
    selectedTrimester &&
    selectedTeacher &&
    selectedLevel &&
    selectedSubject &&
    selectedClass
  );

  // Vérification du formulaire
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isFormComplete) {
      setStep('password');
      setErrorMsg(null);
    }
  };

  // Informations sélectionnées
  const currentTeacherObj = teachers.find(
    (t) => t.id_enseignant === selectedTeacher
  );

  const currentClassName =
    classes.find((c) => c.id_classe === selectedClass)?.nom_classe || '';

  const currentSubjectName =
    availableSubjects.find(
      (s) => s.id_matiere === selectedSubject
    )?.libelle_matiere || '';

  const currentTrimesterObj = trimesters.find(
    (t) => t.id_trimestre === selectedTrimester
  );

  const currentTrimesterName = currentTrimesterObj
    ? `Trimestre ${currentTrimesterObj.numero_trimestre}`
    : '';

  // Connexion de l'enseignant
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
        throw new Error('Aucun token reçu du serveur.');
      }

      setAuthToken(response.token);

      onLoginSuccess(
        {
          id_classe: selectedClass,
          id_matiere: selectedSubject,
          id_sequence:
            currentTrimesterObj?.sequences?.[0]?.id_sequence || '',
          trimester: currentTrimesterName,
          className: currentClassName,
          subjectName: currentSubjectName,
          teacherName: currentTeacherObj?.nom_complet || ''
        },
        response.token
      );

    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Mot de passe incorrect ou accès refusé.';

      setErrorMsg(errorMessage);
      setShake(true);
      setTimeout(() => setShake(false), 500);

    } finally {
      setLoadingLogin(false);
    }
  };

  // Écran de chargement initial
  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#0B1F4B] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A227]" />
        <span className="ml-3 font-medium text-sm">
          Chargement des données scolaires...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1F4B] text-[#0B1F4B] flex flex-col items-center justify-center p-4 sm:p-6 font-sans">

      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-blue-900/10 overflow-hidden">

        {/* En-tête */}
        <div className="bg-[#0B1F4B] text-white p-6 flex items-center justify-between border-b-4 border-[#C9A227]">
          <div>
            <h1 className="font-serif text-lg sm:text-xl font-bold text-[#C9A227]">
              Collège Catholique Saint Charles Borromée
            </h1>
            <p className="text-xs text-blue-200 mt-1">
              Espace Enseignants · Saisie des Notes
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <AnimatePresence mode="wait">

            {/* ÉTAPE 1 : FORMULAIRE */}
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
                  <h2 className="font-serif text-2xl font-bold text-[#0B1F4B]">
                    Identification de l'enseignant
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Choisissez votre identité, votre niveau, une matière et votre classe.
                  </p>
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
                      <option value="" disabled>
                        -- Choisir le trimestre --
                      </option>

                      {trimesters.map((t) => (
                        <option
                          key={t.id_trimestre}
                          value={t.id_trimestre}
                        >
                          Trimestre {t.numero_trimestre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Enseignant */}
                  <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                    <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                      <UserCheck className="w-4 h-4 text-[#C9A227]" />
                      <span>Votre nom (Enseignant)</span>
                    </label>

                    <select
                      value={selectedTeacher}
                      onChange={(e) => {
                        setSelectedTeacher(e.target.value);
                        setSelectedSubject('');
                        setSelectedClass('');
                        setErrorMsg(null);
                      }}
                      required
                      className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
                    >
                      <option value="" disabled>
                        -- Choisir votre nom --
                      </option>

                      {teachers.map((t) => (
                        <option
                          key={t.id_enseignant}
                          value={t.id_enseignant}
                        >
                          {t.nom_complet}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Niveau */}
                <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                  <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                    <GraduationCap className="w-4 h-4 text-[#C9A227]" />
                    <span>Niveau scolaire</span>
                  </label>

                  <select
                    value={selectedLevel}
                    onChange={(e) => {
                      setSelectedLevel(e.target.value);
                      setSelectedSubject('');
                      setSelectedClass('');
                      setErrorMsg(null);
                    }}
                    required
                    className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
                  >
                    <option value="" disabled>
                      -- Choisir le niveau --
                    </option>

                    {levels.map((level) => (
                      <option
                        key={level.id_niveau}
                        value={level.id_niveau}
                      >
                        {level.libelle_niveau}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Matière */}
                <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                  <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                    <BookOpen className="w-4 h-4 text-[#C9A227]" />
                    <span>Matière enseignée</span>
                  </label>

                  <select
                    value={selectedSubject}
                    onChange={(e) => {
                      setSelectedSubject(e.target.value);
                      setSelectedClass('');
                    }}
                    disabled={
                      !selectedTeacher ||
                      !selectedLevel ||
                      loadingSubjects ||
                      loadingProgramme ||
                      availableSubjects.length === 0
                    }
                    required
                    className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227] disabled:bg-gray-100"
                  >
                    <option value="" disabled>
                      {!selectedTeacher
                        ? 'Sélectionnez d’abord votre nom'
                        : !selectedLevel
                          ? 'Sélectionnez d’abord un niveau'
                          : loadingSubjects || loadingProgramme
                            ? 'Chargement des matières...'
                            : availableSubjects.length === 0
                              ? 'Aucune matière commune pour ce niveau'
                              : '-- Choisir la matière --'}
                    </option>

                    {availableSubjects.map((s) => (
                      <option
                        key={s.id_matiere}
                        value={s.id_matiere}
                      >
                        {s.libelle_matiere}
                      </option>
                    ))}
                  </select>

                  {selectedTeacher && selectedLevel &&
                    !loadingSubjects && !loadingProgramme &&
                    availableSubjects.length === 0 && (
                      <p className="text-xs text-orange-700 mt-2">
                        Cet enseignant ne possède aucune matière autorisée dans le programme de ce niveau.
                      </p>
                    )}
                </div>

                {/* Classe */}
                <div className="bg-[#eef2f9]/50 p-4 rounded-xl border border-[#d6e0f1] space-y-2">
                  <label className="flex items-center space-x-2 text-sm font-bold text-[#0B1F4B]">
                    <GraduationCap className="w-4 h-4 text-[#C9A227]" />
                    <span>Classe</span>
                  </label>

                  <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    disabled={!selectedSubject || filteredClasses.length === 0}
                    required
                    className="w-full px-3 py-2.5 bg-white rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A227] disabled:bg-gray-100"
                  >
                    <option value="" disabled>
                      {!selectedLevel
                        ? 'Sélectionnez d’abord un niveau'
                        : !selectedSubject
                          ? 'Sélectionnez d’abord une matière'
                          : filteredClasses.length === 0
                            ? 'Aucune classe disponible pour ce niveau'
                            : '-- Choisir la classe --'}
                    </option>

                    {filteredClasses.map((c) => (
                      <option
                        key={c.id_classe}
                        value={c.id_classe}
                      >
                        {c.nom_classe}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Erreurs */}
                {errorMsg && (
                  <div
                    className="flex items-center space-x-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 flex items-center justify-between">

                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateAdmin) onNavigateAdmin();
                    }}
                    className="text-xs font-semibold text-[#0B1F4B] hover:text-[#C9A227] transition-colors cursor-pointer underline"
                  >
                    Espace administration
                  </button>

                  <button
                    type="submit"
                    disabled={!isFormComplete}
                    className={`px-8 py-3 rounded-xl font-bold flex items-center space-x-2 transition-all shadow-md ${
                      isFormComplete
                        ? 'bg-[#C9A227] hover:bg-[#b08e20] text-[#0B1F4B] cursor-pointer'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <span>Valider et continuer</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </motion.form>
            )}

            {/* ÉTAPE 2 : MOT DE PASSE */}
            {step === 'password' && (
              <motion.form
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                onSubmit={handleLoginSubmit}
                className={`space-y-6 max-w-md mx-auto ${
                  shake ? 'animate-bounce' : ''
                }`}
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

                  <h2 className="font-serif text-2xl font-bold text-[#0B1F4B]">
                    Connexion Sécurisée
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Entrez votre mot de passe pour confirmer votre identité.
                  </p>
                </div>

                {/* Récapitulatif */}
                <div className="bg-[#eef2f9] p-4 rounded-xl border border-[#d6e0f1] space-y-1 text-xs text-[#0B1F4B]">
                  <p>
                    <span className="font-bold">Trimestre :</span>{' '}
                    {currentTrimesterName}
                  </p>
                  <p>
                    <span className="font-bold">Niveau :</span>{' '}
                    {currentLevel?.libelle_niveau}
                  </p>
                  <p>
                    <span className="font-bold">Classe :</span>{' '}
                    {currentClassName}
                  </p>
                  <p>
                    <span className="font-bold">Matière :</span>{' '}
                    {currentSubjectName}
                  </p>
                  <p>
                    <span className="font-bold">Enseignant :</span>{' '}
                    {currentTeacherObj?.nom_complet}
                  </p>
                </div>

                {/* Mot de passe */}
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
                      {showPassword
                        ? <EyeOff className="w-5 h-5" />
                        : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div
                    className="flex items-center space-x-2 text-sm text-red-700 bg-red-50 p-3 rounded-xl border border-red-200"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Boutons */}
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
                      password && !loadingLogin
                        ? 'bg-[#C9A227] hover:bg-[#b08e20] text-[#0B1F4B] cursor-pointer'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {loadingLogin && (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    )}
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