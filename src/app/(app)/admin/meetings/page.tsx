import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MeetingSettings } from "@/components/MeetingSettings";
import { getMeetingSettings } from "@/lib/config";
import { googleReady } from "@/lib/integrations/google";
import { fmtDay, fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminMeetings() {
  const [settings, upcoming, google] = await Promise.all([
    getMeetingSettings(),
    db.meeting.findMany({ where: { startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, take: 14 }),
    googleReady(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Meeting setup" sub="The weekly cadence, and the Google Meet link people join each meeting with." />
      <MeetingSettings initial={settings} google={google}
        upcoming={upcoming.map((m) => ({ id: m.id, title: m.title, when: `${fmtDay(m.startsAt)} · ${fmtTime(m.startsAt)}–${fmtTime(m.endsAt)}`, meetUrl: m.meetUrl ?? "" }))} />
    </div>
  );
}
