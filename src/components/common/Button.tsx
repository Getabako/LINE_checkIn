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
  const baseStyles = 'font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2';

  const variantStyles = {
    primary: 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 disabled:bg-gray-300',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:bg-gray-100',
    line: 'bg-line-green text-white hover:bg-line-green-dark active:opacity-90 disabled:bg-gray-300',
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
