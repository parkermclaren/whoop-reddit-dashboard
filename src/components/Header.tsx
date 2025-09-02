"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  const [navDropdownOpen, setNavDropdownOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const pathname = usePathname();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const exampleQueries = [
    'battery',
    'HRV',
    'sleep accuracy',
    'shipping',
    'cancel',
    'refund',
    'rash',
    'charger',
    'recovery',
    'strain',
    'calibration',
    'firmware',
    'price',
    'whoop 5.0',
    'Oura',
    'Apple Watch',
    'Garmin',
    'Healthspan',
    'WHOOP Age'
  ];
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState<string>('Search e.g. whoop 5.0');
  
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
    { id: 'creator', label: 'Creator' },
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

  // Close desktop dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) setNavDropdownOpen(false);
    };
    if (navDropdownOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [navDropdownOpen]);

  // Typewriter rotating placeholder on dashboard only
  useEffect(() => {
    if (pathname === '/search') return;
    let i = 0;
    let char = 0;
    let deleting = false;
    let timer: NodeJS.Timeout | null = null;
    const step = () => {
      const full = exampleQueries[i];
      if (!deleting) {
        char = Math.min(char + 1, full.length);
        setAnimatedPlaceholder(full.slice(0, char));
        if (char === full.length) {
          deleting = true;
          timer = setTimeout(step, 1200);
          return;
        }
        timer = setTimeout(step, 60);
      } else {
        char = Math.max(char - 1, 0);
        setAnimatedPlaceholder(full.slice(0, char));
        if (char === 0) {
          deleting = false;
          i = (i + 1) % exampleQueries.length;
          timer = setTimeout(step, 200);
          return;
        }
        timer = setTimeout(step, 35);
      }
    };
    step();
    return () => { if (timer) clearTimeout(timer); };
  }, [pathname]);

  const submitHeaderSearch = () => {
    const q = searchValue.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}&page=1`);
  };

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
          <Link href="/" className="text-white uppercase tracking-wider font-semibold hover:text-[#44d7b6] transition-colors">
            WHOOP REDDIT PULSE
          </Link>
        </div>

        {/* Centered Search Bar - hidden on search page */}
        {pathname !== '/search' && (
          <div className="hidden md:flex justify-center flex-1">
            <div className="w-full max-w-xl flex items-center gap-2 relative">
              {/* NEW badge */}
              <div className="absolute -top-2 -right-2 z-10">
                <span className="bg-[#44d7b6] text-black text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-lg">
                  NEW!
                </span>
              </div>
              <div className="relative flex-1">
                {/* subtle glowing ring backdrop */}
                <div className="pointer-events-none absolute -inset-1 rounded-lg bg-[#44d7b6]/25 blur-lg opacity-80 animate-pulse" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitHeaderSearch()}
                  placeholder={animatedPlaceholder}
                  className="relative w-full bg-[#1E1F24] text-white placeholder-gray-400 rounded-md px-3 py-2 outline-none ring-2 ring-[#44d7b6]/50 focus:ring-[#44d7b6]/70 shadow-[0_0_18px_rgba(68,215,182,0.45)] hover:shadow-[0_0_26px_rgba(68,215,182,0.55)] transition-shadow"
                />
              </div>
              <button
                onClick={submitHeaderSearch}
                className="bg-[#3D3F46] hover:bg-[#4a4d55] text-white rounded-md px-4 py-2 transition-colors"
              >
                Search
              </button>
            </div>
          </div>
        )}

        {/* Desktop Dropdown Navigation */}
        <div className="hidden md:flex">
          {pathname === '/' ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setNavDropdownOpen(!navDropdownOpen)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#1E1F24] text-gray-200 border border-[#383a3e] hover:text-white hover:bg-[#26282d]"
                aria-haspopup="listbox"
                aria-expanded={navDropdownOpen}
              >
                Menu
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${navDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
                </svg>
              </button>
              {navDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-md bg-[#1f2125] border border-[#383a3e] shadow-lg z-50">
                  <ul className="py-1 max-h-96 overflow-auto">
                    {navItems.map(item => (
                      <li key={item.id}>
                        <button
                          onClick={() => { setNavDropdownOpen(false); scrollToSection(item.id); }}
                          className={`block w-full text-left px-3 py-2 text-sm ${activeSection === item.id ? 'text-[#44d7b6] bg-[#2a2d32]' : 'text-gray-200 hover:bg-[#2a2d32]'}`}
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <Link 
              href="/"
              className="text-sm whitespace-nowrap tracking-wide transition-colors text-gray-300 hover:text-white px-3 py-2 rounded-md hover:bg-[#1E1F24]"
            >
              Back to main dashboard
            </Link>
          )}
        </div>
      </div>
      
      {/* Mobile Navigation Menu */}
      {menuOpen && (
        <div className="md:hidden absolute left-0 right-0 bg-[#1f2125] border-b border-gray-700 z-40">
          <div className="container mx-auto py-3 px-4">
            {/* Mobile search - hidden on search page */}
            {pathname !== '/search' && (
              <div className="mb-3 flex items-center gap-2 relative">
                {/* NEW badge for mobile */}
                <div className="absolute -top-1 -right-1 z-10">
                  <span className="bg-[#44d7b6] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse shadow-lg">
                    NEW!
                  </span>
                </div>
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute -inset-1 rounded-lg bg-[#44d7b6]/25 blur-lg opacity-80 animate-pulse" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitHeaderSearch()}
                    placeholder={animatedPlaceholder}
                    className="relative w-full bg-[#1E1F24] text-white placeholder-gray-400 rounded-md px-3 py-2 outline-none ring-2 ring-[#44d7b6]/50 focus:ring-[#44d7b6]/70 shadow-[0_0_16px_rgba(68,215,182,0.45)] transition-shadow"
                  />
                </div>
                <button
                  onClick={submitHeaderSearch}
                  className="bg-[#3D3F46] hover:bg-[#4a4d55] text-white rounded-md px-3 py-2 transition-colors"
                >
                  Go
                </button>
              </div>
            )}
            {pathname === '/' ? (
              // Show section navigation on main dashboard
              navItems.map(item => (
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
              ))
            ) : (
              // Show "Back to main dashboard" link on other pages
              <Link 
                href="/"
                className="block w-full text-left py-3 px-4 transition-colors text-gray-300 hover:bg-[#2a2d32] hover:text-white"
              >
                Back to main dashboard
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
} 