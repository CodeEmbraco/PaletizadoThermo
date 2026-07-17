import axios from "axios";

export const GET_QR_URL =
  "http://em10vs0010.embraco.com:8002/api/v1/paletization/thermo/get_qr/";

// Reproduce exactamente la transformación aplicada al imprimir la etiqueta QR
// Thermo (ver printerComponent.jsx, handlePrintQRThermo), para poder
// reconstruirla y compararla contra un QR ya impreso.
export function buildQrThermoLabel(rawGenealogy) {
  const filtered = rawGenealogy.filter((item) => !item.startsWith("Order:"));
  return JSON.stringify(filtered)
    .replace(/[[\]]/g, "")
    .replace(/"/g, " ")
    .replace(/:/g, ",")
    .replace(/\.{3}L/g, "")
    .replace(/\s+/g, "");
}

export async function fetchQrThermoLabel(serialNo) {
  const response = await axios.post(GET_QR_URL, { serialNo });
  return buildQrThermoLabel(response.data);
}
