"use client"

import { useState, type FormEvent } from "react"
import { ArrowRight, CalendarDays, LockKeyhole } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const ADMIN_EMAIL = "juliano96cunha@gmail.com"

type Mode = "login" | "signup"

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState(ADMIN_EMAIL)
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage("")
    setErrorMessage("")

    const supabase = createClient()
    if (mode === "signup") {
      if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
        setErrorMessage("O primeiro cadastro administrativo deve usar o e-mail autorizado.")
        setPending(false)
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
            `${window.location.origin}/auth/callback`,
          data: { full_name: fullName.trim() },
        },
      })

      setPending(false)
      if (error) {
        setErrorMessage("Não foi possível criar a conta. Confira os dados e tente novamente.")
        return
      }
      if (data.session) {
        window.location.replace("/")
        return
      }
      setMessage("Conta criada. Confirme o endereço pelo link enviado por e-mail para ativar o acesso administrativo.")
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setPending(false)
    if (error) {
      setErrorMessage("E-mail ou senha inválidos. Confira os dados e tente novamente.")
      return
    }
    window.location.replace("/")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f8fb] px-4 py-10 text-slate-900">
      <section className="w-full max-w-[440px] rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_70px_-36px_rgba(15,23,42,.24)] sm:p-9">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#e5f5f2] text-[#147d71]">
          <CalendarDays aria-hidden="true" className="size-6" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-[#147d71]">MedAgenda</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{mode === "login" ? "Acesso administrativo" : "Criar conta de administrador"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {mode === "login"
            ? "Entre para gerenciar pacientes, equipe clínica e agendamentos."
            : "O acesso será ativado após a confirmação do e-mail autorizado."}
        </p>

        <form className="mt-7 flex flex-col gap-4" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nome completo
              <input autoComplete="name" className="h-11 rounded-xl border border-slate-200 px-3.5 font-normal outline-none transition focus:border-[#168679] focus:ring-4 focus:ring-[#168679]/10" onChange={(event) => setFullName(event.target.value)} required value={fullName} />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            E-mail
            <input autoComplete="email" className="h-11 rounded-xl border border-slate-200 px-3.5 font-normal outline-none transition focus:border-[#168679] focus:ring-4 focus:ring-[#168679]/10" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Senha
            <input autoComplete={mode === "login" ? "current-password" : "new-password"} className="h-11 rounded-xl border border-slate-200 px-3.5 font-normal outline-none transition focus:border-[#168679] focus:ring-4 focus:ring-[#168679]/10" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {message && <p className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800" role="status">{message}</p>}
          {errorMessage && <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-800" role="alert">{errorMessage}</p>}
          <button className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#147d71] px-4 text-sm font-semibold text-white transition hover:bg-[#106a60] disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
            {pending ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
            {!pending && (mode === "login" ? <LockKeyhole aria-hidden="true" className="size-4" /> : <ArrowRight aria-hidden="true" className="size-4" />)}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-5 text-center">
          <button className="text-sm font-medium text-[#147d71] hover:underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); setErrorMessage("") }} type="button">
            {mode === "login" ? "Primeiro acesso? Criar conta" : "Já tem conta? Entrar"}
          </button>
        </div>
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">Acesso protegido por autenticação e políticas de segurança do Supabase.</p>
      </section>
    </main>
  )
}
