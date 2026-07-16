import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { TickCircle, CloseCircle } from "iconsax-react";
import { selectQrGenealogy } from "../../store/slice/orderSelectedSlice";

// Líneas de la genealogía que NO se inspeccionan visualmente:
// la orden y las mediciones del captube no son legibles en la pieza física.
const EXCLUDED_PREFIXES = [
  "Order:",
  "Captube Back Pressure:",
  "Captube Flow:",
  "Captube Length:",
];

function parseLine(line) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return { label: line.trim(), value: "" };
  }
  return {
    label: line.slice(0, separatorIndex).replace(/\s+/g, " ").trim(),
    value: line.slice(separatorIndex + 1).trim(),
  };
}

// Agrupa las líneas "X PN: ..." y "X SN: ..." en un renglón por componente
// con columnas Part Number / Serial Number.
function buildGroups(lines) {
  const groups = [];
  const byName = new Map();
  for (const line of lines) {
    const { label, value } = parseLine(line);
    const match = label.match(/^(.*)\s+(PN|SN)$/);
    if (!match) {
      groups.push({ name: label, pn: value, sn: "" });
      continue;
    }
    const name = match[1];
    let group = byName.get(name);
    if (!group) {
      group = { name, pn: "", sn: "" };
      byName.set(name, group);
      groups.push(group);
    }
    if (match[2] === "PN") {
      group.pn = value;
    } else {
      group.sn = value;
    }
  }
  return groups;
}

export default function GenealogyChecklist({ onComplete }) {
  const qrGenealogy = useSelector(selectQrGenealogy);

  const items = buildGroups(
    (Array.isArray(qrGenealogy) ? qrGenealogy : [])
      .filter((line) => typeof line === "string")
      .filter((line) => !EXCLUDED_PREFIXES.some((prefix) => line.startsWith(prefix)))
  );

  // Marcado local por renglón: "ok" | "nok". No se persiste ni se envía a ninguna API.
  const [marks, setMarks] = useState({});
  // La inspección se cierra solo al presionar "Confirmar inspección"; hasta
  // entonces el operador puede corregir cualquier marca equivocada.
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setMarks({});
    setFinished(false);
  }, [qrGenealogy]);

  const reviewedCount = items.filter((_, index) => marks[index]).length;
  const nokCount = items.filter((_, index) => marks[index] === "nok").length;
  const allMarked = items.length > 0 && reviewedCount === items.length;

  const toggleMark = (index, value) => {
    if (finished) return;
    setMarks((prev) => ({
      ...prev,
      [index]: prev[index] === value ? undefined : value,
    }));
  };

  const handleConfirm = () => {
    if (!allMarked || finished) return;
    setFinished(true);
    if (onComplete) {
      onComplete({ allOk: nokCount === 0, nokCount });
    }
  };

  const rowClass = (index) => {
    if (marks[index] === "ok") return "bg-green-50";
    if (marks[index] === "nok") return "bg-red-50";
    return "";
  };

  return (
    <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left mb-4 w-full sm:w-2/3 sm:my-4">
      <div className="bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="bg-white text-md font-medium text-gray">
            Inspección visual de genealogía
          </h3>
          {items.length > 0 ? (
            <span
              className={
                "text-xs font-semibold px-2 py-1 rounded-full " +
                (nokCount > 0
                  ? "bg-red-100 text-red-600"
                  : reviewedCount === items.length
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-600")
              }
            >
              {reviewedCount}/{items.length} revisados
              {nokCount > 0
                ? ` · ${nokCount} ERROR${nokCount > 1 ? "ES" : ""}`
                : ""}
            </span>
          ) : null}
        </div>
        {items.length > 0 ? (
          finished ? (
            nokCount > 0 ? (
              <p className="text-sm font-semibold text-red-600 mt-1">
                Inspección finalizada con errores: la pieza NO se puede montar.
                Da click en NUEVO para reiniciar el proceso.
              </p>
            ) : (
              <p className="text-sm font-semibold text-green-700 mt-1">
                Inspección completa: todo OK.
              </p>
            )
          ) : (
            <p className="text-sm text-slate-500 mt-1">
              Marca todos los elementos y presiona Confirmar inspección; puedes
              corregir cualquier marca antes de confirmar. La pieza se montará
              solo si todo está OK.
            </p>
          )
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-black mt-2">
            Escanea un producto para ver los componentes a inspeccionar.
          </p>
        ) : (
          <table className="w-full text-sm text-black mt-2">
            <thead>
              <tr className="text-xs uppercase text-slate-400 text-left">
                <th className="py-1.5 pr-2 font-semibold">Componente</th>
                <th className="py-1.5 pr-2 font-semibold">Part Number</th>
                <th className="py-1.5 pr-2 font-semibold">Serial Number</th>
                <th className="py-1.5 font-semibold text-right">Inspección</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((item, index) => (
                <tr key={index} className={rowClass(index)}>
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap">
                    {item.name}
                  </td>
                  <td className="py-1.5 pr-2 text-lg font-semibold break-all">
                    {item.pn}
                  </td>
                  <td className="py-1.5 pr-2 text-lg font-semibold break-all">
                    {item.sn}
                  </td>
                  <td className="py-1.5 whitespace-nowrap text-right">
                    <button
                      type="button"
                      disabled={finished}
                      onClick={(e) => {
                        toggleMark(index, "ok");
                        e.currentTarget.blur();
                      }}
                      className={
                        "btn-sm rounded mr-3 inline-flex items-center gap-1 disabled:cursor-not-allowed " +
                        (marks[index] === "ok"
                          ? "bg-primary text-white"
                          : "bg-slate-100 border !border-slate-300 text-slate-700 hover:bg-slate-200" +
                            (finished ? " opacity-40" : ""))
                      }
                    >
                      <TickCircle
                        size={16}
                        variant="Bold"
                        color={marks[index] === "ok" ? "#ffffff" : "#15B053"}
                      />
                      OK
                    </button>
                    <button
                      type="button"
                      disabled={finished}
                      onClick={(e) => {
                        toggleMark(index, "nok");
                        e.currentTarget.blur();
                      }}
                      className={
                        "btn-sm rounded inline-flex items-center gap-1 disabled:cursor-not-allowed " +
                        (marks[index] === "nok"
                          ? "bg-red-500 text-white"
                          : "bg-slate-100 border !border-slate-300 text-slate-700 hover:bg-slate-200" +
                            (finished ? " opacity-40" : ""))
                      }
                    >
                      <CloseCircle
                        size={16}
                        variant="Bold"
                        color={marks[index] === "nok" ? "#ffffff" : "#ef4444"}
                      />
                      ERROR
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {items.length > 0 && !finished ? (
          <div className="flex items-center justify-end mt-4">
            {!allMarked ? (
              <span className="text-sm text-slate-500 mr-3">
                Faltan {items.length - reviewedCount} elementos por marcar
              </span>
            ) : null}
            <button
              type="button"
              disabled={!allMarked}
              onClick={(e) => {
                handleConfirm();
                e.currentTarget.blur();
              }}
              className={
                "btn text-white " +
                (allMarked
                  ? "bg-primary hover:bg-green-700"
                  : "bg-slate-300 cursor-not-allowed")
              }
            >
              Confirmar inspección
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
