export function OrganizationUnavailable() {
  return (
    <div role="alert" className="rounded-2xl border border-line bg-white p-6">
      <h1 className="text-lg font-semibold">Organizações indisponíveis</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Não foi possível consultar as organizações. Tente novamente mais tarde.
      </p>
    </div>
  );
}
