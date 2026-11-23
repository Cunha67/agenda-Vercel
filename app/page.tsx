import { redirect } from "next/navigation"
import { MedAgendaWorkspace } from "@/components/medagenda-workspace"
import type { MedAgendaData } from "@/lib/medagenda-types"
import { createClient } from "@/lib/supabase/server"

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "admin") redirect("/auth/no-access")

  const [patientsResult, doctorsResult, schedulesResult, appointmentsResult, blockedSlotsResult, clinicResult] = await Promise.all([
    supabase.from("patients").select("id, full_name, email, phone, birth_date, cpf, is_active, created_at").order("full_name"),
    supabase.from("doctors").select("id, full_name, email, phone, registration, bio, consultation_fee, specialty_id, is_active, specialties(name)").order("full_name"),
    supabase.from("schedules").select("id, doctor_id, clinic_id, weekday, start_time, end_time, slot_duration_minutes").order("weekday"),
    supabase.from("appointments").select("id, patient_id, doctor_id, specialty_id, clinic_id, starts_at, ends_at, appointment_type, status, notes, patients(full_name), doctors(full_name), specialties(name)").order("starts_at", { ascending: false }),
    supabase.from("blocked_slots").select("id, doctor_id, starts_at, ends_at, reason").order("starts_at"),
    supabase.from("clinics").select("id, name, address, phone, email, opening_hours").order("created_at").limit(1).maybeSingle(),
  ])

  const doctors = (doctorsResult.data ?? []).map((doctor) => ({
    ...doctor,
    specialties: normalizeRelation(doctor.specialties),
  }))
  const appointments = (appointmentsResult.data ?? []).map((appointment) => ({
    ...appointment,
    patients: normalizeRelation(appointment.patients),
    doctors: normalizeRelation(appointment.doctors),
    specialties: normalizeRelation(appointment.specialties),
  }))

  const data: MedAgendaData = {
    patients: patientsResult.data ?? [],
    doctors,
    schedules: schedulesResult.data ?? [],
    appointments,
    blockedSlots: blockedSlotsResult.data ?? [],
    clinic: clinicResult.data,
    profileName: profile.full_name || user.email || "Administrador",
    loadError: Boolean(patientsResult.error || doctorsResult.error || schedulesResult.error || appointmentsResult.error || blockedSlotsResult.error || clinicResult.error),
  }

  return <MedAgendaWorkspace key={JSON.stringify(data)} initialData={data} userEmail={user.email ?? ""} />
}
