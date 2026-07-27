import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.5/+esm";

const ARC_TESTNET = {
  chainIdHex: "0x4cef52",
  chainIdDec: 5042002,
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
};

const DEFAULTS = {
  contractAddress: "",
  usdcAddress: "0x3600000000000000000000000000000000000000",
};

const STATUS_LABELS = [
  "Open",
  "Cancelled",
  "Funded",
  "Submitted",
  "Approved",
  "Rejected",
  "Refunded",
];

const ESCROW_ABI = [
  "error ZeroAddress()",
  "error InvalidAmount()",
  "error InvalidDeadline()",
  "error JobNotFound()",
  "error NotClient()",
  "error NotAgent()",
  "error NotEvaluator()",
  "error InvalidStatus()",
  "error DeadlineNotReached()",
  "error JobExpired()",
  "error TransferFailed()",
  "function usdc() view returns (address)",
  "function jobCount() view returns (uint256)",
  "function createJob(address agent,address evaluator,uint256 amount,uint64 deadline,string metadataURI) returns (uint256)",
  "function cancelJob(uint256 jobId)",
  "function fundJob(uint256 jobId)",
  "function submitDeliverable(uint256 jobId,string deliverableHash)",
  "function approveJob(uint256 jobId,string resolutionHash)",
  "function rejectJob(uint256 jobId,string resolutionHash)",
  "function claimRefund(uint256 jobId)",
  "function canClaimRefund(uint256 jobId) view returns (bool)",
  "function getJob(uint256 jobId) view returns (uint256 id,address client,address agent,address evaluator,uint256 amount,uint64 deadline,string metadataURI,string deliverableHash,string resolutionHash,uint8 status,uint64 createdAt,uint64 fundedAt,uint64 submittedAt,uint64 resolvedAt)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

const state = {
  provider: null,
  signer: null,
  account: null,
  network: null,
  contract: null,
  usdc: null,
  decimals: 6,
  jobs: [],
};

const $ = (id) => document.getElementById(id);
const walletAddressEl = $("walletAddress");
const networkNameEl = $("networkName");
const usdcBalanceEl = $("usdcBalance");
const jobCountEl = $("jobCount");
const syncStatusEl = $("syncStatus");
const contractAddressEl = $("contractAddress");
const usdcAddressEl = $("usdcAddress");
const jobsListEl = $("jobsList");
const activityLogEl = $("activityLog");

document.addEventListener("DOMContentLoaded", () => {
  loadSavedConfig();
  bindEvents();
  bootstrap();
});

async function bootstrap() {
  if (!window.ethereum) {
    log("MetaMask gerekli", "Tarayicida EVM cuzdani bulunamadi. MetaMask veya uyumlu bir wallet ac.");
    syncStatusEl.textContent = "No wallet";
    return;
  }

  state.provider = new ethers.BrowserProvider(window.ethereum);
  await detectConnection(false);

  window.ethereum.on("accountsChanged", async () => {
    await detectConnection(true);
  });

  window.ethereum.on("chainChanged", async () => {
    await detectConnection(true);
  });
}

function bindEvents() {
  $("connectButton").addEventListener("click", connectWallet);
  $("switchNetworkButton").addEventListener("click", switchToArcNetwork);
  $("saveConfigButton").addEventListener("click", saveConfig);
  $("refreshButton").addEventListener("click", refreshAll);

  $("createJobForm").addEventListener("submit", handleCreateJob);
  $("approveForm").addEventListener("submit", handleApproveUsdc);
  $("fundForm").addEventListener("submit", handleFundJob);
  $("submitForm").addEventListener("submit", handleSubmitDeliverable);
  $("refundForm").addEventListener("submit", handleRefund);
  $("approveJobButton").addEventListener("click", () => handleResolution("approve"));
  $("rejectJobButton").addEventListener("click", () => handleResolution("reject"));
  jobsListEl.addEventListener("click", handleJobsListClick);
}

function loadSavedConfig() {
  const saved = JSON.parse(localStorage.getItem("arcTaskFlowConfig") || "{}");
  contractAddressEl.value = saved.contractAddress || DEFAULTS.contractAddress;
  usdcAddressEl.value = saved.usdcAddress || DEFAULTS.usdcAddress;
}

function saveConfig() {
  localStorage.setItem(
    "arcTaskFlowConfig",
    JSON.stringify({
      contractAddress: contractAddressEl.value.trim(),
      usdcAddress: usdcAddressEl.value.trim() || DEFAULTS.usdcAddress,
    }),
  );
  log("Konfig kaydedildi", "Kontrat ve USDC adresleri tarayiciya kaydedildi.");
  hydrateContracts();
  void refreshAll();
}

async function connectWallet() {
  try {
    syncStatus("Connecting");
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await detectConnection(true);
  } catch (error) {
    logError("Cuzdan baglanamadi", error);
  }
}

async function detectConnection(refreshAfter = false) {
  if (!state.provider) return;

  const accounts = await state.provider.listAccounts();
  const network = await state.provider.getNetwork();
  state.network = network;

  networkNameEl.textContent =
    Number(network.chainId) === ARC_TESTNET.chainIdDec
      ? "Arc Testnet"
      : `Chain ${network.chainId}`;

  if (accounts.length > 0) {
    state.signer = await state.provider.getSigner();
    state.account = await state.signer.getAddress();
    walletAddressEl.textContent = shorten(state.account);
  } else {
    state.signer = null;
    state.account = null;
    walletAddressEl.textContent = "Not connected";
  }

  hydrateContracts();

  if (refreshAfter && state.account && state.contract) {
    await refreshAll();
  } else if (state.account) {
    await refreshWalletOnly();
  }
}

function hydrateContracts() {
  const contractAddress = contractAddressEl.value.trim();
  const usdcAddress = usdcAddressEl.value.trim() || DEFAULTS.usdcAddress;

  state.contract = null;
  state.usdc = null;

  if (ethers.isAddress(usdcAddress) && state.provider) {
    state.usdc = new ethers.Contract(usdcAddress, ERC20_ABI, state.provider);
  }

  if (ethers.isAddress(contractAddress) && state.provider) {
    state.contract = new ethers.Contract(contractAddress, ESCROW_ABI, state.provider);
  }
}

async function switchToArcNetwork() {
  if (!window.ethereum) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET.chainIdHex }],
    });
    await detectConnection(true);
  } catch (error) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ARC_TESTNET.chainIdHex,
            chainName: ARC_TESTNET.chainName,
            rpcUrls: ARC_TESTNET.rpcUrls,
            blockExplorerUrls: ARC_TESTNET.blockExplorerUrls,
            nativeCurrency: ARC_TESTNET.nativeCurrency,
          },
        ],
      });
      await detectConnection(true);
    } else {
      logError("Arc agina gecilemedi", error);
    }
  }
}

