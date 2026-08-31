import React from 'react';
import { NotFoundPage } from './NotFoundPage';

interface UnauthorizedPageProps {
  requiredRole?: string;
  userRole?: string;
  userEmail?: string;
  targetPath?: string;
  onNavigate?: (path: string) => void;
}

export const UnauthorizedPage: React.FC<UnauthorizedPageProps> = ({ onNavigate }) => {
  return <NotFoundPage onNavigate={onNavigate} />;
};
