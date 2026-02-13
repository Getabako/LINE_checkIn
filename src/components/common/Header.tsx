import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, showBack = false, onBack }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-primary-100/50 animate-fade-in-down">
      <div className="flex items-center h-14 px-4">
        {showBack && (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded-full transition-all duration-300"
          >
            <FiChevronLeft className="w-6 h-6" />
          </button>
        )}
        <h1 className="flex-1 text-lg font-bold text-primary-800 text-center pr-8">
          {title}
        </h1>
      </div>
    </header>
  );
};
