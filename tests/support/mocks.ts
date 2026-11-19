import { jar, reqHeaders } from "./state";

/** Shared mocks for the Next.js request APIs (the rest of the stack is real). */
export const navigationMock = {
  redirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
  forbidden: () => {
    throw new Error("HTTP_403");
  },
  unauthorized: () => {
    throw new Error("HTTP_401");
  },
  notFound: () => {
    throw new Error("HTTP_404");
  },
  usePathname: () => "/admin",
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
};

export const headersMock = {
  headers: async () => new Headers(reqHeaders),
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
  }),
};
