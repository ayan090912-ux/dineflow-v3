import React from 'react';

interface DinelyLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

export const DinelyLogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`shrink-0 ${className}`}
  >
    {/* Primary Red Outer D Container */}
    <rect width="120" height="120" rx="32" fill="#ff3838" />

    {/* Primary Red D Outer Structure */}
    <path
      d="M 28 22 H 62 C 84 22 98 36 98 60 C 98 84 84 98 62 98 H 28 V 22 Z"
      fill="#ff2a2a"
    />

    {/* Inner Dark Navy Double-D Cutout */}
    <path
      d="M 44 38 H 60 C 72 38 80 46 80 60 C 80 74 72 82 60 82 H 44 V 38 Z"
      fill="#0f172a"
    />

    {/* Inner Red Core D Accent */}
    <path
      d="M 54 48 H 60 C 66 48 70 52 70 60 C 70 68 66 72 60 72 H 54 V 48 Z"
      fill="#ff3838"
    />
  </svg>
);

export const DinelyLogo: React.FC<DinelyLogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
  wordmarkClassName = '',
}) => {
  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'sm'
      ? 28
      : size === 'md'
      ? 36
      : size === 'lg'
      ? 44
      : 56;

  const textSize =
    size === 'sm'
      ? 'text-base'
      : size === 'md'
      ? 'text-xl'
      : size === 'lg'
      ? 'text-2xl'
      : 'text-4xl';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <DinelyLogoMark size={pixelSize} />
      {showWordmark && (
        <span className={`font-black tracking-tight text-white font-sans ${textSize} ${wordmarkClassName}`}>
          Dinely
        </span>
      )}
    </div>
  );
};
