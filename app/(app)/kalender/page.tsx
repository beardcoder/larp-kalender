import { CalendarView } from "@/components/views/Calendar.tsx";

export const metadata = { title: "Kalender" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  return <CalendarView month={(await searchParams).monat} />;
}
