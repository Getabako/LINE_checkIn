import React from 'react';

interface LoadingProps {
  fullScreen?: boolean;
  text?: string;
}

export const Loading: React.FC<LoadingProps> = ({ fullScreen = false, text = '読み込み中...' }) => {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        {content}
      </div>
    );
  }

  return <div className="py-8">{content}</div>;
};
