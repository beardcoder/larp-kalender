import { notFound } from "next/navigation";
import { getApp } from "@/lib/server/app.ts";
import { EventForm } from "./EventForm.tsx";

export default async function EventEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ neu?: string }> }) {
  const { id } = await params;
  if (id === "neu") return <EventForm event={null} />;
  const event = getApp().getEvent(Number(id));
  if (!event || !/^\d+$/.test(id)) notFound();
  return <EventForm event={event} created={(await searchParams).neu === "1"} />;
}
