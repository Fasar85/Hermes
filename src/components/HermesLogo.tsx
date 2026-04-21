import React from 'react';
import { cn } from '../lib/utils';

interface HermesLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

export const HermesLogo = ({ className, size = 24, color = "currentColor" }: HermesLogoProps) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke={color} 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={cn("transition-all", className)}
    >
      {/* Caduceus Staff */}
      <line x1="12" y1="22" x2="12" y2="4" />
      
      {/* Wings */}
      <path d="M12 6c4-4 10-1 10-1s-1 6-10 6" />
      <path d="M12 6c-4-4-10-1-10-1s1 6 10 6" />
      
      {/* Snakes */}
      <path d="M9 18c0-2 6-4 6-6s-6-4-6-6" />
      <path d="M15 18c0-2-6-4-6-6s6-4 6-6" />
      
      {/* Tip */}
      <circle cx="12" cy="3" r="1" fill={color} />
    </svg>
  );
};
