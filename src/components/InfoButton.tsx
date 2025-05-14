import React, { useState } from 'react';

interface InfoButtonProps {
  title: string;
  children: React.ReactNode;
}

export default function InfoButton({ title, children }: InfoButtonProps) {
  const [isVisible, setIsVisible] = useState(false);
  
  return (
    <div className="relative">
      <button
        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white bg-[#2a2c32] rounded-full text-xs border border-gray-600"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        aria-label={`Information about ${title}`}
      >
        i
      </button>
      
      {isVisible && (
        <div className="absolute top-0 right-6 w-64 p-3 bg-gray-800 rounded-md shadow-lg border border-gray-700 text-xs z-30">
          <h4 className="text-white font-medium mb-1 text-sm">{title}</h4>
          {children}
        </div>
      )}
    </div>
  );
} 