async function refreshAll() {
  try {
    syncStatus("Refreshing");
    hydrateContracts();
    await refreshWalletOnly();
    await refreshJobs();
    syncStatus("Synced");
  } catch (error) {
    logError("Veriler yenilenemedi", error);
    syncStatus("Error");
  }
}

async function refreshWalletOnly() {
  if (!state.account || !state.usdc) return;

  const decimals = Number(await state.usdc.decimals());
  state.decimals = decimals;

  const balance = await state.usdc.balanceOf(state.account);
  usdcBalanceEl.textContent = `${formatToken(balance, decimals)} USDC`;
}

async function refreshJobs() {
  if (!state.contract) {
    state.jobs = [];
    jobCountEl.textContent = "0";
    jobsListEl.className = "job-list empty-state";
    jobsListEl.textContent = "Escrow contract address girildiginde job listesi burada gorunecek.";
    return;
  }

  const count = Number(await state.contract.jobCount());
  jobCountEl.textContent = String(count);

  if (count === 0) {
    state.jobs = [];
    jobsListEl.className = "job-list empty-state";
    jobsListEl.textContent = "Henuz job yok. Ilk escrow isini olustur.";
    return;
  }

  const jobs = [];
  for (let jobId = count; jobId >= 1; jobId -= 1) {
    const raw = await state.contract.getJob(jobId);
    let refundable = false;

    try {
      refundable = await state.contract.canClaimRefund(jobId);
    } catch {
      refundable = false;
    }

    jobs.push(normalizeJob(raw, refundable));
  }

  state.jobs = jobs;
  renderJobs();
}

