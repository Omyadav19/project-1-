import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, User, Menu } from 'lucide-react';
import specialties from '../utils/specialties.js';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

const Header = () => {
  const navigate = useNavigate();
  const { user, logout } = useApp();

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
    <header className="w-full py-4 px-6 flex items-center justify-end">
      {user && (
        <div className="flex items-center space-x-3">
          <div className="relative">
            <motion.button onClick={() => setOpenMenu(!openMenu)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-3 rounded-full bg-white/10 shadow-sm hover:bg-white/20 transition-all">
              <Menu className="w-5 h-5 text-white" />
            </motion.button>
            {openMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                <div className="p-3">
                  <div className="text-xs text-gray-400 mb-2">Choose a specialty</div>
                  {specialties.map(spec => (
                    <button key={spec.id} onClick={() => handleOpenSpecialty(spec)} className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 text-sm">
                      {spec.name}
                      <div className="text-xs text-gray-400">{spec.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center px-3 py-1 rounded-full bg-white/10 text-white text-sm font-medium">
            <User className="w-4 h-4 mr-2" />
            <span className="truncate max-w-xs">{user.name}</span>
          </div>

          <motion.button
            onClick={handleLogout}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-3 rounded-full bg-white shadow-lg hover:shadow-xl transition-all"
            aria-label="Log out"
          >
            <LogOut className="w-5 h-5 text-gray-700" />
          </motion.button>
        </div>
      )}
    </header>
  );
};

export default Header;
