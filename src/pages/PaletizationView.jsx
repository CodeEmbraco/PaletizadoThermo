import { makeStyles } from "@material-ui/core/styles";
import {
  Add,
  Box1,
  Category,
  Grid8,
  HashtagSquare,
  Health,
  Notepad2,
} from "iconsax-react";
import { useState, useEffect } from "react";
import BrowserPrintComponent from "../printerComponent";

import Stepper from "@keyvaluesystems/react-vertical-stepper";
import { Barcode } from "iconsax-react";

import useScanDetection from "use-scan-detection";

import { useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import ReactToPrint from "react-to-print";
import LabelPrinting from "../partials/genealogy/LabelPrinting";

import {
  getMetadataFromOrder,
  metadataOrderSelected,
  palletAmount,
  selectOrderSelected,
  setPalletAmount,
  differentOrderSelected,
  setDifferentOrderSelected,
  getQRThermo,
  setQrGenealogy,
} from "../store/slice/orderSelectedSlice";

import ComponentsTable from "../partials/paletization/ComponentsTable";
import GenealogyChecklist from "../partials/paletization/GenealogyChecklist";
import {
  addEventToPaletizationLog,
  selectPaletizationLog,
} from "../store/slice/eventsLogSlice";
import {
  createPallet,
  mountComponent,
  processInSAP,
  selectComponents,
  selectLoadingProcessInSap,
  selectPallet,
  setComponents,
  setComponentsJoined,
  setPallet,
} from "../store/slice/palletsSlice";
import {
  getTestResults,
  selectGlobalStatus,
  selectTestResults,
  setGlobalStatus,
  setTestResults,
} from "../store/slice/testResultSlice";

import ModalBlank from "../components/ModalBlank";
import CompressorMismatchModal from "../components/CompressorMismatchModal";
import PalletProductMismatchModal from "../components/PalletProductMismatchModal";
import {
  notifyError,
  notifyPalletScanned,
  notifyPalletProductValidated,
  notifyProductScanned,
} from "../partials/paletization/Toasts";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
    "& button": {
      flexBasis: "20%",
      margin: "2%",
    },
  },
  container: {
    display: "flex",
    flexWrap: "wrap",
  },
  formControl: {
    marginTop: "5%",
    marginBottom: "7%",
    minWidth: 120,
  },
}));

