export type Patient = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  birth_date: string | null
  cpf: string | null
  is_active: boolean
  created_at: string
}

export type Doctor = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  registration: string
  bio: string | null
  consultation_fee: number | null
  specialty_id: string | null
  is_active: boolean
  specialties: { name: string } | null
}

export type Schedule = {
  id: string
  doctor_id: string
  clinic_id: string | null
  weekday: number
  start_time: string
  end_time: string
  slot_duration_minutes: number
}

export type Appointment = {
  id: string
  patient_id: string
  doctor_id: string
  specialty_id: string | null
  clinic_id: string | null
  starts_at: string
  ends_at: string
  appointment_type: string
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show"
  notes: string | null
  patients: { full_name: string } | null
  doctors: { full_name: string } | null
  specialties: { name: string } | null
}

export type BlockedSlot = {
  id: string
  doctor_id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

export type Clinic = {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  opening_hours: string | null
}

export type MedAgendaData = {
  patients: Patient[]
  doctors: Doctor[]
  schedules: Schedule[]
  appointments: Appointment[]
  blockedSlots: BlockedSlot[]
  clinic: Clinic | null
  profileName: string
  loadError: boolean
}
