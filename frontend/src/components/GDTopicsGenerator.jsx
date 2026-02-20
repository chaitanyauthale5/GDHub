import React, { useState, useEffect } from 'react';
import { api } from '../api/apiClient';

const GDTopicsGenerator = () => {
  const [allTopics, setAllTopics] = useState([]); // Store all topics for filtering
  const [topics, setTopics] = useState([]); // Display filtered topics
  const [headlines, setHeadlines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('topics');
  const [activeCategory, setActiveCategory] = useState('All'); // New state for active category

  useEffect(() => {
    fetchCategories();
    generateTopics(); // Auto-generate topics on page load
    fetchHeadlines(); // Auto-fetch headlines on page load
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await api.gdTopics.getCategories();
      if (response.success) {
        setCategories(response.categories);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const generateTopics = async (category = activeCategory) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.gdTopics.generateTopics(category === 'All' ? null : category);
      if (response.success) {
        setAllTopics(response.topics);
        // Apply current category filter
        if (activeCategory === 'All') {
          setTopics(response.topics);
        } else {
          setTopics(response.topics.filter(topic => topic.category === activeCategory));
        }
      } else {
        setError(response.message || 'Failed to generate topics');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while generating topics');
    } finally {
      setLoading(false);
    }
  };

  const filterTopicsByCategory = (category) => {
    setActiveCategory(category);
    // If changing category, fetch new topics for that category
    if (category !== 'All') {
      generateTopics(category);
    } else {
      // For 'All', fetch general topics
      generateTopics('All');
    }
  };

  const fetchHeadlines = async (category = null) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.gdTopics.getHeadlines(category);
      if (response.success) {
        setHeadlines(response.headlines);
      } else {
        setError(response.message || 'Failed to fetch headlines');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while fetching headlines');
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'hard': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Politics': 'bg-blue-100 text-blue-800',
      'Economy': 'bg-green-100 text-green-800',
      'Social Issues': 'bg-purple-100 text-purple-800',
      'Technology': 'bg-indigo-100 text-indigo-800',
      'Environment': 'bg-emerald-100 text-emerald-800',
      'Education': 'bg-orange-100 text-orange-800',
      'International': 'bg-cyan-100 text-cyan-800',
      'General': 'bg-gray-100 text-gray-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('topics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'topics'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              GD Topics
            </button>
            <button
              onClick={() => setActiveTab('headlines')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'headlines'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Current Headlines
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'categories'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Categories
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'topics' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Generated GD Topics</h2>
                <button
                  onClick={() => generateTopics()}
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Generating...' : 'Generate New Topics'}
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              {loading && (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-600">
                    {topics.length === 0 ? 'Generating topics for the first time...' : 'Generating new topics...'}
                  </p>
                </div>
              )}

              {topics.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500">
                  <p>No topics available. Click "Generate New Topics" to get started!</p>
                </div>
              )}

              <div className="grid gap-6">
                {topics.map((topic, index) => (
                  <div 
                    key={index} 
                    className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-300 shadow-sm cursor-pointer group"
                    onClick={() => {
                      if (topic.url) {
                        window.open(topic.url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold text-gray-900 flex-1 leading-relaxed pr-4 group-hover:text-blue-600 transition-colors">{topic.title}</h3>
                      <div className="flex space-x-2 flex-shrink-0">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${getDifficultyColor(topic.difficulty)}`}>
                          {topic.difficulty}
                        </span>
                        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${getCategoryColor(topic.category)}`}>
                          {topic.category}
                        </span>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <div className="flex items-center space-x-4">
                          <span className="flex items-center">
                            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                            <span className="font-semibold">Source:</span> {topic.source}
                          </span>
                          <span className="text-gray-400">|</span>
                          <span className="flex items-center">
                            <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                            <span className="font-semibold">Original:</span> {topic.originalHeadline}
                          </span>
                        </div>
                        {topic.url && (
                          <div className="flex items-center text-blue-600 group-hover:text-blue-800 transition-colors">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            <span className="text-xs font-medium">Read Article</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {topic.tags.map((tag, tagIndex) => (
                        <span key={tagIndex} className="px-3 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-full text-sm text-gray-700 font-medium hover:from-gray-100 hover:to-gray-200 transition-colors">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'headlines' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Current Headlines</h2>
                <button
                  onClick={fetchHeadlines}
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Fetching...' : 'Refresh Headlines'}
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              {headlines.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500">
                  <p>No headlines fetched yet. Click "Refresh Headlines" to get the latest news!</p>
                </div>
              )}

              <div className="grid gap-3">
                {headlines.map((headline, index) => (
                  <div 
                    key={index} 
                    className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => {
                      if (headline.url) {
                        window.open(headline.url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className="font-medium text-gray-900 flex-1 group-hover:text-blue-600 transition-colors pr-4">
                        {headline.title}
                      </h4>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {headline.source}
                        </span>
                        {headline.url && (
                          <div className="flex items-center text-blue-600 group-hover:text-blue-800 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Available Categories</h2>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">
                    {activeCategory !== 'All' && `Filtered by: ${activeCategory}`}
                  </span>
                  {activeCategory !== 'All' && (
                    <button
                      onClick={() => filterTopicsByCategory('All')}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div 
                  key="all" 
                  onClick={() => filterTopicsByCategory('All')}
                  className={`px-4 py-3 rounded-lg text-center font-medium cursor-pointer transition-all duration-200 ${
                    activeCategory === 'All' 
                      ? 'bg-blue-600 text-white shadow-md transform scale-105' 
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  All Categories
                </div>
                {categories.map((category, index) => (
                  <div 
                    key={index} 
                    onClick={() => filterTopicsByCategory(category)}
                    className={`px-4 py-3 rounded-lg text-center font-medium cursor-pointer transition-all duration-200 ${
                      activeCategory === category 
                        ? `${getCategoryColor(category)} shadow-md transform scale-105 ring-2 ring-offset-2 ring-blue-500` 
                        : `${getCategoryColor(category)} hover:opacity-80 hover:shadow-md`
                    }`}
                  >
                    {category}
                  </div>
                ))}
              </div>
              
              {/* Show filtered topics when a category is selected */}
              {activeCategory !== 'All' && (
                <div className="mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Topics in {activeCategory} Category
                    </h3>
                    <button
                      onClick={() => generateTopics()}
                      disabled={loading}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                      {loading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  
                  {loading && (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                  
                  {!loading && topics.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>No topics found in {activeCategory} category.</p>
                    </div>
                  )}
                  
                  {!loading && topics.length > 0 && (
                    <div className="grid gap-4">
                      {topics.map((topic, index) => (
                        <div 
                          key={index} 
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all duration-300 cursor-pointer group"
                          onClick={() => {
                            if (topic.url) {
                              window.open(topic.url, '_blank', 'noopener,noreferrer');
                            }
                          }}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-semibold text-gray-900 flex-1 pr-3 group-hover:text-blue-600 transition-colors">
                              {topic.title}
                            </h4>
                            <div className="flex space-x-2 flex-shrink-0">
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(topic.difficulty)}`}>
                                {topic.difficulty}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between text-sm text-gray-600">
                            <span className="flex items-center">
                              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                              <span>Source: {topic.source}</span>
                            </span>
                            {topic.url && (
                              <div className="flex items-center text-blue-600 group-hover:text-blue-800">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                <span className="text-xs">Read</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GDTopicsGenerator;
