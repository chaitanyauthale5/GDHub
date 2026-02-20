const webScrapingService = require('./src/services/webScrapingService');

webScrapingService.getGDTopics().then(result => {
  console.log('Success:', result.success);
  console.log('Topics count:', result.topics?.length || 0);
  if (result.topics) {
    result.topics.slice(0, 2).forEach((t, i) => {
      console.log(`${i+1}. ${t.title}`);
      console.log(`   Category: ${t.category}, Difficulty: ${t.difficulty}`);
    });
  }
}).catch(err => console.log('Error:', err.message));
