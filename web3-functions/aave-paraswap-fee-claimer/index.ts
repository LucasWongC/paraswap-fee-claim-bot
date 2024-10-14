import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract } from "@ethersproject/contracts";
import ky from "ky"; // we recommend using ky as axios doesn't support fetch by default

const AAVE_PARASWAP_FEE_CLAIMER_ABI = [
  {
    inputs: [{ internalType: "address[]", name: "assets", type: "address[]" }],
    name: "batchClaimToCollector",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address[]", name: "assets", type: "address[]" }],
    name: "batchGetClaimable",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract IERC20", name: "asset", type: "address" },
    ],
    name: "claimToCollector",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, multiChainProvider } = context;

  const provider = multiChainProvider.default();
  // Retrieve Last oracle update time
  const feeClaimerAddress = userArgs.address as string;
  const assets = userArgs.assets as string[];

  if (!feeClaimerAddress) {
    return { canExec: false, message: "Configuration is not valid" };
  }

  let feeClaimer: Contract;
  try {
    feeClaimer = new Contract(
      feeClaimerAddress,
      AAVE_PARASWAP_FEE_CLAIMER_ABI,
      provider
    );
  } catch (err) {
    return { canExec: false, message: `Rpc call failed` };
  }

  // get claimable assets balance
  const balances: bigint[] = await feeClaimer.batchGetClaimable(assets);

  const claimableAssets: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    console.log(`Asset: ${assets[i]} - ${balances[i]}`);
    if (balances?.[i] ?? balances?.[i] > 0n) {
      claimableAssets.push(assets[i]);
    }
  }

  if (claimableAssets.length > 1) {
    return {
      canExec: true,
      callData: [
        {
          to: feeClaimerAddress,
          data: feeClaimer.interface.encodeFunctionData(
            "batchClaimToCollector",
            [claimableAssets]
          ),
        },
      ],
    };
  } else if (claimableAssets.length == 1) {
    return {
      canExec: true,
      callData: [
        {
          to: feeClaimerAddress,
          data: feeClaimer.interface.encodeFunctionData("claimToCollector", [
            claimableAssets[0],
          ]),
        },
      ],
    };
  } else {
    return {
      canExec: false,
      message: "There aren't claimable balance",
    };
  }
});
