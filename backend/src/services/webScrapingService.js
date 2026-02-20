const axios = require('axios');
const cheerio = require('cheerio');

class WebScrapingService {
  constructor() {
    this.newsSources = [
      {
        name: 'The Hindu',
        url: 'https://www.thehindu.com/news/national/',
        selectors: ['.story-card .story-card-heading a', 'h3 a', '.title a', 'a[href*="/news/"]'],
        category: 'National'
      },
      {
        name: 'Times of India',
        url: 'https://timesofindia.indiatimes.com/india',
        selectors: ['.w_tle a', 'h3 a', '.title a', 'a[href*="/articleshow/"]'],
        category: 'National'
      },
      {
        name: 'NDTV',
        url: 'https://www.ndtv.com/india',
        selectors: ['.news_Itm a', 'h2 a', '.story-list a', 'a[href*="/news/"]'],
        category: 'National'
      }
    ];
  }

  async scrapeNewsHeadlines() {
    const headlines = [];
    
    console.log('Starting to scrape news headlines...');
    
    for (const source of this.newsSources) {
      try {
        console.log(`Scraping ${source.name} from ${source.url}...`);
        const response = await axios.get(source.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 10000
        });
        
        console.log(`Response status for ${source.name}: ${response.status}`);
        
        const $ = cheerio.load(response.data);
        const sourceHeadlines = [];
        
        // Try each selector until we find results
        for (const selector of source.selectors) {
          console.log(`Trying selector: ${selector}`);
          $(selector).each((index, element) => {
            const title = $(element).text().trim();
            if (title && title.length > 10 && sourceHeadlines.length < 5) {
              sourceHeadlines.push({
                title,
                source: source.name,
                category: source.category,
                url: $(element).attr('href') || ''
              });
            }
          });
          
          if (sourceHeadlines.length > 0) {
            console.log(`Found ${sourceHeadlines.length} headlines using selector: ${selector}`);
            break;
          }
        }
        
        // If still no headlines, try a more generic approach
        if (sourceHeadlines.length === 0) {
          console.log('Trying generic approach...');
          $('a').each((index, element) => {
            const title = $(element).text().trim();
            const href = $(element).attr('href') || '';
            if (title && title.length > 15 && title.length < 200 && 
                (href.includes('news') || href.includes('article') || href.includes('story')) &&
                sourceHeadlines.length < 3) {
              sourceHeadlines.push({
                title,
                source: source.name,
                category: source.category,
                url: href
              });
            }
          });
        }
        
        console.log(`Found ${sourceHeadlines.length} headlines from ${source.name}`);
        headlines.push(...sourceHeadlines);
      } catch (error) {
        console.error(`Error scraping ${source.name}:`, error.message);
      }
    }
    