function PaletizationView() {
  const testResultsList = useSelector(selectTestResults);
  const globalStatus = useSelector(selectGlobalStatus);
  const orderSelected = useSelector(selectOrderSelected);
  const overrideOrder = useSelector(differentOrderSelected);
  const metadata = useSelector(metadataOrderSelected);
  const palletamount = useSelector(palletAmount);
  const paletizationLog = useSelector(selectPaletizationLog);

  const effectiveOrder = overrideOrder ?? orderSelected?.aufnr;

  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [isEditingPalletAmount, setIsEditingPalletAmount] = useState(false);
  const [editablePalletAmount, setEditablePalletAmount] = useState(32);

  const [barcodePallet, setBarcodePallet] = useState("Escanea pallet");
  const [hasProcessed, setHasProcessed] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState("Escanea producto");

  // ── Validación de material del componente escaneado vs orden ──
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [mismatchInfo, setMismatchInfo] = useState({
    expectedMaterial: "",
    scannedSerial: "",
    expectedPrefix: "",
    scannedPrefix: "",
  });

  // ── Doble escaneo: pallet → código de producto del pallet → componentes ──
  const [palletProductValidated, setPalletProductValidated] = useState(false);
  const [isPalletCreating, setIsPalletCreating] = useState(false);
  const [palletProductMismatchOpen, setPalletProductMismatchOpen] = useState(false);
  const [palletProductMismatchInfo, setPalletProductMismatchInfo] = useState({
    expectedProduct: "",
    scannedProduct: "",
  });

  const labelRef = useRef();

  // Montaje pendiente de inspección visual: se llena al validar el escaneo
  // y solo se ejecuta cuando el checklist de genealogía termina todo en OK.
  const pendingMountRef = useRef(null);

  const dispatch = useDispatch();

  const [selectedItems, setSelectedItems] = useState([]);

  const palletSelected = useSelector(selectPallet);

  const componentsList = useSelector(selectComponents);

  const isLoading = useSelector(selectLoadingProcessInSap);

  const handleSelectedItems = (selectedItems) => {
    setSelectedItems([...selectedItems]);
  };

  useEffect(() => {
    if (palletamount) {
      setEditablePalletAmount(palletamount);
    }
  }, [palletamount]);

  // Desbloquear escaneos cuando la API confirma el pallet (identifier cambia).
  // También resetea la validación de producto para el nuevo pallet.
  useEffect(() => {
    setHasProcessed(false);
    setPalletProductValidated(false);
    if (palletSelected?.identifier) {
      setIsPalletCreating(false);
      // Avisar si el pallet ya fue cerrado (sap_attempted = true)
      if (palletSelected.sap_attempted) {
        notifyError("Este pallet ya fue cerrado — no se pueden realizar nuevas acciones.");
        dispatch(
          addEventToPaletizationLog({
            text: "Pallet cerrado cargado: " + palletSelected.identifier + " — acciones bloqueadas.",
            timestamp: new Date().toISOString(),
          })
        );
      }
    }
  }, [palletSelected?.identifier]);

  // Derivados reactivos usados tanto en el handler como en el JSX
  const hasPallet =
    palletSelected?.identifier &&
    palletSelected.identifier !== "undefined" &&
    String(palletSelected.identifier).trim() !== "";
  const expectedProductCode = (orderSelected?.matnr?.slice(-9) ?? "").toUpperCase();

  // Cleanup al montar la vista: mismo comportamiento que "Nuevo".
  // Se ejecuta cada vez que el usuario navega a /paletization
  // (incluso al volver desde la vista de Logs).
  useEffect(() => {
    setBarcodePallet("Escanea pallet");
    setBarcodeProduct("Escanea producto");
    dispatch(setGlobalStatus(""));
    dispatch(setTestResults([]));
    dispatch(setComponentsJoined(false));
    dispatch(setComponents([]));
    dispatch(setPallet({}));
    dispatch(setDifferentOrderSelected(null));
    dispatch(setQrGenealogy([]));
    pendingMountRef.current = null;
    setHasProcessed(false);
    setPalletProductValidated(false);
    setIsPalletCreating(false);
    setPalletProductMismatchOpen(false);
    setPalletProductMismatchInfo({ expectedProduct: "", scannedProduct: "" });
    setMismatchOpen(false);
    setMismatchInfo({ expectedMaterial: "", scannedSerial: "", expectedPrefix: "", scannedPrefix: "" });
    dispatch(
      addEventToPaletizationLog({
        text: "Vista iniciada. Estado reiniciado.",
        timestamp: new Date().toISOString(),
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = async (rawCode) => {
    const formattedCode = rawCode.replace(/Shift/g, "");
    const upperCode = formattedCode.toUpperCase();

    // Límite de cantidad de pallet
    if (componentsList.length !== 0 && componentsList.length == palletamount) {
      notifyError("Cantidad de pallet ya está completada");
      return;
    }

    // Bloquear mientras la API confirma el pallet recién escaneado
    if (isPalletCreating) {
      notifyError("Esperando confirmación del pallet, intenta de nuevo en un momento.");
      return;
    }

    // ── Pallet cerrado: bloquear cualquier acción ──
    if (hasPallet && palletSelected?.sap_attempted) {
      notifyError("Este pallet ya fue cerrado. Escanea un nuevo pallet.");
      return;
    }

    // ── Estado intermedio: pallet confirmado, producto del pallet sin validar ──
    // El siguiente escaneo corto se interpreta como el código de producto del pallet.
    if (hasPallet && !palletProductValidated) {
      if (formattedCode.length >= 11) {
        notifyError("Escanea primero el código de producto del pallet antes de montar un componente");
        dispatch(
          addEventToPaletizationLog({
            text: "Intento de montar componente sin validar producto del pallet: " + upperCode,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }
      if (upperCode === expectedProductCode) {
        setPalletProductValidated(true);
        notifyPalletProductValidated(upperCode);
        dispatch(
          addEventToPaletizationLog({
            text: "Producto del pallet validado: " + upperCode,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }
      // Código no coincide con el producto de la orden
      setPalletProductMismatchInfo({
        expectedProduct: expectedProductCode,
        scannedProduct: upperCode,
      });
      setPalletProductMismatchOpen(true);
      dispatch(
        addEventToPaletizationLog({
          text:
            "Producto del pallet RECHAZADO. Esperado: " +
            expectedProductCode +
            " | Escaneado: " +
            upperCode,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // ── Scan largo: componente ──
    if (formattedCode.length >= 11) {
      if (!hasPallet) {
        notifyError("Escanea primero el pallet antes de montar un componente");
        dispatch(
          addEventToPaletizationLog({
            text: "Intento de montar componente sin pallet escaneado: " + upperCode,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }
      notifyProductScanned(upperCode);
      setBarcodeProduct(upperCode);
      dispatch(addEventToPaletizationLog({ text: "Producto escaneado: " + upperCode, timestamp: new Date().toISOString() }));
      dispatch(addEventToPaletizationLog({ text: "Consultando resultados de prueba de producto: " + upperCode, timestamp: new Date().toISOString() }));

      const testStatus = await Promise.resolve(dispatch(getTestResults(upperCode)));
      dispatch(getQRThermo(upperCode));

      if (testStatus !== 1) {
        return;
      }

      const condenserMaterial = orderSelected.matnr.slice(-9);

      // Validar que el serial escaneado corresponda al material de la orden.
      // No se necesita genealogía: el serial del condensador comienza con el código de material.
      const cleaned = condenserMaterial.replace(/^0+/, "");
      const dotIdx = cleaned.search(/[.…]/);
      // Comparar el material COMPLETO, no solo un prefijo: dos materiales que
      // comparten los primeros dígitos pero difieren en los últimos (ej. ...130
      // vs ...100) deben rechazarse. Si el material trae punto/elipsis se usa
      // todo lo anterior al separador.
      const expectedPrefix = dotIdx > 0 ? cleaned.slice(0, dotIdx) : cleaned;
      const scannedPrefix = upperCode.slice(0, expectedPrefix.length);

      if (expectedPrefix && scannedPrefix && expectedPrefix !== scannedPrefix) {
        setMismatchInfo({
          expectedMaterial: cleaned,
          scannedSerial: upperCode,
          expectedPrefix,
          scannedPrefix,
        });
        setMismatchOpen(true);
        dispatch(
          addEventToPaletizationLog({
            text:
              "Componente RECHAZADO — material no coincide con la orden. " +
              "Esperado: " + expectedPrefix +
              " | Escaneado: " + scannedPrefix +
              " (" + upperCode + ")",
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const compressorMaterial = orderSelected.components[0].matnr;
      const data = {
        palette: palletSelected.identifier,
        condenser: upperCode,
        compressor: "-",
        compressorMaterial: compressorMaterial,
        condenserMaterial: condenserMaterial,
      };
      // La pieza NO se monta aquí: queda pendiente hasta que el operador
      // complete la inspección visual de genealogía con todos los renglones en OK.
      pendingMountRef.current = { data, condenserMaterial };
      dispatch(
        addEventToPaletizationLog({
          text:
            "Componente validado: " +
            upperCode +
            ". Esperando inspección visual (checklist) para montar.",
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      // ── Scan corto: nuevo pallet ──
      // Distinguir pallet vs material por FORMATO, no por longitud:
      // el pallet SIEMPRE es alfanumérico (al menos una letra, ej. 826ZOP9),
      // mientras que el número de material es 100% numérico (ej. 515380130).
      // Si lo escaneado es puro número, es un material (o un fragmento de
      // serial partido por el lector): NO debe crear un pallet.
      if (!/[A-Z]/.test(upperCode)) {
        notifyError("Eso parece un número de material, no un pallet. Escanea un pallet válido.");
        dispatch(
          addEventToPaletizationLog({
            text: "Escaneo rechazado en creación de pallet (numérico, parece material): " + upperCode,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }
      handleNew();
      setBarcodePallet(upperCode);
      setIsPalletCreating(true);
      dispatch(addEventToPaletizationLog({ text: "Pallet escaneado: " + upperCode, timestamp: new Date().toISOString() }));
      if (
        metadata.length > 0 &&
        metadata.find((obj) => obj.ID_CARACTMATERIAL === 185)?.DE_VALORCARACTMAT == componentsList.length
      ) {
        notifyError("El total de montados no debe superar la cantidad por pallet");
        setIsPalletCreating(false);
        return;
      }
      dispatch(
        createPallet(
          effectiveOrder,
          upperCode,
          orderSelected.matnr.slice(-9),
          metadata.find((obj) => obj.ID_CARACTMATERIAL === 185)?.DE_VALORCARACTMAT
        )
      );
      notifyPalletScanned(upperCode);
      dispatch(addEventToPaletizationLog({ text: "Consultando registro de Pallet: " + upperCode, timestamp: new Date().toISOString() }));
    }
  };

  useScanDetection({
    onComplete: (code) => handleScan(code),
  });

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  function formatTimestampToDDMMYYYYHHMMSS(timestamp) {
    const date = new Date(timestamp);

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  }

  const stylesOverride = {
    LabelTitle: (step, stepIndex) => ({ marginLeft: "8px", fontSize: 15 }),
    ActiveLabelTitle: (step, stepIndex) => ({
      marginLeft: "0px",
      fontSize: 15,
    }),
    LabelDescription: (step, stepIndex) => ({
      marginLeft: "8px",
      fontSize: 13,
    }),
    ActiveLabelDescription: (step, stepIndex) => ({
      marginLeft: "0px",
      fontSize: 13,
    }),
    LineSeparator: (step, stepIndex) => ({ borderRight: "2px solid #dfdff2" }),
    InactiveLineSeparator: (step, stepIndex) => ({
      borderRight: "2px solid #dfdff2",
    }),
    Bubble: (step, stepIndex) => (
      console.log(stepIndex === currentStepIndex),
      console.log(step.status),
      {
        width: "40px",
        height: "40px",
        backgroundColor: step.status === "skipped" ? "red" : "#15B053",
        color: "#fff",
      }
    ),
    ActiveBubble: (step, stepIndex) => ({
      width: "40px",
      height: "40px",
      backgroundColor: step.status === "skipped" ? "red" : "#15B053",
      color: "#fff",
      background: "#15B053",
      border:
        step.status === "skipped" ? "7px solid #ee9090" : "7px solid #A1DFBA",
    }),
    InActiveBubble: (step, stepIndex) => ({
      width: "40px",
      height: "40px",
      backgroundColor: "#F0F1F3",
      color: "#000000",
    }),
  };
  // useEffect(() => {
  //   setTimeout(() => {
  //     localStorage.removeItem("b-gantt-trial-start");
  //     window.location.reload();
  //   }, 60000);

  // }, []);

  // Se dispara una sola vez cuando el operador marca el último renglón del checklist.
  const handleInspectionComplete = ({ allOk, nokCount }) => {
    const pending = pendingMountRef.current;
    if (!allOk) {
      pendingMountRef.current = null;
      notifyError("Inspección visual con errores: la pieza no se puede montar");
      dispatch(
        addEventToPaletizationLog({
          text:
            "Componente RECHAZADO en inspección visual (" +
            nokCount +
            " con ERROR)" +
            (pending ? ": " + pending.data.condenser : ""),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }
    if (!pending) {
      return;
    }
    pendingMountRef.current = null;
    dispatch(
      addEventToPaletizationLog({
        text:
          "Inspección visual completa (todo OK). Montando componente: " +
          pending.data.condenser,
        timestamp: new Date().toISOString(),
      })
    );
    dispatch(mountComponent(pending.data));
    dispatch(getMetadataFromOrder(pending.condenserMaterial));
  };

  function handleNew() {
    setBarcodePallet("Escanea pallet");
    setBarcodeProduct("Escanea producto");
    dispatch(setGlobalStatus(""));
    dispatch(setTestResults([]));
    dispatch(setComponentsJoined(false));
    dispatch(setComponents([]));
    dispatch(setPallet({}));
    dispatch(setDifferentOrderSelected(null));
    dispatch(setQrGenealogy([]));
    pendingMountRef.current = null;
    setHasProcessed(false);
    setPalletProductValidated(false);
    setIsPalletCreating(false);
    setPalletProductMismatchOpen(false);
    setPalletProductMismatchInfo({ expectedProduct: "", scannedProduct: "" });
    setMismatchOpen(false);
    setMismatchInfo({ expectedMaterial: "", scannedSerial: "", expectedPrefix: "", scannedPrefix: "" });
    dispatch(addEventToPaletizationLog({
      text: "Comando NUEVO detectado. Proceso reiniciado.",
      timestamp: new Date().toISOString(),
    }));
  }

  async function handleNotify() {
    setHasProcessed(true);
    const result = await dispatch(
      processInSAP(orderSelected, palletSelected, componentsList, effectiveOrder)
    );
    if (result?.success) {
      dispatch(
        addEventToPaletizationLog({
          text: "Pallet procesado en SAP. Limpiando vista para el siguiente.",
          timestamp: new Date().toISOString(),
        })
      );
      handleNew();
    }
  }

  const handlePalletAmountDoubleClick = () => {
    setIsEditingPalletAmount(true);
  };

  const handlePalletAmountChange = (e) => {
    setEditablePalletAmount(e.target.value);
    dispatch(setPalletAmount(e.target.value));
  };

  const handlePalletAmountBlur = () => {
    setIsEditingPalletAmount(false);
    // You might want to validate the value here
    if (editablePalletAmount < 1) {
      setEditablePalletAmount(1);
    }
  };

  const handlePalletAmountKeyPress = (e) => {
    if (e.key === "Enter") {
      setIsEditingPalletAmount(false);
      // You might want to validate the value here
      if (editablePalletAmount < 1) {
        setEditablePalletAmount(1);
      }
    }
  };

  function buildTreeData(obj) {
    if (typeof obj === "undefined" || Object.keys(obj).length === 0) {
      console.log("Boom undefined");
      return [];
    } else {
      const treeData = [];
      const mainMatnr = obj.matnr.slice(-9); // Obtener los últimos 9 caracteres de matnr

      const parentNode = {
        id: 1,
        label: mainMatnr,
        children: [],
      };

      const childNode = {
        id: 2,
        label: obj.components[0]?.matnr ?? "",
      };

      parentNode.children.push(childNode);
      treeData.push(parentNode);

      return treeData;
    }
  }

  const [expandedNodes, setExpandedNodes] = useState([]);

  const toggleNode = (nodeId) => {
    if (expandedNodes.includes(nodeId)) {
      setExpandedNodes(expandedNodes.filter((id) => id !== nodeId));
    } else {
      setExpandedNodes([...expandedNodes, nodeId]);
    }
  };

  const renderNode = (node) => {
    const isNodeExpanded = expandedNodes.includes(node.id);
    const hasChildNodes = node.children && node.children.length > 0;

    return (
      <div key={node.id} className="tree-node">
        <div
          className={`tree-node__label ${
            hasChildNodes ? "tree-node__label--clickable" : ""
          }`}
          onClick={() => hasChildNodes && toggleNode(node.id)}
        >
          {hasChildNodes && (
            <span
              className={`tree-node__icon ${
                isNodeExpanded
                  ? "tree-node__icon--expanded"
                  : "tree-node__icon--collapsed"
              }`}
            ></span>
          )}
          {node.label}
        </div>
        {isNodeExpanded && hasChildNodes && (
          <div className="tree-node__children">
            {node.children.map((childNode) => renderNode(childNode))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 py-2 w-full max-w-10xl mx-auto">
        <div className="max-w-full mx-4 py-0 sm:mx-auto sm:px-6 lg:px-4">
          <header>
            <div className="mt-8">
              <div className="flex items-center justify-between h-16 -mb-px">
                <h3 className="text-black text-2xl capitalize font-semibold text-gray-400 tracking-tight">
                  Paletización
                </h3>
                {/* Header: Right side */}
                <div className="flex items-center space-x-3">
                  {Object.keys(orderSelected).length === 0 ? null : (
                    <button
                      onClick={(e) => {
                        handleNew();
                        e.currentTarget.blur();
                      }}
                      className="border border-slate-300 rounded w-32 h-12 text-base flex justify-center font-semibold"
                    >
                      <Add
                        className="mr-2 my-auto bg-transparent"
                        color="black"
                        size={20}
                      />
                      <span className="my-auto text-black font-semibold">
                        NUEVO
                      </span>
                    </button>
                  )}
                  <div>
                    <ReactToPrint
                      trigger={() => (
                        <button
                          onClick={(e) => {
                            e.currentTarget.blur();
                          }}
                          className={
                            globalStatus === 1
                              ? "w-64 h-12 bg-primary rounded text-white text-base flex justify-center hover:bg-green-500"
                              : "w-64 h-12 bg-secondary rounded text-black text-base flex justify-center hover:text-white disabled:pointer-events-none"
                          }
                          disabled={globalStatus != 1}
                        >
                          <Barcode
                            className="mr-2 my-auto bg-transparent"
                            color="#ffff"
                            size={20}
                          />
                          <span className="bg-transparent my-auto text-white font-semibold hover:bg-green-500">
                            Imprimir etiqueta
                          </span>
                        </button>
                      )}
                      content={() => labelRef.current}
                    />
                    <div style={{ display: "none" }}>
                      <LabelPrinting
                        ref={labelRef}
                        qrValue={barcodeProduct}
                        metadata={metadata}
                      />
                    </div>
                  </div>
                  <BrowserPrintComponent barcodeProduct={barcodeProduct} />
                  {componentsList.length === 0 ? null : isLoading ? (
                    <button
                      onClick={handleNotify}
                      className={
                        "w-64 h-12 btn bg-primary text-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed shadow-none"
                      }
                      disabled={true}
                    >
                      <svg
                        className="animate-spin bg-transparent w-4 h-4 fill-current shrink-0 mr-2"
                        viewBox="0 0 16 16"
                      >
                        <path d="M8 16a7.928 7.928 0 01-3.428-.77l.857-1.807A6.006 6.006 0 0014 8c0-3.309-2.691-6-6-6a6.006 6.006 0 00-5.422 8.572l-1.806.859A7.929 7.929 0 010 8c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" />
                      </svg>
                      <span className="bg-transparent my-auto text-white font-semibold">
                        Cargando...
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        handleNotify();
                        e.currentTarget.blur();
                      }}
                      className={
                        // Bloqueado si: ya se procesó en sesión, faltan componentes,
                        // no queda nada pendiente de enviar a SAP, o el pallet ya se intentó procesar (persistente).
                        hasProcessed ||
                        componentsList.length < editablePalletAmount ||
                        !componentsList.some((component) => component.send_to_sap === false) ||
                        palletSelected?.sap_attempted
                          ? "w-64 h-12 bg-secondary rounded text-slate-400 text-base flex justify-center cursor-not-allowed opacity-70"
                          : "w-64 h-12 bg-primary rounded text-white text-base flex justify-center hover:bg-green-500"
                      }
                      disabled={
                        // El botón se bloquea si: ya se procesó en sesión, faltan componentes,
                        // no queda nada pendiente de enviar a SAP, o el pallet ya se intentó procesar (persistente).
                        // El reproceso se hace desde la pantalla de Logs.
                        hasProcessed ||
                        componentsList.length < editablePalletAmount ||
                        !componentsList.some((component) => component.send_to_sap === false) ||
                        palletSelected?.sap_attempted
                      }
                    >
                      <span className="bg-transparent my-auto text-white font-semibold">
                        Procesar
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-full mx-4 py-0 sm:mx-auto">
            <div className="sm:flex sm:space-x-4">
              <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:w-1/3 sm:my-4">
                <div className="bg-white p-5">
                  <div className="sm:flex sm:items-start bg-white">
                    <div className="bg-white text-center sm:mt-0 sm:ml-2 sm:text-left">
                      <div className="flex items-center">
                        <Grid8 className="mr-2" color="#A0A2A6" size={20} />
                        <h3 className="bg-white text-md font-medium text-gray">
                          Pallet
                        </h3>
                      </div>

                      <p className="bg-white text-3xl font-bold text-black">
                        {Object.keys(orderSelected).length === 0
                          ? "Selecciona órden"
                          : barcodePallet}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:w-1/3 sm:my-4">
                <div className="bg-white p-5">
                  <div className="sm:flex sm:items-start bg-white">
                    <div className="bg-white text-center sm:mt-0 sm:ml-2 sm:text-left">
                      <div className="flex items-center">
                        <Category className="mr-2" color="#A0A2A6" size={20} />
                        <h3 className="bg-white text-md font-medium text-gray">
                          Número serial actual
                        </h3>
                      </div>

                      <p className="bg-white text-3xl font-bold text-black">
                        {Object.keys(orderSelected).length === 0
                          ? "--------"
                          : barcodeProduct}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:w-1/6 sm:my-4">
                <div className="bg-white p-5">
                  <div className="sm:flex sm:items-start bg-white">
                    <div className="bg-white text-center sm:mt-0 sm:ml-2 sm:text-left">
                      <div className="flex items-center">
                        <HashtagSquare
                          variant="Outline"
                          className="mr-2"
                          color="#A0A2A6"
                          size={20}
                        />
                        <h3 className="bg-white text-md font-medium text-gray">
                          Cantidad pallet
                        </h3>
                      </div>

                      <p className="bg-white text-3xl font-bold text-black">
                        {isEditingPalletAmount ? (
                          <input
                            type="number"
                            value={editablePalletAmount}
                            onChange={handlePalletAmountChange}
                            onBlur={handlePalletAmountBlur}
                            onKeyPress={handlePalletAmountKeyPress}
                            className="bg-transparent border-b-2 border-blue-500 outline-none text-3xl font-bold text-black w-20"
                            autoFocus
                            min="1"
                          />
                        ) : (
                          <span
                            onDoubleClick={handlePalletAmountDoubleClick}
                            className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                            title="Double click to edit"
                          >
                            {editablePalletAmount}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:w-1/6 sm:my-4">
                <div className="bg-white p-5">
                  <div className="sm:flex sm:items-start bg-white">
                    <div className="bg-white text-center sm:mt-0 sm:ml-2 sm:text-left">
                      <div className="flex items-center">
                        <Health className="mr-2" color="#A0A2A6" size={20} />
                        <h3 className="bg-white text-md font-medium text-gray">
                          Total montados
                        </h3>
                      </div>

                      <p className="bg-white text-3xl font-bold text-black">
                        {Object.keys(orderSelected).length === 0
                          ? "--------"
                          : componentsList.length}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
            {/* Banner: pallet cerrado */}
            {hasPallet && palletSelected?.sap_attempted && (
              <div className="bg-red-50 border-2 border-red-500 rounded-lg px-5 py-3 mb-4 flex items-center space-x-3">
                <svg className="shrink-0 text-red-500 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-11a7 7 0 100 14 7 7 0 000-14z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
                </svg>
                <div>
                  <p className="font-semibold text-red-800 text-sm">
                    Pallet cerrado — ya fue procesado en SAP
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">
                    No se pueden realizar nuevas acciones. Escanea un nuevo pallet o reprocésalo desde Logs.
                  </p>
                </div>
              </div>
            )}

            {/* Banner: paso 2 — escanear código de producto del pallet */}
            {hasPallet && !palletProductValidated && (
              <div className="bg-amber-50 border-2 border-amber-400 rounded-lg px-5 py-3 mb-4 flex items-center space-x-3">
                <svg className="shrink-0 text-amber-500 w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">
                    Paso 2: Escanea el código de producto impreso en el pallet
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Código esperado:&nbsp;
                    <span className="font-mono font-bold">{expectedProductCode}</span>
                  </p>
                </div>
              </div>
            )}

            <div className="sm:flex sm:space-x-4">
              <div
                className="flex flex-col w-1/3"
                style={{ paddingRight: "7px" }}
              >
                <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:my-4">
                  <div className="bg-white p-5">
                    <div className="sm:flex sm:items-start bg-white">
                      <div className="bg-white text-center sm:mt-0 sm:ml-2 sm:text-left">
                        <div className="flex items-center">
                          <Notepad2
                            className="mr-2"
                            color="#A0A2A6"
                            size={20}
                          />
                          <h3 className="bg-white text-md font-medium text-gray">
                            Órden
                          </h3>
                        </div>
                        <p className="bg-white text-3xl font-bold text-black">
                          {Object.keys(orderSelected).length === 0
                            ? "Selecciona órden"
                            : effectiveOrder}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:my-4">
                  <div className="bg-white p-5">
                    <div className="sm:flex sm:items-start bg-white">
                      <div className="bg-white text-center sm:mt-0 sm:ml-2 sm:text-left">
                        <div className="flex items-center">
                          <Box1
                            variant="Outline"
                            className="mr-2"
                            color="#A0A2A6"
                            size={20}
                          />
                          <h3 className="bg-white text-md font-medium text-gray">
                            Producto
                          </h3>
                        </div>
                        <p className="bg-white text-3xl font-bold text-black">
                          {Object.keys(orderSelected).length === 0
                            ? "--------"
                            : orderSelected.matnr.slice(-9)}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:w-1/3 sm:my-4">
                <div className="bg-white p-5">
                  <h3 className="bg-white text-md font-medium text-gray">
                    Resultados de pruebas
                  </h3>
                  <h3 className="bg-white text-2xl font-semibold text-black">
                    {testResultsList && testResultsList.length > 0 ? (
                      <div>
                        Estado global:{" "}
                        <span
                          className={
                            globalStatus === 1 ? "text-primary" : "text-red-500"
                          }
                        >
                          {globalStatus === 1 ? "OK" : "Error"}
                        </span>
                        {/* Muestra los detalles de los resultados de prueba aquí si es necesario */}
                      </div>
                    ) : (
                      <p className="text-black">
                        Resultados de pruebas no disponibles
                      </p>
                    )}
                  </h3>
                  <div
                    className="flex grid justify-start"
                    style={{ marginLeft: "-10px", marginTop: "10px" }}
                  >
                    {testResultsList && testResultsList.length > 0 ? (
                      <div>
                        <Stepper
                          className="!ml-0"
                          steps={testResultsList}
                          currentStepIndex={2}
                          styles={stylesOverride}
                        />

                        {/* Muestra los detalles de los resultados de prueba aquí si es necesario */}
                      </div>
                    ) : (
                      <p className="text-black ml-3"></p>
                    )}
                    <div></div>
                  </div>
                </div>
              </section>

              <section
                style={{
                  maxHeight: "645px",
                  minHeight: "200px",
                  overflowY: "scroll",
                }}
                className="inline-block align-bottom rounded-lg border border-slate-200 text-left overflow-hidden mb-4 w-full sm:my-4 w-3/4"
              >
                <div className="bg-white p-5">
                  <h3 className="bg-white text-md font-medium text-gray">
                    Listado de componentes
                  </h3>
                  <div
                    className="flex justify-start"
                    style={{ marginLeft: "-10px" }}
                  >
                    <ComponentsTable selectedItems={handleSelectedItems} />
                    <div></div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <hr className="solid" />
          <div className="mt-8 flex">
            <h3 className="text-black text-2xl capitalize font-semibold text-gray-400 tracking-tight">
              Información adicional
            </h3>
          </div>

          <div className="sm:flex sm:space-x-4 mt-4">
            <div className="w-full sm:w-1/3">
              <section
                style={{ height: "245px", overflowY: "scroll" }}
                className="inline-block align-bottom rounded-lg border border-slate-200 text-left mb-4 w-full sm:my-4"
              >
              <div className="bg-white p-5">
                <h3 className="bg-white text-md font-medium text-gray">
                  Log de eventos
                </h3>
                <div
                  className="bg-white text-sm text-black"
                  style={{ maxHeight: "450px", overflowY: "auto" }}
                >
                  {paletizationLog
                    .slice()
                    .reverse()
                    .map((event, index, array) => (
                      <p
                        key={index}
                        style={{ fontWeight: index === 0 ? "bold" : "normal" }}
                      >
                        <span style={{ color: "green" }}>
                          {formatTimestampToDDMMYYYYHHMMSS(event.timestamp)}
                        </span>{" "}
                        - {event.text}{" "}
                      </p>
                    ))}
                </div>
              </div>
              </section>
            </div>

            <GenealogyChecklist onComplete={handleInspectionComplete} />
          </div>
        </div>
      </div>

      <CompressorMismatchModal
        open={mismatchOpen}
        onClose={() => setMismatchOpen(false)}
        expectedMaterial={mismatchInfo.expectedMaterial}
        scannedSerial={mismatchInfo.scannedSerial}
        expectedPrefix={mismatchInfo.expectedPrefix}
        scannedPrefix={mismatchInfo.scannedPrefix}
      />

      <PalletProductMismatchModal
        open={palletProductMismatchOpen}
        onClose={() => setPalletProductMismatchOpen(false)}
        expectedProduct={palletProductMismatchInfo.expectedProduct}
        scannedProduct={palletProductMismatchInfo.scannedProduct}
      />

      <ModalBlank
        id="info-modal"
        modalOpen={infoModalOpen}
        setModalOpen={setInfoModalOpen}
      >
        <div className="p-5 flex space-x-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-rose-100">
            <svg
              className="w-4 h-4 shrink-0 fill-current text-rose-500"
              viewBox="0 0 16 16"
            >
              <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 12H7V7h2v5zM8 6c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" />
            </svg>
          </div>
          {/* Content */}
          <div>
            {/* Modal header */}
            <div className="mb-2">
              <div className="text-lg font-semibold text-slate-800 text-left">
                No es posible montar {barcodeProduct}
              </div>
            </div>
            {/* Modal content */}
            <div className="text-sm mb-10 text-left">
              <div className="space-y-2">
                <p>
                  El componente no puede ser montado ya que hay uno o más
                  errores en sus pruebas, es posible que el componente se
                  encuentre dañado:
                </p>
                <h3 className="bg-white text-md font-medium text-gray">
                  Semáforo
                </h3>
                <h3 className="bg-white text-2xl font-semibold text-black">
                  {globalStatus !== "" ? (
                    <div>
                      Estado global:{" "}
                      <span
                        className={
                          globalStatus === 1 ? "text-primary" : "text-red-500"
                        }
                      >
                        {globalStatus === 1 ? "OK" : "Error"}
                      </span>
                      {/* Muestra los detalles de los resultados de prueba aquí si es necesario */}
                    </div>
                  ) : (
                    <p className="text-black">
                      Resultados de pruebas no disponibles.
                    </p>
                  )}
                </h3>
                <div
                  className="flex grid justify-start"
                  style={{ marginLeft: "-10px", marginTop: "10px" }}
                >
                  {testResultsList && testResultsList.length > 0 ? (
                    <div>
                      <Stepper
                        className="!ml-0"
                        steps={testResultsList}
                        currentStepIndex={2}
                        styles={stylesOverride}
                      />

                      {/* Muestra los detalles de los resultados de prueba aquí si es necesario */}
                    </div>
                  ) : (
                    <p className="text-black ml-3"></p>
                  )}
                  <div></div>
                </div>
              </div>
            </div>
            {/* Modal footer */}
            <div className="flex flex-wrap justify-end">
              <button
                className="btn-sm bg-primary hover:primary text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfoModalOpen(false);
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      </ModalBlank>
    </>
  );
}

export default PaletizationView;
