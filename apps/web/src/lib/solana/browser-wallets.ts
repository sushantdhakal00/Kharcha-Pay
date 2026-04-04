import bs58 from "bs58";
import type { SolanaClient, SolanaNetwork } from "@metamask/connect-solana";
import { SolanaSignAndSendTransaction, SolanaSignTransaction } from "@solana/wallet-standard-features";
import type {
  SolanaSignAndSendTransactionFeature,
  SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { StandardConnect } from "@wallet-standard/features";
import type { StandardConnectFeature } from "@wallet-standard/features";
import type {
  IdentifierString,
  WalletAccount,
  WalletWithFeatures,
} from "@wallet-standard/base";
import type { Connection, Transaction } from "@solana/web3.js";

export type WalletType = "phantom" | "solflare" | "okx" | "metamask";

type Base58PublicKeyLike = {
  toBase58?: () => string;
  toString?: () => string;
};

type InjectedConnectResult = {
  publicKey?: Base58PublicKeyLike | null;
} | void;

type InjectedSendResult =
  | string
  | Uint8Array
  | {
      signature?: string | Uint8Array;
    };

type InjectedSendOptions = {
  skipPreflight?: boolean;
  preflightCommitment?: "processed" | "confirmed" | "finalized";
  maxRetries?: number;
};

type InjectedSolanaProvider = {
  publicKey?: Base58PublicKeyLike | null;
  connect?: (input?: Record<string, unknown>) => Promise<InjectedConnectResult>;
  signAndSendTransaction?: (
    transaction: Transaction,
    options?: InjectedSendOptions
  ) => Promise<InjectedSendResult>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  isPhantom?: boolean;
  isSolflare?: boolean;
};

type BrowserEthereumProvider = {
  isMetaMask?: boolean;
};

type BrowserWindowLike = {
  phantom?: { solana?: InjectedSolanaProvider | null } | null;
  solana?: InjectedSolanaProvider | null;
  solflare?: InjectedSolanaProvider | null;
  okxwallet?: { solana?: InjectedSolanaProvider | null } | null;
  ethereum?:
    | (BrowserEthereumProvider & {
        providers?: BrowserEthereumProvider[];
      })
    | null;
  location?: {
    origin?: string;
  };
};

type MetaMaskWallet = WalletWithFeatures<
  StandardConnectFeature &
    Partial<SolanaSignAndSendTransactionFeature & SolanaSignTransactionFeature>
>;

export type SolanaWalletAvailability = {
  type: WalletType;
  name: string;
  icon: string;
  available: boolean;
  installed: boolean;
  title: string;
};

export type SolanaWalletSession = {
  address: string;
  name: string;
  type: WalletType;
  sendLegacyTransaction: (
    transaction: Transaction,
    connection: Connection
  ) => Promise<string>;
};

const CLIENT_SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";

const WALLET_META: Record<
  WalletType,
  {
    name: string;
    icon: string;
  }
> = {
  phantom: { name: "Phantom", icon: "👻" },
  solflare: { name: "Solflare", icon: "🔥" },
  okx: { name: "OKX", icon: "🔷" },
  metamask: { name: "MetaMask", icon: "🦊" },
};

const SOLANA_CAIP_IDS: Record<SolanaNetwork, IdentifierString> = {
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
};

let metaMaskClientPromise: Promise<SolanaClient> | null = null;

function getBrowserWindow(view?: BrowserWindowLike | null): BrowserWindowLike | null {
  if (view !== undefined) return view;
  if (typeof window === "undefined") return null;
  return window as unknown as BrowserWindowLike;
}

function normalizeBase58(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (!value || typeof value !== "object") return null;

  const maybe = value as Base58PublicKeyLike;
  if (typeof maybe.toBase58 === "function") {
    const base58 = maybe.toBase58();
    return base58?.trim() ? base58 : null;
  }
  if (typeof maybe.toString === "function") {
    const stringValue = maybe.toString();
    return stringValue && stringValue !== "[object Object]" ? stringValue : null;
  }
  return null;
}

function extractSignature(result: InjectedSendResult): string {
  const raw =
    typeof result === "string" || result instanceof Uint8Array
      ? result
      : result.signature;

  if (!raw) {
    throw new Error("Wallet did not return a transaction signature.");
  }

  return typeof raw === "string" ? raw : bs58.encode(raw);
}

function resolveInjectedProvider(
  type: Exclude<WalletType, "metamask">,
  view?: BrowserWindowLike | null
): InjectedSolanaProvider | null {
  const browserWindow = getBrowserWindow(view);
  if (!browserWindow) return null;

  switch (type) {
    case "phantom": {
      const phantom = browserWindow.phantom?.solana;
      if (phantom) return phantom;
      return browserWindow.solana?.isPhantom ? browserWindow.solana : null;
    }
    case "solflare": {
      const solflare = browserWindow.solflare;
      if (solflare?.isSolflare) return solflare;
      return solflare && typeof solflare.connect === "function" ? solflare : null;
    }
    case "okx":
      return browserWindow.okxwallet?.solana ?? null;
  }
}

function hasMetaMaskExtension(view?: BrowserWindowLike | null): boolean {
  const browserWindow = getBrowserWindow(view);
  const ethereum = browserWindow?.ethereum;
  if (!ethereum) return false;
  if (ethereum.isMetaMask) return true;
  return Array.isArray(ethereum.providers)
    ? ethereum.providers.some((provider) => provider?.isMetaMask)
    : false;
}

export function getClientSolanaNetwork(
  cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
  rpcUrl = CLIENT_SOLANA_RPC
): SolanaNetwork {
  const normalizedCluster = cluster?.trim().toLowerCase();
  if (normalizedCluster === "devnet") return "devnet";
  if (normalizedCluster === "testnet") return "testnet";
  if (normalizedCluster === "mainnet" || normalizedCluster === "mainnet-beta") {
    return "mainnet";
  }

  const normalizedRpc = rpcUrl.toLowerCase();
  if (normalizedRpc.includes("devnet")) return "devnet";
  if (normalizedRpc.includes("testnet")) return "testnet";
  return "mainnet";
}

export function getClientSolanaRpcUrl(): string {
  return CLIENT_SOLANA_RPC;
}

export function getSolanaWalletAvailability(
  view?: BrowserWindowLike | null
): SolanaWalletAvailability[] {
  const browserWindow = getBrowserWindow(view);
  const phantomInstalled = !!resolveInjectedProvider("phantom", browserWindow);
  const solflareInstalled = !!resolveInjectedProvider("solflare", browserWindow);
  const okxInstalled = !!resolveInjectedProvider("okx", browserWindow);
  const metaMaskInstalled = hasMetaMaskExtension(browserWindow);

  return [
    {
      type: "phantom",
      ...WALLET_META.phantom,
      available: phantomInstalled,
      installed: phantomInstalled,
      title: phantomInstalled ? "Pay with Phantom" : "Phantom not installed",
    },
    {
      type: "solflare",
      ...WALLET_META.solflare,
      available: solflareInstalled,
      installed: solflareInstalled,
      title: solflareInstalled ? "Pay with Solflare" : "Solflare not installed",
    },
    {
      type: "okx",
      ...WALLET_META.okx,
      available: okxInstalled,
      installed: okxInstalled,
      title: okxInstalled ? "Pay with OKX" : "OKX Wallet not installed",
    },
    {
      type: "metamask",
      ...WALLET_META.metamask,
      available: browserWindow != null,
      installed: metaMaskInstalled,
      title: metaMaskInstalled
        ? "Pay with MetaMask"
        : "Connect with MetaMask via the extension or mobile app",
    },
  ];
}

async function connectInjectedProvider(
  type: Exclude<WalletType, "metamask">
): Promise<{ address: string; provider: InjectedSolanaProvider }> {
  const provider = resolveInjectedProvider(type);
  if (!provider) {
    throw new Error(`${WALLET_META[type].name} not detected. Install and unlock the wallet, then try again.`);
  }
  if (typeof provider.connect !== "function") {
    throw new Error(`${WALLET_META[type].name} does not expose a connect() method.`);
  }

  const response = await provider.connect();
  const address = normalizeBase58(response?.publicKey ?? provider.publicKey);
  if (!address) {
    throw new Error(`${WALLET_META[type].name} did not return a Solana account.`);
  }

  return { address, provider };
}

async function sendInjectedTransaction(
  walletType: Exclude<WalletType, "metamask">,
  provider: InjectedSolanaProvider,
  transaction: Transaction,
  connection: Connection
): Promise<string> {
  if (typeof provider.signAndSendTransaction === "function") {
    const result = await provider.signAndSendTransaction(transaction, {
      maxRetries: 3,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
    return extractSignature(result);
  }

  if (typeof provider.signTransaction === "function") {
    const signed = await provider.signTransaction(transaction);
    return connection.sendRawTransaction(signed.serialize(), {
      maxRetries: 3,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
  }

  throw new Error(`${WALLET_META[walletType].name} cannot sign transactions in this browser.`);
}

async function getMetaMaskClient(): Promise<SolanaClient> {
  if (!metaMaskClientPromise) {
    metaMaskClientPromise = import("@metamask/connect-solana").then(
      async ({ createSolanaClient }) =>
        createSolanaClient({
          dapp: {
            name: "KharchaPay",
            url: window.location.origin,
          },
          api: {
            supportedNetworks: {
              [getClientSolanaNetwork()]: getClientSolanaRpcUrl(),
            },
          },
        })
    );
  }

  return metaMaskClientPromise;
}

async function connectMetaMask(): Promise<{
  account: WalletAccount;
  wallet: MetaMaskWallet;
}> {
  const client = await getMetaMaskClient();
  const wallet = client.getWallet() as MetaMaskWallet;
  const { accounts } = await wallet.features[StandardConnect].connect();
  const account = accounts[0] ?? wallet.accounts[0];

  if (!account) {
    throw new Error("MetaMask did not return a Solana account.");
  }

  return {
    account,
    wallet,
  };
}

async function sendMetaMaskTransaction(
  wallet: MetaMaskWallet,
  account: WalletAccount,
  transaction: Transaction,
  connection: Connection
): Promise<string> {
  const chain = SOLANA_CAIP_IDS[getClientSolanaNetwork()];
  const serialized = transaction.serialize({ verifySignatures: false });

  const signAndSend = wallet.features[SolanaSignAndSendTransaction];
  if (signAndSend) {
    const [result] = await signAndSend.signAndSendTransaction({
      account,
      chain,
      transaction: serialized,
      options: {
        commitment: "confirmed",
        maxRetries: 3,
        skipPreflight: false,
      },
    });

    if (!result?.signature) {
      throw new Error("MetaMask did not return a transaction signature.");
    }

    return bs58.encode(result.signature);
  }

  const signOnly = wallet.features[SolanaSignTransaction];
  if (!signOnly) {
    throw new Error("MetaMask does not support Solana transaction signing in this browser.");
  }

  const [result] = await signOnly.signTransaction({
    account,
    chain,
    transaction: serialized,
    options: {
      preflightCommitment: "confirmed",
    },
  });

  return connection.sendRawTransaction(result.signedTransaction, {
    maxRetries: 3,
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
}

export async function connectSolanaWallet(
  walletType: WalletType
): Promise<SolanaWalletSession> {
  if (walletType === "metamask") {
    const { account, wallet } = await connectMetaMask();
    return {
      address: account.address,
      name: WALLET_META.metamask.name,
      type: "metamask",
      sendLegacyTransaction: (transaction, connection) =>
        sendMetaMaskTransaction(wallet, account, transaction, connection),
    };
  }

  const { address, provider } = await connectInjectedProvider(walletType);
  return {
    address,
    name: WALLET_META[walletType].name,
    type: walletType,
    sendLegacyTransaction: (transaction, connection) =>
      sendInjectedTransaction(walletType, provider, transaction, connection),
  };
}

export async function confirmSubmittedTransaction(
  connection: Connection,
  signature: string,
  latestBlockhash: {
    blockhash: string;
    lastValidBlockHeight: number;
  }
) {
  const result = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed"
  );

  if (result.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
  }
}
