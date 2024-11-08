import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract } from "@ethersproject/contracts";
import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { constants } from "ethers";

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

const relay = new GelatoRelay();

const claimFee = async (
  chainId: number,
  address: string,
  assets: string[],
  provider: StaticJsonRpcProvider,
  relayApiKey: string
) => {
  let feeClaimer: Contract;
  try {
    feeClaimer = new Contract(address, AAVE_PARASWAP_FEE_CLAIMER_ABI, provider);
  } catch (err) {
    return { canExec: false, message: `Rpc call failed` };
  }

  // get claimable assets balance
  const balances: bigint[] = await feeClaimer.batchGetClaimable(assets);

  const claimableAssets: string[] = [];
  for (let i = 0; i < assets.length; i++) {
    console.log(`Chain: ${chainId} - Asset: ${assets[i]}: ${balances[i]}`);
    if (balances?.[i] ?? balances?.[i] > 0n) {
      claimableAssets.push(assets[i]);
    }
  }

  if (claimableAssets.length > 1) {
    const result = await relay.callWithSyncFee(
      {
        chainId: BigInt(chainId),
        target: address,
        data: feeClaimer.interface.encodeFunctionData("batchClaimToCollector", [
          claimableAssets,
        ]),
        feeToken: constants.AddressZero,
      },
      {},
      relayApiKey
    );

    console.log(result);
  } else if (claimableAssets.length == 1) {
    const result = await relay.callWithSyncFee(
      {
        chainId: BigInt(chainId),
        target: address,
        data: feeClaimer.interface.encodeFunctionData("claimToCollector", [
          claimableAssets[0],
        ]),
        feeToken: constants.AddressZero,
      },
      {},
      relayApiKey
    );

    console.log(result);
  } else {
    console.log("Doesn't have claimable token!");
  }
};

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, multiChainProvider, secrets } = context;

  const relayApiKey = await secrets.get("RELAY_API_KEY");
  if (!relayApiKey) {
    return { canExec: false, message: "Sponsor Api Key not configured" };
  }

  const { chainIds, addresses, assets } = userArgs as {
    chainIds: number[];
    addresses: string[];
    assets: string[];
  };

  if (
    chainIds?.length != addresses?.length ||
    chainIds?.length != assets?.length ||
    !chainIds?.length
  ) {
    return { canExec: false, message: "Configuration is not valid" };
  }

  for (let i = 0; i < chainIds.length; i++) {
    await claimFee(
      chainIds[i],
      addresses[i],
      assets[i].split(","),
      multiChainProvider.chainId(chainIds[i]),
      relayApiKey
    );
  }

  return {
    canExec: false,
    message: "Succeed!",
  };
});
