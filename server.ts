import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import https from 'https';
import * as cheerio from 'cheerio';
import nodemailer from 'nodemailer';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post('/api/send-email', async (req, res) => {
    try {
      const { to, subject, body, isHtml } = req.body;
      const user = process.env.SMTP_EMAIL;
      const pass = process.env.SMTP_PASSWORD;

      if (!user || !pass) {
        return res.status(500).json({ error: 'Faltan credenciales SMTP (SMTP_EMAIL y SMTP_PASSWORD) en los secrets.' });
      }

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });

      const mailOptions = {
        from: user,
        to,
        subject,
        [isHtml ? 'html' : 'text']: body,
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Email Error:', error);
      res.status(500).json({ error: 'No se pudo enviar el correo.' });
    }
  });

  app.get('/api/bcv-rates', (req, res) => {
    https.get('https://www.bcv.org.ve/', { rejectUnauthorized: false }, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          const $ = cheerio.load(data);
          const usdText = $('#dolar strong').text().trim().replace(',', '.');
          const euroText = $('#euro strong').text().trim().replace(',', '.');
          const usd = parseFloat(usdText) || 0;
          const euro = parseFloat(euroText) || 0;
          res.json({ usd, euro });
        } catch (error) {
          console.error('Error parsing BCV page:', error);
          res.status(500).json({ error: 'Failed to parse rates' });
        }
      });
    }).on('error', (err) => {
      console.error('Error fetching BCV:', err.message);
      res.status(500).json({ error: 'Failed to fetch rates' });
    });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { messages } = req.body;
      const formattedMessages = messages.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      
      // Inject system instruction for the Game Master persona
      const systemInstruction = `Eres el Game Master (Director de Juego) de una aventura interactiva de supervivencia apocalíptica zombie. Tu narrativa debe ser inmersiva, de ritmo rápido y estar estrictamente enfocada en evocar una estética visual de "Pixel Art de 16 bits". Al responder, utiliza terminología de videojuegos retro. Tus respuestas deben ser breves y directas.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: formattedMessages,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingBudget: 1024,
          }
        }
      });
      
      res.json({ content: response.text });
    } catch (error: any) {
      const errorMessage = error?.message || '';
      if (errorMessage.includes('quota') || errorMessage.includes('429')) {
        console.warn('Gemini API Quota Exceeded (429).');
        res.status(429).json({ error: 'Se ha agotado la cuota gratuita de la API de IA. Por favor, intenta más tarde.' });
      } else {
        console.error('Chat API Error:', error);
        res.status(500).json({ error: 'Failed to generate chat response' });
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
