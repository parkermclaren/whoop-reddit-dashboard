"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  
  // Function to scroll to section with smooth behavior and offset for header height
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // Close mobile menu first
      setMenuOpen(false);
      
      // Get header height to use as offset
      const headerHeight = document.querySelector('header')?.offsetHeight || 0;
      
      // Get the element's position
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      
      // Calculate position with offset
      const offsetPosition = elementPosition - headerHeight - 20; // Extra 20px padding
      
      // Scroll to the element with offset
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      
      // Update URL hash without scrolling (prevents double scroll)
      setTimeout(() => {
        history.pushState(null, '', `#${id}`);
        setActiveSection(id);
      }, 10);
    }
  };

  // All navigation items
  const navItems = [
    { id: 'feature-analysis', label: 'Feature Analysis' },
    { id: 'theme-distribution', label: 'Theme Distribution' },
    { id: 'top-posts', label: 'Top Posts' },
    { id: 'feature-feedback', label: 'Feature Feedback' },
    { id: 'product-satisfaction', label: 'Product Satisfaction' },
    { id: 'competitor-mentions', label: 'Competitor Mentions' },
    { id: 'cancellation-insights', label: 'Cancellation Insights' },
    { id: 'faqs', label: 'FAQs' },
  ];
  
  // Effect to determine active section while scrolling
  useEffect(() => {
    const handleScroll = () => {
      // Get the header height for offset calculations
      const headerHeight = document.querySelector('header')?.offsetHeight || 0;
      
      // Add some extra buffer to ensure proper activation
      const buffer = headerHeight + 50;
      
      // Find all section elements
      const sections = navItems.map(item => document.getElementById(item.id)).filter(Boolean) as HTMLElement[];
      
      // Find the current active section based on scroll position
      let current = '';
      
      sections.forEach((section) => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        
        if (window.scrollY >= sectionTop - buffer && 
            window.scrollY < sectionTop + sectionHeight - buffer) {
          current = section.getAttribute('id') || '';
        }
      });
      
      // Special case for the top of the page
      if (window.scrollY < 100) {
        current = navItems[0].id;
      }
      
      setActiveSection(current);
    };
    
    // Add scroll listener
    window.addEventListener('scroll', handleScroll);
    
    // Initial call to set active section
    handleScroll();
    
    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header className="bg-[#24262b] border-b border-[#383a3e] p-4 sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <button 
            className="text-white md:hidden" 
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <h1 className="text-white uppercase tracking-wider font-semibold">WHOOP COMMUNITY PULSE</h1>
        </div>
        
        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center space-x-5 overflow-x-auto">
          {navItems.map(item => (
            <button 
              key={item.id}
              onClick={() => scrollToSection(item.id)} 
              className={`
                text-sm whitespace-nowrap tracking-wide transition-colors
                ${activeSection === item.id 
                  ? 'text-[#44d7b6] font-medium' 
                  : 'text-gray-300 hover:text-white'}
              `}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Mobile Navigation Menu */}
      {menuOpen && (
        <div className="md:hidden absolute left-0 right-0 bg-[#1f2125] border-b border-gray-700 z-40">
          <div className="container mx-auto py-3 px-4">
            {navItems.map(item => (
              <button 
                key={item.id}
                onClick={() => scrollToSection(item.id)} 
                className={`
                  block w-full text-left py-3 px-4 transition-colors
                  ${activeSection === item.id 
                    ? 'bg-[#2a2d32] text-[#44d7b6] font-medium' 
                    : 'text-gray-300 hover:bg-[#2a2d32] hover:text-white'}
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
} 