import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { TickCircle, CloseCircle, InfoCircle } from "iconsax-react";
import Tooltip from "react-simple-tooltip";
import { selectQrGenealogy } from "../../store/slice/orderSelectedSlice";

// Líneas de la genealogía que no son componentes (orden y mediciones del captube).
const EXCLUDED_PREFIXES = [
  "Order:",
  "Captube Back Pressure:",
  "Captube Flow:",
  "Captube Length:",
];

// Regla de longitud de la etiqueta productivo por componente. La mayoría
// concatena Part Number + Serial Number, pero en Inverter y Fan la etiqueta
// física es solo el Serial Number: el PN no forma parte de esa cuenta.
const LENGTH_RULES = {
  CDUAssembly: { field: "pnsn", length: 17 },
  CompressorSTG1: { field: "pnsn", length: 17 },
  CompressorSTG2: { field: "pnsn", length: 17 },
  Inverter1: { field: "sn", length: 19 },
  Inverter2: { field: "sn", length: 19 },
  Fan: { field: "sn", length: 17 },
  Captube: { field: "pnsn", length: 17 },
  CE: { field: "pnsn", length: 17 },
};

// Estructura obligatoria del ensamblaje: categoría, cantidad requerida y los
// nombres de componente (tal como llegan del QR) que pertenecen a cada una.
const CATEGORIES = [
  { key: "CDU", label: "CDU", required: 1, members: ["CDUAssembly"] },
  {
    key: "Compressor",
    label: "Compressor",
    required: 2,
    members: ["CompressorSTG1", "CompressorSTG2"],
  },
  {
    key: "Inverter",
    label: "Inverter",
    required: 2,
    members: ["Inverter1", "Inverter2"],
  },
  { key: "Fan", label: "Fan", required: 1, members: ["Fan"] },
  { key: "ColdBox", label: "Cold Box", required: 1, members: ["Captube"] },
  {
    key: "ElectricalBox",
    label: "Electrical Box",
    required: 1,
    members: ["CE"],
  },
];

const TOTAL_REQUIRED = CATEGORIES.reduce((sum, c) => sum + c.required, 0);

// Quota Check (conteo por categoría) + Integridad de Identidad (SN único
// dentro de la misma categoría).
function buildCategoryResults(items) {
  return CATEGORIES.map((category) => {
    const detected = items.filter(
      (item) => category.members.includes(item.name) && item.pn && item.sn
    );
    const detectedCount = detected.length;
    const quotaOk = detectedCount === category.required;

    const seenSn = new Map();
    const duplicateSns = new Set();
    detected.forEach((item) => {
      if (seenSn.has(item.sn)) {
        duplicateSns.add(item.sn);
      } else {
        seenSn.set(item.sn, item.name);
      }
    });
    const identityOk = duplicateSns.size === 0;

    const reasons = [];
    if (!quotaOk) {
      reasons.push(
        `Se requieren ${category.required} unidad${category.required > 1 ? "es" : ""} de ${category.label}, se detectaron ${detectedCount}.`
      );
    }
    if (!identityOk) {
      reasons.push(
        `Serial Number duplicado dentro de la categoría: ${Array.from(duplicateSns).join(", ")}.`
      );
    }
    if (quotaOk && identityOk) {
      reasons.push(
        `${detectedCount}/${category.required} detectados, todos con SN único.`
      );
    }

    return {
      ...category,
      detectedCount,
      quotaOk,
      identityOk,
      ok: quotaOk && identityOk,
      reason: reasons.join(" "),
    };
  });
}

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

// El backend agrega un sufijo fijo "...L" al PN de Compressor que no forma
// parte del número real de dígitos (ej. "513805037...L"); se ignora al contar.
function stripPlaceholderSuffix(pn) {
  return pn.replace(/\.{3}L$/, "");
}