function normalizeJob(raw, refundable) {
  return {
    id: Number(raw.id),
    client: raw.client,
    agent: raw.agent,
    evaluator: raw.evaluator,
    amount: raw.amount,
    deadline: Number(raw.deadline),
    metadataURI: raw.metadataURI,
    deliverableHash: raw.deliverableHash,
    resolutionHash: raw.resolutionHash,
    status: Number(raw.status),
    createdAt: Number(raw.createdAt),
    fundedAt: Number(raw.fundedAt),
    submittedAt: Number(raw.submittedAt),
    resolvedAt: Number(raw.resolvedAt),
    refundable,
  };
}

function renderJobs() {
  jobsListEl.className = "job-list";
  jobsListEl.innerHTML = "";

  for (const job of state.jobs) {
    const card = document.createElement("article");
    card.className = "job-card";

    const statusLabel = STATUS_LABELS[job.status] || "Unknown";
    const metadataLink = safeLink(job.metadataURI);
    const deliverableLink = safeLink(job.deliverableHash);
    const resolutionLink = safeLink(job.resolutionHash);

    card.innerHTML = `
      <div class="job-meta">
        <h3>Job #${job.id}</h3>
        <span class="job-status status-${statusLabel.toLowerCase()}">${statusLabel}</span>
      </div>
      <div class="job-grid">
        <div class="job-stat">
          <span>Budget</span>
          <strong>${formatToken(job.amount, state.decimals)} USDC</strong>
        </div>
        <div class="job-stat">
          <span>Deadline</span>
          <strong>${formatDate(job.deadline)}</strong>
        </div>
        <div class="job-stat">
          <span>Client</span>
          <strong>${shorten(job.client)}</strong>
        </div>
        <div class="job-stat">
          <span>Agent</span>
          <strong>${shorten(job.agent)}</strong>
        </div>
        <div class="job-stat">
          <span>Evaluator</span>
          <strong>${shorten(job.evaluator)}</strong>
        </div>
        <div class="job-stat">
          <span>Refund Window</span>
          <strong>${job.refundable ? "Refund available" : "Not available"}</strong>
        </div>
        <div class="job-stat">
          <span>Brief</span>
          ${metadataLink}
        </div>
        <div class="job-stat">
          <span>Deliverable</span>
          ${deliverableLink}
        </div>
        <div class="job-stat">
          <span>Resolution</span>
          ${resolutionLink}
        </div>
        <div class="job-stat">
          <span>Lifecycle</span>
          <strong>Created ${formatDate(job.createdAt)}${job.resolvedAt ? ` | Resolved ${formatDate(job.resolvedAt)}` : ""}</strong>
        </div>
      </div>
      <div class="job-actions">
        <button type="button" class="small-button" data-fill="fund" data-job="${job.id}" data-amount="${formatToken(job.amount, state.decimals)}">Fill Fund Form</button>
        <button type="button" class="small-button" data-fill="submit" data-job="${job.id}">Fill Submit Form</button>
        <button type="button" class="small-button" data-fill="resolve" data-job="${job.id}">Fill Resolve Form</button>
        <button type="button" class="small-button" data-fill="refund" data-job="${job.id}">Fill Refund Form</button>
        <a class="text-link" href="${ARC_TESTNET.blockExplorerUrls[0]}/address/${contractAddressEl.value.trim()}" target="_blank" rel="noreferrer">Contract</a>
      </div>
    `;

    jobsListEl.appendChild(card);
  }
}

function handleJobsListClick(event) {
  const button = event.target.closest("[data-fill]");
  if (!button) return;
  fillRelatedForm(button.dataset.fill, button.dataset.job, button.dataset.amount);
}

