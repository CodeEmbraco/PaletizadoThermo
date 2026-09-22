import { useEffect } from "react";

function DuplicateSerialModal({ open, onClose, scannedSerial, position, reason }) {
  useEffect(() => {
    if (!open) return;
    const keyHandler = (e) => {
      if (e.key === "Enter" || e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: "rgba(185, 28, 28, 0.97)" }}
      role="alertdialog"
      aria-modal="true"
    >
      <div className="text-center text-white px-8 w-full max-w-5xl">
        <div className="flex justify-center mb-6">
          <svg
            width="160"
            height="160"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            <line x1="12" y1="13" x2="19" y2="20" />
            <line x1="19" y1="13" x2="12" y2="20" />
          </svg>
        </div>

        <h1
          className="font-black uppercase tracking-wider mb-4"
          style={{ fontSize: "72px", lineHeight: 1, color: "white" }}
        >
          Serial duplicado
        </h1>

        <p
          className="font-semibold mb-10"
          style={{ fontSize: "28px", color: "white" }}
        >
          {reason ||
            "El componente escaneado ya se encuentra montado en este pallet."}
          <br />
          No es posible montarlo nuevamente.
        </p>

        <div className="border-4 border-yellow-300 rounded-lg p-6 bg-red-900 mb-10">
          <p
            className="uppercase font-bold mb-3"
            style={{ fontSize: "18px", color: "#fde68a" }}
          >
            Serial escaneado
          </p>
          <p
            className="font-mono font-black break-all"
            style={{ fontSize: "40px", color: "white" }}
          >
            {scannedSerial || "—"}
          </p>
          {position ? (
            <p
              className="mt-3 font-bold"
              style={{ fontSize: "20px", color: "#fde68a" }}
            >
              Ya registrado en la posición #{position} del pallet
            </p>
          ) : null}
        </div>

        <button
          onClick={onClose}
          className="px-12 py-5 bg-white text-red-700 font-black uppercase rounded-lg hover:bg-red-50 shadow-2xl"
          style={{ fontSize: "32px", letterSpacing: "2px" }}
          autoFocus
        >
          Entendido
        </button>

        <p
          className="mt-6 opacity-80"
          style={{ fontSize: "14px", color: "white" }}
        >
          Presiona Enter o Esc para cerrar
        </p>
      </div>
    </div>
  );
}

export default DuplicateSerialModal;
