// server.js - Fixed Stock Sentiment Backend
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// In-memory storage
let sentimentHistory = new Map();
let commentCache = new Map();

class StockSentimentAnalyzer {
  constructor() {
    this.baseURL = 'https://www.reddit.com';
    this.userAgent = 'StockRadar/1.0';
    
    this.bullishTerms = [
      'moon', 'rocket', 'diamond hands', 'hodl', 'buy the dip', 'bullish', 
      'undervalued', 'catalyst', 'breakout', 'support level', 'strong buy',
      'accumulating', 'oversold', 'bounce back', 'long term', 'value play',
      'squeeze', 'gap up', 'momentum', 'uptrend', 'reversal', 'calls',
      'pump', 'lambo', 'tendies', 'yolo', 'ath', 'mooning'
    ];
    
    this.bearishTerms = [
      'dump', 'crash', 'bear market', 'overvalued', 'bubble', 'red flags',
      'sell off', 'resistance', 'downtrend', 'bearish', 'avoid',
      'risky', 'declining', 'weak', 'concerns', 'headwinds',
      'correction', 'pullback', 'gap down', 'breakdown', 'puts',
      'short', 'rug pull', 'bagholding', 'dead cat bounce'
    ];
    
    this.stockKeywords = [
      'stock', 'stocks', 'share', 'shares', 'trading', 'investment',
      'portfolio', 'market', 'ticker', 'DD', 'earnings', 'options'
    ];
  }

  analyzeSentiment(text) {
    if (!text) return { score: 0, label: 'neutral', confidence: 0, bullishSignals: 0, bearishSignals: 0 };
    
    const lowerText = text.toLowerCase();
    let bullishScore = 0;
    let bearishScore = 0;
    
    this.bullishTerms.forEach(term => {
      const count = (lowerText.match(new RegExp(term, 'g')) || []).length;
      bullishScore += count;
    });
    
    this.bearishTerms.forEach(term => {
      const count = (lowerText.match(new RegExp(term, 'g')) || []).length;
      bearishScore += count;
    });
    
    const netScore = bullishScore - bearishScore;
    const totalSignals = bullishScore + bearishScore;
    const confidence = Math.min(totalSignals / 2, 1);
    
    let label, score;
    if (netScore >= 2) {
      label = 'very bullish';
      score = Math.min(netScore, 3);
    } else if (netScore >= 1) {
      label = 'bullish';  
      score = 1;
    } else if (netScore <= -2) {
      label = 'very bearish';
      score = Math.max(netScore, -3);
    } else if (netScore <= -1) {
      label = 'bearish';
      score = -1;
    } else {
      label = 'neutral';
      score = 0;
    }
    
    return { score, label, confidence, bullishSignals: bullishScore, bearishSignals: bearishScore };
  }

