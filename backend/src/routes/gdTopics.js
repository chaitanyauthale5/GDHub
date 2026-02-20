const express = require('express');
const router = express.Router();
const webScrapingService = require('../services/webScrapingService');
const auth = require('../middleware/auth');

router.get('/generate-topics', auth, async (req, res) => {
  try {
    const { category } = req.query;
    const result = await webScrapingService.getGDTopics(category);
    
    if (result.success) {
      res.json({
        success: true,
        topics: result.topics,
        category: result.category,
        count: result.topics.length,
        headlinesCount: result.headlinesCount,
        generatedAt: result.generatedAt
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to generate GD topics',
        error: result.error,
        category: category || 'All'
      });
    }
  } catch (error) {
    console.error('Error in GD topics generation route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      category: req.query.category || 'All'
    });
  }
});

router.get('/generate-topics/:category', auth, async (req, res) => {
  try {
    const { category } = req.params;
    const result = await webScrapingService.getGDTopics(category);
    
    if (result.success) {
      res.json({
        success: true,
        topics: result.topics,
        category: result.category,
        count: result.topics.length,
        headlinesCount: result.headlinesCount,
        generatedAt: result.generatedAt
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to generate GD topics',
        error: result.error,
        category: category
      });
    }
  } catch (error) {
    console.error('Error in GD topics generation route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      category: req.params.category
    });
  }
});

router.get('/headlines', auth, async (req, res) => {
  try {
    const { category } = req.query;
    const headlines = await webScrapingService.scrapeNewsHeadlines(category);
    
    res.json({
      success: true,
      headlines,
      category: category || 'All',
      count: headlines.length
    });
  } catch (error) {
    console.error('Error fetching headlines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch headlines',
      error: error.message,
      category: req.query.category || 'All'
    });
  }
});

router.get('/categories', (req, res) => {
  const categories = [
    'Politics',
    'Economy', 
    'Social Issues',
    'Technology',
    'Environment',
    'Education',
    'International',
    'General'
  ];
  
  res.json({
    success: true,
    categories
  });
});

router.get('/communication-articles', auth, async (req, res) => {
  try {
    const webScrapingService = require('../services/webScrapingService');
    const result = await webScrapingService.getCommunicationArticles();
    
    if (result.success) {
      res.json({
        success: true,
        articles: result.articles,
        count: result.articles.length,
        generatedAt: result.generatedAt
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch communication articles',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in communication articles route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
