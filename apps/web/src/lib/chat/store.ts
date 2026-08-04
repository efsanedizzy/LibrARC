import postgres, { type Sql } from "postgres";

type ChatEnvironment = {
  DATABASE_URL?: string;
};

export type StoredChatNonce = {
  chainId: number;
  expiresAt: Date;
  id: string;
  issuedAt: Date;
  nonceHash: string;
  tokenAddress?: string;
  usedAt?: Date | null;
  walletAddress: string;
};

export type StoredChatSession = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  revokedAt?: Date | null;
  sessionTokenHash: string;
  walletAddress: string;
};

export type StoredChatMessage = {
  body: string;
  createdAt: Date;
  id: bigint;
  tokenAddress: string;
  walletAddress: string;
};

export type ChatStore = {
  countMessagesSince(args: { since: Date; walletAddress: string }): Promise<number>;
  createMessage(args: {
    body: string;
    tokenAddress: string;
    walletAddress: string;
  }): Promise<StoredChatMessage>;
  createNonce(args: {
    chainId: number;
    expiresAt: Date;
    nonceHash: string;
    tokenAddress?: string;
    walletAddress: string;
  }): Promise<void>;
  createSession(args: {
    expiresAt: Date;
    sessionTokenHash: string;
    walletAddress: string;
  }): Promise<void>;
  getLatestMessageByWallet(walletAddress: string): Promise<StoredChatMessage | null>;
  getSessionByHash(sessionTokenHash: string): Promise<StoredChatSession | null>;
  listMessages(args: { cursor?: bigint | null; limit: number; tokenAddress: string }): Promise<{
    hasMore: boolean;
    messages: StoredChatMessage[];
    totalCount?: number;
  }>;
  useNonce(args: {
    chainId: number;
    nonceHash: string;
    walletAddress: string;
  }): Promise<StoredChatNonce | null>;
};

let cachedSignature: string | null = null;
let cachedSql: Sql | null = null;

function getDatabaseUrl(env: ChatEnvironment = process.env as ChatEnvironment) {
  const value = env.DATABASE_URL?.trim();

  return value ? value : null;
}

function getSqlClient() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  if (!cachedSql || cachedSignature !== databaseUrl) {
    cachedSignature = databaseUrl;
    cachedSql = postgres(databaseUrl, {
      connect_timeout: 5,
      idle_timeout: 10,
      max: 2,
      prepare: false
    });
  }

  return cachedSql;
}

function mapNonce(row: Record<string, unknown>): StoredChatNonce {
  return {
    chainId: Number(row.chain_id),
    expiresAt: new Date(String(row.expires_at)),
    id: String(row.id),
    issuedAt: new Date(String(row.issued_at)),
    nonceHash: String(row.nonce_hash),
    tokenAddress: row.token_address ? String(row.token_address) : undefined,
    usedAt: row.used_at ? new Date(String(row.used_at)) : null,
    walletAddress: String(row.wallet_address)
  };
}

function mapSession(row: Record<string, unknown>): StoredChatSession {
  return {
    createdAt: new Date(String(row.created_at)),
    expiresAt: new Date(String(row.expires_at)),
    id: String(row.id),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)) : null,
    sessionTokenHash: String(row.session_token_hash),
    walletAddress: String(row.wallet_address)
  };
}

function mapMessage(row: Record<string, unknown>): StoredChatMessage {
  return {
    body: String(row.body),
    createdAt: new Date(String(row.created_at)),
    id: BigInt(String(row.id)),
    tokenAddress: String(row.token_address),
    walletAddress: String(row.wallet_address)
  };
}

export function getChatStore(): ChatStore | null {
  const sql = getSqlClient();

  if (!sql) {
    return null;
  }

  return {
    async countMessagesSince({ since, walletAddress }) {
      const result = await sql<{ count: string }[]>`
        select count(*)::text as count
        from chat_messages
        where wallet_address = ${walletAddress}
          and deleted_at is null
          and created_at >= ${since.toISOString()}
      `;

      return Number(result[0]?.count ?? "0");
    },
    async createMessage({ body, tokenAddress, walletAddress }) {
      const rows = await sql<Record<string, unknown>[]>`
        insert into chat_messages (token_address, wallet_address, body)
        values (${tokenAddress}, ${walletAddress}, ${body})
        returning id, token_address, wallet_address, body, created_at
      `;

      return mapMessage(rows[0]);
    },
    async createNonce({ chainId, expiresAt, nonceHash, tokenAddress, walletAddress }) {
      await sql`
        insert into chat_nonces (wallet_address, nonce_hash, chain_id, token_address, expires_at)
        values (${walletAddress}, ${nonceHash}, ${chainId}, ${tokenAddress ?? null}, ${expiresAt.toISOString()})
      `;
    },
    async createSession({ expiresAt, sessionTokenHash, walletAddress }) {
      await sql`
        insert into chat_sessions (wallet_address, session_token_hash, expires_at)
        values (${walletAddress}, ${sessionTokenHash}, ${expiresAt.toISOString()})
      `;
    },
    async getLatestMessageByWallet(walletAddress) {
      const rows = await sql<Record<string, unknown>[]>`
        select id, token_address, wallet_address, body, created_at
        from chat_messages
        where wallet_address = ${walletAddress}
          and deleted_at is null
        order by created_at desc
        limit 1
      `;

      return rows[0] ? mapMessage(rows[0]) : null;
    },
    async getSessionByHash(sessionTokenHash) {
      const rows = await sql<Record<string, unknown>[]>`
        select id, wallet_address, session_token_hash, created_at, expires_at, revoked_at
        from chat_sessions
        where session_token_hash = ${sessionTokenHash}
        limit 1
      `;

      return rows[0] ? mapSession(rows[0]) : null;
    },
    async listMessages({ cursor, limit, tokenAddress }) {
      const rows = cursor
        ? await sql<Record<string, unknown>[]>`
            select id, token_address, wallet_address, body, created_at
            from chat_messages
            where token_address = ${tokenAddress}
              and deleted_at is null
              and id < ${cursor.toString(10)}
            order by id desc
            limit ${limit + 1}
          `
        : await sql<Record<string, unknown>[]>`
            select id, token_address, wallet_address, body, created_at
            from chat_messages
            where token_address = ${tokenAddress}
              and deleted_at is null
            order by id desc
            limit ${limit + 1}
          `;
      const countRows = await sql<{ count: string }[]>`
        select count(*)::text as count
        from chat_messages
        where token_address = ${tokenAddress}
          and deleted_at is null
      `;
      const hasMore = rows.length > limit;
      const visibleRows = hasMore ? rows.slice(0, limit) : rows;

      return {
        hasMore,
        messages: visibleRows.reverse().map(mapMessage),
        totalCount: Number(countRows[0]?.count ?? "0")
      };
    },
    async useNonce({ chainId, nonceHash, walletAddress }) {
      const rows = await sql<Record<string, unknown>[]>`
        update chat_nonces
        set used_at = timezone('utc', now())
        where nonce_hash = ${nonceHash}
          and wallet_address = ${walletAddress}
          and chain_id = ${chainId}
          and used_at is null
          and expires_at > timezone('utc', now())
        returning id, wallet_address, nonce_hash, chain_id, token_address, issued_at, expires_at, used_at
      `;

      return rows[0] ? mapNonce(rows[0]) : null;
    }
  };
}
