import Link from "next/link";
import { requireAmbassador } from "@/lib/ambassador/auth";
import { announcementsList, notificationsFor } from "@/lib/ambassador/portal";
import { Card, PageTitle, day } from "@/components/ambassador/ui";
import { markReadAction } from "../../actions";

export const metadata = { title: "News" };

export default async function NewsPage() {
  const me = await requireAmbassador();
  const notes = notificationsFor(me.id);
  const news = announcementsList();
  const unread = notes.filter((n) => !n.read_at).length;
  return (
    <>
      <PageTitle kicker="UPDATES" title="News." />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="display text-[26px]">For you</h2>
        {unread > 0 && <form action={markReadAction}><button className="btn-ghost !min-h-12 !w-auto px-5">MARK ALL READ</button></form>}
      </div>
      {notes.length === 0 ? (
        <Card><p className="body-lg">Nothing yet. New sales, approvals and payouts show up here.</p></Card>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => {
            const inner = (
              <>
                <p className="mono">{day(n.created_at).toUpperCase()}{!n.read_at ? " · NEW" : ""}</p>
                <p className="mt-1 text-[19px] text-fg">{n.title}</p>
                {n.body && <p className="mt-1 text-[16px] text-body">{n.body}</p>}
              </>
            );
            return <li key={n.id} className={`${n.read_at ? "glass-flat" : "glass-accent"} rounded-[20px] p-4`}>{n.link ? <Link href={n.link} className="block">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
      <h2 className="display mb-3 mt-10 text-[26px]">From the team</h2>
      {news.length === 0 ? (
        <Card><p className="body-lg">No announcements yet.</p></Card>
      ) : (
        <ul className="space-y-3">
          {news.map((a) => (
            <li key={a.id} className="glass rounded-[20px] p-5">
              <p className="mono">{day(a.created_at).toUpperCase()}</p>
              <p className="display mt-1 text-[24px]">{a.title}</p>
              <p className="body-lg mt-2 whitespace-pre-line">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
