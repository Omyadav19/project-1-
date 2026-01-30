import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, Heart, Brain, Wind, Target, CloudRain,
  ArrowLeft, Star, Check, Sparkles, User, MessageCircle, Award
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import specialtiesPrompts from '../utils/specialties.js';

const TherapistSelectionPage = () => {
  const navigate = useNavigate();
  const { user, currentEmotion } = useApp();
  const [therapists, setTherapists] = useState([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const specialties = [
    { id: 'all', name: 'All Therapists', icon: Star, color: 'from-pink-500 to-rose-500', description: 'View all available therapists' },
    { id: 'career', name: 'Career Counseling', icon: Briefcase, color: 'from-blue-500 to-cyan-500', description: 'Professional growth and workplace challenges' },
    { id: 'relationship', name: 'Relationships', icon: Heart, color: 'from-red-500 to-pink-500', description: 'Communication and emotional intimacy' },
    { id: 'mental_health', name: 'Mental Health', icon: Brain, color: 'from-purple-500 to-violet-500', description: 'Anxiety, depression, and trauma support' },
    { id: 'stress', name: 'Stress Management', icon: Wind, color: 'from-teal-500 to-cyan-500', description: 'Coping strategies and burnout prevention' },
    { id: 'life_coaching', name: 'Life Coaching', icon: Target, color: 'from-orange-500 to-amber-500', description: 'Personal development and goal achievement' },
    { id: 'grief', name: 'Grief Support', icon: CloudRain, color: 'from-slate-500 to-gray-500', description: 'Bereavement and loss counseling' },
  ];

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    } 
  }, [user, navigate]);

 
  const filteredTherapists = selectedSpecialty === 'all'
    ? therapists
    : therapists.filter(t => t.specialty === selectedSpecialty);

  const handleSelectTherapist = (therapist) => {
    navigate('/therapy-session', { state: { therapist, emotionContext: currentEmotion } });
  };

  const SpecialtyCard = ({ specialty }) => {
    const IconComponent = specialty.icon;
    const isSelected = selectedSpecialty === specialty.id;

    return (
      <motion.button
        onClick={() => {
          // Navigate directly to therapy session for this specialty
          const promptObj = specialtiesPrompts.find(s => s.id === specialty.id) || specialtiesPrompts.find(s => s.id === 'general');
          navigate('/therapy-session', { state: { specialtyId: specialty.id, specialtyName: specialty.name, specialtyPrompt: promptObj?.prompt || '', emotionContext: currentEmotion } });
          setSelectedSpecialty(specialty.id);
        }}
        whileHover={{ scale: 1.05, y: -5 }}
        whileTap={{ scale: 0.98 }}
        className={`relative p-6 rounded-2xl border-2 transition-all duration-300 ${
          isSelected
            ? 'bg-white shadow-2xl border-transparent'
            : 'bg-white/50 border-white/30 hover:bg-white/70'
        }`}
      >
        <div className="flex flex-col items-center text-center space-y-3">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-r ${specialty.color} flex items-center justify-center shadow-lg`}>
            <IconComponent className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">{specialty.name}</h3>
            <p className="text-xs text-gray-600 mt-1">{specialty.description}</p>
          </div>
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg"
            >
              <Check className="w-5 h-5 text-white" />
            </motion.div>
          )}
        </div>
      </motion.button>
    );
  };

  const TherapistCard = ({ therapist }) => {
    const specialty = specialties.find(s => s.id === therapist.specialty);
    const IconComponent = specialty?.icon || User;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -8, scale: 1.02 }}
        className="group bg-white rounded-3xl p-6 shadow-xl border border-white/50 hover:border-white/70 transition-all duration-500 cursor-pointer"
        onClick={() => handleSelectTherapist(therapist)}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-start space-x-4 mb-4">
            <div className="relative">
              <img
                src={therapist.avatar_url || 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=400'}
                alt={therapist.name}
                className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg"
              />
              <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-r ${specialty?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center shadow-lg`}>
                <IconComponent className="w-5 h-5 text-white" />
              </div>
            </div>

            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-800 mb-1">{therapist.name}</h3>
              <div className={`inline-flex items-center px-3 py-1 rounded-full bg-gradient-to-r ${specialty?.color || 'from-gray-500 to-gray-600'} text-white text-xs font-medium`}>
                {specialty?.name || therapist.specialty}
              </div>
            </div>
          </div>

          <p className="text-gray-600 text-sm leading-relaxed mb-4 flex-grow">
            {therapist.description}
          </p>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center">
                <Star className="w-4 h-4 text-yellow-500 mr-1" />
                <span className="font-medium">4.9</span>
              </div>
              <div className="flex items-center">
                <Award className="w-4 h-4 text-blue-500 mr-1" />
                <span>15+ years</span>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`flex items-center px-4 py-2 rounded-full bg-gradient-to-r ${specialty?.color || 'from-gray-500 to-gray-600'} text-white font-semibold text-sm shadow-lg`}
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Start Session
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <motion.button
                onClick={() => navigate('/emotion-detection')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-3 rounded-full bg-white shadow-lg hover:shadow-xl transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </motion.button>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                  Choose Your Therapist
                </h1>
                <p className="text-gray-600 mt-1">
                  Select a specialized therapist to begin your healing journey
                </p>
              </div>
            </div>

            {currentEmotion && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center space-x-2 bg-white px-4 py-2 rounded-full shadow-lg"
              >
                <Brain className="w-5 h-5 text-purple-500" />
                <span className="text-sm font-medium text-gray-700">
                  Current mood: <span className="capitalize text-purple-600">{currentEmotion.emotion}</span>
                </span>
              </motion.div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
            <Sparkles className="w-6 h-6 text-purple-500 mr-2" />
            Specialty Areas
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {specialties.map((specialty, index) => (
              <motion.div
                key={specialty.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * index }}
              >
                <SpecialtyCard specialty={specialty} />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            {selectedSpecialty === 'all'
              ? 'All Available Therapists'
              : `${specialties.find(s => s.id === selectedSpecialty)?.name} Specialists`}
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full"
              />
            </div>
          ) : error ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-red-100 border border-red-300 text-red-700 px-6 py-4 rounded-2xl"
            >
              {error}
            </motion.div>
          ) : filteredTherapists.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-gray-100 border border-gray-300 text-gray-700 px-6 py-4 rounded-2xl text-center"
            >
              No therapists available for this specialty.
            </motion.div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTherapists.map((therapist, index) => (
                <motion.div
                  key={therapist.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                >
                  <TherapistCard therapist={therapist} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div> */}
      </div>     
    </div>
  );
};

export default TherapistSelectionPage;