function fillRelatedForm(type, jobId, amount) {
  if (type === "fund") {
    document.querySelector('#approveForm [name="amount"]').value = amount;
    document.querySelector('#fundForm [name="jobId"]').value = jobId;
    log("Form dolduruldu", `Fund formu Job #${jobId} icin hazirlandi.`);
  }

  if (type === "submit") {
    document.querySelector('#submitForm [name="jobId"]').value = jobId;
    log("Form dolduruldu", `Submit formu Job #${jobId} icin hazirlandi.`);
  }

  if (type === "resolve") {
    document.querySelector('#resolveForm [name="jobId"]').value = jobId;
    document.querySelector('#refundForm [name="jobId"]').value = jobId;
    log("Form dolduruldu", `Resolve ve refund formlari Job #${jobId} icin hazirlandi.`);
  }

  if (type === "refund") {
    document.querySelector('#refundForm [name="jobId"]').value = jobId;
    log("Form dolduruldu", `Refund formu Job #${jobId} icin hazirlandi.`);
  }
}

async function handleCreateJob(event) {
  event.preventDefault();
  const formElement = $("createJobForm");
  const form = new FormData(formElement);

  try {
    await requireSigner();
    const contract = signerContract();
    const amount = parseUsdc(form.get("amount"));
    const deadline = toUnix(form.get("deadline"));

    const tx = await contract.createJob(
      String(form.get("agent")).trim(),
      String(form.get("evaluator")).trim(),
      amount,
      deadline,
      String(form.get("metadata")).trim(),
    );

    await waitForTx("Job olusturuluyor", tx);
    formElement.reset();
    await refreshAll();
  } catch (error) {
    logError("Job olusturma basarisiz", error);
  }
}

async function handleApproveUsdc(event) {
  event.preventDefault();
  try {
    await requireSigner();
    const usdc = signerUsdc();
    const form = new FormData($("approveForm"));
    const amount = parseUsdc(form.get("amount"));
    const spender = contractAddressEl.value.trim();

    if (!ethers.isAddress(spender)) {
      throw new Error("Gecerli escrow contract address gir.");
    }

    const tx = await usdc.approve(spender, amount);
    await waitForTx("USDC allowance onaylaniyor", tx);
    await refreshAll();
  } catch (error) {
    logError("USDC approve basarisiz", error);
  }
}

async function handleFundJob(event) {
  event.preventDefault();
  try {
    await requireSigner();
    const form = new FormData($("fundForm"));
    const contract = signerContract();
    const tx = await contract.fundJob(Number(form.get("jobId")));
    await waitForTx("Escrow fonlaniyor", tx);
    await refreshAll();
  } catch (error) {
    logError("Fund islemi basarisiz", error);
  }
}

async function handleSubmitDeliverable(event) {
  event.preventDefault();
  try {
    await requireSigner();
    const form = new FormData($("submitForm"));
    const contract = signerContract();
    const tx = await contract.submitDeliverable(
      Number(form.get("jobId")),
      String(form.get("deliverableHash")).trim(),
    );
    await waitForTx("Deliverable submit ediliyor", tx);
    await refreshAll();
  } catch (error) {
    logError("Submit basarisiz", error);
  }
}

async function handleResolution(mode) {
  try {
    await requireSigner();
    const form = new FormData($("resolveForm"));
    const contract = signerContract();
    const jobId = Number(form.get("jobId"));
    const resolutionHash = String(form.get("resolutionHash")).trim();

    const tx =
      mode === "approve"
        ? await contract.approveJob(jobId, resolutionHash)
        : await contract.rejectJob(jobId, resolutionHash);

    await waitForTx(mode === "approve" ? "Job approve ediliyor" : "Job reject ediliyor", tx);
    await refreshAll();
  } catch (error) {
    logError(mode === "approve" ? "Approve basarisiz" : "Reject basarisiz", error);
  }
}

async function handleRefund(event) {
  event.preventDefault();
  try {
    await requireSigner();
    const form = new FormData($("refundForm"));
    const contract = signerContract();
    const jobId = Number(form.get("jobId"));
    const refundable = await state.contract.canClaimRefund(jobId);

    if (!refundable) {
      const job = state.jobs.find((item) => item.id === jobId);
      if (!job) {
        throw new Error("Job bulunamadi. Once Refresh Data yap.");
      }

      const status = STATUS_LABELS[job.status] || "Unknown";
      const deadlineMessage = `Deadline: ${formatDate(job.deadline)}`;
      throw new Error(`Refund henuz alinabilir degil. Status: ${status}. ${deadlineMessage}`);
    }

    const tx = await contract.claimRefund(jobId);
    await waitForTx("Refund talep ediliyor", tx);
    await refreshAll();
  } catch (error) {
    logError("Refund basarisiz", error);
  }
}