// Válido solo si el componente es conocido, tiene PN y SN presentes, y el
// campo que define su regla (PN+SN, o solo SN en Inverter) mide exactamente
// lo esperado para esa pieza. Devuelve también la razón, para el tooltip.
function validateGroup(group) {
  const rule = LENGTH_RULES[group.name];

  if (!rule) {
    return {
      ok: false,
      reason: `"${group.name}" no está en las reglas de validación (no se puede verificar).`,
    };
  }
  if (!group.pn || !group.sn) {
    const faltante = [!group.pn && "Part Number", !group.sn && "Serial Number"]
      .filter(Boolean)
      .join(" y ");
    return {
      ok: false,
      reason: `Falta ${faltante}.`,
    };
  }

  const fieldLabel = rule.field === "sn" ? "Serial Number" : "PN+SN";
  const actualLength =
    rule.field === "sn"
      ? group.sn.length
      : (stripPlaceholderSuffix(group.pn) + group.sn).length;

  if (actualLength !== rule.length) {
    return {
      ok: false,
      reason: `${fieldLabel} tiene ${actualLength} caracteres, se esperaban ${rule.length}.`,
    };
  }
  return {
    ok: true,
    reason: `${fieldLabel} = ${actualLength} caracteres, cumple la regla (${rule.length}).`,
  };
}

const TABS = [
  { key: "components", label: "Componentes incluidos" },
  { key: "genealogy", label: "Validación de genealogía" },
];

