const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function testGDTopicsAPI() {
  console.log('Testing GD Topics API...\n');
  
  try {
    console.log('1. Testing categories endpoint...');
    const categoriesResponse = await axios.get(`${API_BASE_URL}/gd-topics/categories`);
    console.log('Categories:', categoriesResponse.data);
    
    console.log('\n2. Testing headlines endpoint (without auth)...');
    try {
      const headlinesResponse = await axios.get(`${API_BASE_URL}/gd-topics/headlines`);
      console.log('Headlines count:', headlinesResponse.data.count);
      console.log('Sample headlines:', headlinesResponse.data.headlines.slice(0, 3));
    } catch (error) {
      console.log('Headlines endpoint requires auth (expected)');
    }
    
    console.log('\n3. Testing web scraping service directly...');
    const webScrapingService = require('./src/services/webScrapingService');
    const result = await webScrapingService.getGDTopics();
    
    if (result.success) {
      console.log('✅ Web scraping service working!');
      console.log('Generated topics count:', result.topics.length);
      console.log('Sample topics:');
      result.topics.slice(0, 3).forEach((topic, index) => {
        console.log(`${index + 1}. ${topic.title}`);
        console.log(`   Category: ${topic.category}, Difficulty: ${topic.difficulty}`);
        console.log(`   Original: ${topic.originalHeadline}\n`);
      });
    } else {
      console.log('❌ Web scraping service failed:', result.error);
    }
    
    console.log('✅ Tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
    }
  }
}

testGDTopicsAPI();
