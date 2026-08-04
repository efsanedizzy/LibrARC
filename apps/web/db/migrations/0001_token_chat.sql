create table if not exists chat_nonces (
  id bigserial primary key,
  wallet_address text not null,
  nonce_hash text not null unique,
  chain_id integer not null,
  token_address text,
  issued_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists chat_nonces_wallet_expires_idx
  on chat_nonces (wallet_address, expires_at desc);

create index if not exists chat_nonces_expiry_idx
  on chat_nonces (expires_at desc);

create table if not exists chat_sessions (
  id bigserial primary key,
  wallet_address text not null,
  session_token_hash text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists chat_sessions_wallet_idx
  on chat_sessions (wallet_address, created_at desc);

create index if not exists chat_sessions_expiry_idx
  on chat_sessions (expires_at desc);

create table if not exists chat_messages (
  id bigserial primary key,
  token_address text not null,
  wallet_address text not null,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists chat_messages_token_created_idx
  on chat_messages (token_address, created_at desc);

create index if not exists chat_messages_wallet_created_idx
  on chat_messages (wallet_address, created_at desc);
