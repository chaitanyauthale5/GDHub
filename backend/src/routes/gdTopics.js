const express = require('express');
const router = express.Router();
const webScrapingService = require('../services/webScrapingService');
const auth = require('../middleware/auth');

router.get('/generate-topics', auth, async (req, res) => {
  try {
    const result = await webScrapingService.getGDTopics();
    
    if (result.success) {
      res.json({
        success: true,
        topics: result.topics,
        count: result.topics.length,
        generatedAt: result.generatedAt
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to generate GD topics',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in GD topics generation route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

router.get('/headlines', auth, async (req, res) => {
  try {
    const headlines = await webScrapingService.scrapeNewsHeadlines();
    
    res.json({
      success: true,
      headlines,
      count: headlines.length
    });
  } catch (error) {
    console.error('Error fetching headlines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch headlines',
      error: error.message
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
