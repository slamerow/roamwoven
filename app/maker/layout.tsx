import { requireMakerUser } from "@/lib/auth";

export default async function MakerLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireMakerUser("/maker");

  return children;
}
