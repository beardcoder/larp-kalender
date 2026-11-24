import { EventList } from "@/components/views/EventList.tsx";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ neu?: string }> }) {
  return <EventList onlyNew={(await searchParams).neu === "1"} />;
}
