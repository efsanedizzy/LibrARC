// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract ArcAgentEscrowMarketplace {
    enum JobStatus {
        Open,
        Cancelled,
        Funded,
        Submitted,
        Approved,
        Rejected,
        Refunded
    }

    struct Job {
        uint256 id;
        address client;
        address agent;
        address evaluator;
        uint256 amount;
        uint64 deadline;
        string metadataURI;
        string deliverableHash;
        string resolutionHash;
        JobStatus status;
        uint64 createdAt;
        uint64 fundedAt;
        uint64 submittedAt;
        uint64 resolvedAt;
    }

    IERC20 public immutable usdc;
    uint256 public jobCount;

    mapping(uint256 => Job) private jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed agent,
        address evaluator,
        uint256 amount,
        uint64 deadline,
        string metadataURI
    );
    event JobCancelled(uint256 indexed jobId);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event DeliverableSubmitted(uint256 indexed jobId, address indexed agent, string deliverableHash);
    event JobApproved(uint256 indexed jobId, address indexed evaluator, string resolutionHash);
    event JobRejected(uint256 indexed jobId, address indexed evaluator, string resolutionHash);
    event JobRefunded(uint256 indexed jobId, address indexed caller);

    error ZeroAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error JobNotFound();
    error NotClient();
    error NotAgent();
    error NotEvaluator();
    error InvalidStatus();
    error DeadlineNotReached();
    error JobExpired();
    error TransferFailed();

    constructor(address usdcAddress) {
        if (usdcAddress == address(0)) revert ZeroAddress();
        usdc = IERC20(usdcAddress);
    }

    function createJob(
        address agent,
        address evaluator,
        uint256 amount,
        uint64 deadline,
        string calldata metadataURI
    ) external returns (uint256 jobId) {
        if (agent == address(0) || evaluator == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        jobId = ++jobCount;

        jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            agent: agent,
            evaluator: evaluator,
            amount: amount,
            deadline: deadline,
            metadataURI: metadataURI,
            deliverableHash: "",
            resolutionHash: "",
            status: JobStatus.Open,
            createdAt: uint64(block.timestamp),
            fundedAt: 0,
            submittedAt: 0,
            resolvedAt: 0
        });

        emit JobCreated(jobId, msg.sender, agent, evaluator, amount, deadline, metadataURI);
    }

    function cancelJob(uint256 jobId) external {
        Job storage job = _getExistingJob(jobId);
        if (job.client != msg.sender) revert NotClient();
        if (job.status != JobStatus.Open) revert InvalidStatus();

        job.status = JobStatus.Cancelled;
        job.resolvedAt = uint64(block.timestamp);

        emit JobCancelled(jobId);
    }

    function fundJob(uint256 jobId) external {
        Job storage job = _getExistingJob(jobId);
        if (job.client != msg.sender) revert NotClient();
        if (job.status != JobStatus.Open) revert InvalidStatus();
        if (block.timestamp > job.deadline) revert JobExpired();

        job.status = JobStatus.Funded;
        job.fundedAt = uint64(block.timestamp);

        bool ok = usdc.transferFrom(msg.sender, address(this), job.amount);
        if (!ok) revert TransferFailed();

        emit JobFunded(jobId, msg.sender, job.amount);
    }

    function submitDeliverable(uint256 jobId, string calldata deliverableHash) external {
        Job storage job = _getExistingJob(jobId);
        if (job.agent != msg.sender) revert NotAgent();
        if (job.status != JobStatus.Funded) revert InvalidStatus();
        if (block.timestamp > job.deadline) revert JobExpired();

        job.status = JobStatus.Submitted;
        job.deliverableHash = deliverableHash;
        job.submittedAt = uint64(block.timestamp);

        emit DeliverableSubmitted(jobId, msg.sender, deliverableHash);
    }

    function approveJob(uint256 jobId, string calldata resolutionHash) external {
        Job storage job = _getExistingJob(jobId);
        if (job.evaluator != msg.sender) revert NotEvaluator();
        if (job.status != JobStatus.Submitted) revert InvalidStatus();

        job.status = JobStatus.Approved;
        job.resolutionHash = resolutionHash;
        job.resolvedAt = uint64(block.timestamp);

        bool ok = usdc.transfer(job.agent, job.amount);
        if (!ok) revert TransferFailed();

        emit JobApproved(jobId, msg.sender, resolutionHash);
    }

    function rejectJob(uint256 jobId, string calldata resolutionHash) external {
        Job storage job = _getExistingJob(jobId);
        if (job.evaluator != msg.sender) revert NotEvaluator();
        if (job.status != JobStatus.Submitted) revert InvalidStatus();

        job.status = JobStatus.Rejected;
        job.resolutionHash = resolutionHash;
        job.resolvedAt = uint64(block.timestamp);

        bool ok = usdc.transfer(job.client, job.amount);
        if (!ok) revert TransferFailed();

        emit JobRejected(jobId, msg.sender, resolutionHash);
    }

    function claimRefund(uint256 jobId) external {
        Job storage job = _getExistingJob(jobId);
        if (job.client != msg.sender) revert NotClient();
        if (!_isRefundable(job)) revert DeadlineNotReached();

        job.status = JobStatus.Refunded;
        job.resolvedAt = uint64(block.timestamp);

        bool ok = usdc.transfer(job.client, job.amount);
        if (!ok) revert TransferFailed();

        emit JobRefunded(jobId, msg.sender);
    }

    function canClaimRefund(uint256 jobId) external view returns (bool) {
        Job storage job = _getExistingJob(jobId);
        return _isRefundable(job);
    }

    function getJob(
        uint256 jobId
    )
        external
        view
        returns (
            uint256 id,
            address client,
            address agent,
            address evaluator,
            uint256 amount,
            uint64 deadline,
            string memory metadataURI,
            string memory deliverableHash,
            string memory resolutionHash,
            JobStatus status,
            uint64 createdAt,
            uint64 fundedAt,
            uint64 submittedAt,
            uint64 resolvedAt
        )
    {
        Job storage job = _getExistingJob(jobId);

        return (
            job.id,
            job.client,
            job.agent,
            job.evaluator,
            job.amount,
            job.deadline,
            job.metadataURI,
            job.deliverableHash,
            job.resolutionHash,
            job.status,
            job.createdAt,
            job.fundedAt,
            job.submittedAt,
            job.resolvedAt
        );
    }

    function getUsdcAllowance(address owner) external view returns (uint256) {
        return usdc.allowance(owner, address(this));
    }

    function getUsdcBalance(address owner) external view returns (uint256) {
        return usdc.balanceOf(owner);
    }

    function _getExistingJob(uint256 jobId) internal view returns (Job storage job) {
        job = jobs[jobId];
        if (job.id == 0) revert JobNotFound();
    }

    function _isRefundable(Job storage job) internal view returns (bool) {
        bool activeEscrow = job.status == JobStatus.Funded || job.status == JobStatus.Submitted;
        return activeEscrow && block.timestamp > job.deadline;
    }
}
