/** Admin pages that re-render live when anything changes: the dashboard and the lists (never edit/detail pages, so nobody loses typing). */
const LIVE = /^\/admin(\/(orders|inventory|products|customers|analytics|marketing|marketing\/discounts|settings\/shipping))?\/?$/;
export const isLivePage = (pathname: string) => LIVE.test(pathname);
