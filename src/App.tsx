import React, { useCallback, useState } from 'react';
import { TeacherWorkflowForm } from './TeacherWorkflowForm';
import { GradeEntrySheet } from './GradeEntrySheet';
import { AdminLogin } from './AdminLogin';
import { AdminDashboard } from './AdminDashboard';
import { clearAuthToken } from './services/api';

export interface SessionInfo {
  subjectName?: string;
  className?: string;
  teacherName?: string;
  id_classe?: string;
  id_matiere?: string;
  id_sequence?: string;
  trimester?: string;
}

export const App: React.FC = () => {
  const [sessionData, setSessionData] = useState<SessionInfo | null>(null);
  const [token, setToken] = useState<string>('');
  const [userRole] = useState<'enseignant' | 'admin'>('enseignant');

  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);

  const handleLoginSuccess = (info: SessionInfo, authToken: string) => {
    setSessionData(info);
    setToken(authToken);
  };

  const handleLogout = useCallback(() => {
    clearAuthToken();
    setSessionData(null);
    setToken('');
  }, []);

  // Stable : utilisé comme dépendance d'effet dans AdminDashboard
  const handleAdminLogout = useCallback(() => {
    clearAuthToken();
    setIsAdmin(false);
    setShowAdminLogin(false);
  }, []);

  // 1. Espace administration connecté
  if (isAdmin) {
    return <AdminDashboard onLogout={handleAdminLogout} />;
  }

  // 2. Enseignant connecté : saisie des notes
  if (sessionData && token) {
    return (
      <GradeEntrySheet
        sessionData={sessionData}
        token={token}
        userRole={userRole}
        onLogout={handleLogout}
      />
    );
  }

  // 3. Connexion administrateur
  if (showAdminLogin) {
    return (
      <AdminLogin
        onSuccess={() => setIsAdmin(true)}
        onBack={() => setShowAdminLogin(false)}
      />
    );
  }

  // 4. Connexion enseignant (par défaut) avec passage de la prop onNavigateAdmin
  return (
    <TeacherWorkflowForm 
      onLoginSuccess={handleLoginSuccess} 
      onNavigateAdmin={() => setShowAdminLogin(true)}
    />
  );
};

export default App;