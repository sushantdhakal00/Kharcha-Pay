import { describe, expect, it } from "vitest";
import {
  getClientSolanaNetwork,
  getSolanaWalletAvailability,
} from "../browser-wallets";

describe("browser wallet helpers", () => {
  it("maps mainnet-beta to MetaMask's mainnet network key", () => {
    expect(getClientSolanaNetwork("mainnet-beta")).toBe("mainnet");
  });

  it("infers devnet from the public RPC URL", () => {
    expect(
      getClientSolanaNetwork(undefined, "https://api.devnet.solana.com")
    ).toBe("devnet");
  });

  it("detects injected Phantom from window.solana", () => {
    const availability = getSolanaWalletAvailability({
      solana: {
        isPhantom: true,
      },
    });

    expect(availability.find((wallet) => wallet.type === "phantom")?.available).toBe(
      true
    );
  });

  it("keeps MetaMask available through MetaMask Connect even without the extension", () => {
    const availability = getSolanaWalletAvailability({});
    const metamask = availability.find((wallet) => wallet.type === "metamask");

    expect(metamask?.available).toBe(true);
    expect(metamask?.installed).toBe(false);
  });
});
