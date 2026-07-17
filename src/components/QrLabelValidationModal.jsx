import { useEffect } from "react";

function QrLabelValidationModal({
  open,
  onClose,
  allOk,
  serialNo,
  rows,
  errorMessage,
}) {
  useEffect(() => {
    if (!open) return;
    const keyHandler = (e) => {
      if (e.key === "Enter" || e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  }, [open, onClose]);

  if (!open) return null;

  const themeColor = errorMessage ? "amber" : allOk ? "green" : "red";
  const overlayColor =
    themeColor === "green"
      ? "rgba(21, 128, 61, 0.97)"
      : themeColor === "amber"
      ? "rgba(146, 64, 14, 0.97)"
      : "rgba(185, 28, 28, 0.97)";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: overlayColor }}
      role="alertdialog"
      aria-modal="true"
    >
      <div className="text-center text-white w-full max-w-4xl max-h-full flex flex-col">
        <h1
          className="font-black uppercase tracking-wider mb-2"
          style={{ fontSize: "42px", lineHeight: 1, color: "white" }}
        >
          {errorMessage
            ? "QR no reconocido"
            : allOk
            ? "QR validado: todo coincide"
            : "QR con diferencias"}
        </h1>

        {serialNo ? (
          <p className="font-mono font-bold mb-4" style={{ fontSize: "20px" }}>
            Serial CDU: {serialNo}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="font-semibold mb-8" style={{ fontSize: "22px" }}>
            {errorMessage}
          </p>
        ) : (
          <div className="bg-white rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col mb-6">
            <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
              <table className="w-full text-sm text-left text-black">
                <thead className="sticky top-0 bg-slate-100">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="py-2 px-3 font-semibold">Campo</th>
                    <th className="py-2 px-3 font-semibold">
                      Esperado (endpoint)
                    </th>
                    <th className="py-2 px-3 font-semibold">Escaneado</th>
                    <th className="py-2 px-3 font-semibold text-right">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row, index) => (
                    <tr
                      key={index}
                      className={row.ok ? "bg-green-50" : "bg-red-50"}
                    >
                      <td className="py-1.5 px-3 font-medium whitespace-nowrap">
                        {row.field}
                      </td>
                      <td className="py-1.5 px-3 font-mono break-all">
                        {row.expected}
                      </td>
                      <td className="py-1.5 px-3 font-mono break-all">
                        {row.scanned}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap text-right">
                        <span
                          className={
                            "font-semibold " +
                            (row.ok ? "text-green-700" : "text-red-600")
                          }
                        >
                          {row.ok ? "OK" : "ERROR"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <button
            onClick={onClose}
            className="px-10 py-4 bg-white font-black uppercase rounded-lg hover:bg-slate-50 shadow-2xl"
            style={{
              fontSize: "24px",
              letterSpacing: "1px",
              color:
                themeColor === "green"
                  ? "#15803d"
                  : themeColor === "amber"
                  ? "#92400e"
                  : "#b91c1c",
            }}
            autoFocus
          >
            Entendido
          </button>
          <p className="mt-4 opacity-80" style={{ fontSize: "13px" }}>
            Presiona Enter o Esc para cerrar
          </p>
        </div>
      </div>
    </div>
  );
}

export default QrLabelValidationModal;
