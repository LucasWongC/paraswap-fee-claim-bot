import {
  AutomateSDK,
  TriggerType,
  Web3Function,
} from "@gelatonetwork/automate-sdk";
import { Signer } from "@ethersproject/abstract-signer";
import hre from "hardhat";

const { ethers, w3f } = hre;

const main = async () => {
  const aaveParaswapFeeClaimerW3f = w3f.get("aave-paraswap-fee-claimer");

  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const automate = new AutomateSDK(chainId, deployer as unknown as Signer);
  const web3Function = new Web3Function(chainId, deployer as unknown as Signer);

  // Deploy Web3Function on IPFS
  console.log("Deploying Web3Function on IPFS...");
  const cid = await aaveParaswapFeeClaimerW3f.deploy();
  console.log(`Web3Function IPFS CID: ${cid}`);

  // Create task using automate sdk
  console.log("Creating automate task...");

  const { taskId, tx } = await automate.createBatchExecTask({
    name: "Web3Function - AAVE Paraswap Fee Claimer",
    web3FunctionHash: cid,
    web3FunctionArgs: {},
    trigger: {
      interval: 30 * 24 * 60 * 60 * 1000,
      type: TriggerType.TIME,
    },
  });

  await tx.wait();
  console.log(`Task created, taskId: ${taskId} (tx hash: ${tx.hash})`);
  console.log(
    `> https://beta.app.gelato.network/task/${taskId}?chainId=${chainId}`
  );

  // Set task specific secrets
  const secrets = aaveParaswapFeeClaimerW3f.getSecrets();
  if (Object.keys(secrets).length > 0) {
    await web3Function.secrets.set(secrets, taskId);
    console.log(`Secrets set`);
  }
};

main()
  .then(() => {
    process.exit();
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
