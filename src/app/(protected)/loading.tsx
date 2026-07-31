export default function ProtectedPageLoading() {
  return (
    <section className="page-loading" role="status" aria-live="polite">
      <span className="screen-reader-only">Caricamento pagina...</span>
      <div className="loading-header" aria-hidden>
        <span className="loading-block loading-title" />
        <span className="loading-block loading-action" />
      </div>
      <div className="loading-metrics" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => <span className="loading-block" key={index} />)}
      </div>
      <span className="loading-block loading-filter" aria-hidden />
      <div className="loading-table" aria-hidden>
        <span className="loading-block" />
        <span className="loading-block" />
        <span className="loading-block" />
        <span className="loading-block" />
        <span className="loading-block" />
      </div>
    </section>
  );
}
