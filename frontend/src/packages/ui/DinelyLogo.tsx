import React from 'react';

interface DinelyLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  variant?: 'full' | 'icon';
  showWordmark?: boolean;
  className?: string;
}

export const DinelyLogoMark: React.FC<{ size?: number; className?: string }> = ({
  size = 32,
  className = '',
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-slate-950 border border-slate-800/80 shadow-md shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/assets/dinely-logo.png"
        alt="Dinely Icon"
        className="w-full h-full object-cover scale-125 rounded-2xl"
        style={{ objectPosition: 'center' }}
      />
    </div>
  );
};

export const DinelyLogo: React.FC<DinelyLogoProps> = ({
  size = 'md',
  variant = 'full',
  showWordmark = true,
  className = '',
}) => {
  const heightMap = {
    sm: 'h-6 sm:h-7',
    md: 'h-8 sm:h-9',
    lg: 'h-10 sm:h-12',
    xl: 'h-14 sm:h-16',
  };

  const heightClass = typeof size === 'number' ? '' : heightMap[size];
  const customStyle = typeof size === 'number' ? { height: `${size}px` } : {};

  if (variant === 'icon' || !showWordmark) {
    const markSize =
      typeof size === 'number'
        ? size
        : size === 'sm'
        ? 28
        : size === 'md'
        ? 36
        : size === 'lg'
        ? 44
        : 56;
    return <DinelyLogoMark size={markSize} className={className} />;
  }

  return (
    <div className={`inline-flex items-center select-none shrink-0 overflow-hidden rounded-2xl ${className}`}>
      <img
        src="/assets/dinely-logo.png"
        alt="Dinely Logo"
        className={`w-auto object-contain mix-blend-screen rounded-2xl ${heightClass}`}
        style={customStyle}
      />
    </div>
  );
};