    console.log(`Total headlines scraped: ${headlines.length}`);
    return headlines;
  }

  generateGDTopics(headlines) {
    const gdTopics = [];
    const categories = ['Politics', 'Economy', 'Social Issues', 'Technology', 'Environment', 'Education'];
    
    headlines.forEach(headline => {
      const topic = this.convertToGDTopic(headline);
      if (topic) {
        gdTopics.push(topic);
      }
    });
    
    categories.forEach(category => {
      const categoryTopics = headlines
        .filter(h => h.category === category || this.matchesCategory(h.title, category))
        .slice(0, 2);
      
      categoryTopics.forEach(headline => {
        const topic = this.convertToGDTopic(headline, category);
        if (topic && !gdTopics.find(t => t.title === topic.title)) {
          gdTopics.push(topic);
        }
      });
    });
    
    return gdTopics.slice(0, 10);
  }

  convertToGDTopic(headline, category = null) {
    const title = headline.title;
    
    const gdTopicTemplates = [
      `Is ${title.split(' ').slice(0, 5).join(' ')} a sign of changing times?`,
      `${title}: Discuss the implications`,
      `The ${title.split(' ').slice(0, 3).join(' ')} debate: Pros and Cons`,
      `Should we be concerned about ${title.split(' ').slice(0, 4).join(' ')}?`,
      `${title}: A step forward or backward?`
    ];
    
    const randomTemplate = gdTopicTemplates[Math.floor(Math.random() * gdTopicTemplates.length)];
    
    return {
      title: randomTemplate,
      originalHeadline: title,
      source: headline.source,
      category: category || this.detectCategory(title),
      difficulty: this.assessDifficulty(title),
      tags: this.extractTags(title),
      url: headline.url, // Add the original URL
      createdAt: new Date()
    };
  }

  detectCategory(title) {
    const keywords = {
      'Politics': ['government', 'election', 'policy', 'minister', 'parliament', 'political'],
      'Economy': ['economy', 'market', 'finance', 'budget', 'inflation', 'gdp'],
      'Technology': ['technology', 'digital', 'internet', 'software', 'ai', 'tech'],
      'Environment': ['environment', 'climate', 'pollution', 'sustainable', 'green'],
      'Social Issues': ['social', 'society', 'culture', 'education', 'health'],
      'International': ['international', 'global', 'world', 'foreign', 'diplomatic']
    };
    
    const lowerTitle = title.toLowerCase();
    for (const [category, words] of Object.entries(keywords)) {
      if (words.some(word => lowerTitle.includes(word))) {
        return category;
      }
    }
    
    return 'General';
  }

  assessDifficulty(title) {
    const complexity = title.length + title.split(' ').length;
    if (complexity < 15) return 'easy';
    if (complexity < 25) return 'medium';
    return 'hard';
  }

  extractTags(title) {
    const words = title.toLowerCase().split(' ').filter(word => word.length > 3);
    return [...new Set(words.slice(0, 5))];
  }

  matchesCategory(title, category) {
    return title.toLowerCase().includes(category.toLowerCase());
  }

  async scrapeCommunicationArticles() {
    const articles = [];
    
    console.log('Starting to scrape communication articles...');
    
    const communicationSources = [
      {
        name: 'Psychology Today',
        url: 'https://www.psychologytoday.com/us/blog/types/communication',
        selectors: ['article h3 a', '.teaser-title a', 'h2 a', '.entry-title a'],
        category: 'Psychology'
      },
      {
        name: 'Harvard Business Review',
        url: 'https://hbr.org/topic/communication',
        selectors: ['.hed a', 'h3 a', '.title a', 'article h2 a'],
        category: 'Business'
      },
      {
        name: 'TED Blog',
        url: 'https://ideas.ted.com/communication/',
        selectors: ['article h2 a', '.entry-title a', 'h3 a', '.post-title a'],
        category: 'Inspiration'
      }
    ];
    
    for (const source of communicationSources) {
      try {
        console.log(`Scraping ${source.name} from ${source.url}...`);
        const response = await axios.get(source.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 10000
        });
        
        console.log(`Response status for ${source.name}: ${response.status}`);
        
        const $ = cheerio.load(response.data);
        const sourceArticles = [];
        
        // Try each selector until we find results
        for (const selector of source.selectors) {
          console.log(`Trying selector: ${selector}`);
          $(selector).each((index, element) => {
            const title = $(element).text().trim();
            const href = $(element).attr('href') || '';
            if (title && title.length > 15 && title.length < 300 && sourceArticles.length < 3) {
              sourceArticles.push({
                title,
                source: source.name,
                category: source.category,
                url: href.startsWith('http') ? href : `${new URL(source.url).origin}${href}`,
                summary: this.generateSummary(title),
                readTime: Math.floor(Math.random() * 8) + 3 // 3-10 minutes read time
              });
            }
          });
          
          if (sourceArticles.length > 0) {
            console.log(`Found ${sourceArticles.length} articles using selector: ${selector}`);
            break;
          }
        }
        
        console.log(`Found ${sourceArticles.length} articles from ${source.name}`);
        articles.push(...sourceArticles);
      } catch (error) {
        console.error(`Error scraping ${source.name}:`, error.message);
      }
    }
    
    console.log(`Total communication articles scraped: ${articles.length}`);
    return articles;
  }

  generateSummary(title) {
    const summaries = [
      `Learn effective communication strategies and techniques for better personal and professional relationships.`,
      `Discover the art of persuasive communication and how to express your ideas with confidence.`,
      `Master verbal and non-verbal communication skills to enhance your public speaking abilities.`,
      `Explore research-backed methods to improve your communication effectiveness in various contexts.`,
      `Understand the psychology behind effective communication and how to apply it in daily life.`
    ];
    
    return summaries[Math.floor(Math.random() * summaries.length)];
  }

  async getCommunicationArticles() {
    try {
      const articles = await this.scrapeCommunicationArticles();
      
      return {
        success: true,
        articles: articles.slice(0, 8), // Limit to 8 articles
        count: articles.length,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error generating communication articles:', error);
      return {
        success: false,
        error: error.message,
        articles: []
      };
    }
  }

  async getGDTopics() {
    try {
      const headlines = await this.scrapeNewsHeadlines();
      const gdTopics = this.generateGDTopics(headlines);
      
      return {
        success: true,
        topics: gdTopics,
        headlinesCount: headlines.length,
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error generating GD topics:', error);
      return {
        success: false,
        error: error.message,
        topics: []
      };
    }
  }
}

module.exports = new WebScrapingService();
