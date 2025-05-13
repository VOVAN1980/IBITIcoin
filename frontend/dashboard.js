import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { Line } from "react-chartjs-2";
import "chart.js/auto";

export default function IBITIDashboard() {
  const [balance, setBalance] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [account, setAccount] = useState("");
  const [threatData, setThreatData] = useState([]);
  const [predictionData, setPredictionData] = useState([]);
  const [fee, setFee] = useState(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchBalance = async () => {
    if (!account) {
      alert("Please enter a valid account address.");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get(
        `/api/get_balance?account=${encodeURIComponent(account)}`
      );
      if (response.data && response.data.balance) {
        setBalance(response.data.balance);
      } else {
        alert("Invalid response format from server.");
      }
    } catch (error) {
      console.error("Error fetching balance", error);
      alert("Failed to fetch balance. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFee = async () => {
    if (!account || !amount) {
      alert("Please enter a valid account and amount.");
      return;
    }
    try {
      const response = await axios.get(
        `/api/get_fee?user=${encodeURIComponent(account)}&amount=${encodeURIComponent(amount)}`
      );
      if (response.data && response.data.fee) {
        setFee(response.data.fee);
      } else {
        alert("Invalid response format from server.");
      }
    } catch (error) {
      console.error("Error fetching fee", error);
      alert("Failed to fetch transaction fee. Please try again.");
    }
  };

  const fetchData = async () => {
    try {
      const [proposalsRes, threatsRes, predictionsRes] = await Promise.all([
        axios.get("/api/get_proposal_history"),
        axios.get("/api/get_threats"),
        axios.get("/api/get_predictions"),
      ]);
      setProposals(proposalsRes.data.proposals || []);
      setThreatData(threatsRes.data.threats || []);
      setPredictionData(predictionsRes.data.predictions || []);
    } catch (error) {
      console.error("Error fetching data", error);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every 60 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">
        IBITI DAO Dashboard - AI Enhanced
      </h1>
      <div className="mt-4">
        <input
          type="text"
          placeholder="Enter account address"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          className="p-2 border rounded"
        />
        <Button className="ml-2" onClick={fetchBalance} disabled={loading}>
          {loading ? "Loading..." : "Get Balance"}
        </Button>
        {balance !== null && <p className="mt-2">Balance: {balance} IBITI</p>}
      </div>

      <div className="mt-4">
        <input
          type="number"
          placeholder="Enter amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="p-2 border rounded"
        />
        <Button className="ml-2" onClick={fetchFee}>
          Get Transaction Fee
        </Button>
        {fee !== null && <p className="mt-2">Transaction Fee: {fee}</p>}
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Threat Analytics</h2>
        <Line
          data={{
            labels: threatData.map((threat, index) => `T-${index + 1}`),
            datasets: [
              {
                label: "Risk Levels",
                data: threatData.map((threat) => threat.risk),
                borderColor: "rgba(255, 99, 132, 1)",
                backgroundColor: "rgba(255, 99, 132, 0.2)",
                fill: true,
              },
            ],
          }}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Risk Prediction</h2>
        <Line
          data={{
            labels: predictionData.map((prediction, index) => `P-${index + 1}`),
            datasets: [
              {
                label: "Predicted Risk",
                data: predictionData.map((prediction) => prediction.risk),
                borderColor: "rgba(54, 162, 235, 1)",
                backgroundColor: "rgba(54, 162, 235, 0.2)",
                fill: true,
              },
            ],
          }}
        />
      </div>
    </div>
  );
}
