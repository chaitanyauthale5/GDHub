import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { api } from '@/api/apiClient';
import { motion } from 'framer-motion';

import { Mic, Users, Sparkles, Clock, Filter, Trophy, BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import TopNav from '../components/navigation/TopNav';
import ClayCard from '../components/shared/ClayCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ExtemporePractice() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);
  const [filter, setFilter] = useState('all');
  const [articles, setArticles] = useState([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('topics');

  useEffect(() => {
    loadTopics();
  }, []);

  useEffect(() => {
    if (activeTab === 'articles') {
      loadArticles();
    }
  }, [activeTab]);

  const loadTopics = async () => {
    try {
      const allTopics = await api.entities.ExtemporeTopic.list();
      setTopics(allTopics);
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  const loadArticles = async () => {
    setArticlesLoading(true);
    try {
      const response = await api.gdTopics.getCommunicationArticles();
      if (response.success) {
        setArticles(response.articles);
      }
    } catch (error) {
      console.error('Error loading articles:', error);
    } finally {
      setArticlesLoading(false);
    }
  };

  const sampleTopics = [
    {
      title: 'Should social media platforms be regulated by the government?',
      difficulty: 'medium',
      category: 'Technology',
      tags: ['politics', 'society', 'technology']
    },
    {
      title: 'The impact of artificial intelligence on employment',
      difficulty: 'hard',
      category: 'Technology',
      tags: ['technology', 'AI', 'employment']
    },
    {
      title: 'The role of education in shaping society',
      difficulty: 'medium',
      category: 'Education',
      tags: ['education', 'society', 'development']
    },
    {
      title: 'Should college education be free for everyone?',
      difficulty: 'easy',
      category: 'Education',
      tags: ['education', 'policy', 'economics']
    },
    {
      title: 'The influence of technology on human relationships',
      difficulty: 'easy',
      category: 'Technology',
      tags: ['technology', 'relationships', 'society']
    }
  ];

  const displayTopics = topics.length > 0 ? topics : sampleTopics;
  const filteredTopics = filter === 'all' ? displayTopics : displayTopics.filter(t => t.difficulty === filter);

  const difficultyColors = {
    easy: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    hard: 'bg-red-100 text-red-800'
  };

  const categoryColors = {
    'Psychology': 'bg-purple-100 text-purple-800',
    'Business': 'bg-blue-100 text-blue-800',
    'Inspiration': 'bg-pink-100 text-pink-800'
  };

  return (
    <div className="min-h-screen pb-20">
      <TopNav activePage="Explore" />
      
      <div className="max-w-7xl mx-auto px-6 pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-5xl font-bold mb-2 gradient-text">Extempore Speaking</h1>
          <p className="text-gray-600 text-lg">Speak spontaneously on any topic</p>
        </motion.div>

        {/* Header Card */}
        <ClayCard className="mb-8 bg-gradient-to-br from-purple-100 via-blue-100 to-pink-100">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-400 to-blue-500">
                  <Mic className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-3xl font-bold gradient-text">How it Works</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="clay-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-purple-600" />
                    <p className="font-semibold">Preparation</p>
                  </div>
                  <p className="text-sm text-gray-600">30 seconds</p>
                </div>
                <div className="clay-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-5 h-5 text-blue-600" />
                    <p className="font-semibold">Speaking</p>
                  </div>
                  <p className="text-sm text-gray-600">Up to 5 min</p>
                </div>
                <div className="clay-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-pink-600" />
                    <p className="font-semibold">Feedback</p>
                  </div>
                  <p className="text-sm text-gray-600">AI Analysis</p>
                </div>
              </div>
            </div>
            <Link to={createPageUrl('ExtemporeRoom?random=true')}>
              <button className="px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold shadow-xl hover:shadow-2xl transition-all flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Get Random Topic
              </button>
            </Link>
          </div>
        </ClayCard>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('topics')}
            className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'topics'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Topics
            </div>
          </button>
          <button
            onClick={() => setActiveTab('articles')}
            className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'articles'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Articles
            </div>
          </button>
        </div>

        {/* Filter - Only show for topics tab */}
        {activeTab === 'topics' && (
          <div className="flex items-center gap-4 mb-6">
            <Filter className="w-5 h-5 text-gray-600" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="clay-card border-none w-48">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Content based on active tab */}
        {activeTab === 'topics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTopics.map((topic, index) => (
              <Link key={index} to={createPageUrl(`ExtemporeRoom?topic=${encodeURIComponent(topic.title)}`)}>
                <ClayCard>
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${difficultyColors[topic.difficulty]}`}>
                      {topic.difficulty}
                    </span>
                    <span className="text-sm text-gray-500">{topic.category}</span>
                  </div>
                  <h3 className="text-lg font-bold mb-3">{topic.title}</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {topic.description || `Discuss pros and cons of ${topic.title.toLowerCase()}`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {topic.tags?.map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-purple-100 text-purple-600 rounded-full text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </ClayCard>
              </Link>
            ))}
          </div>
        )}

        {activeTab === 'articles' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Communication Articles</h2>
              <button
                onClick={loadArticles}
                disabled={articlesLoading}
                className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${articlesLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {articlesLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                <p className="mt-4 text-gray-600">Loading articles...</p>
              </div>
            ) : articles.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>No articles found. Click refresh to try again.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {articles.map((article, index) => (
                  <ClayCard key={index} className="hover:shadow-lg transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${categoryColors[article.category] || 'bg-gray-100 text-gray-800'}`}>
                        {article.category}
                      </span>
                      <span className="text-sm text-gray-500">{article.readTime} min read</span>
                    </div>
                    <h3 className="text-lg font-bold mb-3 line-clamp-2">{article.title}</h3>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-3">{article.summary}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">{article.source}</span>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-purple-600 hover:text-purple-800 text-sm font-medium"
                      >
                        Read More
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </ClayCard>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tournament Section */}
        <ClayCard className="mt-8 bg-gradient-to-br from-orange-50 to-pink-50 border-2 border-orange-200">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Extempore Tournaments</h3>
                <p className="text-gray-600">Compete in organized speaking competitions</p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(createPageUrl('TournamentHub?type=extempore'))}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-orange-400 to-pink-500 text-white font-bold shadow-xl"
            >
              View Tournaments
            </motion.button>
          </div>
        </ClayCard>
      </div>
    </div>
  );
}