export default function GenealogyChecklist({ onComplete }) {
  const qrGenealogy = useSelector(selectQrGenealogy);
  const [activeTab, setActiveTab] = useState("components");

  const items = buildGroups(
    (Array.isArray(qrGenealogy) ? qrGenealogy : [])
      .filter((line) => typeof line === "string")
      .filter((line) => !EXCLUDED_PREFIXES.some((prefix) => line.startsWith(prefix)))
  ).map((group) => ({ ...group, ...validateGroup(group) }));

  const componentNokCount = items.filter((item) => !item.ok).length;

  const categoryResults = buildCategoryResults(items);
  const totalDetected = categoryResults.reduce(
    (sum, c) => sum + c.detectedCount,
    0
  );
  const categoryNokCount = categoryResults.filter((c) => !c.ok).length;
  const systemOk = categoryNokCount === 0;

  const nokCount = componentNokCount + categoryNokCount;

  // Valida automáticamente en cuanto llega una nueva genealogía: no requiere
  // ninguna acción del operador.
  useEffect(() => {
    if (items.length === 0) return;
    if (onComplete) {
      const fanItem = items.find((item) => item.name === "Fan");
      onComplete({ allOk: nokCount === 0, nokCount, fanSerial: fanItem?.sn || null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrGenealogy]);

  const tabHasError = { components: !systemOk, genealogy: componentNokCount > 0 };

  return (
    <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left mb-4 w-full sm:w-2/3 sm:my-4">
      <div className="bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="bg-white text-md font-medium text-gray">
            Validación de genealogía
          </h3>
          {items.length > 0 ? (
            <span
              className={
                "text-xs font-semibold px-2 py-1 rounded-full " +
                (nokCount > 0
                  ? "bg-red-100 text-red-600"
                  : "bg-green-100 text-green-700")
              }
            >
              {nokCount > 0
                ? `${nokCount} ERROR${nokCount > 1 ? "ES" : ""}`
                : "Todo OK"}
            </span>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-slate-500 mt-1">
            Escanea un producto para validar los componentes.
          </p>
        ) : (
          <>
            <div className="inline-flex items-center bg-slate-100 rounded-full p-1 mt-3">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={(e) => {
                    setActiveTab(tab.key);
                    e.currentTarget.blur();
                  }}
                  className={
                    "px-3 py-1.5 rounded-full text-sm font-medium inline-flex items-center gap-1.5 transition-colors " +
                    (activeTab === tab.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {tab.label}
                  {tabHasError[tab.key] ? (
                    <CloseCircle size={16} variant="Bold" color="#ef4444" />
                  ) : (
                    <TickCircle size={16} variant="Bold" color="#15B053" />
                  )}
                </button>
              ))}
            </div>

            {activeTab === "components" ? (
              <>
                <p className="text-sm text-slate-500 mt-3">
                  Requerimientos de inventario ({totalDetected}/{TOTAL_REQUIRED}
                  {" "}
                  componentes): Quota Check por categoría e integridad de
                  identidad.
                </p>
                <table className="w-full text-sm text-black mt-2">
                  <thead>
                    <tr className="text-xs uppercase text-slate-400 text-left">
                      <th className="py-1.5 pr-2 font-semibold">Categoría</th>
                      <th className="py-1.5 pr-2 font-semibold">
                        Cant. Requerida
                      </th>
                      <th className="py-1.5 pr-2 font-semibold">
                        Cant. Detectada
                      </th>
                      <th className="py-1.5 pr-2 font-semibold">
                        Componentes Asociados
                      </th>
                      <th className="py-1.5 font-semibold text-right">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {categoryResults.map((category) => (
                      <tr
                        key={category.key}
                        className={category.ok ? "bg-green-50" : "bg-red-50"}
                      >
                        <td className="py-1.5 pr-2 font-medium whitespace-nowrap">
                          {category.label}
                        </td>
                        <td className="py-1.5 pr-2">{category.required}</td>
                        <td className="py-1.5 pr-2">
                          {category.detectedCount}
                        </td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">
                          {category.members.join(", ")}
                        </td>
                        <td className="py-1.5 whitespace-nowrap text-right">
                          <Tooltip
                            content={category.reason}
                            placement="left"
                            background="#111827"
                            border="#111827"
                            padding={8}
                            radius={4}
                          >
                            <span
                              className={
                                "inline-flex items-center gap-1 font-semibold cursor-help " +
                                (category.ok
                                  ? "text-green-700"
                                  : "text-red-600")
                              }
                            >
                              {category.ok ? (
                                <>
                                  <TickCircle
                                    size={16}
                                    variant="Bold"
                                    color="#15B053"
                                  />
                                  OK
                                </>
                              ) : (
                                <>
                                  <CloseCircle
                                    size={16}
                                    variant="Bold"
                                    color="#ef4444"
                                  />
                                  ERROR
                                </>
                              )}
                            </span>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!systemOk ? (
                  <p className="text-sm font-semibold text-red-600 mt-2">
                    Error de Despliegue: Configuración Incompleta o Inválida.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500 mt-3">
                  Validación automática: existencia y longitud de etiqueta
                  por componente.
                </p>
                <table className="w-full text-sm text-black mt-2">
                  <thead>
                    <tr className="text-xs uppercase text-slate-400 text-left">
                      <th className="py-1.5 pr-2 font-semibold">
                        Componente
                      </th>
                      <th className="py-1.5 pr-2 font-semibold">
                        Part Number
                      </th>
                      <th className="py-1.5 pr-2 font-semibold">
                        Serial Number
                      </th>
                      <th className="py-1.5 font-semibold text-right">
                        <span className="inline-flex items-center gap-1">
                          Validación
                          <Tooltip
                            content="OK requiere: componente reconocido, con Part Number y Serial Number, y PN+SN con la longitud exacta definida por pieza."
                            placement="left"
                            background="#111827"
                            border="#111827"
                            padding={8}
                            radius={4}
                          >
                            <InfoCircle
                              size={14}
                              variant="Bold"
                              color="#94a3b8"
                            />
                          </Tooltip>
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((item, index) => (
                      <tr
                        key={index}
                        className={item.ok ? "bg-green-50" : "bg-red-50"}
                      >
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
                          <Tooltip
                            content={item.reason}
                            placement="left"
                            background="#111827"
                            border="#111827"
                            padding={8}
                            radius={4}
                          >
                            <span
                              className={
                                "inline-flex items-center gap-1 font-semibold cursor-help " +
                                (item.ok ? "text-green-700" : "text-red-600")
                              }
                            >
                              {item.ok ? (
                                <>
                                  <TickCircle
                                    size={16}
                                    variant="Bold"
                                    color="#15B053"
                                  />
                                  OK
                                </>
                              ) : (
                                <>
                                  <CloseCircle
                                    size={16}
                                    variant="Bold"
                                    color="#ef4444"
                                  />
                                  ERROR
                                </>
                              )}
                            </span>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
