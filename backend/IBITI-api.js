require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Web3 } = require("web3");
const { ethers } = require("ethers");

const app = express();
const PORT = process.env.PORT || 3000;

// Подключение к BSC
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.BSC_RPC_URL));
const provider = new ethers.providers.JsonRpcProvider(process.env.BSC_RPC_URL);

const aiFeeManagerAddress = process.env.AI_FEE_MANAGER_ADDRESS;
if (!aiFeeManagerAddress) {
  console.error("❌ Ошибка: AI_FEE_MANAGER_ADDRESS не задан в .env");
  process.exit(1);
}
const aiFeeManagerABI = [
  "function calculateFee(address user, uint256 amount) public view returns (uint256)"
];
const aiFeeManager = new ethers.Contract(aiFeeManagerAddress, aiFeeManagerABI, provider);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Слишком много запросов, попробуйте позже."
});
app.use(limiter);
app.use(cors());

app.get("/api/get_balance", async (req, res) => {
  try {
    const { account } = req.query;
    if (!web3.utils.isAddress(account)) {
      return res.status(400).json({ error: "Неверный адрес кошелька" });
    }
    const balanceWei = await web3.eth.getBalance(account);
    const balanceBnb = web3.utils.fromWei(balanceWei, "ether");
    res.json({ address: account, balance: balanceBnb + " BNB" });
  } catch (error) {
    res.status(500).json({ error: "Ошибка сервера", details: error.message });
  }
});

app.get("/api/get_fee", async (req, res) => {
  try {
    const { user, amount } = req.query;
    if (!ethers.isAddress(user)) {
      return res.status(400).json({ error: "Неверный адрес кошелька" });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Некорректное значение суммы" });
    }
    const amountInWei = ethers.parseUnits(amount, "ether");
    const fee = await aiFeeManager.calculateFee(user, amountInWei);
    res.json({ address: user, fee: fee.toString() + "%" });
  } catch (error) {
    res.status(500).json({ error: "Ошибка сервера", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ IBITI API обновлен и запущен на порту ${PORT}`);
});
