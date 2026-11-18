import Link from "next/link";

// Rendered (with an HTTP 401) when nobody is signed in.
export default function Unauthorized() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5">
      <p className="mono mb-3">401</p>
      <h1 className="display text-[clamp(1.9rem,1.2rem+3vw,3rem)]">Sign in first.</h1>
      <p className="body-lg mt-4">This area is for the MIEL+ team.</p>
      <Link href="/admin/login" className="btn mt-8 !w-fit">SIGN IN</Link>
    </main>
  );
}