  extractStockTickers(text) {
    const tickers = (text.match(/\b[A-Z]{1,5}\b/g) || [])
      .filter(ticker => ticker.length >= 2 && ticker.length <= 5)
      .filter(ticker => !['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'BUT', 'HAS', 'HIS'].includes(ticker));
    
    return [...new Set(tickers)];
  }

  hasStockContext(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return this.stockKeywords.some(keyword => lowerText.includes(keyword)) ||
           /\$[A-Z]{1,5}/.test(text) ||
           /price target|earnings|dividend|options|calls|puts/i.test(text);
  }

  async getStockComments(subreddit, limit = 25, sortBy = 'sentiment') {
    try {
      console.log(`📈 Scanning r/${subreddit}...`);
      
      const response = await axios.get(
        `${this.baseURL}/r/${subreddit}/comments.json?limit=50`,
        {
          headers: { 'User-Agent': this.userAgent },
          timeout: 15000
        }
      );

      const comments = response.data.data.children
        .map(comment => {
          const sentiment = this.analyzeSentiment(comment.data.body);
          const tickers = this.extractStockTickers(comment.data.body || '');
          
          return {
            id: comment.data.id,
            author: comment.data.author,
            text: comment.data.body,
            score: comment.data.score,
            created_utc: comment.data.created_utc,
            timePosted: new Date(comment.data.created_utc * 1000).toLocaleString(),
            subreddit: comment.data.subreddit,
            permalink: `https://reddit.com${comment.data.permalink}`,
            sentiment: sentiment,
            tickers: tickers,
            hasStockMention: tickers.length > 0 || this.hasStockContext(comment.data.body)
          };
        })
        .filter(comment => 
          comment.text && 
          comment.text.length > 20 && 
          !comment.text.includes('[deleted]') &&
          comment.hasStockMention
        );

      const sortedComments = this.sortBySentiment(comments, sortBy);
      const sentimentSummary = this.calculateSentimentSummary(sortedComments);
      
      return {
        success: true,
        subreddit,
        count: sortedComments.length,
        comments: sortedComments.slice(0, limit),
        sentimentSummary,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error fetching r/${subreddit}:`, error.message);
      return {
        success: false,
        error: `Failed to fetch from r/${subreddit}`,
        comments: []
      };
    }
  }

  sortBySentiment(comments, sortBy) {
    switch(sortBy) {
      case 'most_bullish':
        return comments.sort((a, b) => b.sentiment.score - a.sentiment.score);
      case 'most_bearish':
        return comments.sort((a, b) => a.sentiment.score - b.sentiment.score);
      case 'highest_confidence':
        return comments.sort((a, b) => b.sentiment.confidence - a.sentiment.confidence);
      default:
        return comments.sort((a, b) => {
          const aAbs = Math.abs(a.sentiment.score);
          const bAbs = Math.abs(b.sentiment.score);
          if (aAbs !== bAbs) return bAbs - aAbs;
          return b.sentiment.score - a.sentiment.score;
        });
    }
  }

  calculateSentimentSummary(comments) {
    if (comments.length === 0) {
      return {
        averageScore: 0,
        distribution: { very_bullish: 0, bullish: 0, neutral: 0, bearish: 0, very_bearish: 0 },
        totalComments: 0,
        confidenceAverage: 0
      };
    }

    const totalScore = comments.reduce((sum, c) => sum + c.sentiment.score, 0);
    const totalConfidence = comments.reduce((sum, c) => sum + c.sentiment.confidence, 0);
    
    const distribution = {
      very_bullish: comments.filter(c => c.sentiment.label === 'very bullish').length,
      bullish: comments.filter(c => c.sentiment.label === 'bullish').length,
      neutral: comments.filter(c => c.sentiment.label === 'neutral').length,
      bearish: comments.filter(c => c.sentiment.label === 'bearish').length,
      very_bearish: comments.filter(c => c.sentiment.label === 'very bearish').length
    };

    return {
      averageScore: totalScore / comments.length,
      distribution,
      totalComments: comments.length,
      confidenceAverage: totalConfidence / comments.length
    };
  }
}

const analyzer = new StockSentimentAnalyzer();

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Stock Sentiment Radar Online 📈', 
    timestamp: new Date().toISOString()
  });
});

app.get('/api/subreddits', (req, res) => {
  const subreddits = [
    { name: 'stocks', label: 'r/stocks', description: 'General stock discussions' },
    { name: 'wallstreetbets', label: 'r/wallstreetbets', description: 'High-risk trading' },
    { name: 'investing', label: 'r/investing', description: 'Long-term strategies' }
  ];
  
  res.json({ success: true, subreddits });
});

app.get('/api/sentiment', async (req, res) => {
  try {
    const { subreddit = 'stocks', limit = 25, sort = 'sentiment' } = req.query;
    
    const allowedSubreddits = ['stocks', 'wallstreetbets', 'investing'];
    if (!allowedSubreddits.includes(subreddit)) {
      return res.status(403).json({
        success: false,
        error: 'Subreddit not available in free tier'
      });
    }

    const result = await analyzer.getStockComments(subreddit, parseInt(limit), sort);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

app.get('/api/sentiment/trend/:subreddit', (req, res) => {
  res.json({
    success: true,
    trend: {
      trend: 'stable',
      change: '0.0',
      current: '0.5',
      previous: '0.5'
    }
  });
});

app.get('/api/sentiment/overview', (req, res) => {
  res.json({
    success: true,
    overview: {
      stocks: { trend: 'stable', current: '0.2', change: '0.1' },
      wallstreetbets: { trend: 'slightly_bullish', current: '1.1', change: '0.3' },
      investing: { trend: 'stable', current: '0.0', change: '0.0' }
    }
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`📈 Stock Sentiment Radar running on port ${PORT}`);
  console.log(`🌐 API available at http://localhost:${PORT}/api/health`);
});