import Link from "next/link"

export default function NoAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f8fb] px-4 text-slate-900">
      <section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#147d71]">MedAgenda</p>
        <h1 className="mt-3 text-2xl font-semibold">Acesso não autorizado</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">Esta conta não tem perfil administrativo para acessar os dados da clínica.</p>
        <Link className="mt-6 inline-flex h-10 items-center rounded-xl bg-[#147d71] px-4 text-sm font-semibold text-white hover:bg-[#106a60]" href="/auth/login">Voltar ao acesso</Link>
      </section>
    </main>
  )
}
