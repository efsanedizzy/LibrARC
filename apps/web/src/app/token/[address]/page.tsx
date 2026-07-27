type TokenPageProps = {
  params: Promise<{
    address: string;
  }>;
};

export default async function TokenPage({ params }: TokenPageProps) {
  const { address } = await params;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-24">
      <h1 className="text-4xl font-bold">Token Details</h1>

      <p className="mt-4 break-all text-gray-400">Token address: {address}</p>
    </main>
  );
}
