import type { EventStatus, EventType, Genre, RegistrationStatus, UserRole } from "./vocab.ts";

/** Event as exposed by the public and admin APIs (camelCase). Dates are ISO `YYYY-MM-DD`, times `HH:MM`. */
export interface LarpEvent {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  genres: Genre[];
  eventType: EventType;
  tags: string[];
  organizer: string | null;
  venue: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  websiteUrl: string | null;
  registrationUrl: string | null;
  registrationOpens: string | null;
  registrationDeadline: string | null;
  registrationStatus: RegistrationStatus;
  priceText: string | null;
  priceMin: number | null;
  priceMax: number | null;
  minAge: number | null;
  capacity: number | null;
  imageUrl: string | null;
  contactEmail: string | null;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
}

/** Fields only visible in the admin backend and to MCP clients. */
export interface AdminLarpEvent extends LarpEvent {
  source: string;
  sourceUrl: string | null;
  notesInternal: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdByName: string | null;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ApiToken {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
