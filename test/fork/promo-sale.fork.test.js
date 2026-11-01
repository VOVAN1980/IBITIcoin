const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Контракт сайта на копии BSC: настоящий BSC-USDT (18 знаков) и выпущенный токен IBITI.
// Только при FORK_RPC_URL.
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const IBITI = "0x71b552D3503fe20610aaA470A96E1838fae8381A";
const KAZNA = "0xC00dC8E3F4647AAa4791AE58901eDDFE6095adA5";
const RESERVE = "0x9d8dd8B2CFF7A17967fA0eF19eD5C0b3EBeFDe41";
const USDT_BALANCES_SLOT = 1;

const I = (n) => ethers.parseUnits(String(n), 8);
const U = (n) => ethers.parseUnits(String(n), 18);

async function giveUsdt(to, amount) {
  const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [to, USDT_BALANCES_SLOT]));
  await network.provider.send("hardhat_setStorageAt", [USDT, slot, ethers.toBeHex(amount, 32)]);
}

describe("Fork BSC: контракт сайта с настоящими USDT и IBITI", function () {
  before(async function () {
    if (!process.env.FORK_RPC_URL) this.skip();
    await network.provider.send("evm_mine");
  });

  it("покупка за 10 и 100 USDT, реферал, цена $0,10", async () => {
    const [owner, buyer, friend] = await ethers.getSigners();
    const erc = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)", "function decimals() view returns (uint8)"];
    const usdt = new ethers.Contract(USDT, erc, buyer);
    const token = new ethers.Contract(IBITI, erc, ethers.provider);
    expect(await usdt.decimals()).to.equal(18n);
    expect(await token.decimals()).to.equal(8n);

    const sale = await ethers.deployContract("IBITIPromoSale", [USDT, IBITI, owner.address, RESERVE, U("0.10"), 1000, I(1), U(10), U(100)]);

    // запас: обычный перевод с Ledger Казна (на копии сети)
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [KAZNA] });
    await network.provider.send("hardhat_setBalance", [KAZNA, "0x56BC75E2D63100000"]);
    await token.connect(await ethers.getSigner(KAZNA)).transfer(sale.target, I(1_000_000));

    await sale.unpause();
    await giveUsdt(buyer.address, U(1_000));
    await usdt.approve(sale.target, U(110));

    const reserveBefore = await usdt.balanceOf(RESERVE);
    await sale.connect(buyer).buyWithReferral(U(10), friend.address, 0);
    await sale.connect(buyer).buyWithReferral(U(100), friend.address, 0);

    expect(await token.balanceOf(buyer.address)).to.equal(I(110) + I(1_100));
    expect(await token.balanceOf(friend.address)).to.equal(I(1));
    expect((await usdt.balanceOf(RESERVE)) - reserveBefore).to.equal(U(110));
    expect(await usdt.balanceOf(sale.target)).to.equal(0n);
    expect(await usdt.balanceOf(buyer.address)).to.equal(U(890));
    console.log(`      110 USDT → ${ethers.formatUnits(await token.balanceOf(buyer.address), 8)} IBITI, реферал ${ethers.formatUnits(await token.balanceOf(friend.address), 8)}`);
  });
});
