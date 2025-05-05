import React from 'react';
import { Link } from 'wouter';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ className = '', size = 'md' }: LogoProps) {
  const sizes = {
    sm: 'w-24',
    md: 'w-32',
    lg: 'w-40',
  };

  return (
    <Link href="/" className={`${className} block`}>
      <div className="flex items-center gap-2">
        <svg 
          width="32" 
          height="32" 
          viewBox="0 0 32 32" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className={`${size === 'sm' ? 'w-6 h-6' : size === 'md' ? 'w-8 h-8' : 'w-10 h-10'}`}
        >
          <rect width="32" height="32" rx="8" fill="#3B82F6" />
          <path 
            d="M8 9.5C8 8.67157 8.67157 8 9.5 8H22.5C23.3284 8 24 8.67157 24 9.5V10.5C24 11.3284 23.3284 12 22.5 12H9.5C8.67157 12 8 11.3284 8 10.5V9.5Z" 
            fill="white" 
          />
          <path 
            d="M8 15.5C8 14.6716 8.67157 14 9.5 14H17.5C18.3284 14 19 14.6716 19 15.5V16.5C19 17.3284 18.3284 18 17.5 18H9.5C8.67157 18 8 17.3284 8 16.5V15.5Z" 
            fill="white" 
          />
          <path 
            d="M8 21.5C8 20.6716 8.67157 20 9.5 20H19.5C20.3284 20 21 20.6716 21 21.5V22.5C21 23.3284 20.3284 24 19.5 24H9.5C8.67157 24 8 23.3284 8 22.5V21.5Z" 
            fill="white" 
          />
        </svg>
        <span className={`font-bold ${size === 'sm' ? 'text-xl' : size === 'md' ? 'text-2xl' : 'text-3xl'} text-primary`}>
          Blogr
        </span>
      </div>
    </Link>
  );
}