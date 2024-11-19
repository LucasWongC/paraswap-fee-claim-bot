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

const AAVE_DATA_PROVIDER_ABI = [
  {
    inputs: [],
    name: "getAllReservesTokens",
    outputs: [
      {
        components: [
          { internalType: "string", name: "symbol", type: "string" },
          { internalType: "address", name: "tokenAddress", type: "address" },
        ],
        internalType: "struct IPoolDataProvider.TokenData[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const relay = new GelatoRelay();

const claimFee = async (
  chainId: number,
  feeClaimer: string,
  dataProvider: string,
  provider: StaticJsonRpcProvider,
  relayApiKey: string
) => {
  let feeClaimerContract: Contract;
  let dataProviderContract: Contract;
  try {
    feeClaimerContract = new Contract(
      feeClaimer,
      AAVE_PARASWAP_FEE_CLAIMER_ABI,
      provider
    );
    dataProviderContract = new Contract(
      dataProvider,
      AAVE_DATA_PROVIDER_ABI,
      provider
    );
  } catch (err) {
    return { canExec: false, message: `Rpc call failed` };
  }

  const allAssetsWithSymbol = await dataProviderContract.getAllReservesTokens();
  const assets = allAssetsWithSymbol.map((item: any) => item.tokenAddress);

  // get claimable assets balance
  const balances: bigint[] = await feeClaimerContract.batchGetClaimable(assets);

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
        target: feeClaimer,
        data: feeClaimerContract.interface.encodeFunctionData(
          "batchClaimToCollector",
          [claimableAssets]
        ),
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
        target: feeClaimer,
        data: feeClaimerContract.interface.encodeFunctionData(
          "claimToCollector",
          [claimableAssets[0]]
        ),
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

  const { chainIds, feeClaimers, dataProviders } = userArgs as {
    chainIds: number[];
    feeClaimers: string[];
    dataProviders: string[];
  };

  if (
    chainIds?.length != feeClaimers?.length ||
    chainIds?.length != dataProviders?.length ||
    !chainIds?.length
  ) {
    return { canExec: false, message: "Configuration is not valid" };
  }

  for (let i = 0; i < chainIds.length; i++) {
    await claimFee(
      chainIds[i],
      feeClaimers[i],
      dataProviders[i],
      multiChainProvider.chainId(chainIds[i]),
      relayApiKey
    );
  }

  return {
    canExec: false,
    message: "Succeed!",
  };
});
