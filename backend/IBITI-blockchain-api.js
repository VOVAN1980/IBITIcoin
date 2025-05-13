// API для IBITI Blockchain
// REST API с полной интеграцией IBITI Token, DAO, Staking и AI-управлением

const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecretkey";

app.use(express.json());

// Ограничение частоты запросов
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: "Слишком много запросов. Попробуйте позже."
});
app.use(limiter);

// Авторизация через JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Получение баланса аккаунта
app.get("/balance/:account", authenticateToken, async (req, res) => {
  try {
    const { account } = req.params;
    const response = await axios.get(`${process.env.BLOCKCHAIN_API_URL}/get_balance?account=${account}`);
    res.json({ balance: response.data.balance });
  } catch (error) {
    res.status(500).json({ error: "Ошибка получения баланса" });
  }
});

// История голосования
app.get("/voting-history", authenticateToken, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.BLOCKCHAIN_API_URL}/get_voting_history`);
    res.json({ history: response.data });
  } catch (error) {
    res.status(500).json({ error: "Ошибка получения истории голосований" });
  }
});

// Получение информации о стейкинге
app.get("/staking-info/:account", authenticateToken, async (req, res) => {
  try {
    const { account } = req.params;
    const response = await axios.get(`${process.env.BLOCKCHAIN_API_URL}/get_staking_info?account=${account}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Ошибка получения информации о стейкинге" });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`IBITI Blockchain API запущен на порту ${PORT}`);
});
