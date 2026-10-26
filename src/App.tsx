import React, { useState } from 'react';
import { TeacherWorkflowForm } from './TeacherWorkflowForm';
import { GradeEntrySheet } from './GradeEntrySheet';

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
  const [userRole, setUserRole] = useState<'enseignant' | 'admin'>('enseignant');

  const handleLoginSuccess = (info: SessionInfo, authToken: string) => {
    setSessionData(info);
    setToken(authToken);
    setUserRole('enseignant'); // ou selon votre logique
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('jwt_token');
    setSessionData(null);
    setToken('');
  };

  if (!sessionData || !token) {
    return <TeacherWorkflowForm onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <GradeEntrySheet 
      sessionData={sessionData} 
      token={token} 
      userRole={userRole} 
      onLogout={handleLogout} 
    />
  );
};

export default App;