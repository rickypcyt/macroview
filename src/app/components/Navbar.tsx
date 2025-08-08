"use client";

import { useEffect, useState } from 'react';

interface NavbarProps {
  viewMode?: 'summary' | '3d' | '2d' | 'comparison';
  onViewModeChange?: (mode: 'summary' | '3d' | '2d' | 'comparison') => void;
}

export function Navbar({ viewMode = 'summary', onViewModeChange }: NavbarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const handleViewModeChange = (mode: 'summary' | '3d' | '2d' | 'comparison') => {
    onViewModeChange?.(mode);
  };

  // Auto-hide after 3 seconds of inactivity
  useEffect(() => {
    if (isHovered || isActive) {
      const timer = setTimeout(() => {
        setIsHovered(false);
        setIsActive(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isHovered, isActive]);

  return (
    <nav 
      className={`fixed top-4 right-4 z-[1002] transition-all duration-500 ease-in-out ${
        isHovered || isActive 
          ? 'opacity-100 bg-black/90 backdrop-blur-md' 
          : 'opacity-30 bg-black/50 backdrop-blur-sm'
      } rounded-xl border border-white/20 shadow-lg`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setIsActive(true)}
    >
      <div className="py-3 px-2">
        <div className="flex flex-col items-center space-y-2">
          <CompactNavButton 
            label="📊" 
            isActive={viewMode === 'summary'}
            onClick={() => handleViewModeChange('summary')}
            title="Dashboard"
          />
          <CompactNavButton 
            label="📋" 
            isActive={viewMode === 'comparison'}
            onClick={() => handleViewModeChange('comparison')}
            title="Comparison Table"
          />
          <CompactNavButton 
            label="🌍" 
            isActive={viewMode === '3d'}
            onClick={() => handleViewModeChange('3d')}
            title="3D Globe"
          />
          <CompactNavButton 
            label="🗺️" 
            isActive={viewMode === '2d'}
            onClick={() => handleViewModeChange('2d')}
            title="2D Map"
          />
        </div>
      </div>
    </nav>
  );
}

interface CompactNavButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  title: string;
}

function CompactNavButton({ label, isActive, onClick, title }: CompactNavButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 flex items-center justify-center text-lg rounded-lg transition-all duration-200 ${
        isActive 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-gray-300 hover:text-white hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );
}