async function waitForTx(label, tx) {
  log(label, `Tx gonderildi: ${explorerLink(tx.hash)}`);
  syncStatus("Pending tx");
  const receipt = await tx.wait();
  log("Islem tamamlandi", `${label} | block ${receipt.blockNumber} | ${explorerLink(tx.hash)}`);
  syncStatus("Tx mined");
}

async function requireSigner() {
  if (!state.signer || !state.account) {
    throw new Error("Once cuzdan bagla.");
  }

  const network = await state.provider.getNetwork();
  if (Number(network.chainId) !== ARC_TESTNET.chainIdDec) {
    throw new Error("Once Arc Testnet agina gec.");
  }

  return state.signer;
}

function signerContract() {
  if (!state.contract) {
    throw new Error("Once escrow contract address gir.");
  }

  return state.contract.connect(state.signer);
}

function signerUsdc() {
  if (!state.usdc) {
    throw new Error("USDC kontrati yuklenemedi.");
  }

  return state.usdc.connect(state.signer);
}

function parseUsdc(value) {
  return ethers.parseUnits(String(value), state.decimals || 6);
}

function toUnix(value) {
  const timestamp = Math.floor(new Date(String(value)).getTime() / 1000);
  if (!Number.isFinite(timestamp) || timestamp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Deadline gelecekte bir tarih olmali.");
  }
  return timestamp;
}

function formatToken(value, decimals) {
  return Number(ethers.formatUnits(value, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function formatDate(unixSeconds) {
  if (!unixSeconds) return "-";
  return new Date(unixSeconds * 1000).toLocaleString();
}

function shorten(address) {
  if (!address || address === "Not connected") return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function syncStatus(text) {
  syncStatusEl.textContent = text;
}

function safeLink(value) {
  if (!value) return "<strong>-</strong>";
  const isUrl =
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("ipfs://") ||
    value.startsWith("ar://");

  return isUrl
    ? `<a class="text-link" href="${normalizeLink(value)}" target="_blank" rel="noreferrer">${truncateText(value, 42)}</a>`
    : `<strong>${truncateText(value, 42)}</strong>`;
}

function normalizeLink(value) {
  if (value.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${value.replace("ipfs://", "")}`;
  }
  return value;
}

function truncateText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function explorerLink(hash) {
  return `<a class="text-link" href="${ARC_TESTNET.blockExplorerUrls[0]}/tx/${hash}" target="_blank" rel="noreferrer">${shorten(hash)}</a>`;
}

function log(title, message) {
  const item = document.createElement("div");
  item.className = "log-item";
  item.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
  activityLogEl.prepend(item);
}

function logError(title, error) {
  console.error(error);
  const message = getReadableError(error);
  log(title, message);
  syncStatus("Error");
}

function getReadableError(error) {
  const candidate =
    error?.shortMessage ||
    error?.reason ||
    error?.revert?.name ||
    error?.info?.error?.message ||
    error?.message ||
    String(error);

  if (candidate === "DeadlineNotReached") {
    return "Refund icin deadline henuz gecmedi veya job refundable durumda degil.";
  }

  if (candidate === "NotClient") {
    return "Refund sadece isi olusturan client adresi tarafindan alinabilir.";
  }

  if (candidate === "InvalidStatus") {
    return "Bu islem mevcut job statusu icin gecerli degil.";
  }

  if (candidate === "JobExpired") {
    return "Bu islem icin deadline gecmis durumda.";
  }

  if (candidate === "NotAgent") {
    return "Submit islemini sadece agent adresi yapabilir.";
  }

  if (candidate === "NotEvaluator") {
    return "Approve veya reject islemini sadece evaluator adresi yapabilir.";
  }

  return candidate;
}
