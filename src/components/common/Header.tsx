import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiChevronLeft } from 'react-icons/fi';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  /* タイトルの代わりにロゴ画像を表示（トップページ用） */
  logo?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, showBack = false, onBack, logo = false }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  if (logo) {
    return (
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm animate-fade-in-down">
        <div className="flex items-center justify-center h-16 px-4">
          <img
            src="/images/logo.png"
            alt={title}
            className="h-12 w-auto"
          />
        </div>
      </header>
    );
  }

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
        <div className="flex-1 text-center pr-8">
          <h1 className="text-lg font-bold text-primary-800 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] font-semibold text-primary-500 leading-tight truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </header>
  );
};
