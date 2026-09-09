import { createAction, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import { endpointsCodes } from './endpointCodes';

const initialState = {
    globalStatus : '',
    testResults : [],
    serviceStatuses: {
      testResult: null,
      daqsys: null,
      ecmfan: null,
    }
}

const testResultsSlice = createSlice({
    initialState,
    name: 'testResults',
    extraReducers: (builder) => {
    },
    reducers: {
        setTestResults: (state, action) => {
          console.log("Setting test results")
          state.testResults = action.payload;
        },
        setGlobalStatus: (state, action) => {
            state.globalStatus = action.payload;
          },
        setServiceStatuses: (state, action) => {
            state.serviceStatuses = action.payload;
          },
        setServiceStatus: (state, action) => {
            state.serviceStatuses[action.payload.key] = action.payload.status;
          }
      },
});

export const {
    setTestResults,
    setGlobalStatus,
    setServiceStatuses,
    setServiceStatus,
  } = testResultsSlice.actions;


export const selectTestResults = (state) => state.testResults.testResults;

export const selectGlobalStatus = (state) => state.testResults.globalStatus;

export const selectServiceStatuses = (state) => state.testResults.serviceStatuses;

export default testResultsSlice.reducer;

async function call(url) {
    try {
        const res = await axios.get(url)
        return res.data
    } catch (error) {
        throw error
    }
}

function defineGlobalStatus(...statuses) {
    for (const status of statuses) {
        if (status != 1) return status
    }
    return 1
}

// Pruebas del condensador/CDU escaneado: PLIS-RESULT + DAQSYS.
// La prueba de torque del FAN (ECMFAN) NO va aquí: el fan es un
// componente aparte con su propio serial, y se valida justo antes de
// montar con getFanTorqueResult (ver abajo).
export const getTestResults = (barcode) => async (dispatch) => {
    try {
        const data1 = await call(`http://em10vs0010.embraco.com:8001/api/v1/test-result?barcode=${barcode}`)
        const data2 = await call(`http://em10vs0010.embraco.com:8001/api/v1/test-result-daqsys?barcode=${barcode}`)

         // Validaciones
        if (!data1?.results || data1.results.length === 0) {
            alert("Falta la prueba del servicio PLIS-RESULT");
            const status = defineGlobalStatus(0, data2.global_status);
            dispatch(setTestResults([...(data1.results || []), ...(data2.results || [])]))
            dispatch(setGlobalStatus(status))
            dispatch(setServiceStatus({ key: "testResult", status: 0 }))
            dispatch(setServiceStatus({ key: "daqsys", status: data2.global_status }))
            return status;
        }

        if (!data2?.results || data2.results.length === 0) {
            alert("Falta la prueba del servicio DAQSYS");
            const status = defineGlobalStatus(data1.global_status, 0);
            dispatch(setTestResults([...data1.results, ...(data2.results || [])]))
            dispatch(setGlobalStatus(status))
            dispatch(setServiceStatus({ key: "testResult", status: data1.global_status }))
            dispatch(setServiceStatus({ key: "daqsys", status: 0 }))
            return status;
        }
        console.log({ data1, data2 })

        const status = defineGlobalStatus(data1.global_status, data2.global_status);
        dispatch(setTestResults([...data1.results, ...data2.results]))
        dispatch(setGlobalStatus(status))
        dispatch(setServiceStatus({ key: "testResult", status: data1.global_status }))
        dispatch(setServiceStatus({ key: "daqsys", status: data2.global_status }))
        return status;
    } catch (error) {
        endpointsCodes(error, dispatch, setNotFound);
        return 0;
    }
  };

// Prueba de torque ECMFAN del FAN, componente aparte del condensador
// (su serial sale de la genealogía del QR, no del escaneo inicial).
// Se consulta justo antes de montar. El serial del fan en el QR trae el
// prefijo "51" que la tabla Torque_Data no incluye, así que se recorta.
export const getFanTorqueResult = (fanBarcode) => async (dispatch) => {
    const torqueSerial = fanBarcode && fanBarcode.startsWith("51")
      ? fanBarcode.slice(2)
      : fanBarcode;
    try {
        const data = await call(`http://em10vs0010.embraco.com:8001/api/v1/test-result-ecmfan?barcode=${torqueSerial}`)

        if (!data?.results || data.results.length === 0) {
            dispatch(setServiceStatus({ key: "ecmfan", status: 0 }))
            return 0;
        }

        const status = data.global_status === 1 ? 1 : 0;
        dispatch(setServiceStatus({ key: "ecmfan", status }))
        return status;
    } catch (error) {
        console.error("Error consultando torque ECMFAN del fan:", error);
        dispatch(setServiceStatus({ key: "ecmfan", status: 0 }))
        return 0;
    }
  };
