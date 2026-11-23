"use client"

import { useMemo, useState, type FormEvent, type ComponentType, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Activity, ArrowRight, CalendarCheck2, CalendarDays, CalendarPlus, Clock3,
  FileText, LayoutDashboard, LogOut, Pencil, Plus, Search, Settings2,
  ShieldCheck, Stethoscope, UsersRound, X,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Appointment, BlockedSlot, Clinic, Doctor, MedAgendaData, Patient, Schedule } from "@/lib/medagenda-types"

type Section = "overview" | "patients" | "doctors" | "appointments" | "agenda" | "preferences"
type Modal = "patient" | "doctor" | "appointment" | "block" | null

const navigation: { id: Section; label: string; icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "patients", label: "Pacientes", icon: UsersRound },
  { id: "doctors", label: "Médicos", icon: Stethoscope },
  { id: "appointments", label: "Agendamentos", icon: CalendarCheck2 },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "preferences", label: "Preferências", icon: Settings2 },
]

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const weekdayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const statusLabels: Record<Appointment["status"], string> = {
  pending: "Pendente", confirmed: "Confirmado", in_progress: "Em atendimento",
  completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu",
}
const statusClasses: Record<Appointment["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-sky-50 text-sky-700",
  completed: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-50 text-rose-700",
  no_show: "bg-orange-50 text-orange-700",
}

function localDateValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
function formatDate(value: string) {
  const dateValue = value.length === 10 ? `${value}T12:00:00` : value
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(dateValue))
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
function formatClock(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}
function formatTime(value: string) {
  return value.slice(0, 5)
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
}
function ensureNoError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function Field({ label, value, onChange, type = "text", required = false, placeholder, min, step }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string; min?: string; step?: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <input className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#168679] focus:ring-4 focus:ring-[#168679]/10" min={min} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} step={step} type={type} value={value} />
    </label>
  )
}

