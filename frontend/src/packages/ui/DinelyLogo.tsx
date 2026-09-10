import React from 'react';

export interface DinelyLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  variant?: 'full' | 'icon' | 'compact';
  showWordmark?: boolean;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  onClick?: () => void;
}

/**
 * Canonical Dinely Brand Mark:
 * Geometric circular restaurant/food-service utensils symbol (monochrome, transparent).
 */
export const DinelyLogoMark: React.FC<{
  size?: number;
  className?: string;
  strokeWidth?: number;
}> = ({
  size = 28,
  className = '',
  strokeWidth = 1.75,
}) => {
  return (
    <svg
      className={`inline-block shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Dinely"
    >
      {/* Circular outer outline */}
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      {/* Fork utensil (left) */}
      <path
        d="M11 9v5.5a2.5 2.5 0 005 0V9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="13.5"
        y1="9"
        x2="13.5"
        y2="14.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1="13.5"
        y1="14.5"
        x2="13.5"
        y2="23"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Curved utensil (right) */}
      <path
        d="M21 9v6a2.5 2.5 0 01-5 0V9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="18.5"
        y1="15"
        x2="18.5"
        y2="23"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
};

/**
 * Canonical Dinely Brand Logo (Mark + Wordmark)
 * Wordmark is strictly lowercase "dinely".
 */
export const DinelyLogo: React.FC<DinelyLogoProps> = ({
  size = 'md',
  variant = 'full',
  showWordmark = true,
  className = '',
  markClassName = '',
  wordmarkClassName = '',
  onClick,
}) => {
  const sizeConfig = {
    xs: { mark: 16, text: 'text-[12px]', gap: 'gap-1.5' },
    sm: { mark: 22, text: 'text-[14px]', gap: 'gap-2' },
    md: { mark: 28, text: 'text-[16px]', gap: 'gap-2.5' },
    lg: { mark: 36, text: 'text-[20px]', gap: 'gap-3' },
    xl: { mark: 48, text: 'text-[26px]', gap: 'gap-3.5' },
  };

  const isNumeric = typeof size === 'number';
  const markSize = isNumeric
    ? size
    : sizeConfig[size]?.mark || 28;
  const textClass = isNumeric
    ? size > 32
      ? 'text-[20px]'
      : 'text-[15px]'
    : sizeConfig[size]?.text || 'text-[16px]';
  const gapClass = isNumeric
    ? size > 32
      ? 'gap-3'
      : 'gap-2'
    : sizeConfig[size]?.gap || 'gap-2.5';

  const shouldShowWordmark = variant !== 'icon' && showWordmark;

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center ${gapClass} select-none shrink-0 ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <DinelyLogoMark size={markSize} className={markClassName} />
      {shouldShowWordmark && (
        <span
          className={`font-sans font-semibold tracking-tight text-current lowercase leading-none ${textClass} ${wordmarkClassName}`}
        >
          dinely
        </span>
      )}
    </div>
  );
};

export const DinelyLogoCompact: React.FC<DinelyLogoProps> = (props) => (
  <DinelyLogo {...props} variant="compact" />
);

export const DinelyLogoMonochrome: React.FC<DinelyLogoProps> = (props) => (
  <DinelyLogo {...props} />
);

