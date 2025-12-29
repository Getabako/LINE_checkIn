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
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="flex items-center h-14 px-4">
        {showBack && (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
          >
            <FiChevronLeft className="w-6 h-6" />
          </button>
        )}
        <h1 className="flex-1 text-lg font-semibold text-center pr-8">
          {title}
        </h1>
      </div>
    </header>
  );
};