function SelectField({ label, value, onChange, children, required = false }: {
  label: string; value: string; onChange: (value: string) => void; children: ReactNode; required?: boolean
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-800 outline-none transition focus:border-[#168679] focus:ring-4 focus:ring-[#168679]/10" onChange={(event) => onChange(event.target.value)} required={required} value={value}>
        {children}
      </select>
    </label>
  )
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-[#eaf5f3] text-[#147d71]"><FileText aria-hidden="true" className="size-5" /></div>
      <h3 className="mt-4 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function StatusBadge({ status }: { status: Appointment["status"] }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>{statusLabels[status]}</span>
}

export function MedAgendaWorkspace({ initialData, userEmail }: { initialData: MedAgendaData; userEmail: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [section, setSection] = useState<Section>("overview")
  const [modal, setModal] = useState<Modal>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(initialData.loadError ? { kind: "error", text: "Alguns dados não puderam ser carregados. Atualize a página ou verifique a conexão com o Supabase." } : null)
  const [search, setSearch] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [selectedDoctor, setSelectedDoctor] = useState("")
  const [agendaDate, setAgendaDate] = useState(localDateValue())
  const [appointmentFilter, setAppointmentFilter] = useState("all")
  const [patientForm, setPatientForm] = useState({ id: "", full_name: "", email: "", phone: "", birth_date: "", cpf: "" })
  const [doctorForm, setDoctorForm] = useState({ id: "", full_name: "", email: "", phone: "", registration: "", bio: "", consultation_fee: "", specialty: "", start_time: "09:00", end_time: "17:00", slot_duration_minutes: "30" })
  const [doctorDays, setDoctorDays] = useState<number[]>([])
  const [appointmentForm, setAppointmentForm] = useState({ patient_id: "", doctor_id: "", date: localDateValue(), time: "09:00", notes: "" })
  const [blockForm, setBlockForm] = useState({ doctor_id: "", starts_at: "", ends_at: "", reason: "" })
  const [clinicForm, setClinicForm] = useState({
    name: initialData.clinic?.name ?? "", address: initialData.clinic?.address ?? "",
    phone: initialData.clinic?.phone ?? "", email: initialData.clinic?.email ?? "",
    opening_hours: initialData.clinic?.opening_hours ?? "",
  })

  const activePatients = initialData.patients.filter((patient) => patient.is_active)
  const activeDoctors = initialData.doctors.filter((doctor) => doctor.is_active)
  const todayAppointments = initialData.appointments.filter((appointment) => localDateValue(new Date(appointment.starts_at)) === localDateValue())
  const pendingAppointments = initialData.appointments.filter((appointment) => appointment.status === "pending")
  const currentSection = navigation.find((item) => item.id === section)!
  const pageDescriptions: Record<Section, string> = {
    overview: "Acompanhe a rotina da clínica em um só lugar.",
    patients: "Consulte e atualize os cadastros dos pacientes.",
    doctors: "Gerencie a equipe médica e os horários de atendimento.",
    appointments: "Confirme pendências e acompanhe os atendimentos.",
    agenda: "Visualize horários livres, consultas e bloqueios.",
    preferences: "Mantenha os dados de contato e funcionamento atualizados.",
  }

  function openPatient(patient?: Patient) {
    setPatientForm(patient ? {
      id: patient.id, full_name: patient.full_name, email: patient.email ?? "", phone: patient.phone ?? "",
      birth_date: patient.birth_date ?? "", cpf: patient.cpf ?? "",
    } : { id: "", full_name: "", email: "", phone: "", birth_date: "", cpf: "" })
    setModal("patient")
  }

  function openDoctor(doctor?: Doctor) {
    const schedules = doctor ? initialData.schedules.filter((schedule) => schedule.doctor_id === doctor.id) : []
    setDoctorForm(doctor ? {
      id: doctor.id, full_name: doctor.full_name, email: doctor.email ?? "", phone: doctor.phone ?? "",
      registration: doctor.registration, bio: doctor.bio ?? "", consultation_fee: doctor.consultation_fee?.toString() ?? "",
      specialty: doctor.specialties?.name ?? "", start_time: schedules[0]?.start_time.slice(0, 5) ?? "09:00",
      end_time: schedules[0]?.end_time.slice(0, 5) ?? "17:00", slot_duration_minutes: String(schedules[0]?.slot_duration_minutes ?? 30),
    } : {
      id: "", full_name: "", email: "", phone: "", registration: "", bio: "", consultation_fee: "",
      specialty: "", start_time: "09:00", end_time: "17:00", slot_duration_minutes: "30",
    })
    setDoctorDays(schedules.map((schedule) => schedule.weekday))
    setModal("doctor")
  }

  function openAppointment() {
    setAppointmentForm({ patient_id: activePatients[0]?.id ?? "", doctor_id: activeDoctors[0]?.id ?? "", date: localDateValue(), time: "09:00", notes: "" })
    setModal("appointment")
  }

  function showSuccess(text: string) {
    setNotice({ kind: "success", text })
    setModal(null)
    router.refresh()
  }

  function showFailure() {
    setNotice({ kind: "error", text: "Não foi possível salvar. Confira os campos, a conexão e as permissões da conta." })
  }

  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const values = {
        full_name: patientForm.full_name.trim(), email: patientForm.email.trim() || null,
        phone: patientForm.phone.trim() || null, birth_date: patientForm.birth_date || null, cpf: patientForm.cpf.trim() || null,
      }
      const result = patientForm.id
        ? await supabase.from("patients").update(values).eq("id", patientForm.id)
        : await supabase.from("patients").insert(values)
      ensureNoError(result.error)
      showSuccess(patientForm.id ? "Cadastro do paciente atualizado." : "Paciente cadastrado.")
    } catch {
      showFailure()
    } finally {
      setBusy(false)
    }
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const specialtyName = doctorForm.specialty.trim()
      let specialtyId: string | null = null
      if (specialtyName) {
        const specialty = await supabase.from("specialties").upsert({ name: specialtyName }, { onConflict: "name" }).select("id").single()
        ensureNoError(specialty.error)
        if (!specialty.data?.id) throw new Error("Especialidade indisponível")
        specialtyId = specialty.data.id
      }
      const doctorValues = {
        full_name: doctorForm.full_name.trim(), email: doctorForm.email.trim() || null,
        phone: doctorForm.phone.trim() || null, registration: doctorForm.registration.trim(),
        bio: doctorForm.bio.trim() || null, consultation_fee: doctorForm.consultation_fee ? Number(doctorForm.consultation_fee) : null,
        specialty_id: specialtyId,
      }
      let doctorId = doctorForm.id
      if (doctorId) {
        const updated = await supabase.from("doctors").update(doctorValues).eq("id", doctorId)
        ensureNoError(updated.error)
      } else {
        const created = await supabase.from("doctors").insert(doctorValues).select("id").single()
        ensureNoError(created.error)
        if (!created.data?.id) throw new Error("Cadastro não retornou identificador")
        doctorId = created.data.id
      }
      const deleted = await supabase.from("schedules").delete().eq("doctor_id", doctorId)
      ensureNoError(deleted.error)
      if (doctorDays.length) {
        const rows = doctorDays.map((weekday) => ({
          doctor_id: doctorId, clinic_id: initialData.clinic?.id ?? null, weekday,
          start_time: doctorForm.start_time, end_time: doctorForm.end_time,
          slot_duration_minutes: Number(doctorForm.slot_duration_minutes),
        }))
        const inserted = await supabase.from("schedules").insert(rows)
        ensureNoError(inserted.error)
      }
      showSuccess(doctorForm.id ? "Cadastro e agenda do médico atualizados." : "Médico cadastrado com agenda.")
    } catch {
      showFailure()
    } finally {
      setBusy(false)
    }
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const doctor = activeDoctors.find((item) => item.id === appointmentForm.doctor_id)
      if (!doctor) throw new Error("doctor_missing")
      const starts = new Date(`${appointmentForm.date}T${appointmentForm.time}:00`)
      const daySchedule = initialData.schedules.find((schedule) =>
        schedule.doctor_id === doctor.id && schedule.weekday === starts.getDay() &&
        appointmentForm.time >= schedule.start_time.slice(0, 5) && appointmentForm.time < schedule.end_time.slice(0, 5),
      )
      if (!daySchedule) {
        setNotice({ kind: "error", text: "Esse médico não atende nesse dia ou horário. Consulte a agenda antes de agendar." })
        setBusy(false)
        return
      }
      const ends = new Date(starts.getTime() + daySchedule.slot_duration_minutes * 60_000)
      const overlapsAppointment = initialData.appointments.some((item) =>
        item.doctor_id === doctor.id && item.status !== "cancelled" &&
        new Date(item.starts_at).getTime() < ends.getTime() && new Date(item.ends_at).getTime() > starts.getTime(),
      )
      const overlapsBlock = initialData.blockedSlots.some((item) =>
        item.doctor_id === doctor.id && new Date(item.starts_at).getTime() < ends.getTime() && new Date(item.ends_at).getTime() > starts.getTime(),
      )
      if (overlapsAppointment || overlapsBlock) {
        setNotice({ kind: "error", text: "Este horário já está ocupado ou bloqueado. Escolha outro horário disponível." })
        setBusy(false)
        return
      }
      const inserted = await supabase.from("appointments").insert({
        patient_id: appointmentForm.patient_id, doctor_id: doctor.id,
        specialty_id: doctor.specialty_id, clinic_id: initialData.clinic?.id ?? null,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        appointment_type: "Consulta", status: "pending", notes: appointmentForm.notes.trim() || null,
      })
      ensureNoError(inserted.error)
      showSuccess("Agendamento criado como pendente de confirmação.")
    } catch {
      showFailure()
    } finally {
      setBusy(false)
    }
  }

  async function saveBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const start = new Date(blockForm.starts_at)
      const end = new Date(blockForm.ends_at)
      if (end <= start) throw new Error("invalid_range")
      const result = await supabase.from("blocked_slots").insert({
        doctor_id: blockForm.doctor_id, starts_at: start.toISOString(), ends_at: end.toISOString(),
        reason: blockForm.reason.trim() || null,
      })
      ensureNoError(result.error)
      showSuccess("Disponibilidade bloqueada.")
    } catch {
      showFailure()
    } finally {
      setBusy(false)
    }
  }

  async function saveClinic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const values = {
        name: clinicForm.name.trim(), address: clinicForm.address.trim() || null,
        phone: clinicForm.phone.trim() || null, email: clinicForm.email.trim() || null,
        opening_hours: clinicForm.opening_hours.trim() || null,
      }
      const result = initialData.clinic
        ? await supabase.from("clinics").update(values).eq("id", initialData.clinic.id)
        : await supabase.from("clinics").insert(values)
      ensureNoError(result.error)
      showSuccess("Preferências da clínica salvas no Supabase.")
    } catch {
      showFailure()
    } finally {
      setBusy(false)
    }
  }

  async function updateAppointmentStatus(id: string, status: Appointment["status"]) {
    setNotice(null)
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id)
    if (error) showFailure()
    else { setNotice({ kind: "success", text: "Status do agendamento atualizado." }); router.refresh() }
  }

  async function confirmPending() {
    if (!pendingAppointments.length) return
    setBusy(true)
    const { error } = await supabase.from("appointments").update({ status: "confirmed" }).in("id", pendingAppointments.map((item) => item.id))
    setBusy(false)
    if (error) showFailure()
    else { setNotice({ kind: "success", text: `${pendingAppointments.length} agendamento(s) confirmado(s).` }); router.refresh() }
  }

  async function togglePatient(patient: Patient) {
    const { error } = await supabase.from("patients").update({ is_active: !patient.is_active }).eq("id", patient.id)
    if (error) showFailure()
    else { setNotice({ kind: "success", text: patient.is_active ? "Paciente desativado; o histórico foi preservado." : "Paciente reativado." }); router.refresh() }
  }

  async function toggleDoctor(doctor: Doctor) {
    const { error } = await supabase.from("doctors").update({ is_active: !doctor.is_active }).eq("id", doctor.id)
    if (error) showFailure()
    else { setNotice({ kind: "success", text: doctor.is_active ? "Médico desativado; a agenda e o histórico foram preservados." : "Médico reativado." }); router.refresh() }
  }

  async function removeBlock(slot: BlockedSlot) {
    const { error } = await supabase.from("blocked_slots").delete().eq("id", slot.id)
    if (error) showFailure()
    else { setNotice({ kind: "success", text: "Bloqueio removido da agenda." }); router.refresh() }
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.replace("/auth/login")
  }

  const visiblePatients = initialData.patients.filter((patient) =>
    (showInactive || patient.is_active) && `${patient.full_name} ${patient.email ?? ""} ${patient.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  )
  const visibleDoctors = initialData.doctors.filter((doctor) =>
    (showInactive || doctor.is_active) && `${doctor.full_name} ${doctor.registration} ${doctor.specialties?.name ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  )
  const visibleAppointments = initialData.appointments.filter((appointment) =>
    (appointmentFilter === "all" || appointment.status === appointmentFilter) &&
    `${appointment.patients?.full_name ?? ""} ${appointment.doctors?.full_name ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  )
  const agendaAppointments = initialData.appointments.filter((appointment) =>
    localDateValue(new Date(appointment.starts_at)) === agendaDate && (!selectedDoctor || appointment.doctor_id === selectedDoctor),
  )
  const agendaBlocks = initialData.blockedSlots.filter((slot) =>
    localDateValue(new Date(slot.starts_at)) === agendaDate && (!selectedDoctor || slot.doctor_id === selectedDoctor),
  )

  function changeSection(next: Section) {
    setSection(next)
    setSearch("")
    setNotice(null)
  }

  function beginBlock() {
    setBlockForm({ doctor_id: selectedDoctor || activeDoctors[0]?.id || "", starts_at: `${agendaDate}T09:00`, ends_at: `${agendaDate}T10:00`, reason: "" })
    setModal("block")
  }

  return (
    <div className="min-h-screen bg-[#f4f8fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#e5f5f2] text-[#147d71]"><CalendarDays aria-hidden="true" className="size-5" /></div>
            <div><p className="text-[15px] font-bold tracking-tight">MedAgenda</p><p className="mt-0.5 text-xs text-slate-400">Gestão clínica</p></div>
          </div>
          <p className="mb-2 mt-9 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Menu principal</p>
          <nav aria-label="Menu principal" className="flex flex-col gap-1">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button aria-current={section === id ? "page" : undefined} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium transition ${section === id ? "bg-[#eaf5f3] text-[#126e64]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`} key={id} onClick={() => changeSection(id)} type="button">
                <Icon aria-hidden="true" className="size-[17px]" />{label}
                {id === "appointments" && pendingAppointments.length > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{pendingAppointments.length}</span>}
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl bg-[#f4f8fb] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><ShieldCheck aria-hidden="true" className="size-4 text-[#147d71]" />Acesso protegido</div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">Dados clínicos protegidos por autenticação e RLS.</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-7">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 lg:hidden">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e5f5f2] text-[#147d71]"><CalendarDays aria-hidden="true" className="size-5" /></div>
                <div className="min-w-0"><p className="truncate text-sm font-bold">MedAgenda</p><p className="truncate text-[11px] text-slate-400">{currentSection.label}</p></div>
              </div>
              <div className="hidden lg:block"><p className="text-xs text-slate-400">{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p></div>
              <div className="ml-auto flex items-center gap-3">
                {section !== "preferences" && <button className="hidden h-9 items-center gap-2 rounded-xl bg-[#147d71] px-3.5 text-xs font-semibold text-white transition hover:bg-[#106a60] sm:flex" onClick={openAppointment} type="button"><Plus aria-hidden="true" className="size-4" />Novo agendamento</button>}
                <div className="hidden text-right sm:block"><p className="max-w-40 truncate text-xs font-semibold text-slate-700">{initialData.profileName}</p><p className="max-w-40 truncate text-[10px] text-slate-400">{userEmail}</p></div>
                <div aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d9efeb] text-xs font-bold text-[#147d71]">{initials(initialData.profileName)}</div>
                <button aria-label="Sair da conta" className="flex size-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={logout} type="button"><LogOut aria-hidden="true" className="size-4" /></button>
              </div>
            </div>
            <nav aria-label="Navegação móvel" className="mt-3 flex gap-1 overflow-x-auto pb-0.5 lg:hidden">
              {navigation.map(({ id, label, icon: Icon }) => <button aria-current={section === id ? "page" : undefined} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold ${section === id ? "bg-[#eaf5f3] text-[#126e64]" : "text-slate-500 hover:bg-slate-50"}`} key={id} onClick={() => changeSection(id)} type="button"><Icon aria-hidden="true" className="size-3.5" />{label}</button>)}
            </nav>
          </header>

          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-7 md:py-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><h1 className="text-[22px] font-semibold tracking-tight md:text-[26px]">{currentSection.label}</h1><p className="mt-1 text-sm text-slate-500">{pageDescriptions[section]}</p></div>
              <div className="flex gap-2">
                {section === "patients" && <button className="flex h-9 items-center gap-2 rounded-xl bg-[#147d71] px-3.5 text-xs font-semibold text-white hover:bg-[#106a60]" onClick={() => openPatient()} type="button"><Plus aria-hidden="true" className="size-4" />Cadastrar paciente</button>}
                {section === "doctors" && <button className="flex h-9 items-center gap-2 rounded-xl bg-[#147d71] px-3.5 text-xs font-semibold text-white hover:bg-[#106a60]" onClick={() => openDoctor()} type="button"><Plus aria-hidden="true" className="size-4" />Cadastrar médico</button>}
                {section === "appointments" && <button className="flex h-9 items-center gap-2 rounded-xl bg-[#147d71] px-3.5 text-xs font-semibold text-white hover:bg-[#106a60]" onClick={openAppointment} type="button"><Plus aria-hidden="true" className="size-4" />Novo agendamento</button>}
                {section === "agenda" && <button className="flex h-9 items-center gap-2 rounded-xl bg-[#147d71] px-3.5 text-xs font-semibold text-white hover:bg-[#106a60]" onClick={beginBlock} type="button"><CalendarPlus aria-hidden="true" className="size-4" />Bloquear horário</button>}
              </div>
            </div>

            {notice && <div className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`} role={notice.kind === "error" ? "alert" : "status"}><Activity aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{notice.text}</span><button aria-label="Fechar aviso" className="ml-auto" onClick={() => setNotice(null)} type="button"><X aria-hidden="true" className="size-4" /></button></div>}

            {section === "overview" && <Overview data={initialData} todayAppointments={todayAppointments} pendingCount={pendingAppointments.length} onNavigate={changeSection} onNewAppointment={openAppointment} />}
            {section === "patients" && <PatientsPage patients={visiblePatients} search={search} onSearch={setSearch} showInactive={showInactive} onShowInactive={setShowInactive} onEdit={openPatient} onToggle={togglePatient} />}
            {section === "doctors" && <DoctorsPage doctors={visibleDoctors} schedules={initialData.schedules} search={search} onSearch={setSearch} showInactive={showInactive} onShowInactive={setShowInactive} onEdit={openDoctor} onToggle={toggleDoctor} onAgenda={(id) => { setSelectedDoctor(id); changeSection("agenda") }} />}
            {section === "appointments" && <AppointmentsPage appointments={visibleAppointments} filter={appointmentFilter} onFilter={setAppointmentFilter} search={search} onSearch={setSearch} pendingCount={pendingAppointments.length} busy={busy} onConfirmPending={confirmPending} onStatus={updateAppointmentStatus} onAvailability={() => changeSection("agenda")} />}
            {section === "agenda" && <AgendaPage date={agendaDate} onDate={setAgendaDate} doctorId={selectedDoctor} onDoctor={setSelectedDoctor} doctors={activeDoctors} schedules={initialData.schedules} appointments={agendaAppointments} blockedSlots={agendaBlocks} onRemoveBlock={removeBlock} />}
            {section === "preferences" && <PreferencesPage clinic={initialData.clinic} form={clinicForm} onChange={setClinicForm} onSubmit={saveClinic} busy={busy} />}
          </main>
        </div>
      </div>

      {modal && <ModalDialog title={modal === "patient" ? (patientForm.id ? "Editar paciente" : "Cadastrar paciente") : modal === "doctor" ? (doctorForm.id ? "Editar médico e agenda" : "Cadastrar médico") : modal === "appointment" ? "Novo agendamento" : "Bloquear horário"} onClose={() => setModal(null)}>
        {modal === "patient" && <form className="grid gap-4 sm:grid-cols-2" onSubmit={savePatient}>
          <div className="sm:col-span-2"><Field label="Nome completo" required value={patientForm.full_name} onChange={(value) => setPatientForm({ ...patientForm, full_name: value })} /></div>
          <Field label="E-mail" type="email" value={patientForm.email} onChange={(value) => setPatientForm({ ...patientForm, email: value })} />
          <Field label="Telefone" type="tel" value={patientForm.phone} onChange={(value) => setPatientForm({ ...patientForm, phone: value })} />
          <Field label="Data de nascimento" type="date" value={patientForm.birth_date} onChange={(value) => setPatientForm({ ...patientForm, birth_date: value })} />
          <Field label="CPF" value={patientForm.cpf} onChange={(value) => setPatientForm({ ...patientForm, cpf: value })} />
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2"><button className="h-10 rounded-xl px-4 text-sm font-medium text-slate-500 hover:bg-slate-100" onClick={() => setModal(null)} type="button">Cancelar</button><button className="h-10 rounded-xl bg-[#147d71] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? "Salvando…" : "Salvar paciente"}</button></div>
        </form>}
        {modal === "doctor" && <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveDoctor}>
          <div className="sm:col-span-2"><Field label="Nome completo" required value={doctorForm.full_name} onChange={(value) => setDoctorForm({ ...doctorForm, full_name: value })} /></div>
          <Field label="E-mail" type="email" value={doctorForm.email} onChange={(value) => setDoctorForm({ ...doctorForm, email: value })} />
          <Field label="Telefone" type="tel" value={doctorForm.phone} onChange={(value) => setDoctorForm({ ...doctorForm, phone: value })} />
          <Field label="CRM / registro profissional" required value={doctorForm.registration} onChange={(value) => setDoctorForm({ ...doctorForm, registration: value })} />
          <Field label="Especialidade" value={doctorForm.specialty} onChange={(value) => setDoctorForm({ ...doctorForm, specialty: value })} />
          <Field label="Valor da consulta (R$)" min="0" step="0.01" type="number" value={doctorForm.consultation_fee} onChange={(value) => setDoctorForm({ ...doctorForm, consultation_fee: value })} />
          <Field label="Duração do horário (min)" min="5" step="5" type="number" required value={doctorForm.slot_duration_minutes} onChange={(value) => setDoctorForm({ ...doctorForm, slot_duration_minutes: value })} />
          <div className="sm:col-span-2"><label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700"><span>Sobre o médico</span><textarea className="min-h-20 resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal outline-none focus:border-[#168679] focus:ring-4 focus:ring-[#168679]/10" onChange={(event) => setDoctorForm({ ...doctorForm, bio: event.target.value })} value={doctorForm.bio} /></label></div>
          <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-medium text-slate-700">Dias de atendimento</legend><div className="flex flex-wrap gap-2">{weekdayNames.map((day, index) => <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs ${doctorDays.includes(index) ? "border-[#168679] bg-[#eaf5f3] text-[#126e64]" : "border-slate-200 text-slate-500"}`} key={day}><input checked={doctorDays.includes(index)} className="accent-[#147d71]" onChange={() => setDoctorDays(doctorDays.includes(index) ? doctorDays.filter((item) => item !== index) : [...doctorDays, index].sort())} type="checkbox" />{day}</label>)}</div></fieldset>
          <Field label="Início do expediente" type="time" required value={doctorForm.start_time} onChange={(value) => setDoctorForm({ ...doctorForm, start_time: value })} />
          <Field label="Fim do expediente" type="time" required value={doctorForm.end_time} onChange={(value) => setDoctorForm({ ...doctorForm, end_time: value })} />
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2"><button className="h-10 rounded-xl px-4 text-sm font-medium text-slate-500 hover:bg-slate-100" onClick={() => setModal(null)} type="button">Cancelar</button><button className="h-10 rounded-xl bg-[#147d71] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || doctorDays.length === 0} type="submit">{busy ? "Salvando…" : "Salvar médico e agenda"}</button></div>
        </form>}
        {modal === "appointment" && <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveAppointment}>
          {activePatients.length === 0 || activeDoctors.length === 0 ? <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-800 sm:col-span-2">Cadastre ao menos um paciente e um médico com horários de atendimento antes de criar um agendamento.</div> : <>
            <SelectField label="Paciente" required value={appointmentForm.patient_id} onChange={(value) => setAppointmentForm({ ...appointmentForm, patient_id: value })}>{activePatients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}</SelectField>
            <SelectField label="Médico" required value={appointmentForm.doctor_id} onChange={(value) => setAppointmentForm({ ...appointmentForm, doctor_id: value })}>{activeDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</SelectField>
            <Field label="Data" type="date" min={localDateValue()} required value={appointmentForm.date} onChange={(value) => setAppointmentForm({ ...appointmentForm, date: value })} />
            <Field label="Horário de início" type="time" required value={appointmentForm.time} onChange={(value) => setAppointmentForm({ ...appointmentForm, time: value })} />
            <div className="sm:col-span-2"><label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700"><span>Observações</span><textarea className="min-h-20 resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-normal outline-none focus:border-[#168679] focus:ring-4 focus:ring-[#168679]/10" onChange={(event) => setAppointmentForm({ ...appointmentForm, notes: event.target.value })} value={appointmentForm.notes} /></label></div>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">A disponibilidade é validada pelo expediente do médico, horários bloqueados e consultas existentes.</p>
          </>}
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2"><button className="h-10 rounded-xl px-4 text-sm font-medium text-slate-500 hover:bg-slate-100" onClick={() => setModal(null)} type="button">Cancelar</button><button className="h-10 rounded-xl bg-[#147d71] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || activePatients.length === 0 || activeDoctors.length === 0} type="submit">{busy ? "Agendando…" : "Criar agendamento"}</button></div>
        </form>}
        {modal === "block" && <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveBlock}>
          <div className="sm:col-span-2"><SelectField label="Médico" required value={blockForm.doctor_id} onChange={(value) => setBlockForm({ ...blockForm, doctor_id: value })}>{activeDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</SelectField></div>
          <Field label="Início" type="datetime-local" required value={blockForm.starts_at} onChange={(value) => setBlockForm({ ...blockForm, starts_at: value })} />
          <Field label="Fim" type="datetime-local" required value={blockForm.ends_at} onChange={(value) => setBlockForm({ ...blockForm, ends_at: value })} />
          <div className="sm:col-span-2"><Field label="Motivo (opcional)" value={blockForm.reason} onChange={(value) => setBlockForm({ ...blockForm, reason: value })} /></div>
          <div className="flex justify-end gap-2 pt-2 sm:col-span-2"><button className="h-10 rounded-xl px-4 text-sm font-medium text-slate-500 hover:bg-slate-100" onClick={() => setModal(null)} type="button">Cancelar</button><button className="h-10 rounded-xl bg-[#147d71] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy || activeDoctors.length === 0} type="submit">{busy ? "Salvando…" : "Salvar bloqueio"}</button></div>
        </form>}
      </ModalDialog>}
    </div>
  )
}

function Overview({ data, todayAppointments, pendingCount, onNavigate, onNewAppointment }: {
  data: MedAgendaData; todayAppointments: Appointment[]; pendingCount: number; onNavigate: (section: Section) => void; onNewAppointment: () => void
}) {
  const cards = [
    { label: "Pacientes ativos", value: data.patients.filter((item) => item.is_active).length, icon: UsersRound, foot: `${data.patients.length} cadastros no total`, color: "text-[#147d71] bg-[#eaf5f3]" },
    { label: "Médicos ativos", value: data.doctors.filter((item) => item.is_active).length, icon: Stethoscope, foot: `${data.schedules.length} horários semanais`, color: "text-sky-700 bg-sky-50" },
    { label: "Consultas hoje", value: todayAppointments.length, icon: CalendarCheck2, foot: "Na agenda de hoje", color: "text-violet-700 bg-violet-50" },
    { label: "Pendências", value: pendingCount, icon: Clock3, foot: "Aguardando confirmação", color: "text-amber-700 bg-amber-50" },
  ]
  return <div className="flex flex-col gap-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, foot, color }) => <article className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5" key={label}><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`flex size-9 items-center justify-center rounded-xl ${color}`}><Icon aria-hidden="true" className="size-[18px]" /></span></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-slate-400">{foot}</p></article>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Agenda de hoje</h2><p className="mt-1 text-xs text-slate-400">Consultas e atendimentos programados</p></div><button className="text-xs font-semibold text-[#147d71] hover:underline" onClick={() => onNavigate("agenda")} type="button">Ver agenda</button></div>
        {todayAppointments.length ? <div className="flex flex-col divide-y divide-slate-100">{todayAppointments.slice(0, 6).map((item) => <div className="flex items-center gap-3 py-3" key={item.id}><div className="w-14 shrink-0 text-xs font-semibold text-slate-700">{formatClock(item.starts_at)}</div><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#eaf5f3] text-[11px] font-bold text-[#147d71]">{initials(item.patients?.full_name ?? "P")}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{item.patients?.full_name ?? "Paciente"}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{item.doctors?.full_name ?? "Médico"} · {item.specialties?.name ?? "Consulta"}</p></div><StatusBadge status={item.status} /></div>)}</div> : <EmptyState title="Sem consultas para hoje" description="Os próximos agendamentos aparecerão aqui." action={<button className="text-xs font-semibold text-[#147d71] hover:underline" onClick={onNewAppointment} type="button">Criar agendamento</button>} />}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div><h2 className="text-sm font-semibold">Ações rápidas</h2><p className="mt-1 text-xs text-slate-400">Acesse as tarefas mais usadas</p></div><div className="mt-4 flex flex-col gap-2"><QuickAction icon={CalendarPlus} label="Novo agendamento" detail="Verificar disponibilidade" onClick={onNewAppointment} /><QuickAction icon={UsersRound} label="Cadastrar paciente" detail="Adicionar à lista de pacientes" onClick={() => onNavigate("patients")} /><QuickAction icon={Stethoscope} label="Gerenciar médicos" detail="Equipe e horários de atendimento" onClick={() => onNavigate("doctors")} /><QuickAction icon={Settings2} label="Preferências da clínica" detail="Contato e funcionamento" onClick={() => onNavigate("preferences")} /></div></section>
    </div>
  </div>
}

function QuickAction({ icon: Icon, label, detail, onClick }: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>; label: string; detail: string; onClick: () => void }) {
  return <button className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:border-[#b9ded8] hover:bg-[#f7fbfa]" onClick={onClick} type="button"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf5f3] text-[#147d71]"><Icon aria-hidden="true" className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-700">{label}</span><span className="mt-0.5 block truncate text-[11px] text-slate-400">{detail}</span></span><ArrowRight aria-hidden="true" className="size-4 text-slate-400" /></button>
}

function PatientsPage({ patients, search, onSearch, showInactive, onShowInactive, onEdit, onToggle }: {
  patients: Patient[]; search: string; onSearch: (value: string) => void; showInactive: boolean; onShowInactive: (value: boolean) => void; onEdit: (patient: Patient) => void; onToggle: (patient: Patient) => void
}) {
  return <section className="rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><p className="text-xs text-slate-500">{patients.length} cadastro(s)</p><div className="flex flex-wrap items-center gap-3"><label className="flex h-9 w-60 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search aria-hidden="true" className="size-4 text-slate-400" /><span className="sr-only">Buscar pacientes</span><input className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" onChange={(event) => onSearch(event.target.value)} placeholder="Buscar paciente" value={search} /></label><label className="flex items-center gap-2 text-xs text-slate-500"><input checked={showInactive} className="accent-[#147d71]" onChange={(event) => onShowInactive(event.target.checked)} type="checkbox" />Inativos</label></div></div>
    {patients.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Contato</th><th className="px-4 py-3">Nascimento</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{patients.map((patient) => <tr className="text-xs" key={patient.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-[#eaf5f3] text-[11px] font-bold text-[#147d71]">{initials(patient.full_name)}</span><span className="font-semibold text-slate-800">{patient.full_name}</span></div></td><td className="px-4 py-3 text-slate-500">{patient.email || patient.phone || "—"}<span className="block text-[10px] text-slate-400">{patient.email && patient.phone ? patient.phone : ""}</span></td><td className="px-4 py-3 text-slate-500">{patient.birth_date ? formatDate(patient.birth_date) : "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${patient.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{patient.is_active ? "Ativo" : "Inativo"}</span></td><td className="px-4 py-3 text-right"><button aria-label={`Editar ${patient.full_name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => onEdit(patient)} type="button"><Pencil aria-hidden="true" className="size-4" /></button><button className="rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100" onClick={() => onToggle(patient)} type="button">{patient.is_active ? "Desativar" : "Reativar"}</button></td></tr>)}</tbody></table></div> : <div className="p-4"><EmptyState title={search ? "Nenhum resultado" : "Nenhum paciente cadastrado"} description={search ? "Tente buscar por outro nome ou contato." : "Cadastre pacientes para manter seus dados e o histórico de atendimento organizados."} /></div>}
  </section>
}

function DoctorsPage({ doctors, schedules, search, onSearch, showInactive, onShowInactive, onEdit, onToggle, onAgenda }: {
  doctors: Doctor[]; schedules: Schedule[]; search: string; onSearch: (value: string) => void; showInactive: boolean; onShowInactive: (value: boolean) => void; onEdit: (doctor: Doctor) => void; onToggle: (doctor: Doctor) => void; onAgenda: (id: string) => void
}) {
  return <div className="flex flex-col gap-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{doctors.length} médico(s)</p><div className="flex flex-wrap items-center gap-3"><label className="flex h-9 w-60 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search aria-hidden="true" className="size-4 text-slate-400" /><span className="sr-only">Buscar médicos</span><input className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" onChange={(event) => onSearch(event.target.value)} placeholder="Buscar médico ou CRM" value={search} /></label><label className="flex items-center gap-2 text-xs text-slate-500"><input checked={showInactive} className="accent-[#147d71]" onChange={(event) => onShowInactive(event.target.checked)} type="checkbox" />Inativos</label></div></div>
    {doctors.length ? <div className="grid gap-4 xl:grid-cols-2">{doctors.map((doctor) => { const doctorSchedules = schedules.filter((item) => item.doctor_id === doctor.id); return <article className="rounded-2xl border border-slate-200 bg-white p-5" key={doctor.id}><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sm font-bold text-sky-700">{initials(doctor.full_name)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{doctor.full_name}</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${doctor.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{doctor.is_active ? "Ativo" : "Inativo"}</span></div><p className="mt-1 text-xs text-slate-500">{doctor.specialties?.name ?? "Especialidade não informada"} · CRM {doctor.registration}</p></div><button aria-label={`Editar ${doctor.full_name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => onEdit(doctor)} type="button"><Pencil aria-hidden="true" className="size-4" /></button></div><div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:grid-cols-2"><p>{doctor.email || "E-mail não informado"}</p><p>{doctor.phone || "Telefone não informado"}</p></div><div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-slate-700"><Clock3 aria-hidden="true" className="size-3.5 text-[#147d71]" />Agenda semanal</p>{doctorSchedules.length ? <div className="flex flex-wrap gap-1.5">{doctorSchedules.map((item) => <span className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600" key={item.id}>{weekdays[item.weekday]} · {formatTime(item.start_time)}–{formatTime(item.end_time)}</span>)}</div> : <p className="text-[11px] text-slate-400">Sem horários cadastrados</p>}</div><div className="mt-4 flex items-center justify-between"><button className="text-xs font-semibold text-[#147d71] hover:underline" onClick={() => onAgenda(doctor.id)} type="button">Ver agenda deste médico</button><button className="text-[11px] font-semibold text-slate-500 hover:text-slate-800" onClick={() => onToggle(doctor)} type="button">{doctor.is_active ? "Desativar" : "Reativar"}</button></div></article>})}</div> : <EmptyState title={search ? "Nenhum resultado" : "Nenhum médico cadastrado"} description={search ? "Tente buscar por outro nome ou CRM." : "Cadastre médicos e configure os dias e horários em que cada um atende."} />}
  </div>
}

function AppointmentsPage({ appointments, filter, onFilter, search, onSearch, pendingCount, busy, onConfirmPending, onStatus, onAvailability }: {
  appointments: Appointment[]; filter: string; onFilter: (value: string) => void; search: string; onSearch: (value: string) => void; pendingCount: number; busy: boolean; onConfirmPending: () => void; onStatus: (id: string, status: Appointment["status"]) => void; onAvailability: () => void
}) {
  return <div className="flex flex-col gap-4"><div className="grid gap-3 sm:grid-cols-3"><SummaryTile label="Pendentes" value={pendingCount} tone="amber" /><SummaryTile label="Exibidos" value={appointments.length} tone="teal" /><button className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-[#b9ded8]" onClick={onAvailability} type="button"><span><span className="block text-xs font-medium text-slate-500">Agenda e disponibilidade</span><span className="mt-1 block text-sm font-semibold text-[#147d71]">Gerenciar horários</span></span><CalendarDays aria-hidden="true" className="size-5 text-[#147d71]" /></button></div>
    <section className="rounded-2xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div className="flex flex-wrap items-center gap-3"><SelectField label="Filtrar por status" value={filter} onChange={onFilter}><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField><label className="flex h-9 w-56 items-center gap-2 self-end rounded-xl border border-slate-200 px-3"><Search aria-hidden="true" className="size-4 text-slate-400" /><span className="sr-only">Buscar agendamentos</span><input className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400" onChange={(event) => onSearch(event.target.value)} placeholder="Paciente ou médico" value={search} /></label></div><button className="h-9 self-end rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50" disabled={!pendingCount || busy} onClick={onConfirmPending} type="button">{busy ? "Confirmando…" : `Confirmar pendências (${pendingCount})`}</button></div>
      {appointments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><th className="px-4 py-3">Data e hora</th><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Médico</th><th className="px-4 py-3">Especialidade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Atualizar</th></tr></thead><tbody className="divide-y divide-slate-100">{appointments.map((item) => <tr className="text-xs" key={item.id}><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">{formatDateTime(item.starts_at)}</td><td className="px-4 py-3 font-semibold text-slate-800">{item.patients?.full_name ?? "Paciente"}</td><td className="px-4 py-3 text-slate-500">{item.doctors?.full_name ?? "Médico"}</td><td className="px-4 py-3 text-slate-500">{item.specialties?.name ?? "Consulta"}</td><td className="px-4 py-3"><StatusBadge status={item.status} /></td><td className="px-4 py-3"><select aria-label={`Status de ${item.patients?.full_name ?? "agendamento"}`} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px]" onChange={(event) => onStatus(item.id, event.target.value as Appointment["status"])} value={item.status}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table></div> : <div className="p-4"><EmptyState title="Nenhum agendamento encontrado" description="Ajuste os filtros ou crie um novo agendamento. A disponibilidade é validada antes de salvar." /></div>}
    </section>
  </div>
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "amber" | "teal" }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1 text-2xl font-semibold ${tone === "amber" ? "text-amber-700" : "text-[#147d71]"}`}>{value}</p></article>
}

function AgendaPage({ date, onDate, doctorId, onDoctor, doctors, schedules, appointments, blockedSlots, onRemoveBlock }: {
  date: string; onDate: (value: string) => void; doctorId: string; onDoctor: (value: string) => void; doctors: Doctor[]; schedules: Schedule[]; appointments: Appointment[]; blockedSlots: BlockedSlot[]; onRemoveBlock: (slot: BlockedSlot) => void
}) {
  const dayNumber = new Date(`${date}T12:00:00`).getDay()
  const daySchedules = schedules.filter((item) => item.weekday === dayNumber && (!doctorId || item.doctor_id === doctorId))
  const timeline = [
    ...appointments.map((item) => ({ id: item.id, time: item.starts_at, title: item.patients?.full_name ?? "Consulta", subtitle: item.doctors?.full_name ?? "Médico", kind: "appointment" as const })),
    ...blockedSlots.map((item) => ({ id: item.id, time: item.starts_at, title: item.reason || "Horário bloqueado", subtitle: doctors.find((doctor) => doctor.id === item.doctor_id)?.full_name ?? "Médico", kind: "blocked" as const })),
  ].sort((a, b) => a.time.localeCompare(b.time))
  return <div className="flex flex-col gap-4"><section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><Field label="Data da agenda" type="date" value={date} onChange={onDate} /><div className="min-w-[220px] flex-1"><SelectField label="Médico" value={doctorId} onChange={onDoctor}><option value="">Todos os médicos</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}</SelectField></div><p className="pb-2 text-xs text-slate-500">{weekdayNames[dayNumber]} · {timeline.length} evento(s)</p></section>
    <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold">Consultas e bloqueios</h2><p className="mt-1 text-xs text-slate-400">{formatDate(`${date}T12:00:00`)}</p></div></div>{timeline.length ? <div className="flex flex-col gap-2">{timeline.map((item) => <article className={`flex items-center gap-3 rounded-xl border p-3 ${item.kind === "blocked" ? "border-amber-100 bg-amber-50/50" : "border-slate-100 bg-white"}`} key={`${item.kind}-${item.id}`}><span className="w-12 shrink-0 text-xs font-semibold text-slate-700">{formatTime(item.time.slice(11, 16))}</span><span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.kind === "blocked" ? "bg-amber-100 text-amber-700" : "bg-[#eaf5f3] text-[#147d71]"}`}>{item.kind === "blocked" ? <X aria-hidden="true" className="size-4" /> : <CalendarCheck2 aria-hidden="true" className="size-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{item.title}</span><span className="mt-0.5 block text-[11px] text-slate-400">{item.subtitle}</span></span>{item.kind === "blocked" && <button aria-label="Remover bloqueio" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-600" onClick={() => onRemoveBlock(blockedSlots.find((slot) => slot.id === item.id)!)} type="button"><X aria-hidden="true" className="size-4" /></button>}</article>)}</div> : <EmptyState title="Nenhum evento nesta data" description="Confira os horários de atendimento ao lado ou bloqueie um período indisponível." />}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-semibold">Expediente dos médicos</h2><p className="mt-1 text-xs text-slate-400">Horários configurados para este dia</p><div className="mt-4 flex flex-col gap-2">{daySchedules.map((schedule) => { const doctor = doctors.find((item) => item.id === schedule.doctor_id); return <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3" key={schedule.id}><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-700">{doctor?.full_name ?? "Médico"}</span><span className="mt-1 block text-[11px] text-slate-400">Intervalos de {schedule.slot_duration_minutes} min</span></span><span className="shrink-0 text-xs font-semibold text-[#147d71]">{formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}</span></div>})}{!daySchedules.length && <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">Nenhum expediente configurado para este dia.</p>}</div></section></div>
  </div>
}

function PreferencesPage({ clinic, form, onChange, onSubmit, busy }: {
  clinic: Clinic | null; form: { name: string; address: string; phone: string; email: string; opening_hours: string }; onChange: (value: typeof form) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean
}) {
  return <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]"><form className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6" onSubmit={onSubmit}><div className="mb-5"><h2 className="text-sm font-semibold">Dados da clínica</h2><p className="mt-1 text-xs text-slate-400">Essas informações podem ser atualizadas a qualquer momento.</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Nome da clínica" required value={form.name} onChange={(value) => onChange({ ...form, name: value })} /></div><div className="sm:col-span-2"><Field label="Endereço" value={form.address} onChange={(value) => onChange({ ...form, address: value })} /></div><Field label="Telefone" type="tel" value={form.phone} onChange={(value) => onChange({ ...form, phone: value })} /><Field label="E-mail" type="email" value={form.email} onChange={(value) => onChange({ ...form, email: value })} /><div className="sm:col-span-2"><Field label="Horário de funcionamento" placeholder="Seg–Sex, 08:00–18:00" value={form.opening_hours} onChange={(value) => onChange({ ...form, opening_hours: value })} /></div></div><div className="mt-5 flex justify-end"><button className="h-10 rounded-xl bg-[#147d71] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">{busy ? "Salvando…" : "Salvar preferências"}</button></div></form><section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6"><h2 className="text-sm font-semibold">Configuração da conta</h2><p className="mt-1 text-xs text-slate-400">Acesso administrativo e proteção de dados</p><div className="mt-5 flex flex-col gap-3"><div className="flex gap-3 rounded-xl bg-[#f4f8fb] p-3.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#147d71]"><ShieldCheck aria-hidden="true" className="size-4" /></span><div><p className="text-xs font-semibold text-slate-700">Controle por perfil</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Somente o perfil administrativo autorizado acessa cadastros e consultas.</p></div></div><div className="flex gap-3 rounded-xl bg-[#f4f8fb] p-3.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#147d71]"><Activity aria-hidden="true" className="size-4" /></span><div><p className="text-xs font-semibold text-slate-700">Histórico preservado</p><p className="mt-1 text-[11px] leading-5 text-slate-500">Pacientes e médicos são desativados sem apagar dados históricos.</p></div></div>{clinic && <p className="px-1 text-[11px] text-slate-400">Clínica configurada: {clinic.name}</p>}</div></section></div>
}

function ModalDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section aria-labelledby="modal-title" aria-modal="true" className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-6" role="dialog"><div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-lg font-semibold tracking-tight" id="modal-title">{title}</h2><button aria-label="Fechar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} type="button"><X aria-hidden="true" className="size-5" /></button></div>{children}</section></div>
}
