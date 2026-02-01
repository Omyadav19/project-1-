import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, User, Menu } from 'lucide-react';
import specialties from '../utils/specialties.js';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useApp();

  // Pages where header should be transparent/blended
  const isTransparent = ['/therapy-session', '/emotion-detection'].includes(location.pathname);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [openMenu, setOpenMenu] = useState(false);

  const handleOpenSpecialty = (spec) => {
    setOpenMenu(false);
    navigate('/therapy-session', { state: { specialtyId: spec.id, specialtyName: spec.name, specialtyPrompt: spec.prompt } });
  };

  return (
    <header className={`w-full z-40 transition-all duration-300 ${isTransparent
      ? 'sticky top-0 bg-purple-900 backdrop-blur-sm shadow-md'
      : 'sticky top-0 bg-purple-900 backdrop-blur-sm shadow-md'
      }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center shadow">
              <div className="w-5 h-5 text-white">❤️</div>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-white">Puresoul</div>
              <div className="text-xs text-white">Therapeutic support</div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {user && (
              <>
                <div className="hidden md:flex items-center px-3 py-1 rounded-full bg-gray-200 text-black text-sm font-medium">
                  <User className="w-4 h-4 mr-2" />
                  <span className="truncate max-w-xs">{user.name}</span>
                </div>

                <div className="relative">
                  <motion.button onClick={() => setOpenMenu(!openMenu)} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="p-2 rounded-md bg-white/5 hover:bg-gray-200 transition">
                    <Menu className="w-5 h-5 text-white hover:text-black" />
                  </motion.button>
                  {openMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                      <div className="p-3">
                        <div className="text-xs text-gray-400 mb-2">Start a session</div>
                        {specialties.map(spec => (
                          <button key={spec.id} onClick={() => handleOpenSpecialty(spec)} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-sm">
                            <div className="font-medium text-gray-800">{spec.name}</div>
                            <div className="text-xs text-gray-400">{spec.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <motion.button
                  onClick={handleLogout}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="p-2 rounded-md bg-white shadow-sm hover:shadow transition"
                  aria-label="Log out"
                >
                  <LogOut className="w-5 h-5 text-gray-700" />
                </motion.button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;