import { TokenDetailsClient } from "../../../components/token/TokenDetailsClient";

type TokenPageProps = {
  params: Promise<{
    address: string;
  }>;
};

export default async function TokenPage({ params }: TokenPageProps) {
  const { address } = await params;

  return <TokenDetailsClient address={address} />;
}
