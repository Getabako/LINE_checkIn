import React from 'react';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'line';
  fullWidth?: boolean;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  fullWidth = false,
  loading = false,
  disabled,
  className,
  ...props
}) => {
  const baseStyles = 'font-semibold py-3.5 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0';

  const variantStyles = {
    primary: 'bg-gradient-to-r from-primary-500 to-primary-400 text-white shadow-button hover:shadow-button-hover hover:from-primary-600 hover:to-primary-500 active:from-primary-700 active:to-primary-600 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none disabled:hover:translate-y-0',
    secondary: 'bg-white text-gray-700 border-2 border-gray-200 shadow-sm hover:shadow-card hover:bg-sky-50 hover:border-primary-200 active:bg-sky-100 disabled:bg-gray-100 disabled:hover:translate-y-0',
    line: 'bg-line-green text-white shadow-md hover:shadow-lg hover:bg-line-green-dark active:opacity-90 disabled:bg-gray-300 disabled:shadow-none disabled:hover:translate-y-0',
  };

  return (
    <button
      className={clsx(
        baseStyles,
        variantStyles[variant],
        fullWidth && 'w-full',
        'disabled:cursor-not-allowed',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
};
