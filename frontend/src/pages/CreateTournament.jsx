import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { api } from '@/api/apiClient';
import { motion } from 'framer-motion';
import { Trophy, ArrowLeft, Users, Clock, Building2, Globe, Lock, Calendar } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CreateTournament() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const tournamentType = urlParams.get('type') || 'gd';
  
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    organizer: '',
    description: '',
    visibility: 'public',
    group_size: 4,
    max_participants: 100,
    domain: 'general',
    duration: 15,
    start_date: ''
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const currentUser = await api.auth.me();
    setUser(currentUser);
  };

  const generateTournamentId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'T';
    for (let i = 0; i < 7; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  };

  const handleCreate = async () => {
    if (!user || !formData.name || !formData.organizer) {
      alert('Please fill in all required fields');
      return;
    }
    
    setLoading(true);
    try {
      const tournamentId = generateTournamentId();
      
      const tournament = await api.entities.Tournament.create({
        name: formData.name,
        tournament_id: tournamentId,
        type: tournamentType,
        organizer: formData.organizer,
        description: formData.description,
        visibility: formData.visibility,
        group_size: formData.group_size,
        max_participants: formData.max_participants,
        domain: formData.domain,
        duration: formData.duration,
        start_date: formData.start_date || null,
        status: 'registering',
        host_id: user.email,
        host_name: user.full_name
      });

      alert(`Tournament created successfully!\nTournament ID: ${tournamentId}\nShare this ID with participants.`);
      navigate(createPageUrl(`TournamentHub?type=${tournamentType}`));
    } catch (error) {
      console.error('Error creating tournament:', error);
    } finally {
      setLoading(false);
    }
  };

  const domains = ['General', 'Technology', 'Business', 'Education', 'Healthcare', 'Environment', 'Politics', 'Sports'];

  const typeLabels = {
    gd: 'Group Discussion',
    extempore: 'Extempore',
    debate: 'Debate'
  };

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Explore" />
      
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>
          <h1 className="text-4xl font-black mb-2 gradient-text">Create {typeLabels[tournamentType]} Tournament</h1>
          <p className="text-gray-600">Set up a tournament for your organization</p>
        </motion.div>

        <ClayCard className="mb-6">
          <div className="space-y-6">
            {/* Tournament Name */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Trophy className="w-5 h-5 text-orange-500" />
                Tournament Name *
              </label>
              <Input
                placeholder="e.g., Annual GD Championship 2025"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="clay-card border-none h-12"
              />
            </div>

            {/* Organizer */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Building2 className="w-5 h-5 text-blue-500" />
                Organization / College / Company *
              </label>
              <Input
                placeholder="e.g., ABC University, XYZ Corp"
                value={formData.organizer}
                onChange={(e) => setFormData({...formData, organizer: e.target.value})}
                className="clay-card border-none h-12"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Description
              </label>
              <Textarea
                placeholder="Describe your tournament..."
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="clay-card border-none min-h-24"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Visibility */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  {formData.visibility === 'public' ? (
                    <Globe className="w-5 h-5 text-green-500" />
                  ) : (
                    <Lock className="w-5 h-5 text-orange-500" />
                  )}
                  Visibility
                </label>
                <Select value={formData.visibility} onValueChange={(val) => setFormData({...formData, visibility: val})}>
                  <SelectTrigger className="clay-card border-none h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Group Size */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  Group Size
                </label>
                <Select value={formData.group_size.toString()} onValueChange={(val) => setFormData({...formData, group_size: parseInt(val)})}>
                  <SelectTrigger className="clay-card border-none h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 per group</SelectItem>
                    <SelectItem value="3">3 per group</SelectItem>
                    <SelectItem value="4">4 per group</SelectItem>
                    <SelectItem value="5">5 per group</SelectItem>
                    <SelectItem value="6">6 per group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Domain */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Topic Domain
                </label>
                <Select value={formData.domain} onValueChange={(val) => setFormData({...formData, domain: val})}>
                  <SelectTrigger className="clay-card border-none h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((d) => (
                      <SelectItem key={d} value={d.toLowerCase()}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Clock className="w-5 h-5 text-cyan-500" />
                  Duration (mins)
                </label>
                <Select value={formData.duration.toString()} onValueChange={(val) => setFormData({...formData, duration: parseInt(val)})}>
                  <SelectTrigger className="clay-card border-none h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="20">20 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Start Date */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <Calendar className="w-5 h-5 text-pink-500" />
                Start Date (Optional)
              </label>
              <Input
                type="datetime-local"
                value={formData.start_date}
                onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                className="clay-card border-none h-12"
              />
            </div>

            {/* Max Participants */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">
                Max Participants
              </label>
              <Input
                type="number"
                value={formData.max_participants}
                onChange={(e) => setFormData({...formData, max_participants: parseInt(e.target.value)})}
                className="clay-card border-none h-12"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreate}
            disabled={loading}
            className="mt-8 w-full py-5 rounded-3xl bg-gradient-to-r from-orange-400 to-pink-500 text-white font-bold text-lg shadow-xl disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Tournament'}
          </motion.button>
        </ClayCard>

        <ClayCard className="bg-gradient-to-br from-orange-50 to-pink-50">
          <h3 className="font-bold text-lg mb-3">Tournament Tips:</h3>
          <ul className="space-y-2 text-gray-700 text-sm">
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full mt-2"></span>
              Public tournaments are visible to everyone and can be joined with the tournament ID
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 bg-pink-500 rounded-full mt-2"></span>
              Private tournaments require the exact ID to find and register
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full mt-2"></span>
              Participants will receive a unique password via email upon registration
            </li>
          </ul>
        </ClayCard>
      </div>
    </div>
  );
}