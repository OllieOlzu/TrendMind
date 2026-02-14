import express from "express";
import cors from "cors";
import { getJson } from "serpapi";
import "dotenv/config";
import Groq from "groq-sdk";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

app.get("/api/stooq", async (req, res) => {
    try {
        let stock = req.query.stock;

        if (!stock) {
            return res.status(400).json({ error: "Stock symbol required" });
        }

        stock = stock.toLowerCase() + ".us";

        const url = `https://stooq.com/q/d/l/?s=${stock}&i=d`;

        const response = await axios.get(url);

        const csv = response.data;

        const lines = csv.trim().split("\n");
        const headers = lines[0].split(",");

        const data = lines.slice(1).map(line => {
            const values = line.split(",");
            return {
                date: values[0],
                close: parseFloat(values[4])
            };
        });

        res.json(data);

    } catch (error) {
        res.status(500).json({ error: "Failed to fetch stock data" });
    }
});

app.post("/api/newssummary", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ reply: "No message provided" });

  try {
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: "You are a stock headline summarising asistant. Summarise the news headlines given in 2-3 sentances. Dive right into the responce, don't say what your going to do." },
        { role: "user", content: message }
      ],
      model: "llama-3.1-8b-instant",  // or any other supported model
      "top_p": 1,
      "temperature": 0,
      "seed": 0,
    });

    // The API returns an array of choices
    const reply = completion.choices?.[0]?.message?.content || "";
    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Error contacting Groq API" });
  }
});

app.get("/api/news", async (req, res) => {
  const stock = req.query.stock;

  if (!stock) {
    return res.status(400).json({ error: "Missing stock symbol" });
  }

  try {
    const result = await getJson({
      engine: "google_news",
      q: `${stock} stock news`,
      api_key: process.env.APIKEY
    });

    const articles = (result.news_results || [])
      .slice(0, 10)
      .map(a => ({
        title: a.title,
        source: a.source,
        link: a.link,
        date: a.date
      }));

    res.json({
      stock,
      results: articles
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
