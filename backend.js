// backend.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { parse } = require('csv-parse/sync');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = 3000;

// CONFIGURATION - REPLACE WITH YOUR KEYS
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; 
const NEWS_API_KEY = 'YOUR_NEWS_API_KEY'; 

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve the frontend

// --- LOCAL TICKER DATABASE (Subset for demo) ---
const STOCKS = [
    { symbol: "AAPL.US", name: "Apple Inc." },
    { symbol: "MSFT.US", name: "Microsoft Corp." },
    { symbol: "GOOGL.US", name: "Alphabet Inc." },
    { symbol: "AMZN.US", name: "Amazon.com Inc." },
    { symbol: "TSLA.US", name: "Tesla Inc." },
    { symbol: "NVDA.US", name: "NVIDIA Corp." },
    { symbol: "META.US", name: "Meta Platforms" },
    { symbol: "NFLX.US", name: "Netflix Inc." },
    { symbol: "AMD.US", name: "Advanced Micro Devices" },
    { symbol: "INTC.US", name: "Intel Corp." },
    { symbol: "IBM.US", name: "IBM" },
    { symbol: "ORCL.US", name: "Oracle Corp." },
    { symbol: "CSCO.US", name: "Cisco Systems" },
    { symbol: "ADBE.US", name: "Adobe Inc." },
    { symbol: "CRM.US", name: "Salesforce Inc." },
    { symbol: "QCOM.US", name: "Qualcomm Inc." },
    { symbol: "TXN.US", name: "Texas Instruments" },
    { symbol: "AVGO.US", name: "Broadcom Inc." },
    { symbol: "SHOP.US", name: "Shopify Inc." },
    { symbol: "SPOT.US", name: "Spotify Technology" }
];

// --- ENDPOINTS ---

// 1. Search Stocks
app.get('/api/stocks', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    if (!query) return res.json(STOCKS.slice(0, 10)); // Default list

    const filtered = STOCKS.filter(s => 
        s.name.toLowerCase().includes(query) || 
        s.symbol.toLowerCase().includes(query)
    );
    res.json(filtered);
});

// 2. Fetch Historical Data (Stooq)
app.get('/api/history/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    // Stooq CSV URL
    const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=d`;

    try {
        const response = await axios.get(url);
        // Stooq returns a CSV file. We parse it.
        const records = parse(response.data, {
            columns: true,
            skip_empty_lines: true
        });

        // Format for Chart.js (Date and Close price) - Take last 100 days for speed
        const chartData = records.slice(0, 100).reverse().map(row => ({
            date: row.Date,
            price: parseFloat(row.Close)
        }));

        res.json({ symbol, data: chartData });
    } catch (error) {
        console.error("Stooq Error:", error.message);
        res.status(500).json({ error: "Failed to fetch stock data" });
    }
});

// 3. Analyze with Gemini (News + AI)
app.post('/api/analyze', async (req, res) => {
    const { symbol, name } = req.body;

    try {
        // Step A: Fetch News
        // Using NewsAPI.org as an example source
        const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(name)}&sortBy=publishedAt&language=en&apiKey=${NEWS_API_KEY}`;
        const newsResp = await axios.get(newsUrl);
        const articles = newsResp.data.articles.slice(0, 5); // Analyze top 5 articles

        if (articles.length === 0) {
            return res.json({ analysis: "No recent news found to analyze.", articles: [] });
        }

        // Step B: Prepare Prompt for Gemini
        const newsSummary = articles.map(a => `- ${a.title} (${a.source.name})`).join('\n');
        const prompt = `
        You are a financial analyst AI. Analyze the following recent news headlines for ${name} (${symbol}):
        
        ${newsSummary}
        
        Based on this, provide a concise prediction of the stock trend (Bullish/Bearish/Neutral) and a brief reasoning. 
        Format your response as HTML (use <p>, <strong>, <ul>). 
        Important: End with a clear disclaimer that this is not financial advice.
        `;

        // Step C: Generate Content
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ 
            analysis: text, 
            articles: articles.map(a => ({ title: a.title, url: a.url, source: a.source.name, date: a.publishedAt })) 
        });

    } catch (error) {
        console.error("Analysis Error:", error.message);
        res.status(500).json({ error: "AI Analysis failed" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
