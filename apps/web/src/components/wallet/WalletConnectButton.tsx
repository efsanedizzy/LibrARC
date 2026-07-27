import { Button } from "../ui/Button";

export function WalletConnectButton() {
  return (
    <Button
      aria-describedby="wallet-connect-placeholder"
      disabled
      size="sm"
      title="Wallet connection is not implemented in this placeholder."
      variant="secondary"
    >
      Connect Wallet
      <span
        aria-hidden="true"
        className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] uppercase tracking-[0.24em] text-cyan-200/80"
      >
        Soon
      </span>
      <span className="sr-only" id="wallet-connect-placeholder">
        Visual placeholder only. Wallet functionality is not implemented.
      </span>
    </Button>
  );
}
