import Link from "next/link";

// Rendered (with an HTTP 403) when a signed-in person's role isn't allowed to do something.
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5">
      <p className="mono mb-3">403</p>
      <h1 className="display text-[clamp(1.9rem,1.2rem+3vw,3rem)]">Not for your role.</h1>
      <p className="body-lg mt-4">You don&apos;t have access to this. Ask the store owner if you need it.</p>
      <Link href="/admin" className="btn mt-8 !w-fit">BACK TO DASHBOARD</Link>
    </main>
  );
}
